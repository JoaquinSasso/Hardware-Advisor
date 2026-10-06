import { describe, it, expect } from 'vitest';
import { resolveProfile } from '../src/profiles.js';
import { getRamScore, getStorageScore, getGpuScore } from '../src/scoring.js';
import { recommend } from '../src/recommend.js';
import {
  buildCpu,
  buildMotherboard,
  buildRam,
  buildGpu,
  buildStorage,
  buildPsu,
  buildCase,
} from './fixtures.js';
import type { Requirements } from '@pcadvisor/shared';
import type { CatalogItem } from '@pcadvisor/shared';
import type { CpuItem, GpuItem, RamItem, StorageItem } from '../src/types.js';

describe('recommendation engine', () => {
  describe('resolveProfile', () => {
    it('gaming 1080p -> optional', () => {
      const res = resolveProfile({ useCases: ['gaming'], budgetMaxCents: 1, budgetFlexible: false, gamingResolution: '1080p' });
      expect(res.gpuPolicy).toBe('optional');
    });

    it('gaming 1440p -> required', () => {
      const res = resolveProfile({ useCases: ['gaming'], budgetMaxCents: 1, budgetFlexible: false, gamingResolution: '1440p' });
      expect(res.gpuPolicy).toBe('required');
    });

    it('gaming demanding -> required', () => {
      const res = resolveProfile({ useCases: ['gaming'], budgetMaxCents: 1, budgetFlexible: false, gamingDemand: 'demanding' });
      expect(res.gpuPolicy).toBe('required');
    });

    it('office -> avoid', () => {
      const res = resolveProfile({ useCases: ['office'], budgetMaxCents: 1, budgetFlexible: false });
      expect(res.gpuPolicy).toBe('avoid');
    });

    it('study -> avoid and specific weights', () => {
      const res = resolveProfile({ useCases: ['study'], budgetMaxCents: 1, budgetFlexible: false });
      expect(res.gpuPolicy).toBe('avoid');
      expect(res.weights).toEqual({ cpu: 45, gpu: 0, ram: 30, storage: 25 });
    });

    it('programming -> avoid and specific weights', () => {
      const res = resolveProfile({ useCases: ['programming'], budgetMaxCents: 1, budgetFlexible: false });
      expect(res.gpuPolicy).toBe('avoid');
      expect(res.weights).toEqual({ cpu: 45, gpu: 0, ram: 35, storage: 20 });
    });

    it('design -> optional and specific weights', () => {
      const res = resolveProfile({ useCases: ['design'], budgetMaxCents: 1, budgetFlexible: false });
      expect(res.gpuPolicy).toBe('optional');
      expect(res.weights).toEqual({ cpu: 30, gpu: 30, ram: 25, storage: 15 });
    });

    it('video_editing -> optional and specific weights', () => {
      const res = resolveProfile({ useCases: ['video_editing'], budgetMaxCents: 1, budgetFlexible: false });
      expect(res.gpuPolicy).toBe('optional');
      expect(res.weights).toEqual({ cpu: 40, gpu: 25, ram: 25, storage: 10 });
    });

    it('gaming+office combined', () => {
      const res = resolveProfile({ useCases: ['gaming', 'office'], budgetMaxCents: 1, budgetFlexible: false });
      expect(res.gpuPolicy).toBe('optional');
      expect(res.weights.cpu + res.weights.gpu + res.weights.ram + res.weights.storage).toBe(100);
      expect(res.weights.cpu).toBe(32); 
      expect(res.weights).toEqual({ cpu: 32, gpu: 31, ram: 20, storage: 17 });
    });

    it('dedicatedGpu true overrides policy to required', () => {
      const res = resolveProfile({ useCases: ['office'], budgetMaxCents: 1, budgetFlexible: false, preferences: { dedicatedGpu: true } });
      expect(res.gpuPolicy).toBe('required');
    });

    it('dedicatedGpu false overrides policy to avoid', () => {
      const res = resolveProfile({ useCases: ['gaming'], budgetMaxCents: 1, budgetFlexible: false, gamingDemand: 'demanding', preferences: { dedicatedGpu: false } });
      expect(res.gpuPolicy).toBe('avoid');
    });
  });

  describe('scoring', () => {
    it('ramScore rules', () => {
      const ram8_1 = buildRam({ totalGb: 8, modules: 1 }) as RamItem;
      expect(getRamScore(ram8_1, 1)).toBe(30);

      const ram16_2 = buildRam({ totalGb: 16, modules: 2 }) as RamItem;
      expect(getRamScore(ram16_2, 1)).toBe(80); // 70 + 10

      const ram8_2 = buildRam({ totalGb: 8, modules: 1 }) as RamItem;
      expect(getRamScore(ram8_2, 2)).toBe(80); // 16gb total, 2 modules -> 70 + 10

      const ram32_2 = buildRam({ totalGb: 32, modules: 2 }) as RamItem;
      expect(getRamScore(ram32_2, 1)).toBe(100); // 100 + 10 cap at 100
    });

    it('storageScore rules', () => {
      const nvme1tb = buildStorage({ capacityGb: 1000, interface: 'nvme' }) as StorageItem;
      expect(getStorageScore(nvme1tb)).toBe(90); // 80 + 10
    });

    it('gpuScore without gpu uses igpuScore', () => {
      const cpu = buildCpu({ hasIgpu: true, igpuScore: 25 }) as CpuItem;
      expect(getGpuScore(cpu, null)).toBe(25);
    });
  });

  describe('recommend cases', () => {
    const baseCatalog: CatalogItem[] = [
      buildCpu({ tdpW: 65, includesCooler: true, hasIgpu: true, igpuScore: 10, socket: 'AM5' }),
      buildMotherboard({ socket: 'AM5', memoryType: 'DDR5' }),
      buildRam({ memoryType: 'DDR5', totalGb: 16, modules: 2 }),
      buildStorage({ interface: 'nvme', capacityGb: 1000 }),
      buildCase({ supportedFormFactors: ['mATX'] }),
      buildPsu({ wattage: 500, efficiency: '80 Plus Bronze' }),
    ];

    it('gaming demanding returns only builds with gpu', () => {
      const cat = [...baseCatalog, buildGpu({ recommendedPsuW: 400 })];
      const req: Requirements = { useCases: ['gaming'], gamingDemand: 'demanding', budgetMaxCents: 10000000, budgetFlexible: false };
      const res = recommend(req, cat);
      expect(res.builds.length).toBeGreaterThan(0);
      res.builds.forEach(b => {
        expect(b.items.some(i => i.type === 'gpu')).toBe(true);
      });
    });

    it('gaming light returns builds without gpu if igpu >= 6 with warning', () => {
      const cat = [...baseCatalog]; // no gpu in catalog
      const req: Requirements = { useCases: ['gaming'], gamingDemand: 'light', budgetMaxCents: 10000000, budgetFlexible: false };
      const res = recommend(req, cat);
      expect(res.builds.length).toBeGreaterThan(0);
      expect(res.builds[0].items.some(i => i.type === 'gpu')).toBe(false);
      expect(res.builds[0].warnings.some(w => w.includes('gráficos integrados'))).toBe(true);
    });

    it('cpu without cooler is ignored', () => {
      const cat = [
        buildCpu({ includesCooler: false }),
        buildMotherboard(), buildRam(), buildStorage(), buildCase(), buildPsu()
      ];
      const req: Requirements = { useCases: ['office'], budgetMaxCents: 10000000, budgetFlexible: false };
      const res = recommend(req, cat);
      expect(res.builds.length).toBe(0);
    });

    it('gpu with uncertified psu is ignored', () => {
      const cat = [
        ...baseCatalog,
        buildGpu(),
        { ...buildPsu({ efficiency: 'Sin certificación' }), priceCents: 1, tnVariantId: 999 } as CatalogItem // very cheap, should normally win
      ];
      const req: Requirements = { useCases: ['gaming'], budgetMaxCents: 10000000, budgetFlexible: false };
      const res = recommend(req, cat);
      // It should still build, but not with the uncertified psu WHEN it has a GPU
      res.builds.forEach(b => {
        if (b.items.some(i => i.type === 'gpu')) {
          const psu = b.items.find(i => i.type === 'psu');
          expect(psu).toBeDefined();
          if (psu) expect(psu.tnVariantId).not.toBe(999);
        }
      });
    });

    it('ram 1 module with stock 1 does not use qty 2', () => {
      const cat = [
        ...baseCatalog.filter(i => i.type !== 'ram'),
        { ...buildRam({ modules: 1 }), stock: 1, tnVariantId: 888 } as CatalogItem
      ];
      const req: Requirements = { useCases: ['office'], budgetMaxCents: 10000000, budgetFlexible: false };
      const res = recommend(req, cat);
      res.builds.forEach(b => {
        const ram = b.items.find(i => i.type === 'ram');
        expect(ram?.qty).toBe(1);
      });
    });

    it('cpuBrand / gpuBrand preferences', () => {
      const intelCpu = { ...buildCpu({ socket: 'LGA1700' }), tnVariantId: 101, componentId: 'cpu101' } as CatalogItem;
      const amdCpu = { ...buildCpu({ socket: 'AM5' }), tnVariantId: 102, componentId: 'cpu102' } as CatalogItem;
      const intelMb = { ...buildMotherboard({ socket: 'LGA1700' }), tnVariantId: 103, componentId: 'mb103' } as CatalogItem;
      const amdMb = { ...buildMotherboard({ socket: 'AM5' }), tnVariantId: 104, componentId: 'mb104' } as CatalogItem;
      
      const nvidiaGpu = { ...buildGpu({ chipset: 'GeForce RTX 4060' }), tnVariantId: 201, componentId: 'gpu201' } as CatalogItem;
      const amdGpu = { ...buildGpu({ chipset: 'Radeon RX 7600' }), tnVariantId: 202, componentId: 'gpu202' } as CatalogItem;

      const cat = [
        intelCpu, amdCpu, intelMb, amdMb, nvidiaGpu, amdGpu,
        buildRam(), buildStorage(), buildCase(), buildPsu()
      ];

      const req: Requirements = {
        useCases: ['gaming'],
        budgetMaxCents: 10000000,
        budgetFlexible: false,
        preferences: { cpuBrand: 'intel', gpuBrand: 'nvidia' }
      };

      const res = recommend(req, cat);
      expect(res.builds.length).toBeGreaterThan(0);
      res.builds.forEach(b => {
        expect(b.items.find(i => i.type === 'cpu')?.tnVariantId).toBe(101);
        expect(b.items.find(i => i.type === 'gpu')?.tnVariantId).toBe(201);
      });
    });

    it('tiers selection and deduplication', () => {
      // 3 gpus to generate 3 tiers, different perfScore so they have different buildScore
      const gpuCheap = { ...buildGpu({ perfScore: 20, recommendedPsuW: 300 }), priceCents: 1000, tnVariantId: 301, componentId: 'gpu301' } as CatalogItem;
      const gpuMid = { ...buildGpu({ perfScore: 50, recommendedPsuW: 300 }), priceCents: 4000, tnVariantId: 302, componentId: 'gpu302' } as CatalogItem;
      const gpuExp = { ...buildGpu({ perfScore: 90, recommendedPsuW: 300 }), priceCents: 8000, tnVariantId: 303, componentId: 'gpu303' } as CatalogItem;
      // cpu+mb+ram+storage+case+psu cost = 6000
      // totals: cheap=7000, mid=10000, exp=14000
      const cat = [
        ...baseCatalog,
        gpuCheap, gpuMid, gpuExp
      ];
      
      // req budget: 14000 (performance: <=14000, balanced: <=11900, budget: <=9800)
      const req: Requirements = { useCases: ['gaming'], budgetMaxCents: 14000, budgetFlexible: false };
      const res = recommend(req, cat);
      
      // budget -> cheap (7000 <= 9800)
      // balanced -> mid (10000 <= 11900)
      // performance -> exp (14000 <= 14000)
      expect(res.builds.length).toBe(3);
      expect(res.builds.find(b => b.tier === 'budget')?.items.find(i => i.type === 'gpu')?.tnVariantId).toBe(301);
      expect(res.builds.find(b => b.tier === 'balanced')?.items.find(i => i.type === 'gpu')?.tnVariantId).toBe(302);
      expect(res.builds.find(b => b.tier === 'performance')?.items.find(i => i.type === 'gpu')?.tnVariantId).toBe(303);
      
      // If we lower budget to 12000:
      // performance -> mid (10000 <= 12000)
      // balanced -> mid (10000 <= 10200)
      // budget -> cheap (7000 <= 8400)
      // balanced and performance are the same -> deduplicate, keep balanced
      const req2: Requirements = { useCases: ['gaming'], budgetMaxCents: 12000, budgetFlexible: false };
      const res2 = recommend(req2, cat);
      expect(res2.builds.length).toBe(2);
      expect(res2.builds.some(b => b.tier === 'performance')).toBe(false);
      expect(res2.builds.some(b => b.tier === 'balanced')).toBe(true);
      expect(res2.builds.some(b => b.tier === 'budget')).toBe(true);
    });

    it('budgetFlexible permits an outcome up to 105% of budget', () => {
      // cost of base catalog is 6000
      const cat = [...baseCatalog];
      
      // 5800 is less than 6000. without flexible it will not fit
      const reqStrict: Requirements = { useCases: ['office'], budgetMaxCents: 5800, budgetFlexible: false };
      const resStrict = recommend(reqStrict, cat);
      expect(resStrict.builds.length).toBe(0);

      // 5800 * 1.10 = 6380. With flexible, it fits! (Actually budgetCap uses 110%, not 105%? Wait...
      // The requirement states "un armado de 105% del presupuesto aparece con flexible y no sin él".
      // Let's set the cost to 6000. 105% of what is 6000?
      // budget = 5715. 5715 * 1.05 = 6000.75
      const reqFlex: Requirements = { useCases: ['office'], budgetMaxCents: 5715, budgetFlexible: true };
      const resFlex = recommend(reqFlex, cat);
      expect(resFlex.builds.length).toBeGreaterThan(0);
    });

    it('insufficient budget returns cheapest valid', () => {
      const cat = [...baseCatalog]; // cost = 6000
      const req: Requirements = { useCases: ['office'], budgetMaxCents: 5000, budgetFlexible: false };
      const res = recommend(req, cat);
      expect(res.builds).toEqual([]);
      expect(res.cheapestValidTotalCents).toBe(6000);
    });

    it('catalog without any valid combination returns empty and null', () => {
      const cat = [
        buildCpu({ socket: 'AM4' }),
        buildMotherboard({ socket: 'LGA1700' }), // mismatched socket!
        buildRam(), buildStorage(), buildCase(), buildPsu()
      ];
      const req: Requirements = { useCases: ['office'], budgetMaxCents: 10000000, budgetFlexible: true };
      const res = recommend(req, cat);
      expect(res.builds).toEqual([]);
      expect(res.cheapestValidTotalCents).toBeNull();
    });

    it('pure and deterministic', () => {
      const cat = [...baseCatalog];
      const catCopy = JSON.parse(JSON.stringify(cat));
      const req: Requirements = { useCases: ['office'], budgetMaxCents: 10000, budgetFlexible: false };
      const reqCopy = JSON.parse(JSON.stringify(req));
      
      const res1 = recommend(req, cat);
      const res2 = recommend(req, cat);
      
      expect(res1).toEqual(res2);
      expect(cat).toEqual(catCopy); // untouched
      expect(req).toEqual(reqCopy); // untouched
    });
  });
});
