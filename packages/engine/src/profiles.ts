import type { Requirements, UseCase } from '@pcadvisor/shared';

export const MIN_GAMING_IGPU_SCORE = 6;

type GpuPolicy = 'required' | 'optional' | 'avoid';

type ProfileWeights = {
  cpu: number;
  gpu: number;
  ram: number;
  storage: number;
};

type ProfileDef = {
  weights: ProfileWeights;
  gpuPolicy: GpuPolicy;
};

export function resolveProfile(req: Requirements): {
  weights: ProfileWeights;
  gpuPolicy: GpuPolicy;
  isGaming: boolean;
} {
  const isGaming = req.useCases.includes('gaming');
  let profiles: ProfileDef[] = [];

  for (const useCase of req.useCases) {
    if (useCase === 'gaming') {
      const isHighRes = req.gamingResolution === '1440p' || req.gamingResolution === '4k';
      const isDemanding = req.gamingDemand === 'demanding';
      if (isHighRes) {
        profiles.push({
          weights: { cpu: 20, gpu: 55, ram: 15, storage: 10 },
          gpuPolicy: 'required',
        });
      } else {
        profiles.push({
          weights: { cpu: 30, gpu: 45, ram: 15, storage: 10 },
          gpuPolicy: isDemanding ? 'required' : 'optional',
        });
      }
    } else if (useCase === 'office') {
      profiles.push({
        weights: { cpu: 45, gpu: 0, ram: 30, storage: 25 },
        gpuPolicy: 'avoid',
      });
    } else if (useCase === 'study') {
      profiles.push({
        weights: { cpu: 45, gpu: 0, ram: 30, storage: 25 },
        gpuPolicy: 'avoid',
      });
    } else if (useCase === 'programming') {
      profiles.push({
        weights: { cpu: 45, gpu: 0, ram: 35, storage: 20 },
        gpuPolicy: 'avoid',
      });
    } else if (useCase === 'design') {
      profiles.push({
        weights: { cpu: 30, gpu: 30, ram: 25, storage: 15 },
        gpuPolicy: 'optional',
      });
    } else if (useCase === 'video_editing') {
      profiles.push({
        weights: { cpu: 40, gpu: 25, ram: 25, storage: 10 },
        gpuPolicy: 'optional',
      });
    }
  }

  let maxCpu = 0, maxGpu = 0, maxRam = 0, maxStorage = 0;
  let combinedGpuPolicy: GpuPolicy = 'avoid';

  const policyRank = { required: 3, optional: 2, avoid: 1 };

  for (const p of profiles) {
    if (p.weights.cpu > maxCpu) maxCpu = p.weights.cpu;
    if (p.weights.gpu > maxGpu) maxGpu = p.weights.gpu;
    if (p.weights.ram > maxRam) maxRam = p.weights.ram;
    if (p.weights.storage > maxStorage) maxStorage = p.weights.storage;

    if (policyRank[p.gpuPolicy] > policyRank[combinedGpuPolicy]) {
      combinedGpuPolicy = p.gpuPolicy;
    }
  }

  const sumMax = maxCpu + maxGpu + maxRam + maxStorage;
  let wCpu = Math.floor((maxCpu * 100) / sumMax);
  let wGpu = Math.floor((maxGpu * 100) / sumMax);
  let wRam = Math.floor((maxRam * 100) / sumMax);
  let wStorage = Math.floor((maxStorage * 100) / sumMax);

  let missing = 100 - (wCpu + wGpu + wRam + wStorage);

  const arr = [
    { key: 'cpu', maxVal: maxCpu, w: wCpu },
    { key: 'gpu', maxVal: maxGpu, w: wGpu },
    { key: 'ram', maxVal: maxRam, w: wRam },
    { key: 'storage', maxVal: maxStorage, w: wStorage },
  ];

  arr.sort((a, b) => {
    if (a.maxVal !== b.maxVal) return b.maxVal - a.maxVal;
    const order = { cpu: 4, gpu: 3, ram: 2, storage: 1 };
    return order[b.key as keyof typeof order] - order[a.key as keyof typeof order];
  });

  for (let i = 0; i < missing; i++) {
    arr[i % 4].w += 1;
  }

  const finalWeights = { cpu: 0, gpu: 0, ram: 0, storage: 0 };
  for (const item of arr) {
    finalWeights[item.key as keyof ProfileWeights] = item.w;
  }

  if (req.preferences?.dedicatedGpu === true) {
    combinedGpuPolicy = 'required';
  } else if (req.preferences?.dedicatedGpu === false) {
    combinedGpuPolicy = 'avoid';
  }

  return {
    weights: finalWeights,
    gpuPolicy: combinedGpuPolicy,
    isGaming,
  };
}
