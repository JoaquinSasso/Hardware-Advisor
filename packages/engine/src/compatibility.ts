import type {
  ComponentType,
  Violation,
  CompatibilityWarning,
  CompatibilityResult,
} from '@pcadvisor/shared';
import type { Part } from './types.js';
import { requiredPsuW } from './power.js';

export function checkCompatibility(parts: Part[]): CompatibilityResult {
  const violations: Violation[] = [];
  const warnings: CompatibilityWarning[] = [];

  // Fase 1 - Estructura
  let hasStructureViolations = false;

  for (const part of parts) {
    if (!Number.isInteger(part.qty) || part.qty < 1) {
      violations.push({
        code: 'UNEXPECTED_COMPONENT',
        message: `La cantidad del componente ${part.item.type} no es válida.`,
        componentTypes: [part.item.type],
      });
      hasStructureViolations = true;
    }
  }

  const getParts = (type: ComponentType) => parts.filter((p) => p.item.type === type);
  const cpus = getParts('cpu');
  const motherboards = getParts('motherboard');
  const rams = getParts('ram');
  const gpus = getParts('gpu');
  const storages = getParts('storage');
  const psus = getParts('psu');
  const cases = getParts('case');

  const requiredTypes: ComponentType[] = ['cpu', 'motherboard', 'ram', 'storage', 'case'];
  for (const type of requiredTypes) {
    if (getParts(type).length === 0) {
      violations.push({
        code: 'MISSING_COMPONENT',
        message: `Falta componente requerido: ${type}.`,
        componentTypes: [type],
      });
      hasStructureViolations = true;
    }
  }

  const theCase = cases[0];
  const hasIncludedPsu = theCase?.item.type === 'case' && theCase.item.specs.includedPsu !== null;

  if (psus.length === 0 && !hasIncludedPsu) {
    violations.push({
      code: 'MISSING_COMPONENT',
      message: 'Falta componente requerido: psu.',
      componentTypes: ['psu'],
    });
    hasStructureViolations = true;
  }

  const singleTypes: ComponentType[] = ['cpu', 'motherboard', 'case', 'gpu', 'psu'];
  for (const type of singleTypes) {
    const typeParts = getParts(type);
    const firstTypePart = typeParts[0];
    if (typeParts.length > 1 || (typeParts.length === 1 && firstTypePart && firstTypePart.qty > 1)) {
      violations.push({
        code: 'UNEXPECTED_COMPONENT',
        message: `No se puede tener más de un componente de tipo ${type}.`,
        componentTypes: [type],
      });
      hasStructureViolations = true;
    }
  }

  if (rams.length > 1) {
    violations.push({
      code: 'UNEXPECTED_COMPONENT',
      message: 'No se pueden mezclar memorias RAM distintas.',
      componentTypes: ['ram'],
    });
    hasStructureViolations = true;
  }

  if (psus.length > 0 && hasIncludedPsu) {
    violations.push({
      code: 'UNEXPECTED_COMPONENT',
      message: 'Hay una fuente de poder separada pero el gabinete ya incluye una.',
      componentTypes: ['psu', 'case'],
    });
    hasStructureViolations = true;
  }

  if (hasStructureViolations) {
    return {
      ok: false,
      violations,
      warnings: [],
    };
  }

  // Fase 2 - Reglas técnicas
  const cpuPart = cpus[0];
  const mbPart = motherboards[0];
  const ramPart = rams[0];
  const casePart = cases[0];

  if (!cpuPart || !mbPart || !ramPart || !casePart) {
    throw new Error('Faltan componentes requeridos');
  }

  const cpu = cpuPart.item;
  const mb = mbPart.item;
  const ram = ramPart.item;
  const ramQty = ramPart.qty;
  const gpu = gpus.length > 0 ? gpus[0]?.item : null;
  const myCase = casePart.item;
  const psuPart = psus.length > 0 ? psus[0]?.item : null;

  if (cpu.type !== 'cpu' || mb.type !== 'motherboard' || ram.type !== 'ram' || myCase.type !== 'case') {
    throw new Error('Unexpected types');
  }

  const psuEfectiva = psuPart?.type === 'psu' ? psuPart.specs : myCase.specs.includedPsu;

  // CPU_MB_SOCKET
  if (cpu.specs.socket !== mb.specs.socket) {
    violations.push({
      code: 'CPU_MB_SOCKET',
      message: `El procesador usa socket ${cpu.specs.socket} y la mother socket ${mb.specs.socket}.`,
      componentTypes: ['cpu', 'motherboard'],
    });
  }

  // RAM_TYPE
  const ramTypeMismatch = ram.specs.memoryType !== mb.specs.memoryType;
  const ramNotSupportedByCpu = !cpu.specs.memoryTypes.includes(ram.specs.memoryType);
  if (ramTypeMismatch || ramNotSupportedByCpu) {
    const msgs: string[] = [];
    if (ramTypeMismatch) {
      msgs.push(`La memoria es ${ram.specs.memoryType} y la mother usa ${mb.specs.memoryType}`);
    }
    if (ramNotSupportedByCpu) {
      msgs.push(`el procesador no soporta ${ram.specs.memoryType}`);
    }
    violations.push({
      code: 'RAM_TYPE',
      message: msgs.join(' y/o '),
      componentTypes: ['ram', 'motherboard', 'cpu'],
    });
  }

  // RAM_SLOTS
  if (ram.specs.modules * ramQty > mb.specs.memorySlots) {
    violations.push({
      code: 'RAM_SLOTS',
      message: `Las memorias ocupan ${ram.specs.modules * ramQty} slots y la mother tiene ${mb.specs.memorySlots}.`,
      componentTypes: ['ram', 'motherboard'],
    });
  }

  // MB_CASE_FORM_FACTOR
  if (!myCase.specs.supportedFormFactors.includes(mb.specs.formFactor)) {
    violations.push({
      code: 'MB_CASE_FORM_FACTOR',
      message: `La mother es ${mb.specs.formFactor} y el gabinete acepta ${myCase.specs.supportedFormFactors.join(', ')}.`,
      componentTypes: ['motherboard', 'case'],
    });
  }

  // GPU_LENGTH
  if (gpu?.type === 'gpu' && gpu.specs.lengthMm > myCase.specs.maxGpuLengthMm) {
    violations.push({
      code: 'GPU_LENGTH',
      message: `La placa de video mide ${gpu.specs.lengthMm}mm y el gabinete soporta hasta ${myCase.specs.maxGpuLengthMm}mm.`,
      componentTypes: ['gpu', 'case'],
    });
  }

  // NEEDS_GPU
  if (!gpu && !cpu.specs.hasIgpu) {
    violations.push({
      code: 'NEEDS_GPU',
      message: 'El procesador no tiene gráficos integrados, se necesita una placa de video.',
      componentTypes: ['cpu', 'gpu'],
    });
  }

  // NEEDS_COOLER
  if (!cpu.specs.includesCooler) {
    violations.push({
      code: 'NEEDS_COOLER',
      message: 'El procesador no incluye cooler de fábrica.',
      componentTypes: ['cpu'],
    });
  }

  // NVME_SLOT
  const nvmeQty = storages.filter(p => p.item.type === 'storage' && p.item.specs.interface === 'nvme').reduce((acc, p) => acc + p.qty, 0);
  if (nvmeQty > mb.specs.m2Slots) {
    violations.push({
      code: 'NVME_SLOT',
      message: `Se requieren ${nvmeQty} slots M.2 y la mother tiene ${mb.specs.m2Slots}.`,
      componentTypes: ['storage', 'motherboard'],
    });
  }

  // SATA_PORTS
  const sataQty = storages.filter(p => p.item.type === 'storage' && p.item.specs.interface === 'sata').reduce((acc, p) => acc + p.qty, 0);
  if (sataQty > mb.specs.sataPorts) {
    violations.push({
      code: 'SATA_PORTS',
      message: `Se requieren ${sataQty} puertos SATA y la mother tiene ${mb.specs.sataPorts}.`,
      componentTypes: ['storage', 'motherboard'],
    });
  }

  // PSU_POWER
  if (psuEfectiva) {
    const gpuSpecs = gpu?.type === 'gpu' ? { tbpW: gpu.specs.tbpW, recommendedPsuW: gpu.specs.recommendedPsuW } : null;
    const reqW = requiredPsuW(cpu.specs.tdpW, gpuSpecs);
    if (psuEfectiva.wattage < reqW) {
      violations.push({
        code: 'PSU_POWER',
        message: `La fuente de ${psuEfectiva.wattage}W no alcanza los ${reqW}W requeridos.`,
        componentTypes: psuPart ? (gpu ? ['psu', 'cpu', 'gpu'] : ['psu', 'cpu']) : (gpu ? ['case', 'cpu', 'gpu'] : ['case', 'cpu']),
      });
    }
  }

  // PSU_FORM_FACTOR
  if (psuPart?.type === 'psu' && myCase.specs.psuFormFactor === 'SFX' && psuPart.specs.formFactor === 'ATX') {
    violations.push({
      code: 'PSU_FORM_FACTOR',
      message: 'Una fuente ATX no cabe en un gabinete que requiere SFX.',
      componentTypes: ['psu', 'case'],
    });
  }

  // Warnings
  if (mb.specs.biosNote !== null) {
    warnings.push({
      code: 'BIOS_UPDATE_MAY_BE_REQUIRED',
      message: mb.specs.biosNote,
    });
  }

  if (ram.specs.modules * ramQty === 1) {
    warnings.push({
      code: 'SINGLE_CHANNEL_MEMORY',
      message: 'Con un solo módulo de memoria la PC funciona en canal simple; dos módulos rinden mejor.',
    });
  }

  return {
    ok: violations.length === 0,
    violations,
    warnings,
  };
}
