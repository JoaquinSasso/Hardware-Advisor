import { sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  ChatTurnSchema,
  type ChatTurn,
  RequirementsSchema,
  type Requirements,
  BuildSchema,
  type Build,
} from '@pcadvisor/shared';
import { getRows, type DbClient } from './client.js';

export class StoreNotFoundError extends Error {
  constructor(message = 'Store not found') {
    super(message);
    this.name = 'StoreNotFoundError';
  }
}

export class ConversationNotFoundError extends Error {
  constructor(message = 'Conversation not found') {
    super(message);
    this.name = 'ConversationNotFoundError';
  }
}

export class RecommendationNotFoundError extends Error {
  constructor(message = 'Recommendation not found') {
    super(message);
    this.name = 'RecommendationNotFoundError';
  }
}

export class BuildNotInRecommendationError extends Error {
  constructor(message = 'Build not in recommendation') {
    super(message);
    this.name = 'BuildNotInRecommendationError';
  }
}

export async function getStoreConfig(
  db: DbClient,
  tnStoreId: number
): Promise<{ checkoutMode: 'cart' | 'whatsapp'; whatsappNumber: string | null } | null> {
  const rows = getRows(await db.execute(sql`
    SELECT checkout_mode, whatsapp_number
    FROM stores
    WHERE tn_store_id = ${tnStoreId}
  `));

  if (rows.length === 0) {
    return null;
  }

  return {
    checkoutMode: rows[0].checkout_mode,
    whatsappNumber: rows[0].whatsapp_number ?? null,
  };
}

export async function updateStoreConfig(
  db: DbClient,
  p: {
    tnStoreId: number;
    checkoutMode: 'cart' | 'whatsapp';
    whatsappNumber?: string | null;
  }
): Promise<{ checkoutMode: 'cart' | 'whatsapp'; whatsappNumber: string | null }> {
  const whatsappNumber = p.whatsappNumber ?? null;
  const rows = getRows(await db.execute(sql`
    UPDATE stores
    SET checkout_mode = ${p.checkoutMode}, whatsapp_number = ${whatsappNumber}
    WHERE tn_store_id = ${p.tnStoreId}
    RETURNING checkout_mode, whatsapp_number
  `));

  if (rows.length === 0) {
    throw new StoreNotFoundError(`Store ${p.tnStoreId} not found`);
  }

  return {
    checkoutMode: rows[0].checkout_mode,
    whatsappNumber: rows[0].whatsapp_number ?? null,
  };
}

export async function getOrCreateConversation(
  db: DbClient,
  p: { tnStoreId: number; sessionId: string }
): Promise<{ id: string }> {
  const storeRows = getRows(await db.execute(sql`
    SELECT id FROM stores WHERE tn_store_id = ${p.tnStoreId}
  `));

  if (storeRows.length === 0) {
    throw new StoreNotFoundError(`Store ${p.tnStoreId} not found`);
  }

  const storeId = storeRows[0].id;

  await db.execute(sql`
    INSERT INTO conversations (store_id, session_id)
    VALUES (${storeId}, ${p.sessionId})
    ON CONFLICT (store_id, session_id) DO NOTHING
  `);

  const convRows = getRows(await db.execute(sql`
    SELECT id FROM conversations
    WHERE store_id = ${storeId} AND session_id = ${p.sessionId}
  `));

  return { id: convRows[0].id };
}

export async function appendTurns(
  db: DbClient,
  conversationId: string,
  turns: ChatTurn[]
): Promise<void> {
  // Valida cada turno con ChatTurnSchema ANTES de escribir (si uno falla, no se escribe ninguno).
  for (const turn of turns) {
    ChatTurnSchema.parse(turn);
  }

  // En UNA transacción: SELECT ... FROM conversations WHERE id = $1 FOR UPDATE
  // (ConversationNotFoundError si no existe); seq siguiente = max(seq) + 1 (o 1);
  // insertar en orden; actualizar last_message_at = now().
  await db.transaction(async (tx) => {
    const convRes = getRows(await tx.execute(sql`
      SELECT id FROM conversations WHERE id = ${conversationId} FOR UPDATE
    `));

    if (convRes.length === 0) {
      throw new ConversationNotFoundError(`Conversation ${conversationId} not found`);
    }

    if (turns.length === 0) {
      return;
    }

    const maxSeqRes = getRows(await tx.execute(sql`
      SELECT COALESCE(MAX(seq), 0) AS max_seq
      FROM conversation_turns
      WHERE conversation_id = ${conversationId}
    `));

    let nextSeq = Number(maxSeqRes[0].max_seq) + 1;

    for (const turn of turns) {
      await tx.execute(sql`
        INSERT INTO conversation_turns (conversation_id, seq, role, payload)
        VALUES (${conversationId}, ${nextSeq}, ${turn.role}, ${JSON.stringify(turn)}::jsonb)
      `);
      nextSeq++;
    }

    await tx.execute(sql`
      UPDATE conversations
      SET last_message_at = now()
      WHERE id = ${conversationId}
    `);
  });
}

export async function getRecentTurns(
  db: DbClient,
  conversationId: string,
  limit: number
): Promise<ChatTurn[]> {
  const rows = getRows(await db.execute(sql`
    SELECT payload FROM (
      SELECT seq, payload
      FROM conversation_turns
      WHERE conversation_id = ${conversationId}
      ORDER BY seq DESC
      LIMIT ${limit}
    ) sub
    ORDER BY seq ASC
  `));

  const turns: ChatTurn[] = rows.map((row) => {
    const raw = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
    return ChatTurnSchema.parse(raw);
  });

  const firstUserIndex = turns.findIndex((t) => t.role === 'user');
  if (firstUserIndex === -1) {
    return [];
  }
  return turns.slice(firstUserIndex);
}

export async function countUserTurns(
  db: DbClient,
  conversationId: string
): Promise<number> {
  const rows = getRows(await db.execute(sql`
    SELECT count(*)::int AS count
    FROM conversation_turns
    WHERE conversation_id = ${conversationId} AND role = 'user'
  `));

  return Number(rows[0]?.count ?? 0);
}

export async function saveRecommendation(
  db: DbClient,
  p: {
    conversationId: string;
    requirements: Requirements;
    builds: Build[];
    cheapestValidTotalCents: number | null;
  }
): Promise<string> {
  const validatedRequirements = RequirementsSchema.parse(p.requirements);
  const validatedBuilds = p.builds.map((b) => BuildSchema.parse(b));

  const rows = getRows(await db.execute(sql`
    INSERT INTO recommendations (conversation_id, requirements, builds, cheapest_valid_total_cents)
    VALUES (
      ${p.conversationId},
      ${JSON.stringify(validatedRequirements)}::jsonb,
      ${JSON.stringify(validatedBuilds)}::jsonb,
      ${p.cheapestValidTotalCents}
    )
    RETURNING id
  `));

  return rows[0].id;
}

export async function getRecommendation(
  db: DbClient,
  id: string
): Promise<{
  id: string;
  conversationId: string;
  requirements: Requirements;
  builds: Build[];
  cheapestValidTotalCents: number | null;
} | null> {
  const rows = getRows(await db.execute(sql`
    SELECT id, conversation_id, requirements, builds, cheapest_valid_total_cents
    FROM recommendations
    WHERE id = ${id}
  `));

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  const rawReq = typeof row.requirements === 'string' ? JSON.parse(row.requirements) : row.requirements;
  const rawBuilds = typeof row.builds === 'string' ? JSON.parse(row.builds) : row.builds;

  const requirements = RequirementsSchema.parse(rawReq);
  const builds = z.array(BuildSchema).parse(rawBuilds);
  const cheapestValidTotalCents =
    row.cheapest_valid_total_cents !== null && row.cheapest_valid_total_cents !== undefined
      ? Number(row.cheapest_valid_total_cents)
      : null;

  return {
    id: row.id,
    conversationId: row.conversation_id,
    requirements,
    builds,
    cheapestValidTotalCents,
  };
}

export async function recordEvent(
  db: DbClient,
  p: {
    recommendationId: string;
    type: 'cart_added' | 'whatsapp_clicked';
    buildId: string;
  }
): Promise<void> {
  const rows = getRows(await db.execute(sql`
    SELECT builds
    FROM recommendations
    WHERE id = ${p.recommendationId}
  `));

  if (rows.length === 0) {
    throw new RecommendationNotFoundError(`Recommendation ${p.recommendationId} not found`);
  }

  const rawBuilds = typeof rows[0].builds === 'string' ? JSON.parse(rows[0].builds) : rows[0].builds;
  const builds = z.array(BuildSchema).parse(rawBuilds);
  const buildExists = builds.some((b) => b.id === p.buildId);

  if (!buildExists) {
    throw new BuildNotInRecommendationError(
      `Build ${p.buildId} not found in recommendation ${p.recommendationId}`
    );
  }

  await db.execute(sql`
    INSERT INTO recommendation_events (recommendation_id, type, build_id)
    VALUES (${p.recommendationId}, ${p.type}, ${p.buildId})
  `);
}
