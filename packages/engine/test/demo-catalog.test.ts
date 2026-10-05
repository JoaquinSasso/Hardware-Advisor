import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { CatalogItem, CatalogItemSchema } from '@pcadvisor/shared';
import { checkCompatibility } from '../src/index.js';
import { Part } from '../src/types.js';

let componentsRaw: any[] = [];
let hasDemoData = false;

try {
  const p = fileURLToPath(new URL('../../db/seed/demo/components.json', import.meta.url));
  componentsRaw = JSON.parse(fs.readFileSync(p, 'utf-8'));
  hasDemoData = true;
} catch (e) {
  // We'll handle failure in a test if it doesn't exist
}

const suite = describe; // quitamos el skip


suite('Demo Catalog Integration', () => {
  let catalog: CatalogItem[] = [];

  beforeAll(() => {
    if (!hasDemoData) throw new Error('demo components.json not found');
    catalog = componentsRaw.map((raw, idx) => ({
      type: raw.type,
      componentId: `comp-${idx}`,
      tnProductId: idx + 1,
      tnVariantId: idx + 1,
      name: raw.canonicalName,
      priceCents: 10000,
      stock: 10,
      specs: raw.specs,
    })) as CatalogItem[];
  });

  const getByName = (name: string): CatalogItem => {
    const item = catalog.find((c) => c.name === name);
    if (!item) throw new Error(`Component ${name} not found`);
    return item;
  };

  it('Todos validan con CatalogItemSchema', () => {
    for (const item of catalog) {
      expect(CatalogItemSchema.parse(item)).toEqual(item);
    }
  });

  it('AMD Ryzen 7 5700X y Intel Core i5-14600KF en cualquier armado -> NEEDS_COOLER', () => {
    const cpu1 = getByName('AMD Ryzen 7 5700X');
    const cpu2 = getByName('Intel Core i5-14600KF');
    
    // Armado base válido de AM4 para aislar el problema
    const parts1: Part[] = [
      { item: cpu1, qty: 1 },
      { item: catalog.find(c => c.name === 'Gigabyte A520M K V2')!, qty: 1 },
      { item: catalog.find(c => c.type === 'ram' && c.specs.memoryType === 'DDR4')!, qty: 1 },
      { item: catalog.find(c => c.type === 'gpu')!, qty: 1 },
      { item: catalog.find(c => c.type === 'storage')!, qty: 1 },
      { item: catalog.find(c => c.type === 'psu')!, qty: 1 },
      { item: catalog.find(c => c.type === 'case' && c.specs.includedPsu === null)!, qty: 1 },
    ];
    
    const res1 = checkCompatibility(parts1);
    expect(res1.violations.some(v => v.code === 'NEEDS_COOLER')).toBe(true);

    const parts2 = [...parts1];
    parts2[0] = { item: cpu2, qty: 1 };
    parts2[1] = { item: catalog.find(c => c.type === 'motherboard' && c.specs.socket === 'LGA1700')!, qty: 1 };
    parts2[2] = { item: catalog.find(c => c.type === 'ram' && c.specs.memoryType === 'DDR5')!, qty: 1 };
    
    const res2 = checkCompatibility(parts2);
    expect(res2.violations.some(v => v.code === 'NEEDS_COOLER')).toBe(true);
  });

  it('Sapphire Pulse Radeon RX 9070 XT 16G + Gabinete Kit Micro ATX con fuente 500W -> GPU_LENGTH y PSU_POWER', () => {
    const gpu = getByName('Sapphire Pulse Radeon RX 9070 XT 16G');
    const cabinet = getByName('Gabinete Kit Micro ATX con fuente 500W');
    
    const parts: Part[] = [
      { item: getByName('AMD Ryzen 5 5600GT'), qty: 1 },
      { item: getByName('Gigabyte A520M K V2'), qty: 1 },
      { item: catalog.find(c => c.type === 'ram' && c.specs.memoryType === 'DDR4')!, qty: 1 },
      { item: catalog.find(c => c.type === 'storage')!, qty: 1 },
      { item: gpu, qty: 1 },
      { item: cabinet, qty: 1 },
    ];

    const res = checkCompatibility(parts);
    expect(res.violations.map(v => v.code)).toContain('GPU_LENGTH');
    expect(res.violations.map(v => v.code)).toContain('PSU_POWER');
  });

  it('ASUS Prime B650-PLUS + Thermaltake AH T200 -> MB_CASE_FORM_FACTOR', () => {
    const mb = getByName('ASUS Prime B650-PLUS');
    const cabinet = getByName('Thermaltake AH T200');

    const parts: Part[] = [
      { item: getByName('AMD Ryzen 5 7600'), qty: 1 },
      { item: mb, qty: 1 },
      { item: catalog.find(c => c.type === 'ram' && c.specs.memoryType === 'DDR5')!, qty: 1 },
      { item: catalog.find(c => c.type === 'storage')!, qty: 1 },
      { item: catalog.find(c => c.type === 'psu')!, qty: 1 },
      { item: cabinet, qty: 1 },
    ];

    const res = checkCompatibility(parts);
    expect(res.violations.some(v => v.code === 'MB_CASE_FORM_FACTOR')).toBe(true);
  });

  it('Build específico ok con warnings', () => {
    const parts: Part[] = [
      { item: getByName('AMD Ryzen 5 5600GT'), qty: 1 },
      { item: getByName('Gigabyte A520M K V2'), qty: 1 },
      { item: getByName('Kingston Fury Beast DDR4 8GB 3200'), qty: 1 },
      { item: getByName('Kingston NV3 1TB NVMe'), qty: 1 },
      { item: getByName('Thermaltake AH T200'), qty: 1 },
      { item: getByName('Cooler Master MWE 550 Bronze V3'), qty: 1 },
    ];

    const res = checkCompatibility(parts);
    expect(res.ok).toBe(true);
    expect(res.warnings.map(w => w.code)).toContain('BIOS_UPDATE_MAY_BE_REQUIRED');
    expect(res.warnings.map(w => w.code)).toContain('SINGLE_CHANNEL_MEMORY');
  });
});
