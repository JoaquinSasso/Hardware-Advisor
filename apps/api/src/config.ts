import { z } from 'zod';

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.string().optional(),
  PGLITE_DIR: z.string().default('../../packages/db/.pglite'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  ALLOWED_ORIGINS: z.string().transform((val) => val.split(',').map(s => s.trim()).filter(Boolean)).default('*'),
  MAX_USER_MESSAGES: z.coerce.number().int().positive().default(20),
});

export const config = ConfigSchema.parse(process.env);
export type Config = z.infer<typeof ConfigSchema>;
