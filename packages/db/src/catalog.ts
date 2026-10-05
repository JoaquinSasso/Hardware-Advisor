import { sql } from 'drizzle-orm';
import { getRows, type DbClient } from './client.js';
import { CatalogItemSchema, type CatalogItem } from '@pcadvisor/shared';

function toCamelCase(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null) continue;
    const camelKey = key.replace(/_([a-z])/g, g => g[1].toUpperCase());
    
    let finalValue = value;
    if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
      finalValue = value.slice(1, -1).split(',').filter(Boolean);
    }
    
    result[camelKey] = finalValue;
  }
  return result;
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
    delete rawSpecs.component_id;
    delete rawSpecs.type;

    const specs = toCamelCase(rawSpecs);

    if (type === 'case') {
      if (rawSpecs.included_psu_wattage) {
        specs.includedPsu = {
          wattage: rawSpecs.included_psu_wattage,
          efficiency: rawSpecs.included_psu_efficiency,
          formFactor: rawSpecs.included_psu_form_factor,
        };
      } else {
        specs.includedPsu = null;
      }
      delete specs.includedPsuWattage;
      delete specs.includedPsuEfficiency;
      delete specs.includedPsuFormFactor;
    }

    const itemObj = {
      type,
      componentId: row.component_id,
      tnProductId: Number(row.tn_product_id),
      tnVariantId: Number(row.tn_variant_id),
      name: row.name,
      priceCents: Number(row.price_cents),
      stock: Number(row.stock),
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
