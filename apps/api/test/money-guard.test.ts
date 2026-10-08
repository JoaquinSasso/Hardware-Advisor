import { describe, it, expect } from 'vitest';
import { extractAmounts, findMoneyViolations } from '../src/chat/money-guard.js';

describe('money-guard.ts', () => {
  describe('extractAmounts', () => {
    it.each([
      ['$ 1.916.710', [1916710]],
      ['$1.916.710', [1916710]],
      ['$1916710', [1916710]],
      ['1.916.710', [1916710]],
      ['tengo 1300000', [1300000]],
      ['hasta 800000', [800000]],
      ['1.916.710,50', [1916710]],
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
});
