import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { getRows, type DbClient } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface MigrateOptions {
  dir?: string;
  log?: (msg: string) => void;
}

export async function migrate(db: DbClient, opts?: MigrateOptions): Promise<void> {
  const log = opts?.log ?? console.log;
  const migrationsDir = opts?.dir ?? path.join(__dirname, '..', 'migrations');

  await db.execRaw(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const files = await fs.readdir(migrationsDir);
  const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();

  for (const file of sqlFiles) {
    const filePath = path.join(migrationsDir, file);
    const content = await fs.readFile(filePath, 'utf-8');

    const result: any = await db.execute(sql`
      SELECT name FROM schema_migrations WHERE name = ${file}
    `);

    const rows = getRows(result);
    if (rows.length === 0) {
      await db.applyMigration(file, content);
      log(`Applied migration: ${file}`);
    }
  }
}
