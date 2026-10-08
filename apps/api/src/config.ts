import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';

const preprocessEnv = (env: NodeJS.ProcessEnv) => {
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      const trimmed = value.trim();
      if (trimmed === '') {
        result[key] = undefined;
      } else {
        result[key] = trimmed;
      }
    }
  }
  return result;
};

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.string().optional(),
  PGLITE_DIR: z.string().default('../../packages/db/.pglite'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  GEMINI_FALLBACK_MODEL: z.string().optional(),
  ALLOWED_ORIGINS: z.string().transform((val) => val.split(',').map(s => s.trim()).filter(Boolean)).default('*'),
  MAX_USER_MESSAGES: z.coerce.number().int().positive().default(20),
});

export const config = ConfigSchema.parse(preprocessEnv(process.env));
export type Config = z.infer<typeof ConfigSchema>;

export function dbOptions(cfg: Config): { url: string } | { pglite: true; dataDir: string } {
  if (cfg.DATABASE_URL) {
    return { url: cfg.DATABASE_URL };
  }
  const dataDir = path.resolve(cfg.PGLITE_DIR);
  if (!fs.existsSync(dataDir)) {
    throw new Error(`No existe la base PGlite en ${dataDir}`);
  }
  return { pglite: true, dataDir };
}
