import { serve } from '@hono/node-server';
import { createDb } from '@pcadvisor/db';
import { config, dbOptions } from './config.js';
import { createApp } from './app.js';
import { GeminiClient } from './llm/gemini.js';

async function main() {
  const logger = (entry: Record<string, unknown>) => console.log(JSON.stringify(entry));

  if (!config.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is required in server.ts');
  }
  if (!config.GEMINI_MODEL) {
    throw new Error('GEMINI_MODEL is required in server.ts');
  }

  const opts = dbOptions(config);
  const db = createDb(opts);

  if ('url' in opts) {
    const parsed = new URL(opts.url);
    logger({ level: 'info', msg: 'Database configured', host: parsed.host });
  } else {
    logger({ level: 'info', msg: 'Database configured', path: opts.dataDir });
  }

  const llm = new GeminiClient(config.GEMINI_API_KEY, config.GEMINI_MODEL, config.GEMINI_FALLBACK_MODEL, logger);

  const app = createApp({ db, llm, config, logger });

  logger({ level: 'info', msg: 'Server starting', port: config.PORT });
  serve({
    fetch: app.fetch,
    port: config.PORT,
  });
}

main().catch((err) => {
  const logger = (entry: Record<string, unknown>) => console.log(JSON.stringify(entry));
  logger({ level: 'fatal', msg: 'Failed to start server', error: String(err) });
  process.exit(1);
});
