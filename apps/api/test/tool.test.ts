import { describe, it, expect } from 'vitest';
import { UseCaseSchema } from '@pcadvisor/shared';
import { toolSpec, toRequirements, toolResultForLlm } from '../src/chat/tool.js';
import { formatArs } from '../src/format.js';

describe('tool.ts', () => {
  it('enums coinciden con shared', () => {
    const useCaseProp = (toolSpec.parameters as any).properties.useCases.items;
    expect(useCaseProp.enum).toEqual(UseCaseSchema.options);
  });

  it('toRequirements 1300000 -> 130000000', () => {
    const reqs = toRequirements({
      useCases: ['gaming'],
      budgetMaxArs: 1300000,
      budgetFlexible: false,
    });
    expect(reqs.budgetMaxCents).toBe(130000000);
  });

  it('formatArs(116523060) === "$ 1.165.231"', () => {
    expect(formatArs(116523060)).toBe('$ 1.165.231');
  });

  it('toolResultForLlm lanza si falta un ítem', () => {
    expect(() => toolResultForLlm({
      status: 'ok',
      builds: [{
        id: '1',
        tier: 'budget',
        totalCents: 100,
        warnings: [],
        items: [
          { type: 'cpu', componentId: 'c1', tnProductId: 1, tnVariantId: 1, name: 'CPU', priceCents: 10, qty: 1 },
          { type: 'ram', componentId: 'r1', tnProductId: 1, tnVariantId: 1, name: 'RAM', priceCents: 10, qty: 1 }
        ]
      }]
    }, [])).toThrow('RAM component not found in catalog');
  });
});
