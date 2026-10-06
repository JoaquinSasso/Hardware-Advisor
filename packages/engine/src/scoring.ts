import type { CpuItem, GpuItem, RamItem, StorageItem } from './types.js';

export function getCpuScore(cpu: CpuItem): number {
  return cpu.specs.perfScore;
}

export function getGpuScore(cpu: CpuItem, gpu: GpuItem | null): number {
  if (gpu) {
    return gpu.specs.perfScore;
  }
  return cpu.specs.igpuScore;
}

export function getRamScore(ram: RamItem, qty: number): number {
  const totalGb = ram.specs.totalGb * qty;
  let score = 10;
  if (totalGb >= 32) score = 100;
  else if (totalGb >= 16) score = 70;
  else if (totalGb >= 8) score = 30;

  const totalModules = ram.specs.modules * qty;
  if (totalModules >= 2) {
    score += 10;
  }
  return Math.min(score, 100);
}

export function getStorageScore(storage: StorageItem): number {
  const capacityGb = storage.specs.capacityGb;
  let score = 20;
  if (capacityGb >= 2000) score = 100;
  else if (capacityGb >= 1000) score = 80;
  else if (capacityGb >= 480) score = 50;

  if (storage.specs.interface === 'nvme') {
    score += 10;
  }
  return Math.min(score, 100);
}

export function calculateBuildScore(
  cpuItem: CpuItem,
  gpuItem: GpuItem | null,
  ramItem: RamItem,
  ramQty: number,
  storageItem: StorageItem,
  weights: { cpu: number; gpu: number; ram: number; storage: number }
): number {
  const cScore = getCpuScore(cpuItem);
  const gScore = getGpuScore(cpuItem, gpuItem);
  const rScore = getRamScore(ramItem, ramQty);
  const sScore = getStorageScore(storageItem);

  return (
    weights.cpu * cScore +
    weights.gpu * gScore +
    weights.ram * rScore +
    weights.storage * sScore
  );
}
