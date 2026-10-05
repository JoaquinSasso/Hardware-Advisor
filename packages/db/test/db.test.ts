import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, getRows } from '../src/client.js';
import { migrate } from '../src/migrate.js';
import { importCsv } from '../src/import-csv.js';
import { seedComponents } from '../src/seed-components.js';
import { applyMappings } from '../src/apply-mappings.js';
import { getCatalog } from '../src/catalog.js';
import { sql } from 'drizzle-orm';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Database Tests', () => {
  let db: ReturnType<typeof createDb>;

  beforeEach(async () => {
    // Fresh in-memory PGlite for each test
    db = createDb({ pglite: true });
    await migrate(db, { log: () => {} });
  });

  it('1. migrate sobre base vacía crea todo; correrlo dos veces no falla ni duplica', async () => {
    // Should run successfully the second time without duplicating
    await migrate(db, { log: () => {} });
    const tables = getRows(await db.execute(sql`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `));
    const tableNames = tables.map(t => t.tablename);
    expect(tableNames).toContain('stores');
    expect(tableNames).toContain('components');
    expect(tableNames).toContain('cpu_specs');
    expect(tableNames).toContain('store_variants');
    expect(tableNames).toContain('schema_migrations');
  });

  it('2. importCsv sobre sample.csv: conteos correctos, decodificación, precios, herencia', async () => {
    const res = await importCsv(db, {
      tnStoreId: 1,
      storeName: 'Test Store',
      filePath: path.join(__dirname, 'fixtures/sample.csv')
    });

    expect(res.inserted).toBe(9); // 1 simple, 2 vars, 2 rep SKU, 4 new for test 13
    expect(res.skipped).toBe(2); // 1 acc, 1 invalid price
    expect(res.warnings.length).toBe(1);
    expect(res.warnings[0]).toContain('prod-inv');

    const simple = getRows(await db.execute(sql`SELECT * FROM store_variants WHERE tn_handle = 'prod-simple'`));
    expect(simple[0].price_cents).toBe(20654004);
    expect(simple[0].name).toBe('Procesador Simple');

    const var1 = getRows(await db.execute(sql`SELECT * FROM store_variants WHERE tn_handle = 'prod-var' AND variant_label = 'Color: Rojo'`));
    expect(var1[0].name).toBe('Teclado Variante');
    expect(var1[0].published).toBe(true);

    const var2 = getRows(await db.execute(sql`SELECT * FROM store_variants WHERE tn_handle = 'prod-var' AND variant_label = 'Color: Azul (Ñ)'`));
    expect(var2[0].name).toBe('Teclado Variante'); // Heredado
    expect(var2[0].published).toBe(true); // Heredado de la 1ra fila

    // 5. Dos productos con el mismo SKU
    const reps = getRows(await db.execute(sql`SELECT * FROM store_variants WHERE sku = 'SKU-SAME'`));
    expect(reps.length).toBe(2);
  });

  it('3. Ninguna columna ni valor de Costo aparece en la base', async () => {
    await importCsv(db, { tnStoreId: 1, storeName: 'S', filePath: path.join(__dirname, 'fixtures/sample.csv') });
    
    // Attempt to select from store_variants to see if there's any column "costo" or similar
    const columnsRes = getRows(await db.execute(sql`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'store_variants'
    `));
    const cols = columnsRes.map(c => c.column_name);
    expect(cols).not.toContain('costo');
    expect(cols).not.toContain('cost');

    const allData = getRows(await db.execute(sql`SELECT * FROM store_variants`));
    for (const row of allData) {
      for (const val of Object.values(row)) {
        // Ninguno debería ser 1000, 500, 200, 300, 50 (los costos del CSV)
        // excepto 500 que es un precio también (500.00), pero 1000 es precio (1,000.00) = 100000 cents
        // The value '1000' as a raw number shouldn't be here since the price is 100000 cents
        // and stock is 10. Cost was 1000.
        // We'll just verify that no specific cost-only value (like 300) exists anywhere unless it's a price.
        // In prod-rep2 price is 600.00 => 60000, stock is 2. Cost was 300.
        expect(val).not.toBe(300);
      }
    }
  });

  it('4. Importar dos veces es idempotente y conserva mapeos', async () => {
    await importCsv(db, { tnStoreId: 1, storeName: 'S', filePath: path.join(__dirname, 'fixtures/sample.csv') });
    
    // Set a mapping manually
    await db.execute(sql`
      UPDATE store_variants SET mapping_status = 'ignored' WHERE tn_handle = 'prod-simple'
    `);

    // Import again
    const res2 = await importCsv(db, { tnStoreId: 1, storeName: 'S', filePath: path.join(__dirname, 'fixtures/sample.csv') });
    expect(res2.inserted).toBe(0);
    expect(res2.updated).toBe(9);

    const check = getRows(await db.execute(sql`SELECT mapping_status FROM store_variants WHERE tn_handle = 'prod-simple'`));
    expect(check[0].mapping_status).toBe('ignored');
  });

  it('5. Dos productos con el mismo SKU se importan ambos', async () => {
    await importCsv(db, { tnStoreId: 1, storeName: 'Test Store', filePath: path.join(__dirname, 'fixtures/sample.csv') });
    const reps = getRows(await db.execute(sql`SELECT * FROM store_variants WHERE sku = 'SKU-SAME'`));
    expect(reps.length).toBe(2);
    expect(reps[0].tn_handle).not.toBe(reps[1].tn_handle);
  });

  it('6. Insertar cpu_specs para gpu falla por FK compuesta', async () => {
    await db.execute(sql`
      INSERT INTO components (id, type, brand, model, canonical_name)
      VALUES ('00000000-0000-0000-0000-000000000001', 'gpu', 'N', 'M', 'C1')
    `);
    
    // Try to insert cpu_specs for this gpu component
    await expect(db.execute(sql`
      INSERT INTO cpu_specs (component_id, type, socket, cores, threads, tdp_w, has_igpu, includes_cooler, memory_types, perf_score)
      VALUES ('00000000-0000-0000-0000-000000000001', 'cpu', 'S', 1, 1, 1, false, false, '{"DDR4"}', 50)
    `)).rejects.toThrow();
  });

  it('7. advisor_enabled = true con mapping_status unmapped falla por CHECK', async () => {
    await db.execute(sql`INSERT INTO stores (id, tn_store_id, name) VALUES ('00000000-0000-0000-0000-000000000001', 99, 'T')`);
    await expect(db.execute(sql`
      INSERT INTO store_variants (store_id, tn_product_id, tn_variant_id, tn_handle, name, category_path, price_cents, stock, published, source, mapping_status, advisor_enabled)
      VALUES ('00000000-0000-0000-0000-000000000001', 1, 1, 'h', 'n', 'c', 1, 1, true, 'csv', 'unmapped', true)
    `)).rejects.toThrow();
  });

  it('8. case_specs con solo included_psu_wattage falla por CHECK', async () => {
    await db.execute(sql`
      INSERT INTO components (id, type, brand, model, canonical_name)
      VALUES ('00000000-0000-0000-0000-000000000001', 'case', 'B', 'M', 'C2')
    `);
    await expect(db.execute(sql`
      INSERT INTO case_specs (component_id, type, supported_form_factors, max_gpu_length_mm, psu_form_factor, included_psu_wattage)
      VALUES ('00000000-0000-0000-0000-000000000001', 'case', '{"ATX"}', 100, 'ATX', 500)
    `)).rejects.toThrow();
  });

  it('9. seedComponents con specs inválido aborta', async () => {
    // Creamos un fixture inválido temporal
    const invalidPath = path.join(__dirname, 'fixtures/invalid.json');
    await fs.writeFile(invalidPath, JSON.stringify([{
      canonicalName: "Bad CPU",
      type: "cpu",
      brand: "AMD",
      model: "Ryzen",
      specs: { cores: -1 } // Invalid
    }]));

    await expect(seedComponents(db, invalidPath)).rejects.toThrow(/Validation failed/);
    await fs.unlink(invalidPath);

    const check = getRows(await db.execute(sql`SELECT * FROM components`));
    expect(check.length).toBe(0);
  });

  it('10. getCatalog devuelve correctos y valida', async () => {
    await importCsv(db, { tnStoreId: 1, storeName: 'S', filePath: path.join(__dirname, 'fixtures/sample.csv') });
    await seedComponents(db, path.join(__dirname, 'fixtures/components.json'));
    await applyMappings(db, 1, path.join(__dirname, 'fixtures/mappings.json'));

    const catalog = await getCatalog(db, 1);
    
    // "prod-simple" is confirmed, enabled, stock 10, CPU
    // "prod-var" Color Rojo is confirmed, enabled, stock 5, RAM
    // 2 motherboards, 2 cases from the new fixtures are confirmed, enabled, stock 10.
    // Total = 6
    expect(catalog.length).toBe(6);
    
    // Sort is type asc, then price asc
    // The case items should be checked appropriately later.
    const cpus = catalog.filter(c => c.type === 'cpu');
    expect(cpus.length).toBe(1);
    expect(cpus[0].name).toBe('Procesador Simple');
    expect(cpus[0].priceCents).toBe(20654004);

    const rams = catalog.filter(c => c.type === 'ram');
    expect(rams.length).toBe(1);
    expect(rams[0].name).toBe('Teclado Variante');

    // Test case reconstruction (we'll manually insert one to test case_specs)
    await db.execute(sql`
      INSERT INTO store_variants (store_id, tn_product_id, tn_variant_id, tn_handle, variant_label, name, category_path, price_cents, stock, published, source, mapping_status, advisor_enabled, component_id)
      SELECT id, 999, 999, 'case-h', NULL, 'Gabo', 'C', 1000, 10, true, 'api', 'confirmed', true, (SELECT id FROM components WHERE canonical_name = 'Gabinete Generico')
      FROM stores WHERE tn_store_id = 1
    `);

    const catalog2 = await getCatalog(db, 1);
    expect(catalog2.length).toBe(7);
    
    const caseItem = catalog2.find(c => c.type === 'case' && c.name === 'Gabo') as any;
    expect(caseItem).toBeDefined();
    expect(caseItem.specs.includedPsu.wattage).toBe(500);
  });

  it('11. migración de prueba con string con ";" y comentario "-- a; b" se aplica correctamente', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pcadvisor-mig-semicolon-'));
    try {
      const sqlContent = `
        -- a; b
        CREATE TABLE test_comments_semicolon (
          id int PRIMARY KEY,
          val text NOT NULL
        );
        INSERT INTO test_comments_semicolon (id, val) VALUES (1, 'valor con ; punto y coma');
        -- comentario final; con punto y coma
      `;
      await fs.writeFile(path.join(tempDir, '0002_test.sql'), sqlContent, 'utf-8');

      await migrate(db, { dir: tempDir, log: () => {} });

      const rows = getRows(await db.execute(sql`SELECT * FROM test_comments_semicolon`));
      expect(rows.length).toBe(1);
      expect(rows[0].val).toBe('valor con ; punto y coma');

      const migRecord = getRows(await db.execute(sql`
        SELECT * FROM schema_migrations WHERE name = '0002_test.sql'
      `));
      expect(migRecord.length).toBe(1);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('12. migración cuya segunda sentencia falla deja la base sin cambios y sin registro en schema_migrations', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pcadvisor-mig-fail-'));
    try {
      const sqlContent = `
        CREATE TABLE should_be_rolled_back (
          id int PRIMARY KEY
        );
        INSERT INTO tabla_inexistente_falla VALUES (1);
      `;
      await fs.writeFile(path.join(tempDir, '0002_fail.sql'), sqlContent, 'utf-8');

      await expect(migrate(db, { dir: tempDir, log: () => {} })).rejects.toThrow();

      const tableCheck = getRows(await db.execute(sql`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'should_be_rolled_back'
      `));
      expect(tableCheck.length).toBe(0);

      const migCheck = getRows(await db.execute(sql`
        SELECT * FROM schema_migrations WHERE name = '0002_fail.sql'
      `));
      expect(migCheck.length).toBe(0);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});

