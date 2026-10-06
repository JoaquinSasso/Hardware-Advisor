import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { recommend } from '../src/recommend.js';
import { checkCompatibility } from '../src/compatibility.js';
import { resolveProfile, MIN_GAMING_IGPU_SCORE } from '../src/profiles.js';
import { calculateBuildScore } from '../src/scoring.js';
import { isCertifiedPsu } from '../src/policy.js';
import {
  RequirementsSchema,
  BuildSchema,
  type UseCase,
} from '@pcadvisor/shared';
import type { CpuItem, GpuItem, RamItem, StorageItem, Part } from '../src/types.js';

import { getDemoCatalog } from './demo-catalog.js';

describe('recommendation property tests', () => {
  it('should satisfy requirements for valid outputs', () => {
    const catalog = getDemoCatalog();
    
    expect(catalog.length).toBeGreaterThan(0);

    const useCasesGen = fc.subarray(['gaming', 'office', 'study', 'design', 'video_editing', 'programming'] as const, { minLength: 1 });
    const budgetGen = fc.integer({ min: 50000000, max: 800000000 });
    const flexGen = fc.boolean();
    const resolutionGen = fc.option(fc.constantFrom('1080p', '1440p', '4k') as fc.Arbitrary<'1080p'|'1440p'|'4k'>);
    const demandGen = fc.option(fc.constantFrom('light', 'demanding') as fc.Arbitrary<'light'|'demanding'>);
    const prefsGen = fc.option(fc.record({
      cpuBrand: fc.option(fc.constantFrom('intel', 'amd') as fc.Arbitrary<'intel'|'amd'>, { nil: undefined }),
      gpuBrand: fc.option(fc.constantFrom('nvidia', 'amd') as fc.Arbitrary<'nvidia'|'amd'>, { nil: undefined }),
      dedicatedGpu: fc.option(fc.boolean(), { nil: undefined }),
    }, { withDeletedKeys: true }), { nil: undefined });

    fc.assert(
      fc.property(
        useCasesGen, budgetGen, flexGen, resolutionGen, demandGen, prefsGen,
        (useCases, budgetMaxCents, budgetFlexible, gamingResolution, gamingDemand, preferences) => {
          const rawReq: any = {
            useCases,
            budgetMaxCents,
            budgetFlexible,
          };
          if (gamingResolution !== null) rawReq.gamingResolution = gamingResolution;
          if (gamingDemand !== null) rawReq.gamingDemand = gamingDemand;
          if (preferences !== null) rawReq.preferences = preferences;

          const req = RequirementsSchema.parse(rawReq);
          const res = recommend(req, catalog);
          const profile = resolveProfile(req);

          if (res.builds.length > 0) {
            expect(res.cheapestValidTotalCents).toBeNull();
          } else {
            if (res.cheapestValidTotalCents !== null) {
              const budgetCap = req.budgetFlexible ? Math.floor(req.budgetMaxCents * 110 / 100) : req.budgetMaxCents;
              expect(res.cheapestValidTotalCents).toBeGreaterThan(budgetCap);
            }
          }

          let prevTotal = -1;
          let prevScore = -1;
          const ids = new Set<string>();

          for (const build of res.builds) {
            expect(() => BuildSchema.parse(build)).not.toThrow();
            
            expect(ids.has(build.id)).toBe(false);
            ids.add(build.id);

            for (const note of (build as any).internalNotes || []) {
              expect(build.warnings).not.toContain(note);
            }

            let calculatedTotal = 0;
            const parts: Part[] = [];
            
            let hasGpu = false;
            let cpuIgpuScore = 0;
            let psuCertified = false;
            
            let bCpu: CpuItem | undefined;
            let bGpu: GpuItem | undefined;
            let bRam: RamItem | undefined;
            let bStorage: StorageItem | undefined;
            let bRamQty = 1;

            for (const bItem of build.items) {
              calculatedTotal += bItem.priceCents * bItem.qty;
              const catItem = catalog.find(i => i.tnVariantId === bItem.tnVariantId);
              if (!catItem) throw new Error('Item not in catalog');
              expect(bItem.qty).toBeLessThanOrEqual(catItem.stock);
              parts.push({ item: catItem, qty: bItem.qty });
              
              if (catItem.type === 'cpu') {
                cpuIgpuScore = catItem.specs.igpuScore;
                bCpu = catItem as CpuItem;
              }
              if (catItem.type === 'gpu') {
                hasGpu = true;
                bGpu = catItem as GpuItem;
              }
              if (catItem.type === 'ram') {
                bRam = catItem as RamItem;
                bRamQty = bItem.qty;
              }
              if (catItem.type === 'storage') {
                bStorage = catItem as StorageItem;
              }
              if (catItem.type === 'psu') {
                if (isCertifiedPsu(catItem.specs.efficiency)) psuCertified = true;
              }
              if (catItem.type === 'case' && catItem.specs.includedPsu) {
                if (isCertifiedPsu(catItem.specs.includedPsu.efficiency)) psuCertified = true;
              }
            }

            expect(build.totalCents).toBe(calculatedTotal);
            const budgetCap = req.budgetFlexible ? Math.floor(req.budgetMaxCents * 110 / 100) : req.budgetMaxCents;
            expect(build.totalCents).toBeLessThanOrEqual(budgetCap);

            const comp = checkCompatibility(parts);
            expect(comp.ok).toBe(true);

            if (profile.gpuPolicy === 'required') {
              expect(hasGpu).toBe(true);
            } else if (profile.gpuPolicy === 'avoid') {
              expect(hasGpu).toBe(false);
            }

            if (req.useCases.includes('gaming') && !hasGpu) {
              expect(cpuIgpuScore).toBeGreaterThanOrEqual(MIN_GAMING_IGPU_SCORE);
            }

            if (hasGpu) {
              expect(psuCertified).toBe(true);
            }

            const currentScore = calculateBuildScore(bCpu!, bGpu || null, bRam!, bRamQty, bStorage!, profile.weights);

            if (prevTotal !== -1) {
              expect(build.totalCents).toBeGreaterThan(prevTotal);
              expect(currentScore).toBeGreaterThanOrEqual(prevScore);
            }
            prevTotal = build.totalCents;
            prevScore = currentScore;
          }
        }
      ),
      { numRuns: 200 }
    );
  }, 20000);
});
