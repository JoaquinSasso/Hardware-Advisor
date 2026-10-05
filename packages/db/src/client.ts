import { drizzle } from 'drizzle-orm/postgres-js';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import postgres from 'postgres';
import { PGlite } from '@electric-sql/pglite';
import * as schema from './schema.js';

export type DbClient = (ReturnType<typeof drizzle> | ReturnType<typeof drizzlePglite>) & {
  execRaw: (sqlText: string) => Promise<void>;
  applyMigration: (name: string, sqlText: string) => Promise<void>;
};

export function getRows<T = any>(result: any): T[] {
  return Array.isArray(result) ? result : result.rows || [];
}

export function createDb(opts: { url: string } | { pglite: true; dataDir?: string }): DbClient {
  if ('pglite' in opts && opts.pglite) {
    const client = new PGlite(opts.dataDir);
    const db = drizzlePglite(client, { schema });
    return Object.assign(db, {
      execRaw: async (sqlText: string): Promise<void> => {
        await client.exec(sqlText);
      },
      applyMigration: async (name: string, sqlText: string): Promise<void> => {
        await client.transaction(async (tx) => {
          await tx.exec(sqlText);
          await tx.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        });
      },
    });
  } else if ('url' in opts) {
    const client = postgres(opts.url);
    const db = drizzle(client, { schema });
    return Object.assign(db, {
      execRaw: async (sqlText: string): Promise<void> => {
        await client.unsafe(sqlText);
      },
      applyMigration: async (name: string, sqlText: string): Promise<void> => {
        await client.begin(async (tx) => {
          await tx.unsafe(sqlText);
          await tx`INSERT INTO schema_migrations (name) VALUES (${name})`;
        });
      },
    });
  }
  throw new Error('Invalid options for createDb');
}
