import { describe, it, expect, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  createDb,
  getRows,
  migrate,
  StoreNotFoundError,
  syncStoreVariants,
  type SyncVariantInput,
} from '../src/index.js';

function makeVariant(overrides: Partial<SyncVariantInput> = {}): SyncVariantInput {
  return {
    tnProductId: 10,
    tnVariantId: 100,
    tnHandle: 'ryzen-5-5600',
    variantLabel: null,
    sku: 'SKU-5600',
    name: 'AMD Ryzen 5 5600',
    categoryPath: 'Componentes, Procesadores',
    priceCents: 18500000,
    stock: 7,
    published: true,
    ...overrides,
  };
}

describe('syncStoreVariants', () => {
  let db: ReturnType<typeof createDb>;

  beforeEach(async () => {
    db = createDb({ pglite: true });
    await migrate(db, { log: () => {} });
  });

  it('tienda inexistente sin storeName lanza StoreNotFoundError; con storeName se crea', async () => {
    await expect(
      syncStoreVariants(db, {
        tnStoreId: 500,
        variants: [makeVariant()],
      }),
    ).rejects.toBeInstanceOf(StoreNotFoundError);

    const storesBefore = getRows(await db.execute(sql`SELECT * FROM stores WHERE tn_store_id = 500`));
    expect(storesBefore).toHaveLength(0);

    const res = await syncStoreVariants(db, {
      tnStoreId: 500,
      storeName: 'Tienda Prueba',
      variants: [makeVariant()],
    });

    expect(res).toEqual({ inserted: 1, updated: 0, rematched: 0, missing: 0 });
    const storesAfter = getRows<{ name: string }>(
      await db.execute(sql`SELECT name FROM stores WHERE tn_store_id = 500`),
    );
    expect(storesAfter).toHaveLength(1);
    expect(storesAfter[0]?.name).toBe('Tienda Prueba');
  });

  it('insert de 2 variantes nuevas devuelve inserted 2 y source api', async () => {
    const v1 = makeVariant({ tnProductId: 10, tnVariantId: 100, tnHandle: 'prod-1', variantLabel: null });
    const v2 = makeVariant({
      tnProductId: 11,
      tnVariantId: 200,
      tnHandle: 'prod-2',
      variantLabel: 'Color: Negro',
    });

    const res = await syncStoreVariants(db, {
      tnStoreId: 1,
      storeName: 'Store 1',
      variants: [v1, v2],
    });

    expect(res).toEqual({ inserted: 2, updated: 0, rematched: 0, missing: 0 });

    const rows = getRows<{
      tn_variant_id: number | string;
      source: string;
      mapping_status: string;
      advisor_enabled: boolean;
      component_id: string | null;
    }>(
      await db.execute(sql`
        SELECT tn_variant_id, source, mapping_status, advisor_enabled, component_id
        FROM store_variants
        ORDER BY tn_variant_id ASC
      `),
    );

    expect(rows).toHaveLength(2);
    expect(Number(rows[0]?.tn_variant_id)).toBe(100);
    expect(rows[0]?.source).toBe('api');
    expect(rows[0]?.mapping_status).toBe('unmapped');
    expect(rows[0]?.advisor_enabled).toBe(false);
    expect(rows[0]?.component_id).toBeNull();
    expect(Number(rows[1]?.tn_variant_id)).toBe(200);
    expect(rows[1]?.source).toBe('api');
  });

  it('fila previa importada por CSV con mapping confirmado se rematchea por handle/label conservando mapping, component_id y advisor_enabled', async () => {
    const componentId = '00000000-0000-0000-0000-000000000010';
    const storeId = '00000000-0000-0000-0000-000000000001';

    await db.execute(sql`
      INSERT INTO stores (id, tn_store_id, name)
      VALUES (${storeId}, 1, 'Store CSV')
    `);
    await db.execute(sql`
      INSERT INTO components (id, type, brand, model, canonical_name)
      VALUES (${componentId}, 'cpu', 'AMD', 'Ryzen 5 5600', 'AMD Ryzen 5 5600')
    `);
    await db.execute(sql`
      INSERT INTO store_variants (
        store_id, tn_product_id, tn_variant_id, tn_handle, variant_label,
        sku, name, category_path, price_cents, stock, published, source,
        component_id, mapping_status, advisor_enabled
      ) VALUES (
        ${storeId}, 999991, 999992, 'ryzen-5-5600', 'Box: Original',
        'OLD-SKU', 'Nombre CSV', 'COMPONENTES', 15000000, 3, true, 'csv',
        ${componentId}, 'confirmed', true
      )
    `);

    const res = await syncStoreVariants(db, {
      tnStoreId: 1,
      variants: [
        makeVariant({
          tnProductId: 42,
          tnVariantId: 4201,
          tnHandle: 'ryzen-5-5600',
          variantLabel: 'Box: Original',
          sku: 'NEW-SKU',
          name: 'AMD Ryzen 5 5600 API',
          categoryPath: 'Componentes, Procesadores',
          priceCents: 19000000,
          stock: 12,
          published: true,
        }),
      ],
    });

    expect(res).toEqual({ inserted: 0, updated: 0, rematched: 1, missing: 0 });

    const rows = getRows<{
      tn_product_id: number | string;
      tn_variant_id: number | string;
      sku: string | null;
      name: string;
      price_cents: number | string;
      stock: number;
      source: string;
      component_id: string | null;
      mapping_status: string;
      advisor_enabled: boolean;
    }>(await db.execute(sql`SELECT * FROM store_variants WHERE store_id = ${storeId}`));

    expect(rows).toHaveLength(1);
    expect(Number(rows[0]?.tn_product_id)).toBe(42);
    expect(Number(rows[0]?.tn_variant_id)).toBe(4201);
    expect(rows[0]?.sku).toBe('NEW-SKU');
    expect(rows[0]?.name).toBe('AMD Ryzen 5 5600 API');
    expect(Number(rows[0]?.price_cents)).toBe(19000000);
    expect(rows[0]?.stock).toBe(12);
    expect(rows[0]?.source).toBe('api');
    expect(rows[0]?.component_id).toBe(componentId);
    expect(rows[0]?.mapping_status).toBe('confirmed');
    expect(rows[0]?.advisor_enabled).toBe(true);
  });

  it('segunda sincronización con los mismos datos devuelve updated = cantidad e inserted = 0', async () => {
    const variants = [
      makeVariant({ tnProductId: 1, tnVariantId: 101, tnHandle: 'h-1', variantLabel: null }),
      makeVariant({ tnProductId: 2, tnVariantId: 102, tnHandle: 'h-2', variantLabel: 'Color: Blanco' }),
    ];

    const first = await syncStoreVariants(db, {
      tnStoreId: 1,
      storeName: 'Store',
      variants,
    });
    expect(first).toEqual({ inserted: 2, updated: 0, rematched: 0, missing: 0 });

    const second = await syncStoreVariants(db, {
      tnStoreId: 1,
      variants,
    });
    expect(second).toEqual({ inserted: 0, updated: 2, rematched: 0, missing: 0 });
  });

  it('variante que desaparece pasa a missing 1 con stock 0, published false y mapping intacto', async () => {
    const componentId = '00000000-0000-0000-0000-000000000020';
    await db.execute(sql`
      INSERT INTO components (id, type, brand, model, canonical_name)
      VALUES (${componentId}, 'cpu', 'Intel', 'i5-12400', 'Intel Core i5-12400')
    `);

    const v1 = makeVariant({ tnProductId: 1, tnVariantId: 101, tnHandle: 'keep-me', stock: 5, published: true });
    const v2 = makeVariant({ tnProductId: 2, tnVariantId: 102, tnHandle: 'lose-me', stock: 8, published: true });

    await syncStoreVariants(db, {
      tnStoreId: 1,
      storeName: 'Store',
      variants: [v1, v2],
    });

    await db.execute(sql`
      UPDATE store_variants
      SET component_id = ${componentId}, mapping_status = 'confirmed', advisor_enabled = true
      WHERE tn_variant_id = 102
    `);

    const second = await syncStoreVariants(db, {
      tnStoreId: 1,
      variants: [v1],
    });

    expect(second).toEqual({ inserted: 0, updated: 1, rematched: 0, missing: 1 });

    const missingRows = getRows<{
      stock: number;
      published: boolean;
      component_id: string | null;
      mapping_status: string;
      advisor_enabled: boolean;
    }>(await db.execute(sql`SELECT * FROM store_variants WHERE tn_variant_id = 102`));

    expect(missingRows).toHaveLength(1);
    expect(missingRows[0]?.stock).toBe(0);
    expect(missingRows[0]?.published).toBe(false);
    expect(missingRows[0]?.component_id).toBe(componentId);
    expect(missingRows[0]?.mapping_status).toBe('confirmed');
    expect(missingRows[0]?.advisor_enabled).toBe(true);
  });

  it('tnVariantId repetido en el input lanza Error y no escribe nada en la base', async () => {
    const existing = makeVariant({
      tnProductId: 1,
      tnVariantId: 101,
      tnHandle: 'initial-handle',
      priceCents: 10000,
    });

    await syncStoreVariants(db, {
      tnStoreId: 1,
      storeName: 'Store',
      variants: [existing],
    });

    await expect(
      syncStoreVariants(db, {
        tnStoreId: 1,
        variants: [
          makeVariant({ tnProductId: 1, tnVariantId: 101, tnHandle: 'initial-handle', priceCents: 99999 }),
          makeVariant({ tnProductId: 2, tnVariantId: 101, tnHandle: 'other-handle', priceCents: 88888 }),
        ],
      }),
    ).rejects.toThrow(/101/);

    const rows = getRows<{ tn_handle: string; price_cents: number | string }>(
      await db.execute(sql`SELECT tn_handle, price_cents FROM store_variants`),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tn_handle).toBe('initial-handle');
    expect(Number(rows[0]?.price_cents)).toBe(10000);
  });

  it('choque de unicidad handle/label lanza Error indicando ambos tn_variant_id y no escribe nada', async () => {
    const v1 = makeVariant({ tnProductId: 1, tnVariantId: 101, tnHandle: 'handle-a', variantLabel: null, priceCents: 1000 });
    const v2 = makeVariant({ tnProductId: 2, tnVariantId: 202, tnHandle: 'handle-b', variantLabel: null, priceCents: 2000 });

    await syncStoreVariants(db, {
      tnStoreId: 1,
      storeName: 'Store',
      variants: [v1, v2],
    });

    // Intentamos actualizar la variante 101 para que tome el handle 'handle-b' que ya pertenece a la variante 202
    let caughtError: Error | undefined;
    try {
      await syncStoreVariants(db, {
        tnStoreId: 1,
        variants: [
          makeVariant({ tnProductId: 1, tnVariantId: 101, tnHandle: 'handle-b', variantLabel: null, priceCents: 9999 }),
        ],
      });
    } catch (err) {
      caughtError = err as Error;
    }

    expect(caughtError).toBeInstanceOf(Error);
    expect(caughtError?.message).toContain('101');
    expect(caughtError?.message).toContain('202');

    // Verificar que la tabla no cambió (rollback de transacción)
    const rows = getRows<{ tn_variant_id: number | string; tn_handle: string; price_cents: number | string }>(
      await db.execute(sql`SELECT tn_variant_id, tn_handle, price_cents FROM store_variants ORDER BY tn_variant_id ASC`),
    );
    expect(rows).toHaveLength(2);
    expect(Number(rows[0]?.tn_variant_id)).toBe(101);
    expect(rows[0]?.tn_handle).toBe('handle-a');
    expect(Number(rows[0]?.price_cents)).toBe(1000);
    expect(Number(rows[1]?.tn_variant_id)).toBe(202);
    expect(rows[1]?.tn_handle).toBe('handle-b');
    expect(Number(rows[1]?.price_cents)).toBe(2000);
  });
});
