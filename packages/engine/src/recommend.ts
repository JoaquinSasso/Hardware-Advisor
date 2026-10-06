import {
  type Requirements,
  type CatalogItem,
  type Build,
  type BuildItem,
  BuildSchema,
} from '@pcadvisor/shared';
import { checkCompatibility } from './compatibility.js';
import { requiredPsuW } from './power.js';
import { resolveProfile, MIN_GAMING_IGPU_SCORE } from './profiles.js';
import { calculateBuildScore } from './scoring.js';
import { getCpuBrand, getGpuBrand, isCertifiedPsu, WARNING_AUDIENCE } from './policy.js';
import type { CpuItem, MotherboardItem, RamItem, GpuItem, StorageItem, CaseItem, PsuItem, Part } from './types.js';

export type RecommendResult = {
  builds: Build[];
  cheapestValidTotalCents: number | null;
};

type Candidate = {
  id: string;
  cpu: CpuItem;
  mb: MotherboardItem;
  ram: RamItem;
  ramQty: number;
  myCase: CaseItem;
  storage: StorageItem;
  gpu: GpuItem | null;
  psu: PsuItem | null;
  totalCents: number;
  buildScore: number;
};

function buildId(parts: { tnVariantId: number; qty: number }[]): string {
  return parts
    .slice()
    .sort((a, b) => a.tnVariantId - b.tnVariantId)
    .map(p => `${p.tnVariantId}x${p.qty}`)
    .join('-');
}

export function recommend(req: Requirements, catalog: CatalogItem[]): RecommendResult {
  const { weights, gpuPolicy, isGaming } = resolveProfile(req);

  const budgetCap = req.budgetFlexible
    ? Math.floor((req.budgetMaxCents * 110) / 100)
    : req.budgetMaxCents;

  const prefCpuBrand = req.preferences?.cpuBrand;
  const prefGpuBrand = req.preferences?.gpuBrand;

  const cpus = catalog.filter((i): i is CpuItem => i.type === 'cpu' && i.specs.includesCooler && (!prefCpuBrand || getCpuBrand(i) === prefCpuBrand));
  const mbs = catalog.filter((i): i is MotherboardItem => i.type === 'motherboard');
  const rams = catalog.filter((i): i is RamItem => i.type === 'ram');
  const cases = catalog.filter((i): i is CaseItem => i.type === 'case');
  const storages = catalog.filter((i): i is StorageItem => i.type === 'storage');
  const gpus = catalog.filter((i): i is GpuItem => i.type === 'gpu' && (!prefGpuBrand || getGpuBrand(i) === prefGpuBrand));
  const psus = catalog.filter((i): i is PsuItem => i.type === 'psu');

  const candidates: Candidate[] = [];
  let cheapestOverallValidTotalCents: number | null = null;

  for (const cpu of cpus) {
    if (cpu.stock < 1) continue;
    const cpuCost = cpu.priceCents;
    if (cpuCost > budgetCap && cheapestOverallValidTotalCents !== null && cpuCost >= cheapestOverallValidTotalCents) continue;

    for (const mb of mbs) {
      if (mb.stock < 1) continue;
      if (mb.specs.socket !== cpu.specs.socket) continue;

      const mbCost = mb.priceCents;
      if (cpuCost + mbCost > budgetCap && cheapestOverallValidTotalCents !== null && cpuCost + mbCost >= cheapestOverallValidTotalCents) continue;

      for (const ram of rams) {
        if (ram.specs.memoryType !== mb.specs.memoryType) continue;
        if (!cpu.specs.memoryTypes.includes(ram.specs.memoryType)) continue;

        const qtys = [1];
        if (ram.specs.modules === 1 && ram.stock >= 2) {
          qtys.push(2);
        }

        for (const ramQty of qtys) {
          if (ramQty > ram.stock) continue;
          if (ram.specs.modules * ramQty > mb.specs.memorySlots) continue;

          const ramCost = ram.priceCents * ramQty;
          if (cpuCost + mbCost + ramCost > budgetCap && cheapestOverallValidTotalCents !== null && cpuCost + mbCost + ramCost >= cheapestOverallValidTotalCents) continue;

          for (const myCase of cases) {
            if (myCase.stock < 1) continue;
            if (!myCase.specs.supportedFormFactors.includes(mb.specs.formFactor)) continue;

            const caseCost = myCase.priceCents;
            if (cpuCost + mbCost + ramCost + caseCost > budgetCap && cheapestOverallValidTotalCents !== null && cpuCost + mbCost + ramCost + caseCost >= cheapestOverallValidTotalCents) continue;

            for (const storage of storages) {
              if (storage.stock < 1) continue;
              if (storage.specs.interface === 'nvme' && mb.specs.m2Slots < 1) continue;
              if (storage.specs.interface === 'sata' && mb.specs.sataPorts < 1) continue;

              const storageCost = storage.priceCents;
              if (cpuCost + mbCost + ramCost + caseCost + storageCost > budgetCap && cheapestOverallValidTotalCents !== null && cpuCost + mbCost + ramCost + caseCost + storageCost >= cheapestOverallValidTotalCents) continue;

              const tryGpu = (gpu: GpuItem | null) => {
                if (gpu && gpu.stock < 1) return;
                if (gpu && gpuPolicy === 'avoid') return;
                if (!gpu && gpuPolicy === 'required') return;
                if (!gpu && !cpu.specs.hasIgpu) return;
                if (gpu && gpu.specs.lengthMm > myCase.specs.maxGpuLengthMm) return;
                if (!gpu && isGaming && cpu.specs.igpuScore < MIN_GAMING_IGPU_SCORE) return;

                const gpuCost = gpu ? gpu.priceCents : 0;
                const costG = cpuCost + mbCost + ramCost + caseCost + storageCost + gpuCost;
                if (costG > budgetCap && cheapestOverallValidTotalCents !== null && costG >= cheapestOverallValidTotalCents) return;

                const tryPsu = (psu: PsuItem | null) => {
                  if (psu && psu.stock < 1) return;
                  if (myCase.specs.includedPsu) {
                    if (psu !== null) return;
                  } else {
                    if (psu === null) return;
                    if (myCase.specs.psuFormFactor === 'SFX' && psu.specs.formFactor === 'ATX') return;
                  }

                  const psuCost = psu ? psu.priceCents : 0;
                  const totalCents = costG + psuCost;

                  const psuEfectiva = psu ? psu.specs : myCase.specs.includedPsu;
                  if (!psuEfectiva) throw new Error(`Sin fuente efectiva para el gabinete ${myCase.tnVariantId}`);

                  if (gpu && !isCertifiedPsu(psuEfectiva.efficiency)) return;

                  const gpuSpecs = gpu ? { tbpW: gpu.specs.tbpW, recommendedPsuW: gpu.specs.recommendedPsuW } : null;
                  const reqW = requiredPsuW(cpu.specs.tdpW, gpuSpecs);

                  if (psuEfectiva.wattage < reqW) return;

                  if (totalCents > budgetCap) {
                    if (cheapestOverallValidTotalCents === null || totalCents < cheapestOverallValidTotalCents) {
                      cheapestOverallValidTotalCents = totalCents;
                    }
                    return;
                  }

                  const buildScore = calculateBuildScore(cpu, gpu, ram, ramQty, storage, weights);

                  const partsList = [
                    { tnVariantId: cpu.tnVariantId, qty: 1 },
                    { tnVariantId: mb.tnVariantId, qty: 1 },
                    { tnVariantId: ram.tnVariantId, qty: ramQty },
                    { tnVariantId: myCase.tnVariantId, qty: 1 },
                    { tnVariantId: storage.tnVariantId, qty: 1 },
                  ];
                  if (gpu) partsList.push({ tnVariantId: gpu.tnVariantId, qty: 1 });
                  if (psu) partsList.push({ tnVariantId: psu.tnVariantId, qty: 1 });

                  candidates.push({
                    id: buildId(partsList),
                    cpu, mb, ram, ramQty, myCase, storage, gpu, psu, totalCents, buildScore
                  });
                };

                if (myCase.specs.includedPsu) {
                  tryPsu(null);
                } else {
                  for (const psu of psus) {
                    tryPsu(psu);
                  }
                }
              };

              tryGpu(null);
              for (const gpu of gpus) {
                tryGpu(gpu);
              }
            }
          }
        }
      }
    }
  }

  for (const c of candidates) {
    const parts: Part[] = [
      { item: c.cpu, qty: 1 },
      { item: c.mb, qty: 1 },
      { item: c.ram, qty: c.ramQty },
      { item: c.storage, qty: 1 },
      { item: c.myCase, qty: 1 },
    ];
    if (c.gpu) parts.push({ item: c.gpu, qty: 1 });
    if (c.psu) parts.push({ item: c.psu, qty: 1 });

    const comp = checkCompatibility(parts);
    if (!comp.ok) {
      const codes = comp.violations.map(v => v.code);
      throw new Error(`Candidate ${c.id} failed checkCompatibility: ${codes.join(', ')}`);
    }
  }

  candidates.sort((a, b) => {
    if (a.buildScore !== b.buildScore) return b.buildScore - a.buildScore;
    if (a.totalCents !== b.totalCents) return a.totalCents - b.totalCents;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });

  const perfThreshold = budgetCap;
  const balancedThreshold = Math.floor(req.budgetMaxCents * 85 / 100);
  const budgetThreshold = Math.floor(req.budgetMaxCents * 70 / 100);

  let perfCand: Candidate | null = null;
  let balancedCand: Candidate | null = null;
  let budgetCand: Candidate | null = null;

  for (const c of candidates) {
    if (!perfCand && c.totalCents <= perfThreshold) perfCand = c;
    if (!balancedCand && c.totalCents <= balancedThreshold) balancedCand = c;
    if (!budgetCand && c.totalCents <= budgetThreshold) budgetCand = c;
  }

  const selectedCandidates: { cand: Candidate; tier: 'budget' | 'balanced' | 'performance' }[] = [];
  
  if (budgetCand) selectedCandidates.push({ cand: budgetCand, tier: 'budget' });
  if (balancedCand && (!budgetCand || balancedCand.id !== budgetCand.id)) {
    selectedCandidates.push({ cand: balancedCand, tier: 'balanced' });
  }
  if (perfCand && (!balancedCand || perfCand.id !== balancedCand.id) && (!budgetCand || perfCand.id !== budgetCand.id)) {
    selectedCandidates.push({ cand: perfCand, tier: 'performance' });
  }

  const builds: Build[] = [];
  for (const { cand, tier } of selectedCandidates) {
    const parts: Part[] = [
      { item: cand.cpu, qty: 1 },
      { item: cand.mb, qty: 1 },
      { item: cand.ram, qty: cand.ramQty },
    ];
    if (cand.gpu) parts.push({ item: cand.gpu, qty: 1 });
    parts.push({ item: cand.storage, qty: 1 });
    if (cand.psu) parts.push({ item: cand.psu, qty: 1 });
    parts.push({ item: cand.myCase, qty: 1 });

    const buildItems: BuildItem[] = parts.map(p => ({
      type: p.item.type,
      componentId: p.item.componentId,
      tnProductId: p.item.tnProductId,
      tnVariantId: p.item.tnVariantId,
      name: p.item.name,
      priceCents: p.item.priceCents,
      qty: p.qty,
    }));

    const comp = checkCompatibility(parts);
    const warnings: string[] = [];
    const internalNotes: string[] = [];

    const totalRamModules = cand.ram.specs.modules * cand.ramQty;
    const isSingleChannelIgpu = isGaming && !cand.gpu && totalRamModules === 1;

    for (const w of comp.warnings) {
      const audience = WARNING_AUDIENCE[w.code];
      if (audience === 'internal') {
        internalNotes.push(w.message);
      } else {
        if (w.code === 'SINGLE_CHANNEL_MEMORY' && isSingleChannelIgpu) {
          warnings.push('Con un solo módulo de memoria, los gráficos integrados rinden bastante menos: conviene sumar un segundo módulo igual.');
        } else {
          warnings.push(w.message);
        }
      }
    }

    if (isGaming && !cand.gpu) {
      warnings.push('Usa los gráficos integrados del procesador: alcanza para juegos livianos como CS2, LoL o Valorant en calidad baja o media, no para juegos exigentes.');
    }

    const build: Build = {
      id: cand.id,
      tier,
      items: buildItems,
      totalCents: cand.totalCents,
      warnings,
      internalNotes,
    };
    builds.push(BuildSchema.parse(build));
  }

  if (builds.length > 0) {
    return { builds, cheapestValidTotalCents: null };
  } else {
    return { builds: [], cheapestValidTotalCents: cheapestOverallValidTotalCents };
  }
}
