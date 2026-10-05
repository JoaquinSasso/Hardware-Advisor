export const BASE_LOAD_W = 75;
export const PSU_LOAD_FACTOR = 1.4;

export function estimatedLoadW(cpuTdpW: number, gpuTbpW: number | null): number {
  return cpuTdpW + (gpuTbpW ?? 0) + BASE_LOAD_W;
}

export function requiredPsuW(cpuTdpW: number, gpu: { tbpW: number; recommendedPsuW: number } | null): number {
  const estimated = estimatedLoadW(cpuTdpW, gpu?.tbpW ?? null);
  const factored = Math.ceil(estimated * PSU_LOAD_FACTOR);
  return Math.max(factored, gpu?.recommendedPsuW ?? 0);
}
