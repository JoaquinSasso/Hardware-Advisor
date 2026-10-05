import { z } from 'zod';

// ============================================================================
// Enums
// ============================================================================

export const ComponentTypeSchema = z.enum([
  'cpu',
  'motherboard',
  'ram',
  'gpu',
  'storage',
  'psu',
  'case',
]);
export type ComponentType = z.infer<typeof ComponentTypeSchema>;

export const MemoryTypeSchema = z.enum(['DDR4', 'DDR5']);
export type MemoryType = z.infer<typeof MemoryTypeSchema>;

export const FormFactorSchema = z.enum(['ATX', 'mATX', 'ITX']);
export type FormFactor = z.infer<typeof FormFactorSchema>;

export const PsuFormFactorSchema = z.enum(['ATX', 'SFX']);
export type PsuFormFactor = z.infer<typeof PsuFormFactorSchema>;

// ============================================================================
// Component Specs
// ============================================================================

export const CpuSpecsSchema = z
  .object({
    socket: z.string().min(1),
    cores: z.number().int().positive(),
    threads: z.number().int().positive(),
    tdpW: z.number().int().positive(),
    hasIgpu: z.boolean(),
    igpuScore: z.number().int().min(0).max(100),
    includesCooler: z.boolean(),
    memoryTypes: z.array(MemoryTypeSchema).min(1),
    perfScore: z.number().int().min(1).max(100),
  })
  .superRefine((data, ctx) => {
    if (!data.hasIgpu && data.igpuScore !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'igpuScore must be 0 when hasIgpu is false',
        path: ['igpuScore'],
      });
    }
    if (data.hasIgpu && data.igpuScore < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'igpuScore must be >= 1 when hasIgpu is true',
        path: ['igpuScore'],
      });
    }
  });
export type CpuSpecs = z.infer<typeof CpuSpecsSchema>;

export const MotherboardSpecsSchema = z.object({
  socket: z.string().min(1),
  chipset: z.string().min(1),
  formFactor: FormFactorSchema,
  memoryType: MemoryTypeSchema,
  memorySlots: z.number().int().positive(),
  m2Slots: z.number().int().nonnegative(),
  sataPorts: z.number().int().nonnegative(),
  biosNote: z.string().nullable(),
});
export type MotherboardSpecs = z.infer<typeof MotherboardSpecsSchema>;

export const RamSpecsSchema = z.object({
  memoryType: MemoryTypeSchema,
  totalGb: z.number().int().positive(),
  modules: z.number().int().positive(),
  speedMhz: z.number().int().positive(),
});
export type RamSpecs = z.infer<typeof RamSpecsSchema>;

export const GpuSpecsSchema = z.object({
  chipset: z.string().min(1),
  vramGb: z.number().int().positive(),
  lengthMm: z.number().int().positive(),
  tbpW: z.number().int().positive(),
  recommendedPsuW: z.number().int().positive(),
  perfScore: z.number().int().min(1).max(100),
});
export type GpuSpecs = z.infer<typeof GpuSpecsSchema>;

export const StorageSpecsSchema = z.object({
  interface: z.enum(['sata', 'nvme']),
  formFactor: z.enum(['2.5', 'M.2-2280']),
  capacityGb: z.number().int().positive(),
});
export type StorageSpecs = z.infer<typeof StorageSpecsSchema>;

export const PsuSpecsSchema = z.object({
  wattage: z.number().int().positive(),
  efficiency: z.string(),
  formFactor: PsuFormFactorSchema,
});
export type PsuSpecs = z.infer<typeof PsuSpecsSchema>;

export const CaseSpecsSchema = z.object({
  supportedFormFactors: z.array(FormFactorSchema).min(1),
  maxGpuLengthMm: z.number().int().positive(),
  psuFormFactor: PsuFormFactorSchema,
  includedPsu: PsuSpecsSchema.nullable(),
});
export type CaseSpecs = z.infer<typeof CaseSpecsSchema>;

// ============================================================================
// Catalog
// ============================================================================

export const CatalogItemBaseSchema = z.object({
  componentId: z.string().min(1),
  tnProductId: z.number().int().positive(),
  tnVariantId: z.number().int().positive(),
  name: z.string().min(1),
  priceCents: z.number().int().nonnegative(),
  stock: z.number().int().nonnegative(),
});
export type CatalogItemBase = z.infer<typeof CatalogItemBaseSchema>;

export const CatalogItemSchema = z.discriminatedUnion('type', [
  CatalogItemBaseSchema.extend({
    type: z.literal('cpu'),
    specs: CpuSpecsSchema,
  }),
  CatalogItemBaseSchema.extend({
    type: z.literal('motherboard'),
    specs: MotherboardSpecsSchema,
  }),
  CatalogItemBaseSchema.extend({
    type: z.literal('ram'),
    specs: RamSpecsSchema,
  }),
  CatalogItemBaseSchema.extend({
    type: z.literal('gpu'),
    specs: GpuSpecsSchema,
  }),
  CatalogItemBaseSchema.extend({
    type: z.literal('storage'),
    specs: StorageSpecsSchema,
  }),
  CatalogItemBaseSchema.extend({
    type: z.literal('psu'),
    specs: PsuSpecsSchema,
  }),
  CatalogItemBaseSchema.extend({
    type: z.literal('case'),
    specs: CaseSpecsSchema,
  }),
]);
export type CatalogItem = z.infer<typeof CatalogItemSchema>;

// ============================================================================
// Requirements
// ============================================================================

export const UseCaseSchema = z.enum([
  'gaming',
  'office',
  'study',
  'design',
  'video_editing',
  'programming',
]);
export type UseCase = z.infer<typeof UseCaseSchema>;

export const RequirementsSchema = z.object({
  useCases: z.array(UseCaseSchema).min(1),
  budgetMaxCents: z.number().int().positive(),
  budgetFlexible: z.boolean(),
  gamingResolution: z.enum(['1080p', '1440p', '4k']).optional(),
  gamingDemand: z.enum(['light', 'demanding']).optional(),
  preferences: z
    .object({
      cpuBrand: z.enum(['amd', 'intel']).optional(),
      gpuBrand: z.enum(['nvidia', 'amd']).optional(),
      dedicatedGpu: z.boolean().optional(),
    })
    .optional(),
});
export type Requirements = z.infer<typeof RequirementsSchema>;

// ============================================================================
// Build
// ============================================================================

export const BuildItemSchema = z.object({
  type: ComponentTypeSchema,
  componentId: z.string().min(1),
  tnProductId: z.number().int().positive(),
  tnVariantId: z.number().int().positive(),
  name: z.string().min(1),
  priceCents: z.number().int().nonnegative(),
  qty: z.number().int().positive(),
});
export type BuildItem = z.infer<typeof BuildItemSchema>;

export const BuildSchema = z.object({
  id: z.string().min(1),
  tier: z.enum(['budget', 'balanced', 'performance']),
  items: z.array(BuildItemSchema).min(1),
  totalCents: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
});
export type Build = z.infer<typeof BuildSchema>;

// ============================================================================
// Compatibility & Violations
// ============================================================================

export const ViolationCodeSchema = z.enum([
  'MISSING_COMPONENT',
  'CPU_MB_SOCKET',
  'RAM_TYPE',
  'RAM_SLOTS',
  'MB_CASE_FORM_FACTOR',
  'GPU_LENGTH',
  'NEEDS_GPU',
  'NEEDS_COOLER',
  'NVME_SLOT',
  'PSU_POWER',
  'PSU_FORM_FACTOR',
  'UNEXPECTED_COMPONENT',
  'SATA_PORTS',
]);
export type ViolationCode = z.infer<typeof ViolationCodeSchema>;

export const ViolationSchema = z.object({
  code: ViolationCodeSchema,
  message: z.string(),
  componentTypes: z.array(ComponentTypeSchema),
});
export type Violation = z.infer<typeof ViolationSchema>;

export const WarningCodeSchema = z.enum([
  'BIOS_UPDATE_MAY_BE_REQUIRED',
  'SINGLE_CHANNEL_MEMORY',
]);
export type WarningCode = z.infer<typeof WarningCodeSchema>;

export const CompatibilityWarningSchema = z.object({
  code: WarningCodeSchema,
  message: z.string(),
});
export type CompatibilityWarning = z.infer<typeof CompatibilityWarningSchema>;

export const CompatibilityResultSchema = z.object({
  ok: z.boolean(),
  violations: z.array(ViolationSchema),
  warnings: z.array(CompatibilityWarningSchema),
});
export type CompatibilityResult = z.infer<typeof CompatibilityResultSchema>;

// ============================================================================
// Chat & Events
// ============================================================================

export const ChatRequestSchema = z.object({
  storeId: z.string().min(1),
  sessionId: z.string().uuid(),
  message: z.string().min(1).max(1000),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const ChatResponseSchema = z.object({
  reply: z.string(),
  suggestions: z.array(z.string()).max(4),
  builds: z.array(BuildSchema).max(3).optional(),
  recommendationId: z.string().optional(),
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;

export const EventRequestSchema = z.object({
  type: z.enum(['cart_added', 'whatsapp_clicked']),
});
export type EventRequest = z.infer<typeof EventRequestSchema>;
