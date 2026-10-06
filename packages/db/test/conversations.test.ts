import { describe, it, expect, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { ChatTurn, Requirements, Build } from '@pcadvisor/shared';
import {
  createDb,
  getRows,
  migrate,
  getStoreConfig,
  updateStoreConfig,
  getOrCreateConversation,
  appendTurns,
  getRecentTurns,
  countUserTurns,
  saveRecommendation,
  getRecommendation,
  recordEvent,
  StoreNotFoundError,
  ConversationNotFoundError,
  RecommendationNotFoundError,
  BuildNotInRecommendationError,
} from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Conversations and Recommendations Repository (@pcadvisor/db)', () => {
  let db: ReturnType<typeof createDb>;

  beforeEach(async () => {
    db = createDb({ pglite: true });
    await migrate(db, { log: () => {} });
  });

  it('1. 0003 se aplica sobre una base con 0001 y 0002 ya aplicadas', async () => {
    const freshDb = createDb({ pglite: true });
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    await freshDb.execRaw(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const sql0001 = await fs.readFile(path.join(migrationsDir, '0001_catalog.sql'), 'utf-8');
    await freshDb.applyMigration('0001_catalog.sql', sql0001);

    const sql0002 = await fs.readFile(path.join(migrationsDir, '0002_cpu_igpu_score.sql'), 'utf-8');
    await freshDb.applyMigration('0002_cpu_igpu_score.sql', sql0002);

    // Apply remaining migrations (which includes 0003_conversations.sql)
    await migrate(freshDb, { log: () => {} });

    const tables = getRows(await freshDb.execute(sql`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `));
    const tableNames = tables.map((t: any) => t.tablename);
    expect(tableNames).toContain('conversations');
    expect(tableNames).toContain('conversation_turns');
    expect(tableNames).toContain('recommendations');
    expect(tableNames).toContain('recommendation_events');

    const migrations = getRows(await freshDb.execute(sql`
      SELECT name FROM schema_migrations WHERE name = '0003_conversations.sql'
    `));
    expect(migrations).toHaveLength(1);
  });

  it('2. getOrCreateConversation es idempotente; mismo sessionId en dos tiendas → dos conversaciones distintas; tienda inexistente → StoreNotFoundError', async () => {
    await db.execute(sql`
      INSERT INTO stores (tn_store_id, name)
      VALUES (101, 'Tienda 1'), (102, 'Tienda 2')
    `);

    const sessionId = '11111111-1111-1111-1111-111111111111';

    // First call
    const conv1 = await getOrCreateConversation(db, { tnStoreId: 101, sessionId });
    expect(conv1.id).toBeDefined();

    // Second call with same store and session returns same ID (idempotent)
    const conv1Again = await getOrCreateConversation(db, { tnStoreId: 101, sessionId });
    expect(conv1Again.id).toBe(conv1.id);

    // Same sessionId in another store returns distinct ID
    const conv2 = await getOrCreateConversation(db, { tnStoreId: 102, sessionId });
    expect(conv2.id).toBeDefined();
    expect(conv2.id).not.toBe(conv1.id);

    // Non-existent store throws StoreNotFoundError
    await expect(
      getOrCreateConversation(db, { tnStoreId: 999, sessionId })
    ).rejects.toBeInstanceOf(StoreNotFoundError);
  });

  it('3. appendTurns: seq consecutivos a través de dos llamadas; un turno inválido en el lote → no se escribe ninguno; conversación inexistente → ConversationNotFoundError', async () => {
    await db.execute(sql`INSERT INTO stores (tn_store_id, name) VALUES (201, 'Tienda 3')`);
    const { id: conversationId } = await getOrCreateConversation(db, {
      tnStoreId: 201,
      sessionId: '22222222-2222-2222-2222-222222222222',
    });

    const turn1: ChatTurn = { role: 'user', text: 'Mensaje 1' };
    const turn2: ChatTurn = {
      role: 'assistant',
      text: 'Respuesta 1',
      toolCall: null,
      providerData: null,
    };
    await appendTurns(db, conversationId, [turn1, turn2]);

    const turnsAfterFirst = getRows(await db.execute(sql`
      SELECT seq, role FROM conversation_turns WHERE conversation_id = ${conversationId} ORDER BY seq ASC
    `));
    expect(turnsAfterFirst).toHaveLength(2);
    expect(turnsAfterFirst[0].seq).toBe(1);
    expect(turnsAfterFirst[1].seq).toBe(2);

    // Second call appends with consecutive seq (seq 3)
    const turn3: ChatTurn = { role: 'user', text: 'Mensaje 2' };
    await appendTurns(db, conversationId, [turn3]);

    const turnsAfterSecond = getRows(await db.execute(sql`
      SELECT seq, role FROM conversation_turns WHERE conversation_id = ${conversationId} ORDER BY seq ASC
    `));
    expect(turnsAfterSecond).toHaveLength(3);
    expect(turnsAfterSecond[2].seq).toBe(3);

    // Invalid turn in batch: none should be written
    const validTurn: ChatTurn = { role: 'user', text: 'Mensaje 3' };
    const invalidTurn = { role: 'user', text: '' } as unknown as ChatTurn;

    await expect(
      appendTurns(db, conversationId, [validTurn, invalidTurn])
    ).rejects.toThrow();

    const turnsAfterFailed = getRows(await db.execute(sql`
      SELECT seq FROM conversation_turns WHERE conversation_id = ${conversationId}
    `));
    expect(turnsAfterFailed).toHaveLength(3); // None of the batch was written

    // Non-existent conversation throws ConversationNotFoundError
    const fakeConvId = '00000000-0000-0000-0000-000000000099';
    await expect(
      appendTurns(db, fakeConvId, [validTurn])
    ).rejects.toBeInstanceOf(ConversationNotFoundError);
  });

  it('4. Insertar a mano un turno con role \'user\' y payload role \'tool\' falla por CHECK', async () => {
    await db.execute(sql`INSERT INTO stores (tn_store_id, name) VALUES (301, 'Tienda 4')`);
    const { id: conversationId } = await getOrCreateConversation(db, {
      tnStoreId: 301,
      sessionId: '33333333-3333-3333-3333-333333333333',
    });

    await expect(
      db.execute(sql`
        INSERT INTO conversation_turns (conversation_id, seq, role, payload)
        VALUES (
          ${conversationId},
          1,
          'user',
          '{"role": "tool", "name": "recommend_builds", "result": {}}'::jsonb
        )
      `)
    ).rejects.toThrow();
  });

  it('5. getRecentTurns: devuelve los últimos N en orden; si el recorte empieza con un turno assistant con toolCall o un tool, se descartan hasta el primer user', async () => {
    await db.execute(sql`INSERT INTO stores (tn_store_id, name) VALUES (401, 'Tienda 5')`);
    const { id: conversationId } = await getOrCreateConversation(db, {
      tnStoreId: 401,
      sessionId: '44444444-4444-4444-4444-444444444444',
    });

    const turns: ChatTurn[] = [
      { role: 'user', text: 'Turno 1: hola' },
      {
        role: 'assistant',
        text: null,
        toolCall: { name: 'recommend_builds', args: {} },
        providerData: null,
      },
      {
        role: 'tool',
        name: 'recommend_builds',
        result: { ok: true },
      },
      {
        role: 'assistant',
        text: 'Turno 4: te recomiendo una build',
        toolCall: null,
        providerData: null,
      },
      { role: 'user', text: 'Turno 5: gracias' },
      {
        role: 'assistant',
        text: 'Turno 6: de nada',
        toolCall: null,
        providerData: null,
      },
    ];

    await appendTurns(db, conversationId, turns);

    // Limit 2: últimos 2 son turno 5 (user) y turno 6 (assistant). Empieza con user -> devuelve ambos.
    const recent2 = await getRecentTurns(db, conversationId, 2);
    expect(recent2).toHaveLength(2);
    expect(recent2[0]).toEqual(turns[4]);
    expect(recent2[1]).toEqual(turns[5]);

    // Limit 4: últimos 4 en seq asc son turno 3 (tool), turno 4 (assistant), turno 5 (user), turno 6 (assistant).
    // Tool y assistant iniciales se descartan hasta el primer user (turno 5).
    const recent4 = await getRecentTurns(db, conversationId, 4);
    expect(recent4).toHaveLength(2);
    expect(recent4[0]).toEqual(turns[4]);
    expect(recent4[1]).toEqual(turns[5]);

    // Limit 5: últimos 5 empiezan con turno 2 (assistant con toolCall). Se descartan turno 2, 3, 4 hasta turno 5.
    const recent5 = await getRecentTurns(db, conversationId, 5);
    expect(recent5).toHaveLength(2);
    expect(recent5[0]).toEqual(turns[4]);
    expect(recent5[1]).toEqual(turns[5]);

    // Limit 6: incluye turno 1 (user) hasta turno 6. Empieza con user -> devuelve los 6.
    const recent6 = await getRecentTurns(db, conversationId, 6);
    expect(recent6).toHaveLength(6);
    expect(recent6).toEqual(turns);

    // Si los últimos turnos no contienen ningún user (ej. limit 1 -> solo turno 6 assistant) -> devuelve []
    const recent1 = await getRecentTurns(db, conversationId, 1);
    expect(recent1).toHaveLength(0);
  });

  it('6. countUserTurns cuenta solo turnos user', async () => {
    await db.execute(sql`INSERT INTO stores (tn_store_id, name) VALUES (501, 'Tienda 6')`);
    const { id: conversationId } = await getOrCreateConversation(db, {
      tnStoreId: 501,
      sessionId: '55555555-5555-5555-5555-555555555555',
    });

    expect(await countUserTurns(db, conversationId)).toBe(0);

    const turns: ChatTurn[] = [
      { role: 'user', text: 'U1' },
      {
        role: 'assistant',
        text: 'A1',
        toolCall: null,
        providerData: null,
      },
      {
        role: 'tool',
        name: 'recommend_builds',
        result: {},
      },
      { role: 'user', text: 'U2' },
      {
        role: 'assistant',
        text: 'A2',
        toolCall: null,
        providerData: null,
      },
    ];

    await appendTurns(db, conversationId, turns);

    expect(await countUserTurns(db, conversationId)).toBe(2);
  });

  it('7. saveRecommendation + getRecommendation: ida y vuelta idéntica (toEqual), con cheapestValidTotalCents null y con valor', async () => {
    await db.execute(sql`INSERT INTO stores (tn_store_id, name) VALUES (601, 'Tienda 7')`);
    const { id: conversationId } = await getOrCreateConversation(db, {
      tnStoreId: 601,
      sessionId: '66666666-6666-6666-6666-666666666666',
    });

    const requirements: Requirements = {
      useCases: ['gaming'],
      budgetMaxCents: 150000000,
      budgetFlexible: false,
      gamingResolution: '1080p',
      gamingDemand: 'demanding',
      preferences: {
        cpuBrand: 'amd',
        gpuBrand: 'nvidia',
      },
    };

    const builds: Build[] = [
      {
        id: 'build-perf',
        tier: 'performance',
        items: [
          {
            type: 'cpu',
            componentId: 'c-cpu-1',
            tnProductId: 10,
            tnVariantId: 20,
            name: 'Ryzen 7 7700X',
            priceCents: 35000000,
            qty: 1,
          },
        ],
        totalCents: 35000000,
        warnings: ['BIOS_UPDATE_MAY_BE_REQUIRED'],
        internalNotes: [],
      },
    ];

    // Con cheapestValidTotalCents con valor
    const recIdWithVal = await saveRecommendation(db, {
      conversationId,
      requirements,
      builds,
      cheapestValidTotalCents: 120000000,
    });
    const retrievedWithVal = await getRecommendation(db, recIdWithVal);
    expect(retrievedWithVal).toEqual({
      id: recIdWithVal,
      conversationId,
      requirements,
      builds,
      cheapestValidTotalCents: 120000000,
    });

    // Con cheapestValidTotalCents null
    const recIdWithNull = await saveRecommendation(db, {
      conversationId,
      requirements,
      builds,
      cheapestValidTotalCents: null,
    });
    const retrievedWithNull = await getRecommendation(db, recIdWithNull);
    expect(retrievedWithNull).toEqual({
      id: recIdWithNull,
      conversationId,
      requirements,
      builds,
      cheapestValidTotalCents: null,
    });

    // Id inexistente devuelve null
    const fakeRec = await getRecommendation(db, '00000000-0000-0000-0000-000000000099');
    expect(fakeRec).toBeNull();
  });

  it('8. recordEvent: buildId válido inserta; buildId ajeno → BuildNotInRecommendationError; recommendation inexistente → RecommendationNotFoundError', async () => {
    await db.execute(sql`INSERT INTO stores (tn_store_id, name) VALUES (701, 'Tienda 8')`);
    const { id: conversationId } = await getOrCreateConversation(db, {
      tnStoreId: 701,
      sessionId: '77777777-7777-7777-7777-777777777777',
    });

    const recId = await saveRecommendation(db, {
      conversationId,
      requirements: {
        useCases: ['office'],
        budgetMaxCents: 50000000,
        budgetFlexible: true,
      },
      builds: [
        {
          id: 'build-office-1',
          tier: 'budget',
          items: [
            {
              type: 'cpu',
              componentId: 'c-cpu-office',
              tnProductId: 11,
              tnVariantId: 21,
              name: 'Core i3 12100',
              priceCents: 10000000,
              qty: 1,
            },
          ],
          totalCents: 10000000,
          warnings: [],
          internalNotes: [],
        },
      ],
      cheapestValidTotalCents: null,
    });

    // Build válido inserta correctamente
    await expect(
      recordEvent(db, {
        recommendationId: recId,
        type: 'cart_added',
        buildId: 'build-office-1',
      })
    ).resolves.toBeUndefined();

    const events = getRows(await db.execute(sql`
      SELECT recommendation_id, type, build_id FROM recommendation_events WHERE recommendation_id = ${recId}
    `));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('cart_added');
    expect(events[0].build_id).toBe('build-office-1');

    // Build ajeno lanza BuildNotInRecommendationError
    await expect(
      recordEvent(db, {
        recommendationId: recId,
        type: 'whatsapp_clicked',
        buildId: 'other-build-id',
      })
    ).rejects.toBeInstanceOf(BuildNotInRecommendationError);

    // Recomendación inexistente lanza RecommendationNotFoundError
    await expect(
      recordEvent(db, {
        recommendationId: '00000000-0000-0000-0000-000000000099',
        type: 'cart_added',
        buildId: 'build-office-1',
      })
    ).rejects.toBeInstanceOf(RecommendationNotFoundError);
  });

  it('9. Borrar la tienda borra en cascada conversaciones, turnos, recomendaciones y eventos', async () => {
    await db.execute(sql`INSERT INTO stores (tn_store_id, name) VALUES (801, 'Tienda 9')`);
    const storeRows = getRows(await db.execute(sql`SELECT id FROM stores WHERE tn_store_id = 801`));
    const storeId = storeRows[0].id;

    const { id: conversationId } = await getOrCreateConversation(db, {
      tnStoreId: 801,
      sessionId: '88888888-8888-8888-8888-888888888888',
    });

    await appendTurns(db, conversationId, [{ role: 'user', text: 'Hola' }]);

    const recId = await saveRecommendation(db, {
      conversationId,
      requirements: {
        useCases: ['gaming'],
        budgetMaxCents: 80000000,
        budgetFlexible: false,
      },
      builds: [
        {
          id: 'b-cascade',
          tier: 'budget',
          items: [
            {
              type: 'cpu',
              componentId: 'c-cpu-cascade',
              tnProductId: 12,
              tnVariantId: 22,
              name: 'CPU Cascade',
              priceCents: 10000000,
              qty: 1,
            },
          ],
          totalCents: 10000000,
          warnings: [],
          internalNotes: [],
        },
      ],
      cheapestValidTotalCents: null,
    });

    await recordEvent(db, {
      recommendationId: recId,
      type: 'cart_added',
      buildId: 'b-cascade',
    });

    // Delete store
    await db.execute(sql`DELETE FROM stores WHERE id = ${storeId}`);

    // Verify all cascaded
    const convs = getRows(await db.execute(sql`SELECT count(*)::int as count FROM conversations`));
    expect(convs[0].count).toBe(0);

    const turns = getRows(await db.execute(sql`SELECT count(*)::int as count FROM conversation_turns`));
    expect(turns[0].count).toBe(0);

    const recs = getRows(await db.execute(sql`SELECT count(*)::int as count FROM recommendations`));
    expect(recs[0].count).toBe(0);

    const evts = getRows(await db.execute(sql`SELECT count(*)::int as count FROM recommendation_events`));
    expect(evts[0].count).toBe(0);
  });

  it('10. getStoreConfig devuelve la configuración; tienda inexistente → null', async () => {
    await db.execute(sql`
      INSERT INTO stores (tn_store_id, name, checkout_mode, whatsapp_number)
      VALUES (901, 'Tienda 10', 'whatsapp', '+5491112345678')
    `);

    const config = await getStoreConfig(db, 901);
    expect(config).toEqual({
      checkoutMode: 'whatsapp',
      whatsappNumber: '+5491112345678',
    });

    const nonExistent = await getStoreConfig(db, 9999);
    expect(nonExistent).toBeNull();

    // Test updateStoreConfig
    const updated = await updateStoreConfig(db, {
      tnStoreId: 901,
      checkoutMode: 'cart',
      whatsappNumber: null,
    });
    expect(updated).toEqual({
      checkoutMode: 'cart',
      whatsappNumber: null,
    });

    const configAfter = await getStoreConfig(db, 901);
    expect(configAfter).toEqual({
      checkoutMode: 'cart',
      whatsappNumber: null,
    });

    await expect(
      updateStoreConfig(db, { tnStoreId: 9999, checkoutMode: 'cart' })
    ).rejects.toBeInstanceOf(StoreNotFoundError);
  });
});
