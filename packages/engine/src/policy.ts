import type { CpuItem, GpuItem } from './types.js';

export function getCpuBrand(cpu: CpuItem): 'intel' | 'amd' {
  return cpu.specs.socket.startsWith('LGA') ? 'intel' : 'amd';
}

export function getGpuBrand(gpu: GpuItem): 'nvidia' | 'amd' | null {
  if (gpu.specs.chipset.startsWith('GeForce')) return 'nvidia';
  if (gpu.specs.chipset.startsWith('Radeon')) return 'amd';
  return null;
}

export function isCertifiedPsu(efficiency: string): boolean {
  return efficiency.startsWith('80 Plus');
}
import type { WarningCode } from '@pcadvisor/shared';
export const WARNING_AUDIENCE: Record<WarningCode, 'customer' | 'internal'> = { BIOS_UPDATE_MAY_BE_REQUIRED: 'internal', SINGLE_CHANNEL_MEMORY: 'customer' };
