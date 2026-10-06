import fs from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { getRows, type DbClient } from './client.js';
import * as schemas from '@pcadvisor/shared';

// Helper to convert camelCase to snake_case
function toSnakeCase(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    result[snakeKey] = value;
  }
  return result;
}

export async function seedComponents(db: DbClient, filePath: string) {
  const content = await fs.readFile(filePath, 'utf-8');
  const items = JSON.parse(content);

  let inserted = 0;
  let updated = 0;

  await db.transaction(async (tx) => {
    for (const item of items) {
      const { canonicalName, type, brand, model, specs } = item;

      // Validate with shared schema
      let schema;
      switch (type) {
        case 'cpu': schema = schemas.CpuSpecsSchema; break;
        case 'motherboard': schema = schemas.MotherboardSpecsSchema; break;
        case 'ram': schema = schemas.RamSpecsSchema; break;
        case 'gpu': schema = schemas.GpuSpecsSchema; break;
        case 'storage': schema = schemas.StorageSpecsSchema; break;
        case 'psu': schema = schemas.PsuSpecsSchema; break;
        case 'case': schema = schemas.CaseSpecsSchema; break;
        default: throw new Error(`Unknown type ${type} for ${canonicalName}`);
      }

      const parsed = schema.safeParse(specs);
      if (!parsed.success) {
        const firstError = parsed.error.errors[0];
        if (!firstError) throw new Error(`Validation failed for ${canonicalName}`);
        throw new Error(`Validation failed for ${canonicalName}, field: ${firstError.path.join('.')}`);
      }

      const existing = getRows(await tx.execute(sql`SELECT id FROM components WHERE canonical_name = ${canonicalName}`));
      let componentId;

      const firstExisting = existing[0];
      if (firstExisting) {
        updated++;
        componentId = firstExisting.id;
        await tx.execute(sql`
          UPDATE components SET brand = ${brand}, model = ${model} WHERE id = ${componentId}
        `);
      } else {
        inserted++;
        const compResult = getRows(await tx.execute(sql`
          INSERT INTO components (type, brand, model, canonical_name)
          VALUES (${type}, ${brand}, ${model}, ${canonicalName})
          RETURNING id
        `));
        const firstCompResult = compResult[0];
        if (!firstCompResult) throw new Error(`Failed to insert component ${canonicalName}`);
        componentId = firstCompResult.id;
      }

      const snakeSpecs = toSnakeCase(specs);
      
      if (type === 'case') {
        const includedPsu = specs.includedPsu;
        delete snakeSpecs.included_psu;
        if (includedPsu) {
          snakeSpecs.included_psu_wattage = includedPsu.wattage;
          snakeSpecs.included_psu_efficiency = includedPsu.efficiency;
          snakeSpecs.included_psu_form_factor = includedPsu.formFactor;
        } else {
          snakeSpecs.included_psu_wattage = null;
          snakeSpecs.included_psu_efficiency = null;
          snakeSpecs.included_psu_form_factor = null;
        }
      }

      const columns = ['component_id', 'type', ...Object.keys(snakeSpecs)];
      const values = [componentId, type, ...Object.values(snakeSpecs).map(v => Array.isArray(v) ? `{${v.join(',')}}` : v)];
      
      const setClauses = Object.keys(snakeSpecs).map(k => sql.raw(`${k} = EXCLUDED.${k}`));
      
      const insertSql = sql`
        INSERT INTO ${sql.raw(`${type}_specs`)} (${sql.raw(columns.join(', '))})
        VALUES (${sql.join(values, sql`, `)})
        ON CONFLICT (component_id) DO UPDATE SET
          ${sql.join(setClauses, sql`, `)}
      `;
      
      await tx.execute(insertSql);
    }
  });

  return { total: items.length, inserted, updated };
}
