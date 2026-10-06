import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as dbLib from '@pcadvisor/db';
import { createApp } from '../src/app.js';
import { FakeLlmClient } from '../src/llm/fake.js';
import { setupDemoDb } from './setup.js';
import { type Config } from '../src/config.js';
import { getRecentTurns } from '@pcadvisor/db';

describe('chat.ts / advisor.ts / events.ts', () => {
  let db: Awaited<ReturnType<typeof setupDemoDb>>;
  let config: Config;

  beforeEach(async () => {
    db = await setupDemoDb();
    config = {
      PORT: 8080,
      DATABASE_URL: undefined,
      PGLITE_DIR: '',
      GEMINI_API_KEY: 'test',
      GEMINI_MODEL: 'test',
      ALLOWED_ORIGINS: ['*'],
      MAX_USER_MESSAGES: 2,
    };
  });

  it('1. advisor: config de la tienda demo; tienda inexistente 404', async () => {
    const app = createApp({ db, llm: new FakeLlmClient([]), config, logger: () => {} });
    const res = await app.request('/v1/stores/900000001/advisor');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checkoutMode).toBe('cart');

    const res404 = await app.request('/v1/stores/999/advisor');
    expect(res404.status).toBe(404);
  });

  it('2. chat solo texto', async () => {
    const fakeLlm = new FakeLlmClient([{ kind: 'text', text: 'Hola, soy el asesor' }]);
    const app = createApp({ db, llm: fakeLlm, config, logger: () => {} });

    const reqBody = { storeId: '900000001', sessionId: '00000000-0000-0000-0000-000000000000', message: 'Hola' };
    const res = await app.request('/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply).toBe('Hola, soy el asesor');
    expect(body.builds).toBeUndefined();
    expect(body.suggestions[0]).toMatch(/Quiero jugar Valorant/); // INITIAL

    // Check turns
    const convos = await db.query.conversations.findMany();
    expect(convos).toHaveLength(1);
    const turns = await getRecentTurns(db, convos[0].id, 10);
    expect(turns).toHaveLength(2);
    expect(turns[0].role).toBe('user');
    expect(turns[1].role).toBe('assistant');
  });

  it('3. chat con herramienta', async () => {
    const fakeLlm = new FakeLlmClient([
      { kind: 'tool_call', name: 'recommend_builds', args: { useCases: ['gaming'], budgetMaxArs: 1300000, budgetFlexible: false, gamingDemand: 'light' }, providerData: null },
      { kind: 'text', text: 'Aquí tenés tu recomendación' }
    ]);
    const app = createApp({ db, llm: fakeLlm, config, logger: () => {} });

    const reqBody = { storeId: '900000001', sessionId: '00000000-0000-0000-0000-000000000001', message: 'Quiero jugar lol' };
    const res = await app.request('/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply).toBe('Aquí tenés tu recomendación');
    expect(body.builds).toBeDefined();
    expect(body.builds.length).toBeGreaterThan(0);
    expect(body.recommendationId).toBeDefined();
    expect(body.suggestions[0]).toMatch(/Cuál me conviene/); // AFTER

    // Check turns
    const convos = await db.query.conversations.findMany();
    const turns = await getRecentTurns(db, convos[0].id, 10);
    expect(turns).toHaveLength(4); // user, assistant(tool_call), tool, assistant(text)

    // Check fakeLlm calls
    const toolCallHistory = fakeLlm.calls[1].history;
    const toolTurn = toolCallHistory.find(t => t.role === 'tool') as any;
    expect(toolTurn.result).not.toHaveProperty('priceCents');
    expect(toolTurn.result).not.toHaveProperty('totalCents');
    const resultStr = JSON.stringify(toolTurn.result);
    // ensure no arbitrary total amount leak
    expect(resultStr).not.toMatch(/"130000000"/); // just rough check
  });

  it('4. args inválidos', async () => {
    const fakeLlm = new FakeLlmClient([
      { kind: 'tool_call', name: 'recommend_builds', args: { useCases: ['gaming'], budgetMaxArs: -10, budgetFlexible: false }, providerData: null },
      { kind: 'text', text: 'Corregí los datos' }
    ]);
    const app = createApp({ db, llm: fakeLlm, config, logger: () => {} });

    const reqBody = { storeId: '900000001', sessionId: '00000000-0000-0000-0000-000000000002', message: 'hola' };
    await app.request('/v1/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reqBody) });

    const toolCallInput = fakeLlm.calls[1];
    const toolTurn = toolCallInput.history.find(t => t.role === 'tool') as any;
    expect(toolTurn.result.status).toBe('invalid_args');
    expect(toolTurn.result.issues.length).toBeGreaterThan(0);
  });

  it('5. presupuesto insuficiente', async () => {
    const fakeLlm = new FakeLlmClient([
      { kind: 'tool_call', name: 'recommend_builds', args: { useCases: ['gaming'], budgetMaxArs: 10, budgetFlexible: false }, providerData: null },
      { kind: 'text', text: 'Presupuesto insuficiente' }
    ]);
    const app = createApp({ db, llm: fakeLlm, config, logger: () => {} });

    const reqBody = { storeId: '900000001', sessionId: '00000000-0000-0000-0000-000000000003', message: 'hola' };
    const res = await app.request('/v1/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reqBody) });

    const body = await res.json();
    expect(body.builds).toBeUndefined();

    const toolCallInput = fakeLlm.calls[1];
    const toolTurn = toolCallInput.history.find(t => t.role === 'tool') as any;
    expect(toolTurn.result.status).toBe('no_builds_in_budget');
    expect(toolTurn.result.minimumBudgetLabel).toMatch(/^\$ /);
  });

  it('6. tercera llamada a la herramienta', async () => {
    const fakeLlm = new FakeLlmClient([
      { kind: 'tool_call', name: 'recommend_builds', args: { useCases: ['gaming'], budgetMaxArs: 1000000, budgetFlexible: false }, providerData: null },
      { kind: 'tool_call', name: 'recommend_builds', args: { useCases: ['gaming'], budgetMaxArs: 1000000, budgetFlexible: false }, providerData: null },
      { kind: 'tool_call', name: 'recommend_builds', args: { useCases: ['gaming'], budgetMaxArs: 1000000, budgetFlexible: false }, providerData: null },
    ]);
    const app = createApp({ db, llm: fakeLlm, config, logger: () => {} });

    const reqBody = { storeId: '900000001', sessionId: '00000000-0000-0000-0000-000000000004', message: 'hola' };
    const res = await app.request('/v1/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reqBody) });

    const body = await res.json();
    expect(body.reply).toBe("Perdón, no pude completar la recomendación. ¿Podés contarme de nuevo qué necesitás o escribirnos por WhatsApp?");
    expect(fakeLlm.calls.length).toBe(3); // Called 3 times, 3rd time returns tool_call -> break.
  });

  it('7. historial: en el segundo mensaje, el fake recibe turnos', async () => {
    config.MAX_USER_MESSAGES = 10;
    const fakeLlm = new FakeLlmClient([
      { kind: 'text', text: 'Respuesta 1' },
      { kind: 'text', text: 'Respuesta 2' }
    ]);
    const app = createApp({ db, llm: fakeLlm, config, logger: () => {} });

    const sessionId = '00000000-0000-0000-0000-000000000005';
    await app.request('/v1/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId: '900000001', sessionId, message: 'm1' }) });
    await app.request('/v1/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId: '900000001', sessionId, message: 'm2' }) });

    const secondCall = fakeLlm.calls[1];
    expect(secondCall.history[0].role).toBe('user');
    expect((secondCall.history[0] as any).text).toBe('m1');
    expect(secondCall.history[1].role).toBe('assistant');
  });

  it('8. LLM caído: 503 y no se persistió', async () => {
    config.MAX_USER_MESSAGES = 10;
    const fakeLlm = new FakeLlmClient([], 0); // throw on 1st call
    const app = createApp({ db, llm: fakeLlm, config, logger: () => {} });

    const sessionId = '00000000-0000-0000-0000-000000000006';
    const res = await app.request('/v1/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId: '900000001', sessionId, message: 'hola' }) });
    expect(res.status).toBe(503);

    const convos = await db.query.conversations.findMany({ where: (c, { eq }) => eq(c.sessionId, sessionId) });
    if (convos.length > 0) {
      const turns = await getRecentTurns(db, convos[0].id, 10);
      expect(turns).toHaveLength(0);
    }
  });

  it('9. límite MAX_USER_MESSAGES = 2', async () => {
    config.MAX_USER_MESSAGES = 2;
    const fakeLlm = new FakeLlmClient([
      { kind: 'text', text: 'R1' },
      { kind: 'text', text: 'R2' },
      { kind: 'text', text: 'R3' }
    ]);
    const app = createApp({ db, llm: fakeLlm, config, logger: () => {} });
    const sessionId = '00000000-0000-0000-0000-000000000007';

    await app.request('/v1/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId: '900000001', sessionId, message: 'm1' }) });
    await app.request('/v1/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId: '900000001', sessionId, message: 'm2' }) });
    
    const res3 = await app.request('/v1/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId: '900000001', sessionId, message: 'm3' }) });
    expect(res3.status).toBe(429);
  });

  it('10. validación body inválido y store inexistente', async () => {
    const fakeLlm = new FakeLlmClient([]);
    const app = createApp({ db, llm: fakeLlm, config, logger: () => {} });

    const resBody = await app.request('/v1/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"bad":"json' });
    expect(resBody.status).toBe(400);

    const resStore = await app.request('/v1/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId: '999', sessionId: '00000000-0000-0000-0000-000000000009', message: 'm' }) });
    expect(resStore.status).toBe(404);
  });

  it('11. events', async () => {
    const fakeLlm = new FakeLlmClient([
      { kind: 'tool_call', name: 'recommend_builds', args: { useCases: ['gaming'], budgetMaxArs: 1300000, budgetFlexible: false, gamingDemand: 'light' }, providerData: null },
      { kind: 'text', text: 'Aquí tenés tu recomendación' }
    ]);
    const app = createApp({ db, llm: fakeLlm, config, logger: () => {} });
    
    // Create recommendation
    const chatRes = await app.request('/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: '900000001', sessionId: '00000000-0000-0000-0000-000000000008', message: 'hola' }),
    });
    const { recommendationId, builds } = await chatRes.json();
    const buildId = builds[0].id; // the tier name is the buildId since it's just a generated build string like 'basic'

    // valid
    const evRes1 = await app.request(`/v1/recommendations/${recommendationId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'cart_added', buildId }),
    });
    expect(evRes1.status).toBe(204);

    // invalid buildId
    const evRes2 = await app.request(`/v1/recommendations/${recommendationId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'cart_added', buildId: 'fake' }),
    });
    expect(evRes2.status).toBe(400);

    // invalid id
    const evRes3 = await app.request(`/v1/recommendations/00000000-0000-0000-0000-000000000000/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'cart_added', buildId }),
    });
    expect(evRes3.status).toBe(404);
  });

  it('getCatalog se llama una sola vez por llamada a la herramienta', async () => {
    const fakeLlm = new FakeLlmClient([
      { kind: 'tool_call', name: 'recommend_builds', args: { useCases: ['gaming'], budgetMaxArs: 1300000, budgetFlexible: false, gamingDemand: 'light' }, providerData: null },
      { kind: 'text', text: 'Ok, acá va.' }
    ]);
    const app = createApp({ db, llm: fakeLlm, config, logger: () => {} });

    const getCatalogSpy = vi.spyOn(dbLib, 'getCatalog');

    const reqBody = { storeId: '900000001', sessionId: '00000000-0000-0000-0000-000000000012', message: 'hola' };
    const res = await app.request('/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    expect(res.status).toBe(200);
    expect(getCatalogSpy).toHaveBeenCalledTimes(1);
    
    getCatalogSpy.mockRestore();
  });

  it('storeId "12abc" -> 400', async () => {
    const fakeLlm = new FakeLlmClient([]);
    const app = createApp({ db, llm: fakeLlm, config, logger: () => {} });

    const reqBody = { storeId: '12abc', sessionId: '00000000-0000-0000-0000-000000000013', message: 'hola' };
    const res = await app.request('/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_request');
  });
});
