import {
  CatalogItem,
  CpuSpecs,
  MotherboardSpecs,
  RamSpecs,
  GpuSpecs,
  StorageSpecs,
  PsuSpecs,
  CaseSpecs,
} from '@pcadvisor/shared';

export function buildCpu(overrides?: Partial<CpuSpecs>): CatalogItem {
  return {
    type: 'cpu',
    componentId: 'cpu-1',
    tnProductId: 1,
    tnVariantId: 1,
    name: 'CPU',
    priceCents: 1000,
    stock: 10,
    specs: {
      socket: 'AM5',
      cores: 6,
      threads: 12,
      tdpW: 65,
      hasIgpu: false,
      includesCooler: true,
      memoryTypes: ['DDR5'],
      perfScore: 80,
      ...overrides,
    },
  };
}

export function buildMotherboard(overrides?: Partial<MotherboardSpecs>): CatalogItem {
  return {
    type: 'motherboard',
    componentId: 'mb-1',
    tnProductId: 2,
    tnVariantId: 2,
    name: 'MB',
    priceCents: 1000,
    stock: 10,
    specs: {
      socket: 'AM5',
      chipset: 'B650',
      formFactor: 'mATX',
      memoryType: 'DDR5',
      memorySlots: 4,
      m2Slots: 2,
      sataPorts: 4,
      biosNote: null,
      ...overrides,
    },
  };
}

export function buildRam(overrides?: Partial<RamSpecs>): CatalogItem {
  return {
    type: 'ram',
    componentId: 'ram-1',
    tnProductId: 3,
    tnVariantId: 3,
    name: 'RAM',
    priceCents: 1000,
    stock: 10,
    specs: {
      memoryType: 'DDR5',
      totalGb: 16,
      modules: 2,
      speedMhz: 6000,
      ...overrides,
    },
  };
}

export function buildGpu(overrides?: Partial<GpuSpecs>): CatalogItem {
  return {
    type: 'gpu',
    componentId: 'gpu-1',
    tnProductId: 4,
    tnVariantId: 4,
    name: 'GPU',
    priceCents: 1000,
    stock: 10,
    specs: {
      chipset: 'RTX 4060',
      vramGb: 8,
      lengthMm: 250,
      tbpW: 150,
      recommendedPsuW: 550,
      perfScore: 80,
      ...overrides,
    },
  };
}

export function buildStorage(overrides?: Partial<StorageSpecs>): CatalogItem {
  return {
    type: 'storage',
    componentId: 'st-1',
    tnProductId: 5,
    tnVariantId: 5,
    name: 'Storage',
    priceCents: 1000,
    stock: 10,
    specs: {
      interface: 'nvme',
      formFactor: 'M.2-2280',
      capacityGb: 1000,
      ...overrides,
    },
  };
}

export function buildPsu(overrides?: Partial<PsuSpecs>): CatalogItem {
  return {
    type: 'psu',
    componentId: 'psu-1',
    tnProductId: 6,
    tnVariantId: 6,
    name: 'PSU',
    priceCents: 1000,
    stock: 10,
    specs: {
      wattage: 650,
      efficiency: '80 Plus Bronze',
      formFactor: 'ATX',
      ...overrides,
    },
  };
}

export function buildCase(overrides?: Partial<CaseSpecs>): CatalogItem {
  return {
    type: 'case',
    componentId: 'case-1',
    tnProductId: 7,
    tnVariantId: 7,
    name: 'Case',
    priceCents: 1000,
    stock: 10,
    specs: {
      supportedFormFactors: ['ATX', 'mATX', 'ITX'],
      maxGpuLengthMm: 330,
      psuFormFactor: 'ATX',
      includedPsu: null,
      ...overrides,
    },
  };
}
