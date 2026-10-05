import { describe, it, expect } from 'vitest';
import {
  // Types
  type ComponentType,
  type MemoryType,
  type FormFactor,
  type PsuFormFactor,
  type CpuSpecs,
  type MotherboardSpecs,
  type RamSpecs,
  type GpuSpecs,
  type StorageSpecs,
  type PsuSpecs,
  type CaseSpecs,
  type CatalogItemBase,
  type CatalogItem,
  type UseCase,
  type Requirements,
  type BuildItem,
  type Build,
  type ViolationCode,
  type Violation,
  type CompatibilityResult,
  type ChatRequest,
  type ChatResponse,
  type EventRequest,
  // Schemas
  ComponentTypeSchema,
  MemoryTypeSchema,
  FormFactorSchema,
  PsuFormFactorSchema,
  CpuSpecsSchema,
  MotherboardSpecsSchema,
  RamSpecsSchema,
  GpuSpecsSchema,
  StorageSpecsSchema,
  PsuSpecsSchema,
  CaseSpecsSchema,
  CatalogItemBaseSchema,
  CatalogItemSchema,
  UseCaseSchema,
  RequirementsSchema,
  BuildItemSchema,
  BuildSchema,
  ViolationCodeSchema,
  ViolationSchema,
  CompatibilityResultSchema,
  ChatRequestSchema,
  ChatResponseSchema,
  EventRequestSchema,
} from './index.js';

describe('Contracts & Schemas (@pcadvisor/shared)', () => {
  const validCpu: CatalogItem = {
    type: 'cpu',
    componentId: 'cpu-amd-7600',
    tnProductId: 1001,
    tnVariantId: 2001,
    name: 'AMD Ryzen 5 7600',
    priceCents: 25000000,
    stock: 10,
    specs: {
      socket: 'AM5',
      cores: 6,
      threads: 12,
      tdpW: 65,
      hasIgpu: true,
      includesCooler: true,
      memoryTypes: ['DDR5'],
      perfScore: 78,
    },
  };

  const validMotherboard: CatalogItem = {
    type: 'motherboard',
    componentId: 'mb-msi-b650m',
    tnProductId: 1002,
    tnVariantId: 2002,
    name: 'MSI PRO B650M-A WiFi',
    priceCents: 18000000,
    stock: 5,
    specs: {
      socket: 'AM5',
      chipset: 'B650',
      formFactor: 'mATX',
      memoryType: 'DDR5',
      memorySlots: 4,
      m2Slots: 2,
      sataPorts: 4,
      biosNote: null,
    },
  };

  const validRam: CatalogItem = {
    type: 'ram',
    componentId: 'ram-kingston-32gb',
    tnProductId: 1003,
    tnVariantId: 2003,
    name: 'Kingston Fury Beast 32GB (2x16GB)',
    priceCents: 14000000,
    stock: 15,
    specs: {
      memoryType: 'DDR5',
      totalGb: 32,
      modules: 2,
      speedMhz: 6000,
    },
  };

  const validGpu: CatalogItem = {
    type: 'gpu',
    componentId: 'gpu-rtx-4070',
    tnProductId: 1004,
    tnVariantId: 2004,
    name: 'ASUS Dual GeForce RTX 4070 EVO 12GB',
    priceCents: 85000000,
    stock: 4,
    specs: {
      chipset: 'GeForce RTX 4070',
      vramGb: 12,
      lengthMm: 227,
      tbpW: 200,
      recommendedPsuW: 650,
      perfScore: 85,
    },
  };

  const validStorage: CatalogItem = {
    type: 'storage',
    componentId: 'storage-nvme-1tb',
    tnProductId: 1005,
    tnVariantId: 2005,
    name: 'Kingston NV2 1TB NVMe M.2',
    priceCents: 8000000,
    stock: 25,
    specs: {
      interface: 'nvme',
      formFactor: 'M.2-2280',
      capacityGb: 1000,
    },
  };

  const validPsu: CatalogItem = {
    type: 'psu',
    componentId: 'psu-corsair-750w',
    tnProductId: 1006,
    tnVariantId: 2006,
    name: 'Corsair RM750e 750W 80 Plus Gold',
    priceCents: 16000000,
    stock: 8,
    specs: {
      wattage: 750,
      efficiency: '80 Plus Gold',
      formFactor: 'ATX',
    },
  };

  const validCase: CatalogItem = {
    type: 'case',
    componentId: 'case-nzxt-h5',
    tnProductId: 1007,
    tnVariantId: 2007,
    name: 'NZXT H5 Flow',
    priceCents: 13000000,
    stock: 7,
    specs: {
      supportedFormFactors: ['ATX', 'mATX', 'ITX'],
      maxGpuLengthMm: 365,
      psuFormFactor: 'ATX',
      includedPsu: null,
    },
  };

  const makeBuild = (id: string): Build => ({
    id,
    tier: 'budget',
    items: [
      {
        type: 'cpu',
        componentId: 'cpu-amd-7600',
        tnProductId: 1001,
        tnVariantId: 2001,
        name: 'AMD Ryzen 5 7600',
        priceCents: 25000000,
        qty: 1,
      },
    ],
    totalCents: 25000000,
    warnings: [],
  });

  // Requerimiento 1: Un CatalogItem válido de cada uno de los 7 tipos parsea OK.
  it('1. parses valid CatalogItem for all 7 component types', () => {
    expect(CatalogItemSchema.parse(validCpu)).toEqual(validCpu);
    expect(CatalogItemSchema.parse(validMotherboard)).toEqual(validMotherboard);
    expect(CatalogItemSchema.parse(validRam)).toEqual(validRam);
    expect(CatalogItemSchema.parse(validGpu)).toEqual(validGpu);
    expect(CatalogItemSchema.parse(validStorage)).toEqual(validStorage);
    expect(CatalogItemSchema.parse(validPsu)).toEqual(validPsu);
    expect(CatalogItemSchema.parse(validCase)).toEqual(validCase);
  });

  // Requerimiento 2: Un CatalogItem type:'cpu' con specs de motherboard falla.
  it('2. fails when a CatalogItem type:cpu has motherboard specs', () => {
    const invalidCpu = {
      ...validCpu,
      specs: validMotherboard.specs,
    };
    expect(() => CatalogItemSchema.parse(invalidCpu)).toThrow();
  });

  // Requerimiento 3: perfScore: 0 y perfScore: 101 fallan; priceCents: 10.5 falla.
  it('3. rejects perfScore: 0, perfScore: 101 and non-integer priceCents (10.5)', () => {
    const cpuSpecsBase = validCpu.specs;

    expect(() =>
      CpuSpecsSchema.parse({
        ...cpuSpecsBase,
        perfScore: 0,
      })
    ).toThrow();

    expect(() =>
      CpuSpecsSchema.parse({
        ...cpuSpecsBase,
        perfScore: 101,
      })
    ).toThrow();

    const gpuSpecsBase = validGpu.specs;

    expect(() =>
      GpuSpecsSchema.parse({
        ...gpuSpecsBase,
        perfScore: 0,
      })
    ).toThrow();

    expect(() =>
      GpuSpecsSchema.parse({
        ...gpuSpecsBase,
        perfScore: 101,
      })
    ).toThrow();

    expect(() =>
      CatalogItemBaseSchema.parse({
        componentId: 'comp-1',
        tnProductId: 1,
        tnVariantId: 1,
        name: 'Item',
        priceCents: 10.5,
        stock: 5,
      })
    ).toThrow();

    expect(() =>
      BuildItemSchema.parse({
        type: 'cpu',
        componentId: 'comp-1',
        tnProductId: 1,
        tnVariantId: 1,
        name: 'Item',
        priceCents: 10.5,
        qty: 1,
      })
    ).toThrow();
  });

  // Requerimiento 4: Requirements con useCases: [] falla.
  it('4. fails when Requirements has empty useCases array', () => {
    const invalidEmptyUseCases = {
      useCases: [],
      budgetMaxCents: 50000000,
      budgetFlexible: false,
    };
    expect(() => RequirementsSchema.parse(invalidEmptyUseCases)).toThrow();

    const validRequirements = {
      useCases: ['gaming', 'programming'] as const,
      budgetMaxCents: 50000000,
      budgetFlexible: true,
      gamingResolution: '1440p' as const,
      preferences: {
        cpuBrand: 'amd' as const,
        gpuBrand: 'nvidia' as const,
        dedicatedGpu: true,
      },
    };
    expect(RequirementsSchema.parse(validRequirements)).toEqual(validRequirements);
  });

  // Requerimiento 5: ChatResponse con 4 builds falla; ChatRequest con sessionId no-UUID falla.
  it('5. fails for ChatResponse with 4 builds and ChatRequest with non-UUID sessionId', () => {
    const fourBuilds = [
      makeBuild('b1'),
      makeBuild('b2'),
      makeBuild('b3'),
      makeBuild('b4'),
    ];

    expect(() =>
      ChatResponseSchema.parse({
        reply: 'Recomendaciones listas',
        suggestions: ['Ver detalles'],
        builds: fourBuilds,
      })
    ).toThrow();

    const threeBuilds = [makeBuild('b1'), makeBuild('b2'), makeBuild('b3')];
    expect(() =>
      ChatResponseSchema.parse({
        reply: 'Recomendaciones listas',
        suggestions: ['Ver detalles'],
        builds: threeBuilds,
      })
    ).not.toThrow();

    expect(() =>
      ChatRequestSchema.parse({
        storeId: 'store-123',
        sessionId: 'not-a-valid-uuid',
        message: 'Hola, busco una PC',
      })
    ).toThrow();

    expect(() =>
      ChatRequestSchema.parse({
        storeId: 'store-123',
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        message: 'Hola, busco una PC',
      })
    ).not.toThrow();
  });

  // Requerimiento 6: CaseSpecs acepta includedPsu: null y un PsuSpecs válido.
  it('6. accepts CaseSpecs with includedPsu as null and valid PsuSpecs', () => {
    const caseNullPsu = {
      supportedFormFactors: ['ATX', 'mATX'] as const,
      maxGpuLengthMm: 350,
      psuFormFactor: 'ATX' as const,
      includedPsu: null,
    };
    expect(CaseSpecsSchema.parse(caseNullPsu)).toEqual(caseNullPsu);

    const caseWithPsu = {
      supportedFormFactors: ['ITX'] as const,
      maxGpuLengthMm: 320,
      psuFormFactor: 'SFX' as const,
      includedPsu: {
        wattage: 650,
        efficiency: '80 Plus Gold',
        formFactor: 'SFX' as const,
      },
    };
    expect(CaseSpecsSchema.parse(caseWithPsu)).toEqual(caseWithPsu);

    const caseMissingPsu = {
      supportedFormFactors: ['ITX'] as const,
      maxGpuLengthMm: 320,
      psuFormFactor: 'SFX' as const,
    };
    expect(() => CaseSpecsSchema.parse(caseMissingPsu)).toThrow();
  });

  // Pruebas adicionales de contratos restantes
  it('validates Build, CompatibilityResult and EventRequest', () => {
    const build = makeBuild('build-1');
    expect(BuildSchema.parse(build)).toEqual(build);

    const violation = {
      code: 'CPU_MB_SOCKET' as const,
      message: 'Socket mismatch between CPU and Motherboard',
      componentTypes: ['cpu', 'motherboard'] as const,
    };
    expect(ViolationSchema.parse(violation)).toEqual(violation);

    const compatResult = {
      ok: false,
      violations: [violation],
    };
    expect(CompatibilityResultSchema.parse(compatResult)).toEqual(compatResult);

    const validEvent = { type: 'cart_added' as const };
    expect(EventRequestSchema.parse(validEvent)).toEqual(validEvent);

    expect(() => EventRequestSchema.parse({ type: 'unknown_event' })).toThrow();
  });

  it('exports all 23 schema definitions from @pcadvisor/shared index', () => {
    const schemas = [
      ComponentTypeSchema,
      MemoryTypeSchema,
      FormFactorSchema,
      PsuFormFactorSchema,
      CpuSpecsSchema,
      MotherboardSpecsSchema,
      RamSpecsSchema,
      GpuSpecsSchema,
      StorageSpecsSchema,
      PsuSpecsSchema,
      CaseSpecsSchema,
      CatalogItemBaseSchema,
      CatalogItemSchema,
      UseCaseSchema,
      RequirementsSchema,
      BuildItemSchema,
      BuildSchema,
      ViolationCodeSchema,
      ViolationSchema,
      CompatibilityResultSchema,
      ChatRequestSchema,
      ChatResponseSchema,
      EventRequestSchema,
    ];

    expect(schemas).toHaveLength(23);
    for (const schema of schemas) {
      expect(schema).toBeDefined();
      expect(typeof schema.parse).toBe('function');
    }
  });
});
