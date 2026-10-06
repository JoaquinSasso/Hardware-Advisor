import { describe, it, expect } from 'vitest';
import { getGpuScore } from '../src/scoring.js';
import type { CpuItem, GpuItem } from '../src/types.js';

describe('scoring', () => {
  it('getGpuScore sin gpu: igpuScore 13 con 1 módulo -> 7; con 2 módulos -> 13; con gpu no cambia según módulos', () => {
    const cpu = { specs: { igpuScore: 13 } } as CpuItem;
    const gpu = { specs: { perfScore: 80 } } as GpuItem;

    // sin gpu, 1 modulo -> 13 * 0.6 = 7.8 -> floor(7.8) = 7
    expect(getGpuScore(cpu, null, 1)).toBe(7);
    
    // sin gpu, 2 modulos -> 13
    expect(getGpuScore(cpu, null, 2)).toBe(13);

    // con gpu, 1 o 2 modulos -> 80
    expect(getGpuScore(cpu, gpu, 1)).toBe(80);
    expect(getGpuScore(cpu, gpu, 2)).toBe(80);
  });
});
