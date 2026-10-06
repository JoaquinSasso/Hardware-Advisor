import { Hono } from 'hono';
import { type DbClient, getOrCreateConversation, countUserTurns, getRecentTurns, StoreNotFoundError } from '@pcadvisor/db';
import { ChatRequestSchema, type ChatResponse, ChatResponseSchema } from '@pcadvisor/shared';
import { runChatTurn } from '../chat/orchestrator.js';
import { toPlainText } from '../chat/plain-text.js';
import { type LlmClient, LlmUnavailableError } from '../llm/types.js';
import { type Config } from '../config.js';

export function createChatRouter(deps: { db: DbClient; llm: LlmClient; config: Config; logger: (entry: Record<string, unknown>) => void }) {
  const router = new Hono();

  router.post('/', async (c) => {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_request', issues: ['Invalid JSON body'] }, 400);
    }
    
    const bodyResult = ChatRequestSchema.safeParse(body);
    if (!bodyResult.success) {
      return c.json({ error: 'invalid_request', issues: bodyResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`) }, 400);
    }
    const reqData = bodyResult.data;
    const storeIdStr = reqData.storeId;
    if (!/^\d+$/.test(storeIdStr)) {
      return c.json({ error: 'invalid_request', issues: ['storeId must be a numeric string'] }, 400);
    }
    const storeId = parseInt(storeIdStr, 10);

    try {
      const { id: conversationId } = await getOrCreateConversation(deps.db, { tnStoreId: storeId, sessionId: reqData.sessionId });
      
      const turnsCount = await countUserTurns(deps.db, conversationId);
      if (turnsCount >= deps.config.MAX_USER_MESSAGES) {
        return c.json({ error: 'conversation_limit' }, 429);
      }

      const history = await getRecentTurns(deps.db, conversationId, 30);
      
      const result = await runChatTurn({
        db: deps.db,
        llm: deps.llm,
        conversationId,
        storeId,
        history,
        userMessage: reqData.message,
      });

      const response: ChatResponse = ChatResponseSchema.parse({
        reply: toPlainText(result.reply),
        builds: result.builds && result.builds.length > 0 ? result.builds : undefined,
        recommendationId: result.recommendationId,
        suggestions: result.suggestions,
      });

      return c.json(response, 200);

    } catch (err) {
      if (err instanceof StoreNotFoundError) {
        return c.json({ error: 'store_not_found' }, 404);
      }
      if (err instanceof LlmUnavailableError) {
        deps.logger({
          level: 'warn', msg: 'llm_unavailable', cause: err.message,
          upstream: err.cause instanceof Error ? err.cause.message : String(err.cause ?? ''),
        });
        return c.json({ error: 'llm_unavailable' }, 503);
      }
      deps.logger({ level: 'error', msg: 'chat_failed', error: String(err),
                    stack: err instanceof Error ? err.stack : undefined });
      return c.json({ error: 'internal' }, 500);
    }
  });

  return router;
}
