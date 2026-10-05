import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { getRows, type DbClient } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function migrate(db: DbClient) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const migrationsDir = path.join(__dirname, '..', 'migrations');
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
      // Split statements by semicolon that are at the end of a line or statement
      const statements = content.split(/;\s*$/m).filter(s => s.trim().length > 0);
      for (const stmt of statements) {
        await db.execute(sql.raw(stmt + ';'));
      }
      await db.execute(sql`
        INSERT INTO schema_migrations (name) VALUES (${file})
      `);
      console.log(`Applied migration: ${file}`);
    }
  }
}
