import { describe, it, expect } from 'vitest';
import { extractAmounts, findMoneyViolations, collectAllowedAmounts, extractUserAmounts } from '../src/chat/money-guard.js';
import { type ChatTurn } from '@pcadvisor/shared';

describe('money-guard.ts', () => {
  describe('extractAmounts', () => {
    it.each([
			["$ 1.916.710", [1916710]],
			["$1.916.710", [1916710]],
			["$1916710", [1916710]],
			["1.916.710", [1916710]],
			["tengo 1300000", [1300000]],
			["hasta 800000", [800000]],
			["1.916.710,50", [1916710]],
		])('reconoce: "%s" -> %j', (input, expected) => {
			expect(extractAmounts(input)).toEqual(expected);
		});

    it.each([
      'i5-12400F',
      'Core i3 12100F',
      '14600KF',
      'RTX 5060',
      'Ryzen 5 5600GT',
      '3200MHz',
      '16 GB',
      '2026',
      '1,3 millones',
      'KF432C16BB',
    ])('NO reconoce: "%s"', (input) => {
      expect(extractAmounts(input)).toEqual([]);
    });
  });

  describe('findMoneyViolations', () => {
    it('el Intel Core i5-12400F cuesta $ 2.081.710 con 2081710 permitido -> []', () => {
      expect(
        findMoneyViolations('el Intel Core i5-12400F cuesta $ 2.081.710', new Set([2081710]))
      ).toEqual([]);
    });

    it('monto inventado -> [monto]', () => {
      const allowed = new Set([1500000]);
      expect(findMoneyViolations('El precio es $ 1.916.710', allowed)).toEqual([1916710]);
    });
  });

  describe('collectAllowedAmounts', () => {
    it('turno tool no_builds_in_budget con minimumBudgetArs: 1165232, minimumBudgetLabel: "$ 1.165.231" -> el set contiene 1165231 y 1165232; y findMoneyViolations("arranca en $ 1.165.231", set) -> []', () => {
      const toolTurn: ChatTurn = {
        role: 'tool',
        name: 'recommend_builds',
        result: {
          status: 'no_builds_in_budget',
          minimumBudgetArs: 1165232,
          minimumBudgetLabel: '$ 1.165.231',
        },
      };
      const set = collectAllowedAmounts([toolTurn]);
      expect(set.has(1165231)).toBe(true);
      expect(set.has(1165232)).toBe(true);
      expect(findMoneyViolations('arranca en $ 1.165.231', set)).toEqual([]);
    });

    it('collectAllowedAmounts con un turno user "listo, la de 1M entonces" -> findMoneyViolations([])', () => {
      const set = collectAllowedAmounts([{ role: 'user', text: 'listo, la de 1M entonces' } as ChatTurn]);
      expect(findMoneyViolations('Con un presupuesto de 1000000 pesos…', set)).toEqual([]);
    });

    it('un turno assistant con texto "800 lucas" NO agrega 800000 (la jerga solo cuenta en turnos user)', () => {
      const set = collectAllowedAmounts([{ role: 'assistant', text: '800 lucas' } as ChatTurn]);
      expect(set.has(800000)).toBe(false);
    });
  });

  describe('extractUserAmounts', () => {
    it.each([
      ['tengo 1.2M', [1200000]],
      ['1,2M ponele', [1200000]],
      ['con 1 palo q tire bien', [1000000]],
      ['un palo y medio', [1500000]],
      ['1 palo 500', [1500000]],
      ['2 palos y medio', [2500000]],
      ['800 lucas', [800000]],
      ['170k', [170000]],
      ['700mil pesos', [700000]],
      ['1,3 millones', [1300000]],
      ['un millón y medio', [1500000]],
      ['2 millones de pesos', [2000000]],
      ['entre 900 y 1200', [900, 1200, 900000, 1200000]],
      ['tengo 1300000', [1300000]],
      ['2,07 palos', [2070000]],
    ])('reconoce: "%s" -> %j', (input, expected) => {
      expect(extractUserAmounts(input)).toEqual(expected);
    });

    it.each([
      'i5-12400F',
      'RTX 5060',
      'Ryzen 5 5600GT',
      '3200MHz',
      '16 GB',
    ])('NO reconoce: "%s"', (input) => {
      expect(extractUserAmounts(input)).toEqual([]);
    });
  });
});
