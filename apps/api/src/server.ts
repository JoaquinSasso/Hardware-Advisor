import { serve } from '@hono/node-server';
import { createDb } from '@pcadvisor/db';
import { config } from './config.js';
import { createApp } from './app.js';
import { GeminiClient } from './llm/gemini.js';

async function main() {
  if (!config.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is required in server.ts');
  }
  if (!config.GEMINI_MODEL) {
    throw new Error('GEMINI_MODEL is required in server.ts');
  }

  const dbOpts = config.DATABASE_URL
    ? { url: config.DATABASE_URL }
    : { pglite: true, dataDir: config.PGLITE_DIR };
  const db = createDb(dbOpts as any);

  const llm = new GeminiClient(config.GEMINI_API_KEY, config.GEMINI_MODEL);

  const app = createApp({ db, llm, config });

  console.log(`Server starting on port ${config.PORT}...`);
  serve({
    fetch: app.fetch,
    port: config.PORT,
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
