import { Hono } from 'hono';
import { type DbClient, getStoreConfig, StoreNotFoundError } from '@pcadvisor/db';
import { INITIAL_SUGGESTIONS } from '../chat/suggestions.js';
import { AdvisorConfigSchema } from '@pcadvisor/shared';

export function createAdvisorRouter(deps: { db: DbClient }) {
  const router = new Hono();

  router.get('/:tnStoreId/advisor', async (c) => {
    const storeIdStr = c.req.param('tnStoreId');
    const storeId = parseInt(storeIdStr, 10);
    if (isNaN(storeId)) {
      return c.json({ error: 'invalid_request' }, 400);
    }

    try {
      const config = await getStoreConfig(deps.db, storeId);
      if (!config) {
        return c.json({ error: 'store_not_found' }, 404);
      }
      const response = {
        checkoutMode: config.checkoutMode,
        whatsappNumber: config.whatsappNumber,
        initialSuggestions: INITIAL_SUGGESTIONS,
      };
      
      const validatedResponse = AdvisorConfigSchema.parse(response);
      
      return c.json(validatedResponse, 200);
    } catch (err) {
      if (err instanceof StoreNotFoundError) {
        return c.json({ error: 'store_not_found' }, 404);
      }
      return c.json({ error: 'internal' }, 500);
    }
  });

  return router;
}
