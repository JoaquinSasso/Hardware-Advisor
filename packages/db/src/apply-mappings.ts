import fs from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { getRows, type DbClient } from './client.js';

export async function applyMappings(db: DbClient, tnStoreId: number, filePath: string) {
  const content = await fs.readFile(filePath, 'utf-8');
  const mappings = JSON.parse(content);

  let confirmed = 0;
  let ignored = 0;

  await db.transaction(async (tx) => {
    const storeRes = getRows(await tx.execute(sql`SELECT id FROM stores WHERE tn_store_id = ${tnStoreId}`));
    if (storeRes.length === 0) throw new Error(`Store ${tnStoreId} not found`);
    const storeId = storeRes[0].id;

    for (const mapping of mappings) {
      const { tnHandle, variantLabel, canonicalName, status, advisorEnabled } = mapping;

      let variantRes;
      if (variantLabel === null) {
        variantRes = getRows(await tx.execute(sql`
          SELECT id FROM store_variants 
          WHERE store_id = ${storeId} AND tn_handle = ${tnHandle} AND variant_label IS NULL
        `));
      } else {
        variantRes = getRows(await tx.execute(sql`
          SELECT id FROM store_variants 
          WHERE store_id = ${storeId} AND tn_handle = ${tnHandle} AND variant_label = ${variantLabel}
        `));
      }

      if (variantRes.length === 0) {
        throw new Error(`Variant not found for handle ${tnHandle} and label ${variantLabel}`);
      }
      const variantId = variantRes[0].id;

      let componentId = null;
      if (status === 'confirmed') {
        if (!canonicalName) throw new Error(`canonicalName required for confirmed status`);
        const compRes = getRows(await tx.execute(sql`SELECT id FROM components WHERE canonical_name = ${canonicalName}`));
        if (compRes.length === 0) throw new Error(`Component ${canonicalName} not found`);
        componentId = compRes[0].id;
      }

      const finalStatus = status;
      const finalAdvisorEnabled = status === 'ignored' ? false : advisorEnabled;
      const finalComponentId = status === 'ignored' ? null : componentId;

      if (finalStatus === 'confirmed') confirmed++;
      if (finalStatus === 'ignored') ignored++;

      await tx.execute(sql`
        UPDATE store_variants 
        SET mapping_status = ${finalStatus},
            advisor_enabled = ${finalAdvisorEnabled},
            component_id = ${finalComponentId}
        WHERE id = ${variantId}
      `);
    }
  });

  return { total: mappings.length, confirmed, ignored };
}
