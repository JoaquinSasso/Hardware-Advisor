import { describe, it, expect } from 'vitest';
import { checkCompatibility, requiredPsuW } from '../src/index.js';
import { Part } from '../src/types.js';
import {
  buildCpu,
  buildMotherboard,
  buildRam,
  buildGpu,
  buildStorage,
  buildPsu,
  buildCase,
} from './fixtures.js';
import { CompatibilityResultSchema } from '@pcadvisor/shared';

describe('Engine Compatibility', () => {
  const getBaseParts = (): Part[] => [
    { item: buildCpu(), qty: 1 },
    { item: buildMotherboard(), qty: 1 },
    { item: buildRam(), qty: 1 },
    { item: buildGpu(), qty: 1 },
    { item: buildStorage(), qty: 1 },
    { item: buildPsu(), qty: 1 },
    { item: buildCase(), qty: 1 },
  ];

  it('1. El armado base es ok, sin violaciones ni warnings', () => {
    const parts = getBaseParts();
    const result = checkCompatibility(parts);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  describe('2. Por CADA código técnico de la tabla', () => {
    it.each([
      [
        'CPU_MB_SOCKET',
        { item: buildCpu({ socket: 'AM4' }), qty: 1 },
        { item: buildMotherboard({ socket: 'AM5' }), qty: 1 },
        ['cpu', 'motherboard'],
      ],
      [
        'RAM_SLOTS',
        { item: buildRam({ modules: 4 }), qty: 2 }, // 8 modules
        { item: buildMotherboard({ memorySlots: 4 }), qty: 1 },
        ['ram', 'motherboard'],
      ],
      [
        'MB_CASE_FORM_FACTOR',
        { item: buildMotherboard({ formFactor: 'ATX' }), qty: 1 },
        { item: buildCase({ supportedFormFactors: ['mATX', 'ITX'] }), qty: 1 },
        ['motherboard', 'case'],
      ],
      [
        'GPU_LENGTH',
        { item: buildGpu({ lengthMm: 350 }), qty: 1 },
        { item: buildCase({ maxGpuLengthMm: 330 }), qty: 1 },
        ['gpu', 'case'],
      ],
      [
        'NEEDS_GPU',
        { item: buildCpu({ hasIgpu: false }), qty: 1 },
        undefined,
        ['cpu', 'gpu'],
      ],
      [
        'NEEDS_COOLER',
        { item: buildCpu({ includesCooler: false }), qty: 1 },
        undefined,
        ['cpu'],
      ],
      [
        'NVME_SLOT',
        { item: buildStorage({ interface: 'nvme' }), qty: 3 },
        { item: buildMotherboard({ m2Slots: 2 }), qty: 1 },
        ['storage', 'motherboard'],
      ],
      [
        'SATA_PORTS',
        { item: buildStorage({ interface: 'sata' }), qty: 5 },
        { item: buildMotherboard({ sataPorts: 4 }), qty: 1 },
        ['storage', 'motherboard'],
      ],
      [
        'PSU_POWER',
        { item: buildPsu({ wattage: 300 }), qty: 1 },
        { item: buildCpu({ tdpW: 150 }), qty: 1 }, // estimated: 150 + 150 + 75 = 375 * 1.4 = 525
        ['psu', 'cpu', 'gpu'],
      ],
      [
        'PSU_FORM_FACTOR',
        { item: buildPsu({ formFactor: 'ATX' }), qty: 1 },
        { item: buildCase({ psuFormFactor: 'SFX' }), qty: 1 },
        ['psu', 'case'],
      ]
    ])('viola %s', (code, part1, part2, expectedComponentTypes) => {
      const parts = getBaseParts();
      if (code === 'NEEDS_GPU') {
        const idxGpu = parts.findIndex(p => p.item.type === 'gpu');
        parts.splice(idxGpu, 1);
        parts.find(p => p.item.type === 'cpu')!.item = buildCpu({ hasIgpu: false });
      } else if (code === 'NEEDS_COOLER') {
        parts.find(p => p.item.type === 'cpu')!.item = buildCpu({ includesCooler: false });
      } else {
        const p1Idx = parts.findIndex(p => p.item.type === part1?.item.type);
        if (p1Idx >= 0) parts.splice(p1Idx, 1, part1 as Part);
        
        if (part2) {
          const p2Idx = parts.findIndex(p => p.item.type === part2.item.type);
          if (p2Idx >= 0) parts.splice(p2Idx, 1, part2 as Part);
        }
      }

      const result = checkCompatibility(parts);
      expect(result.ok).toBe(false);
      const violation = result.violations.find(v => v.code === code);
      expect(violation).toBeDefined();
      expect(violation?.componentTypes).toEqual(expectedComponentTypes);
    });

    it('RAM_TYPE: límite', () => {
      const parts = getBaseParts();
      parts.find(p => p.item.type === 'cpu')!.item.specs = { ...buildCpu().specs, memoryTypes: ['DDR5', 'DDR4'] };
      const result = checkCompatibility(parts);
      expect(result.ok).toBe(true);
    });
    
    it('SATA_PORTS límite', () => {
      const parts = getBaseParts();
      parts.find(p => p.item.type === 'storage')!.item = buildStorage({ interface: 'sata' });
      parts.find(p => p.item.type === 'storage')!.qty = 4;
      parts.find(p => p.item.type === 'motherboard')!.item = buildMotherboard({ sataPorts: 4 });
      const result = checkCompatibility(parts);
      expect(result.ok).toBe(true);
    });
    
    it('NEEDS_COOLER límite', () => {
      const parts = getBaseParts();
      parts.find(p => p.item.type === 'cpu')!.item = buildCpu({ includesCooler: true });
      const result = checkCompatibility(parts);
      expect(result.ok).toBe(true);
    });
  });

  it('3. RAM_TYPE: falla por mother, falla por CPU, falla por ambas -> siempre UNA violación', () => {
    // Falla mother
    let parts = getBaseParts();
    parts.find(p => p.item.type === 'ram')!.item = buildRam({ memoryType: 'DDR4' });
    parts.find(p => p.item.type === 'cpu')!.item = buildCpu({ memoryTypes: ['DDR5', 'DDR4'] });
    let result = checkCompatibility(parts);
    expect(result.violations.filter(v => v.code === 'RAM_TYPE')).toHaveLength(1);

    // Falla cpu
    parts = getBaseParts();
    parts.find(p => p.item.type === 'cpu')!.item = buildCpu({ memoryTypes: ['DDR4'] });
    result = checkCompatibility(parts);
    expect(result.violations.filter(v => v.code === 'RAM_TYPE')).toHaveLength(1);

    // Falla ambas
    parts = getBaseParts();
    parts.find(p => p.item.type === 'ram')!.item = buildRam({ memoryType: 'DDR4' });
    parts.find(p => p.item.type === 'motherboard')!.item = buildMotherboard({ memoryType: 'DDR5' });
    parts.find(p => p.item.type === 'cpu')!.item = buildCpu({ memoryTypes: ['DDR5'] });
    result = checkCompatibility(parts);
    expect(result.violations.filter(v => v.code === 'RAM_TYPE')).toHaveLength(1);
  });

  it('4. Estructura: violaciones', () => {
    // Falta cpu
    const parts = getBaseParts().filter(p => p.item.type !== 'cpu');
    const result = checkCompatibility(parts);
    expect(result.violations.some(v => v.code === 'MISSING_COMPONENT')).toBe(true);
    expect(result.warnings).toHaveLength(0);

    // qty < 1
    const partsQty = getBaseParts();
    partsQty.find(p => p.item.type === 'gpu')!.qty = 0;
    const resultQty = checkCompatibility(partsQty);
    expect(resultQty.violations.some(v => v.code === 'UNEXPECTED_COMPONENT')).toBe(true);

    // Más de una Part de cpu
    const parts2 = [...getBaseParts(), { item: buildCpu(), qty: 1 }];
    const result2 = checkCompatibility(parts2);
    expect(result2.violations.some(v => v.code === 'UNEXPECTED_COMPONENT')).toBe(true);

    // gpu qty 2
    const parts3 = getBaseParts();
    parts3.find(p => p.item.type === 'gpu')!.qty = 2;
    const result3 = checkCompatibility(parts3);
    expect(result3.violations.some(v => v.code === 'UNEXPECTED_COMPONENT')).toBe(true);
    
    // Dos memorias ram distintas
    const parts4 = [...getBaseParts(), { item: buildRam({ speedMhz: 4800 }), qty: 1 }];
    const result4 = checkCompatibility(parts4);
    expect(result4.violations.some(v => v.code === 'UNEXPECTED_COMPONENT')).toBe(true);
    
    // PSU presente + gabinete con includedPsu
    const parts5 = getBaseParts();
    parts5.find(p => p.item.type === 'case')!.item = buildCase({
      includedPsu: { wattage: 650, efficiency: 'Bronze', formFactor: 'ATX' }
    });
    const result5 = checkCompatibility(parts5);
    expect(result5.violations.some(v => v.code === 'UNEXPECTED_COMPONENT')).toBe(true);
    
    // Storage con multiple parts y qty > 1 es válido
    const parts6 = getBaseParts();
    parts6.find(p => p.item.type === 'storage')!.qty = 2;
    parts6.push({ item: buildStorage({ capacityGb: 500, interface: 'sata' }), qty: 1 });
    const result6 = checkCompatibility(parts6);
    expect(result6.ok).toBe(true);
  });

  it('5. Gabinete con includedPsu y sin psu', () => {
    const parts = getBaseParts().filter(p => p.item.type !== 'psu');
    parts.find(p => p.item.type === 'case')!.item = buildCase({
      includedPsu: { wattage: 650, efficiency: '80 Plus Bronze', formFactor: 'ATX' }
    });
    const result = checkCompatibility(parts);
    expect(result.ok).toBe(true);

    parts.find(p => p.item.type === 'case')!.item = buildCase({
      includedPsu: { wattage: 100, efficiency: '80 Plus Bronze', formFactor: 'ATX' }
    });
    const result2 = checkCompatibility(parts);
    expect(result2.violations.find(v => v.code === 'PSU_POWER')?.componentTypes).toEqual(['case', 'cpu', 'gpu']);
  });

  it('6. PSU SFX en gabinete ATX válido; PSU ATX en gabinete SFX -> PSU_FORM_FACTOR', () => {
    const parts = getBaseParts();
    parts.find(p => p.item.type === 'psu')!.item = buildPsu({ formFactor: 'SFX' });
    const result = checkCompatibility(parts);
    expect(result.ok).toBe(true);

    parts.find(p => p.item.type === 'case')!.item = buildCase({ psuFormFactor: 'SFX' });
    parts.find(p => p.item.type === 'psu')!.item = buildPsu({ formFactor: 'ATX' });
    const result2 = checkCompatibility(parts);
    expect(result2.violations.some(v => v.code === 'PSU_FORM_FACTOR')).toBe(true);
  });

  it('7. Varias violaciones a la vez se reportan todas, en el orden de la tabla', () => {
    const parts = getBaseParts();
    parts.find(p => p.item.type === 'cpu')!.item = buildCpu({ socket: 'AM4' }); // CPU_MB_SOCKET
    parts.find(p => p.item.type === 'gpu')!.item = buildGpu({ lengthMm: 400 }); // GPU_LENGTH
    const result = checkCompatibility(parts);
    expect(result.violations.map(v => v.code)).toEqual(['CPU_MB_SOCKET', 'GPU_LENGTH']);
  });

  it('8. Sin gpu con hasIgpu true: válido', () => {
    const parts = getBaseParts().filter(p => p.item.type !== 'gpu');
    parts.find(p => p.item.type === 'cpu')!.item = buildCpu({ hasIgpu: true });
    const result = checkCompatibility(parts);
    expect(result.ok).toBe(true);
  });

  it('9. Warnings', () => {
    const parts = getBaseParts();
    parts.find(p => p.item.type === 'motherboard')!.item = buildMotherboard({ biosNote: 'Update required' });
    parts.find(p => p.item.type === 'ram')!.item = buildRam({ modules: 1 });
    const result = checkCompatibility(parts);
    expect(result.warnings.map(w => w.code)).toEqual(['BIOS_UPDATE_MAY_BE_REQUIRED', 'SINGLE_CHANNEL_MEMORY']);

    parts.find(p => p.item.type === 'ram')!.qty = 2;
    const result2 = checkCompatibility(parts);
    expect(result2.warnings.map(w => w.code)).toEqual(['BIOS_UPDATE_MAY_BE_REQUIRED']);
  });

  it('10. Pureza', () => {
    const parts = getBaseParts();
    const clonedParts = structuredClone(parts);
    const result1 = checkCompatibility(parts);
    const result2 = checkCompatibility(parts);
    expect(result1).toEqual(result2);
    expect(parts).toEqual(clonedParts);
  });

  it('11. Todo resultado valida contra CompatibilityResultSchema', () => {
    const parts = getBaseParts();
    const result = checkCompatibility(parts);
    expect(CompatibilityResultSchema.parse(result)).toEqual(result);
  });

  it('12. power.ts', () => {
    expect(requiredPsuW(65, null)).toBe(196);
    expect(requiredPsuW(65, { tbpW: 250, recommendedPsuW: 650 })).toBe(650);
    expect(requiredPsuW(125, { tbpW: 304, recommendedPsuW: 300 })).toBe(706);
  });

  it('RAM_SLOTS limite', () => {
    const parts = getBaseParts();
    parts.find(p => p.item.type === 'ram')!.item = buildRam({ modules: 2 });
    parts.find(p => p.item.type === 'ram')!.qty = 2; // 4 modules total
    parts.find(p => p.item.type === 'motherboard')!.item = buildMotherboard({ memorySlots: 4 });
    const result = checkCompatibility(parts);
    expect(result.ok).toBe(true);
  });

  it('NVME limite', () => {
    const parts = getBaseParts();
    parts.find(p => p.item.type === 'storage')!.qty = 2;
    parts.find(p => p.item.type === 'motherboard')!.item = buildMotherboard({ m2Slots: 2 });
    const result = checkCompatibility(parts);
    expect(result.ok).toBe(true);
  });

  it('GPU_LENGTH limite', () => {
    const parts = getBaseParts();
    parts.find(p => p.item.type === 'gpu')!.item = buildGpu({ lengthMm: 330 });
    parts.find(p => p.item.type === 'case')!.item = buildCase({ maxGpuLengthMm: 330 });
    const result = checkCompatibility(parts);
    expect(result.ok).toBe(true);
  });
  
  it('PSU_POWER limite', () => {
    const parts = getBaseParts();
    parts.find(p => p.item.type === 'psu')!.item = buildPsu({ wattage: 550 });
    parts.find(p => p.item.type === 'gpu')!.item = buildGpu({ tbpW: 100, recommendedPsuW: 550 });
    parts.find(p => p.item.type === 'cpu')!.item = buildCpu({ tdpW: 65 });
    // estimated = 65 + 100 + 75 = 240
    // req = max(ceil(240 * 1.4) = 336, 550) = 550
    const result = checkCompatibility(parts);
    expect(result.ok).toBe(true);
  });
});
