import { describe, it, expect } from 'vitest';
import { getDemoCatalog } from './demo-catalog.js';
import { recommend } from '../src/recommend.js';
import type { Requirements } from '@pcadvisor/shared';

describe('demo-recommend', () => {
  const catalog = getDemoCatalog();

  it('gaming 1080p demanding, $2.5M -> todos con gpu y fuente 80 Plus', () => {
    const req: Requirements = {
      useCases: ['gaming'],
      gamingResolution: '1080p',
      gamingDemand: 'demanding',
      budgetMaxCents: 250000000,
      budgetFlexible: false,
    };
    
    const t0 = performance.now();
    const res = recommend(req, catalog);
    const t1 = performance.now();
    expect(t1 - t0).toBeLessThan(1000);

    expect(res.builds.length).toBeGreaterThan(0);
    res.builds.forEach(build => {
      const hasGpu = build.items.some(i => i.type === 'gpu');
      expect(hasGpu).toBe(true);

      const psu = build.items.find(i => i.type === 'psu');
      if (psu) {
        const catItem = catalog.find(i => i.tnVariantId === psu.tnVariantId);
        expect(catItem?.specs.efficiency?.startsWith('80 Plus')).toBe(true);
      } else {
        const myCase = build.items.find(i => i.type === 'case');
        const caseCat = catalog.find(i => i.tnVariantId === myCase?.tnVariantId);
        expect(caseCat?.specs.includedPsu?.efficiency?.startsWith('80 Plus')).toBe(true);
      }
    });
  });

  it('gaming light, $1.3M -> al menos un armado sin gpu, CPU igpuScore >= 6 y warning', () => {
    const req: Requirements = {
      useCases: ['gaming'],
      gamingDemand: 'light',
      budgetMaxCents: 130000000,
      budgetFlexible: false,
    };

    const t0 = performance.now();
    const res = recommend(req, catalog);
    const t1 = performance.now();
    expect(t1 - t0).toBeLessThan(1000);

    expect(res.builds.length).toBeGreaterThan(0);
    
    const withoutGpu = res.builds.filter(b => !b.items.some(i => i.type === 'gpu'));
    expect(withoutGpu.length).toBeGreaterThan(0);

    withoutGpu.forEach(build => {
      const cpu = build.items.find(i => i.type === 'cpu');
      const catCpu = catalog.find(i => i.tnVariantId === cpu?.tnVariantId);
      expect(catCpu?.specs.igpuScore).toBeGreaterThanOrEqual(6);
      expect(build.warnings.some(w => w.includes('gráficos integrados'))).toBe(true);
    });
  });

  it('office, $1.3M -> al menos 1 armado, ninguno con gpu', () => {
    const req: Requirements = {
      useCases: ['office'],
      budgetMaxCents: 130000000,
      budgetFlexible: false,
    };

    const t0 = performance.now();
    const res = recommend(req, catalog);
    const t1 = performance.now();
    expect(t1 - t0).toBeLessThan(1000);

    expect(res.builds.length).toBeGreaterThan(0);
    res.builds.forEach(build => {
      expect(build.items.some(i => i.type === 'gpu')).toBe(false);
    });
  });

  it('gaming, $500k -> builds [] y cheapestValidTotalCents > 50M', () => {
    const req: Requirements = {
      useCases: ['gaming'],
      budgetMaxCents: 50000000,
      budgetFlexible: false,
    };

    const t0 = performance.now();
    const res = recommend(req, catalog);
    const t1 = performance.now();
    expect(t1 - t0).toBeLessThan(1000);

    expect(res.builds.length).toBe(0);
    expect(res.cheapestValidTotalCents).toBeGreaterThan(50000000);
  });

  it('8M sin preferencias -> < 1000ms', () => {
    const req: Requirements = {
      useCases: ['gaming'],
      budgetMaxCents: 800000000,
      budgetFlexible: true,
    };

    const t0 = performance.now();
    const res = recommend(req, catalog);
    const t1 = performance.now();
    expect(t1 - t0).toBeLessThan(1000);

    expect(res.builds.length).toBeGreaterThan(0);
  });
});
