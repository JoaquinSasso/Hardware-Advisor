import fs from 'node:fs';
import crypto from 'node:crypto';
import { parse } from 'csv-parse';
import iconv from 'iconv-lite';
import { eq, sql } from 'drizzle-orm';
import type { DbClient } from './client.js';
import { stores, storeVariants } from './schema.js';

export async function importCsv(
  db: DbClient,
  opts: { tnStoreId: number; storeName: string; filePath: string }
): Promise<{ inserted: number; updated: number; skipped: number; warnings: string[] }> {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const warnings: string[] = [];

  // 1. Create or get store
  let storeId: string;
  const existingStores = await db.select().from(stores).where(eq(stores.tnStoreId, opts.tnStoreId));
  if (existingStores.length > 0) {
    storeId = existingStores[0].id;
  } else {
    const insertedStore = await db.insert(stores).values({
      tnStoreId: opts.tnStoreId,
      name: opts.storeName,
    }).returning();
    storeId = insertedStore[0].id;
  }

  const parser = fs.createReadStream(opts.filePath)
    .pipe(iconv.decodeStream('win1252'))
    .pipe(parse({
      delimiter: ';',
      columns: true,
      skip_empty_lines: true,
      trim: true
    }));

  let lastProductName = '';
  let lastProductCategory = '';
  let lastPublished = false;

  for await (const row of parser) {
    const handle = row['Identificador de URL'];
    let name = row['Nombre'];
    let category = row['Categorías'];
    let showInStore = row['Mostrar en tienda'];

    if (name) {
      lastProductName = name;
      lastProductCategory = category;
      lastPublished = showInStore === 'SI';
    } else {
      name = lastProductName;
      category = lastProductCategory;
      showInStore = lastPublished ? 'SI' : 'NO';
    }

    if (!category || !category.includes('COMPONENTES')) {
      skipped++;
      continue;
    }

    const priceStr = row['Precio'] || '';
    const priceRegex = /^\d{1,3}(,\d{3})*(\.\d{1,2})?$/;
    if (!priceRegex.test(priceStr)) {
      warnings.push(`Invalid price format for handle ${handle}: ${priceStr}`);
      skipped++;
      continue;
    }

    // Convert price to cents without floating point arithmetic
    const cleanPrice = priceStr.replace(/,/g, '');
    const [intPart, decPart] = cleanPrice.split('.');
    const centsStr = decPart ? decPart.padEnd(2, '0').slice(0, 2) : '00';
    const priceCents = parseInt(intPart + centsStr, 10);

    const stockStr = row['Stock'] || '0';
    const stock = parseInt(stockStr, 10) || 0;
    const sku = row['SKU'] || null;

    const props: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const propName = row[`Nombre de propiedad ${i}`];
      const propValue = row[`Valor de propiedad ${i}`];
      if (propName && propValue) {
        props.push(`${propName}: ${propValue}`);
      }
    }
    const variantLabel = props.length > 0 ? props.join(', ') : null;

    const syntheticId = (s: string) => {
      const hash = crypto.createHash('sha256').update(s).digest('hex');
      return parseInt(hash.slice(0, 12), 16) + 1;
    };

    const tnProductId = syntheticId(handle);
    const tnVariantId = syntheticId(handle + '|' + (variantLabel ?? ''));
    const published = showInStore === 'SI';

    await db.transaction(async (tx) => {
      let existing;
      if (variantLabel === null) {
        const result: any = await tx.execute(sql`
          SELECT id FROM store_variants 
          WHERE store_id = ${storeId} AND tn_handle = ${handle} AND variant_label IS NULL
        `);
        const rows = result.rows || result;
        existing = rows.length > 0 ? rows[0] : null;
      } else {
        const result: any = await tx.execute(sql`
          SELECT id FROM store_variants 
          WHERE store_id = ${storeId} AND tn_handle = ${handle} AND variant_label = ${variantLabel}
        `);
        const rows = result.rows || result;
        existing = rows.length > 0 ? rows[0] : null;
      }

      if (existing) {
        await tx.update(storeVariants)
          .set({
            name,
            categoryPath: category,
            priceCents,
            stock,
            published,
            sku,
            lastSyncedAt: new Date()
          })
          .where(eq(storeVariants.id, existing.id));
        updated++;
      } else {
        await tx.insert(storeVariants).values({
          storeId,
          tnProductId,
          tnVariantId,
          tnHandle: handle,
          variantLabel,
          sku,
          name,
          categoryPath: category,
          priceCents,
          stock,
          published,
          source: 'csv'
        });
        inserted++;
      }
    });
  }

  return { inserted, updated, skipped, warnings };
}
