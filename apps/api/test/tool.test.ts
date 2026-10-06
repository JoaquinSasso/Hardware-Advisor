import { describe, it, expect } from 'vitest';
import { UseCaseSchema } from '@pcadvisor/shared';
import { toolSpec, toRequirements, toolResultForLlm } from '../src/chat/tool.js';

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

  it('un build con internalNotes -> el resultado para el LLM no las contiene', () => {
    const catalog = [
      { type: 'ram', componentId: 'r1', specs: { totalGb: 8 } } as any,
      { type: 'storage', componentId: 's1', specs: { capacityGb: 500, interface: 'nvme' } } as any,
    ];
    const result = toolResultForLlm({
      status: 'ok',
      builds: [{
        id: '1',
        tier: 'budget',
        totalCents: 100,
        warnings: ['customer warning'],
        internalNotes: ['internal note'],
        items: [
          { type: 'cpu', componentId: 'c1', tnProductId: 1, tnVariantId: 1, name: 'CPU', priceCents: 10, qty: 1 },
          { type: 'ram', componentId: 'r1', tnProductId: 1, tnVariantId: 1, name: 'RAM', priceCents: 10, qty: 1 },
          { type: 'storage', componentId: 's1', tnProductId: 1, tnVariantId: 1, name: 'Storage', priceCents: 10, qty: 1 }
        ]
      }]
    }, catalog);
    expect((result as any).builds[0].warnings).toEqual(['customer warning']);
    expect((result as any).builds[0].internalNotes).toBeUndefined();
  });
});
