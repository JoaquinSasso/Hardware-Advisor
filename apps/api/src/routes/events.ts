import { Hono } from 'hono';
import { z } from 'zod';
import { type DbClient, recordEvent, RecommendationNotFoundError, BuildNotInRecommendationError } from '@pcadvisor/db';
import { EventRequestSchema } from '@pcadvisor/shared';

export function createEventsRouter(deps: { db: DbClient; logger: (entry: Record<string, unknown>) => void }) {
  const router = new Hono();

  router.post('/:id/events', async (c) => {
    const id = c.req.param('id');
    if (!z.string().uuid().safeParse(id).success) {
      return c.json({ error: 'recommendation_not_found' }, 404);
    }

    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_request', issues: ['Invalid JSON body'] }, 400);
    }
    
    const bodyResult = EventRequestSchema.safeParse(body);
    if (!bodyResult.success) {
      return c.json({ error: 'invalid_request', issues: bodyResult.error.errors.map(e => e.message) }, 400);
    }

    try {
      await recordEvent(deps.db, {
        recommendationId: id,
        type: bodyResult.data.type,
        buildId: bodyResult.data.buildId,
      });
      return new Response(null, { status: 204 });
    } catch (err) {
      if (err instanceof RecommendationNotFoundError) {
        return c.json({ error: 'recommendation_not_found' }, 404);
      }
      if (err instanceof BuildNotInRecommendationError) {
        return c.json({ error: 'build_not_in_recommendation' }, 400);
      }
      deps.logger({ level: 'error', msg: 'event_failed', error: String(err) });
      return c.json({ error: 'internal' }, 500);
    }
  });

  return router;
}
