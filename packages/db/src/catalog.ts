import { sql } from 'drizzle-orm';
import { getRows, type DbClient } from './client.js';
import {
  CatalogItemSchema,
  type CatalogItem,
  type CpuSpecs,
  type MotherboardSpecs,
  type RamSpecs,
  type GpuSpecs,
  type StorageSpecs,
  type PsuSpecs,
  type CaseSpecs,
} from '@pcadvisor/shared';

function parsePgArray(arrStr: any): any[] {
  if (Array.isArray(arrStr)) return arrStr;
  if (typeof arrStr === 'string' && arrStr.startsWith('{') && arrStr.endsWith('}')) {
    return arrStr.slice(1, -1).split(',').filter(Boolean);
  }
  return [];
}

function parseSafeInt(val: any, fieldName: string): number {
  const num = Number(val);
  if (!Number.isSafeInteger(num)) {
    throw new Error(`Invalid safe integer for ${fieldName}: ${val}`);
  }
  return num;
}

function toCpuSpecs(row: any): CpuSpecs {
  return {
    socket: row.socket,
    cores: row.cores,
    threads: row.threads,
    tdpW: row.tdp_w,
    hasIgpu: row.has_igpu,
    igpuScore: row.igpu_score,
    includesCooler: row.includes_cooler,
    memoryTypes: parsePgArray(row.memory_types) as any,
    perfScore: row.perf_score,
  };
}

function toMotherboardSpecs(row: any): MotherboardSpecs {
  return {
    socket: row.socket,
    chipset: row.chipset,
    formFactor: row.form_factor,
    memoryType: row.memory_type,
    memorySlots: row.memory_slots,
    m2Slots: row.m2_slots,
    sataPorts: row.sata_ports,
    biosNote: row.bios_note
  };
}

function toRamSpecs(row: any): RamSpecs {
  return {
    memoryType: row.memory_type,
    totalGb: row.total_gb,
    modules: row.modules,
    speedMhz: row.speed_mhz,
  };
}

function toGpuSpecs(row: any): GpuSpecs {
  return {
    chipset: row.chipset,
    vramGb: row.vram_gb,
    lengthMm: row.length_mm,
    tbpW: row.tbp_w,
    recommendedPsuW: row.recommended_psu_w,
    perfScore: row.perf_score,
  };
}

function toStorageSpecs(row: any): StorageSpecs {
  return {
    interface: row.interface,
    formFactor: row.form_factor,
    capacityGb: row.capacity_gb,
  };
}

function toPsuSpecs(row: any): PsuSpecs {
  return {
    wattage: row.wattage,
    efficiency: row.efficiency,
    formFactor: row.form_factor,
  };
}

function toCaseSpecs(row: any): CaseSpecs {
  let includedPsu = null;
  if (row.included_psu_wattage !== null && row.included_psu_wattage !== undefined) {
    includedPsu = {
      wattage: row.included_psu_wattage,
      efficiency: row.included_psu_efficiency,
      formFactor: row.included_psu_form_factor,
    };
  }

  return {
    supportedFormFactors: parsePgArray(row.supported_form_factors) as any,
    maxGpuLengthMm: row.max_gpu_length_mm,
    psuFormFactor: row.psu_form_factor,
    includedPsu,
  };
}

export async function getCatalog(db: DbClient, tnStoreId: number): Promise<CatalogItem[]> {
  const storeRes = getRows(await db.execute(sql`SELECT id FROM stores WHERE tn_store_id = ${tnStoreId}`));
  if (storeRes.length === 0) return [];
  const storeId = storeRes[0].id;

  const variants = getRows(await db.execute(sql`
    SELECT 
      sv.tn_product_id, sv.tn_variant_id, sv.name, sv.price_cents, sv.stock,
      c.id as component_id, c.type
    FROM store_variants sv
    JOIN components c ON sv.component_id = c.id
    WHERE sv.store_id = ${storeId}
      AND sv.advisor_enabled = true
      AND sv.mapping_status = 'confirmed'
      AND sv.stock > 0
      AND sv.published = true
    ORDER BY c.type ASC, sv.price_cents ASC
  `));

  const results: CatalogItem[] = [];

  for (const row of variants) {
    const type = row.type as string;
    const specsRes = getRows(await db.execute(sql`
      SELECT * FROM ${sql.raw(`${type}_specs`)}
      WHERE component_id = ${row.component_id}
    `));

    if (specsRes.length === 0) continue;
    const rawSpecs = specsRes[0];

    let specs: any;
    switch (type) {
      case 'cpu': specs = toCpuSpecs(rawSpecs); break;
      case 'motherboard': specs = toMotherboardSpecs(rawSpecs); break;
      case 'ram': specs = toRamSpecs(rawSpecs); break;
      case 'gpu': specs = toGpuSpecs(rawSpecs); break;
      case 'storage': specs = toStorageSpecs(rawSpecs); break;
      case 'psu': specs = toPsuSpecs(rawSpecs); break;
      case 'case': specs = toCaseSpecs(rawSpecs); break;
      default: continue;
    }

    const itemObj = {
      type,
      componentId: row.component_id,
      tnProductId: parseSafeInt(row.tn_product_id, 'tn_product_id'),
      tnVariantId: parseSafeInt(row.tn_variant_id, 'tn_variant_id'),
      name: row.name,
      priceCents: parseSafeInt(row.price_cents, 'price_cents'),
      stock: parseSafeInt(row.stock, 'stock'),
      specs,
    };

    const parsed = CatalogItemSchema.safeParse(itemObj);
    if (!parsed.success) {
      throw new Error(`CatalogItem validation failed for tnVariantId ${row.tn_variant_id}: ${parsed.error.message}`);
    }

    results.push(parsed.data);
  }

  return results;
}
