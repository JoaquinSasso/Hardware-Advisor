import { drizzle } from 'drizzle-orm/postgres-js';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import postgres from 'postgres';
import { PGlite } from '@electric-sql/pglite';

export type DbClient = (ReturnType<typeof drizzle> | ReturnType<typeof drizzlePglite>) & {
  execRaw: (sqlText: string) => Promise<void>;
};

export function getRows(result: any): any[] {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  if (Array.isArray(result.rows)) return result.rows;
  return [];
}

export function createDb(opts: { url: string } | { pglite: true } | string): DbClient {
  if (typeof opts === 'string') {
    const client = new PGlite(opts);
    const db = drizzlePglite({ client });
    return Object.assign(db, {
      execRaw: async (sqlText: string): Promise<void> => {
        await client.exec(sqlText);
      },
    });
  } else if ('pglite' in opts && opts.pglite) {
    const client = new PGlite();
    const db = drizzlePglite({ client });
    return Object.assign(db, {
      execRaw: async (sqlText: string): Promise<void> => {
        await client.exec(sqlText);
      },
    });
  } else if ('url' in opts) {
    const client = postgres(opts.url);
    const db = drizzle(client);
    return Object.assign(db, {
      execRaw: async (sqlText: string): Promise<void> => {
        await client.unsafe(sqlText);
      },
    });
  }
  throw new Error('Invalid options for createDb');
}
