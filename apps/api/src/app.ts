import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { type DbClient } from '@pcadvisor/db';
import { type LlmClient } from './llm/types.js';
import { type Config } from './config.js';
import { createAdvisorRouter } from './routes/advisor.js';
import { createChatRouter } from './routes/chat.js';
import { createEventsRouter } from './routes/events.js';

export function createApp(deps: { db: DbClient; llm: LlmClient; config: Config; logger: (entry: Record<string, unknown>) => void }) {
  const app = new Hono();

  // Logger Middleware
  app.use('*', async (c, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    deps.logger({
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      latencyMs: ms,
    });
  });

  // CORS
  app.use('*', cors({
    origin: deps.config.ALLOWED_ORIGINS,
  }));

  // Body Limit
  app.use('*', bodyLimit({
    maxSize: 16 * 1024, // 16 KB
  }));

  // Healthcheck
  app.get('/healthz', (c) => c.text('ok', 200));

  // Routes
  app.route('/v1/stores', createAdvisorRouter({ db: deps.db }));
  app.route('/v1/chat', createChatRouter({ db: deps.db, llm: deps.llm, config: deps.config, logger: deps.logger }));
  app.route('/v1/recommendations', createEventsRouter({ db: deps.db, logger: deps.logger }));

  return app;
}
