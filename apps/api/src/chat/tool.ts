import { z } from 'zod';
import { UseCaseSchema, type Requirements, type Build, type CatalogItem, RequirementsSchema, formatArs } from '@pcadvisor/shared';
import { type ToolSpec } from '../llm/types.js';

export const RecommendToolArgsSchema = z.object({
  useCases: z.array(UseCaseSchema).min(1).describe("Usos principales de la PC"),
  budgetMaxArs: z.number().int().positive().describe("Presupuesto máximo en pesos argentinos, número entero sin separadores"),
  budgetFlexible: z.boolean().describe("Si el presupuesto se puede estirar un poco"),
  gamingResolution: z.enum(['1080p','1440p','4k']).optional().describe("Resolución del monitor si se usa para jugar"),
  gamingDemand: z.enum(['light','demanding']).optional().describe("Exigencia de los juegos"),
  preferences: z.object({
    cpuBrand: z.enum(['amd','intel']).optional(),
    gpuBrand: z.enum(['amd','nvidia']).optional(),
    dedicatedGpu: z.boolean().optional(),
  }).partial().optional().describe("Preferencias específicas de marca o componentes"),
});

export type RecommendToolArgs = z.infer<typeof RecommendToolArgsSchema>;

export function toRequirements(args: RecommendToolArgs): Requirements {
  return RequirementsSchema.parse({
    useCases: args.useCases,
    budgetMaxCents: args.budgetMaxArs * 100,
    budgetFlexible: args.budgetFlexible,
    gamingResolution: args.gamingResolution,
    gamingDemand: args.gamingDemand,
    preferences: args.preferences || {},
  });
}

export const toolSpec: ToolSpec = {
  name: 'recommend_builds',
  description: 'Recomienda armados de PC compatibles y en stock según las necesidades y el presupuesto.',
  parameters: {
    type: 'object',
    properties: {
      useCases: {
        type: 'array',
        items: {
          type: 'string',
          enum: UseCaseSchema.options,
        },
        description: 'Usos principales de la PC',
      },
      budgetMaxArs: {
        type: 'integer',
        description: 'Presupuesto máximo en pesos argentinos, número entero sin separadores',
      },
      budgetFlexible: {
        type: 'boolean',
        description: 'Si el presupuesto se puede estirar un poco',
      },
      gamingResolution: {
        type: 'string',
        enum: ['1080p', '1440p', '4k'],
        description: 'Resolución del monitor si se usa para jugar',
      },
      gamingDemand: {
        type: 'string',
        enum: ['light', 'demanding'],
        description: 'Exigencia de los juegos',
      },
      preferences: {
        type: 'object',
        properties: {
          cpuBrand: { type: 'string', enum: ['amd', 'intel'] },
          gpuBrand: { type: 'string', enum: ['amd', 'nvidia'] },
          dedicatedGpu: { type: 'boolean' },
        },
        description: 'Preferencias específicas de marca o componentes',
      },
    },
    required: ['useCases', 'budgetMaxArs', 'budgetFlexible'],
  },
};

export type ToolResult = 
  | { status: 'ok'; builds: Build[] }
  | { status: 'no_builds_in_budget'; cheapestValidTotalCents: number | null }
  | { status: 'invalid_args'; issues: string[] };

export const ToolResultBuildSchema = z.object({
  tier: z.enum(['budget', 'balanced', 'performance']),
  totalLabel: z.string(),
  cpu: z.string(),
  gpu: z.string().nullable(),
  ramGb: z.number().int().nonnegative(),
  storageGb: z.number().int().nonnegative(),
  storageType: z.enum(['sata', 'nvme']),
  warnings: z.array(z.string()),
});
export type ToolResultBuild = z.infer<typeof ToolResultBuildSchema>;

export const ToolResultForLlmSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    builds: z.array(ToolResultBuildSchema),
  }),
  z.object({
    status: z.literal('no_builds_in_budget'),
    minimumBudgetArs: z.number().int().nullable(),
    minimumBudgetLabel: z.string().nullable(),
  }),
  z.object({
    status: z.literal('invalid_args'),
    issues: z.array(z.string()),
  }),
]);
export type ToolResultForLlm = z.infer<typeof ToolResultForLlmSchema>;

export function toolResultForLlm(
  result: ToolResult,
  catalog: CatalogItem[]
): ToolResultForLlm {
  if (result.status === 'ok') {
    const catalogMap = new Map<string, CatalogItem>();
    for (const item of catalog) {
      catalogMap.set(item.componentId, item);
    }

    return {
      status: 'ok',
      builds: result.builds.map(b => {
        let cpu = '';
        let gpu: string | null = null;
        let ramGb = 0;
        let storageGb = 0;
        let storageType: 'sata' | 'nvme' | null = null;

        for (const item of b.items) {
          if (item.type === 'cpu') cpu = item.name;
          if (item.type === 'gpu') gpu = item.name;
          if (item.type === 'ram') {
             const catItem = catalogMap.get(item.componentId);
             if (!catItem || catItem.type !== 'ram') {
               throw new Error(`RAM component not found in catalog: ${item.componentId}`);
             }
             ramGb += catItem.specs.totalGb * item.qty;
          }
          if (item.type === 'storage') {
             const catItem = catalogMap.get(item.componentId);
             if (!catItem || catItem.type !== 'storage') {
               throw new Error(`Storage component not found in catalog: ${item.componentId}`);
             }
             storageGb += catItem.specs.capacityGb * item.qty;
             storageType = catItem.specs.interface;
          }
        }

        if (storageType === null) {
          throw new Error(`No storage component found in build`);
        }

        return {
          tier: b.tier,
          totalLabel: formatArs(b.totalCents),
          cpu,
          gpu,
          ramGb,
          storageGb,
          storageType,
          warnings: b.warnings,
        };
      }),
    };
  }
  if (result.status === 'no_builds_in_budget') {
    return {
      status: 'no_builds_in_budget',
      minimumBudgetArs: result.cheapestValidTotalCents !== null ? Math.ceil(result.cheapestValidTotalCents / 100) : null,
      minimumBudgetLabel: result.cheapestValidTotalCents !== null ? formatArs(result.cheapestValidTotalCents) : null,
    };
  }
  return result;
}
