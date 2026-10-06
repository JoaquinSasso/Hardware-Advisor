import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { recommend } from '../src/recommend.js';
import { recommendReference } from './reference-recommend.js';
import { RequirementsSchema } from '@pcadvisor/shared';
import { getDemoCatalog } from './demo-catalog.js';

describe('recommendation equivalence test', () => {
  it('should return the exact same results as the reference implementation', () => {
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
          
          const actual = recommend(req, catalog);
          const expected = recommendReference(req, catalog);

          expect(actual).toEqual(expected);
        }
      ),
      { numRuns: 100 }
    );
  }, 240000);
});
