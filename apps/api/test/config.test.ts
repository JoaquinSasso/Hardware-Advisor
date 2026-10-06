import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { dbOptions } from '../src/config.js';

vi.mock('node:fs');

describe('config.ts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('DATABASE_URL="" -> usa PGlite', () => {
    // Si config tiene DATABASE_URL = undefined (como preprocesado de string vacio), y un PGLITE_DIR valido
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const opts = dbOptions({ DATABASE_URL: undefined, PGLITE_DIR: './some/path' } as any);
    expect(opts).toEqual({ pglite: true, dataDir: path.resolve('./some/path') });
  });

  it('PGLITE_DIR inexistente -> Error con la ruta', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    expect(() => dbOptions({ DATABASE_URL: undefined, PGLITE_DIR: './bad/path' } as any)).toThrow('No existe la base PGlite en');
  });

  it('con DATABASE_URL -> { url }', () => {
    const opts = dbOptions({ DATABASE_URL: 'postgres://localhost/db' } as any);
    expect(opts).toEqual({ url: 'postgres://localhost/db' });
  });
});
