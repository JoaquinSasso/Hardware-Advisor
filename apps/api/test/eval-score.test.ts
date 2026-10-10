import { describe, it, expect } from 'vitest';
import { scoreCase } from '../eval/score.js';
import type { Case, TurnRecord } from '../eval/schema.js';

describe('scoreCase', () => {
  const baseCase: Case = {
    id: 't1',
    source: 'synth_gpt',
    turns: [],
    expect: { kind: 'recommend' },
  };

  const baseTurn: TurnRecord = {
    message: '',
    reply: '',
    rawTexts: [],
    toolCalls: [],
    ms: 0,
    attempts: [],
    moneyViolations: [],
  };

  it('recommend que aprueba con todos los campos', () => {
    const c: Case = {
      ...baseCase,
      expect: {
        kind: 'recommend',
        budgetMaxArs: 100,
        budgetFlexible: true,
        useCases: ['gaming'],
        gamingDemand: 'light',
        gamingResolution: '1080p',
        preferences: { cpuBrand: 'amd' },
      },
    };
    const turn = {
      ...baseTurn,
      toolCalls: [{
        args: {
          budgetMaxArs: 100,
          budgetFlexible: true,
          useCases: ['gaming'],
          gamingDemand: 'light',
          gamingResolution: '1080p',
          preferences: { cpuBrand: 'amd' },
        },
      }],
    };
    const result = scoreCase(c, [turn]);
    expect(result.ok).toBe(true);
    expect(result.failedFields).toBeUndefined();
  });

  it('recommend con budgetMaxArs distinto -> failedFields toEqual(["budgetMaxArs"])', () => {
    const c: Case = {
      ...baseCase,
      expect: { kind: 'recommend', budgetMaxArs: 100 },
    };
    const turn = {
      ...baseTurn,
      toolCalls: [{ args: { budgetMaxArs: 200 } }],
    };
    const result = scoreCase(c, [turn]);
    expect(result.ok).toBe(false);
    expect(result.failedFields).toEqual(['budgetMaxArs']);
  });

  it('recommend sin tool call -> failedFields toEqual(["toolCall"])', () => {
    const c: Case = { ...baseCase, expect: { kind: 'recommend' } };
    const turn = { ...baseTurn, toolCalls: [] };
    const result = scoreCase(c, [turn]);
    expect(result.ok).toBe(false);
    expect(result.failedFields).toEqual(['toolCall']);
  });

  it('recommend con useCases esperado ⊂ actual aprueba', () => {
    const c: Case = {
      ...baseCase,
      expect: { kind: 'recommend', useCases: ['gaming'] },
    };
    const turn = {
      ...baseTurn,
      toolCalls: [{ args: { useCases: ['office', 'gaming'] } }],
    };
    const result = scoreCase(c, [turn]);
    expect(result.ok).toBe(true);
    expect(result.failedFields).toBeUndefined();
  });

  it('ask con tool call no aprueba', () => {
    const c: Case = { ...baseCase, expect: { kind: 'ask' } };
    const turn = {
      ...baseTurn,
      reply: '?',
      toolCalls: [{ args: {} }],
    };
    const result = scoreCase(c, [turn]);
    expect(result.ok).toBe(false);
  });

  it('ask sin "?" no aprueba', () => {
    const c: Case = { ...baseCase, expect: { kind: 'ask' } };
    const turn = {
      ...baseTurn,
      reply: 'hola',
      toolCalls: [],
    };
    const result = scoreCase(c, [turn]);
    expect(result.ok).toBe(false);
  });

  it('out_of_scope sin tool call -> aprobado automatico y needsReview toBe(true)', () => {
    const c: Case = { ...baseCase, expect: { kind: 'out_of_scope' } };
    const turn = { ...baseTurn, toolCalls: [] };
    const result = scoreCase(c, [turn]);
    expect(result.ok).toBe(true);
    expect(result.needsReview).toBe(true);
  });

  it('quote_price con el totalLabel en el reply aprueba; sin el no aprueba', () => {
    const c: Case = { ...baseCase, expect: { kind: 'quote_price' } };
    const turnWithTotal = {
      ...baseTurn,
      toolCalls: [{
        args: {},
        result: { status: 'ok', builds: [{ totalLabel: '$ 100.000' }] },
      }],
      reply: 'Cuesta $ 100.000 total',
    };
    let result = scoreCase(c, [turnWithTotal]);
    expect(result.ok).toBe(true);

    const turnWithoutTotal = {
      ...baseTurn,
      toolCalls: [{
        args: {},
        result: { status: 'ok', builds: [{ totalLabel: '$ 100.000' }] },
      }],
      reply: 'Cuesta mucho',
    };
    result = scoreCase(c, [turnWithoutTotal]);
    expect(result.ok).toBe(false);
  });

  it('markdown cuenta "**hola**" y no cuenta "2*3*4"', () => {
    const turn1 = { ...baseTurn, rawTexts: ['**hola**'] };
    const turn2 = { ...baseTurn, rawTexts: ['2*3*4'] };
    expect(scoreCase(baseCase, [turn1]).markdown).toBe(1);
    expect(scoreCase(baseCase, [turn2]).markdown).toBe(0);
  });

  it('bannedWords cuenta "Ideal" y no cuenta "idealmente"', () => {
    const turn1 = { ...baseTurn, rawTexts: ['Esto es Ideal para vos'] };
    const turn2 = { ...baseTurn, rawTexts: ['idealmente seria asi'] };
    expect(scoreCase(baseCase, [turn1]).bannedWords).toBe(1);
    expect(scoreCase(baseCase, [turn2]).bannedWords).toBe(0);
  });

  it('internalTerms cuenta "un totalLabel de" y no cuenta "precio total"', () => {
    const turn1 = { ...baseTurn, rawTexts: ['un totalLabel de'] };
    const turn2 = { ...baseTurn, rawTexts: ['precio total'] };
    expect(scoreCase(baseCase, [turn1]).internalTerms).toBe(1);
    expect(scoreCase(baseCase, [turn2]).internalTerms).toBe(0);
  });

  it('caso con error -> no aprueba y needsReview toBe(true)', () => {
    const result = scoreCase(baseCase, [baseTurn], 'Error timeout');
    expect(result.ok).toBe(false);
    expect(result.needsReview).toBe(true);
  });
});
