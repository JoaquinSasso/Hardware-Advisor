import { sql } from 'drizzle-orm';
import { getRows, type DbClient } from './client.js';
import { StoreNotFoundError } from './conversations.js';

export type SyncVariantInput = {
  tnProductId: number;
  tnVariantId: number;
  tnHandle: string;
  variantLabel: string | null;
  sku: string | null;
  name: string;
  categoryPath: string;
  priceCents: number;
  stock: number;
  published: boolean;
};

interface ExistingVariantRow {
  id: string;
  tn_variant_id: number | string;
}

export async function syncStoreVariants(
  db: DbClient,
  p: {
    tnStoreId: number;
    storeName?: string;
    variants: SyncVariantInput[];
  },
): Promise<{ inserted: number; updated: number; rematched: number; missing: number }> {
  return db.transaction(async (tx) => {
    // 1. Tienda: buscar o crear con storeName
    const storeRows = getRows<{ id: string }>(
      await tx.execute(sql`
        SELECT id FROM stores WHERE tn_store_id = ${p.tnStoreId}
      `),
    );

    let storeId: string;
    const existingStore = storeRows[0];
    if (existingStore) {
      storeId = existingStore.id;
    } else {
      if (p.storeName === undefined || p.storeName.trim() === '') {
        throw new StoreNotFoundError(`Store ${p.tnStoreId} not found`);
      }
      const insertedStoreRows = getRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO stores (tn_store_id, name)
          VALUES (${p.tnStoreId}, ${p.storeName})
          RETURNING id
        `),
      );
      const createdStore = insertedStoreRows[0];
      if (!createdStore) {
        throw new Error(`Failed to create store ${p.tnStoreId}`);
      }
      storeId = createdStore.id;
    }

    // 2. Validar entradas: tnVariantId repetido o (tnHandle, variantLabel) repetido
    const seenVariantIds = new Set<number>();
    const seenHandles = new Map<string, Set<string | null>>();

    for (const v of p.variants) {
      if (seenVariantIds.has(v.tnVariantId)) {
        throw new Error(`tnVariantId repetido en el input: ${v.tnVariantId}`);
      }
      seenVariantIds.add(v.tnVariantId);

      let labelsForHandle = seenHandles.get(v.tnHandle);
      if (!labelsForHandle) {
        labelsForHandle = new Set<string | null>();
        seenHandles.set(v.tnHandle, labelsForHandle);
      }
      if (labelsForHandle.has(v.variantLabel)) {
        throw new Error(
          `(tnHandle, variantLabel) repetido en el input: (${v.tnHandle}, ${v.variantLabel ?? 'NULL'})`,
        );
      }
      labelsForHandle.add(v.variantLabel);
    }

    let inserted = 0;
    let updated = 0;
    let rematched = 0;
    const touchedRowIds = new Set<string>();

    // 3. Procesar cada variante del input
    for (const v of p.variants) {
      const byVariantIdRows = getRows<ExistingVariantRow>(
        await tx.execute(sql`
          SELECT id, tn_variant_id
          FROM store_variants
          WHERE store_id = ${storeId} AND tn_variant_id = ${v.tnVariantId}
        `),
      );

      const rowByVariantId = byVariantIdRows[0];
      if (rowByVariantId) {
        // 3a. Encontrado por tn_variant_id -> verificar que no choque con otra fila en (store_id, tn_handle, variant_label)
        const conflictRows =
          v.variantLabel === null
            ? getRows<ExistingVariantRow>(
                await tx.execute(sql`
                  SELECT id, tn_variant_id
                  FROM store_variants
                  WHERE store_id = ${storeId}
                    AND tn_handle = ${v.tnHandle}
                    AND variant_label IS NULL
                    AND id <> ${rowByVariantId.id}
                `),
              )
            : getRows<ExistingVariantRow>(
                await tx.execute(sql`
                  SELECT id, tn_variant_id
                  FROM store_variants
                  WHERE store_id = ${storeId}
                    AND tn_handle = ${v.tnHandle}
                    AND variant_label = ${v.variantLabel}
                    AND id <> ${rowByVariantId.id}
                `),
              );

        const conflictRow = conflictRows[0];
        if (conflictRow) {
          throw new Error(
            `Choque de unicidad para (${v.tnHandle}, ${v.variantLabel ?? 'NULL'}) entre tn_variant_id ${v.tnVariantId} y ${conflictRow.tn_variant_id}`,
          );
        }

        await tx.execute(sql`
          UPDATE store_variants
          SET tn_product_id = ${v.tnProductId},
              tn_variant_id = ${v.tnVariantId},
              tn_handle = ${v.tnHandle},
              variant_label = ${v.variantLabel},
              sku = ${v.sku},
              name = ${v.name},
              category_path = ${v.categoryPath},
              price_cents = ${v.priceCents},
              stock = ${v.stock},
              published = ${v.published},
              source = 'api',
              last_synced_at = now()
          WHERE id = ${rowByVariantId.id}
        `);

        touchedRowIds.add(rowByVariantId.id);
        updated++;
        continue;
      }

      // 3b. Buscar por (tn_handle, variant_label)
      const byHandleLabelRows =
        v.variantLabel === null
          ? getRows<ExistingVariantRow>(
              await tx.execute(sql`
                SELECT id, tn_variant_id
                FROM store_variants
                WHERE store_id = ${storeId}
                  AND tn_handle = ${v.tnHandle}
                  AND variant_label IS NULL
              `),
            )
          : getRows<ExistingVariantRow>(
              await tx.execute(sql`
                SELECT id, tn_variant_id
                FROM store_variants
                WHERE store_id = ${storeId}
                  AND tn_handle = ${v.tnHandle}
                  AND variant_label = ${v.variantLabel}
              `),
            );

      const rowByHandleLabel = byHandleLabelRows[0];
      if (rowByHandleLabel) {
        await tx.execute(sql`
          UPDATE store_variants
          SET tn_product_id = ${v.tnProductId},
              tn_variant_id = ${v.tnVariantId},
              tn_handle = ${v.tnHandle},
              variant_label = ${v.variantLabel},
              sku = ${v.sku},
              name = ${v.name},
              category_path = ${v.categoryPath},
              price_cents = ${v.priceCents},
              stock = ${v.stock},
              published = ${v.published},
              source = 'api',
              last_synced_at = now()
          WHERE id = ${rowByHandleLabel.id}
        `);

        touchedRowIds.add(rowByHandleLabel.id);
        rematched++;
        continue;
      }

      // 3c. No existe -> INSERT con mapping por defecto
      const insertedRows = getRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO store_variants (
            store_id,
            tn_product_id,
            tn_variant_id,
            tn_handle,
            variant_label,
            sku,
            name,
            category_path,
            price_cents,
            stock,
            published,
            source,
            last_synced_at
          ) VALUES (
            ${storeId},
            ${v.tnProductId},
            ${v.tnVariantId},
            ${v.tnHandle},
            ${v.variantLabel},
            ${v.sku},
            ${v.name},
            ${v.categoryPath},
            ${v.priceCents},
            ${v.stock},
            ${v.published},
            'api',
            now()
          )
          RETURNING id
        `),
      );

      const insertedRow = insertedRows[0];
      if (!insertedRow) {
        throw new Error(`Failed to insert variant ${v.tnVariantId}`);
      }
      touchedRowIds.add(insertedRow.id);
      inserted++;
    }

    // 4. Filas de la tienda que no aparecieron en el input -> stock = 0, published = false, missing++
    const allStoreRows = getRows<{ id: string }>(
      await tx.execute(sql`
        SELECT id FROM store_variants WHERE store_id = ${storeId}
      `),
    );

    let missing = 0;
    for (const row of allStoreRows) {
      if (!touchedRowIds.has(row.id)) {
        await tx.execute(sql`
          UPDATE store_variants
          SET stock = 0,
              published = false
          WHERE id = ${row.id}
        `);
        missing++;
      }
    }

    return { inserted, updated, rematched, missing };
  });
}
