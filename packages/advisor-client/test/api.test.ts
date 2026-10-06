import { describe, it, expect } from 'vitest';
import { createAdvisorClient } from '../src/api.js';

describe('createAdvisorClient', () => {
  it('exito valida y devuelve value', async () => {
    const fakeFetch = async () => new Response(JSON.stringify({
      checkoutMode: 'whatsapp',
      whatsappNumber: '1234',
      initialSuggestions: ['Hola']
    }), { status: 200 });
    const client = createAdvisorClient({ baseUrl: 'http://test', storeId: '1', fetch: fakeFetch as any });
    
    const res = await client.getConfig();
    expect(res).toEqual({
      ok: true,
      value: { checkoutMode: 'whatsapp', whatsappNumber: '1234', initialSuggestions: ['Hola'] }
    });
  });

  it('cada codigo de error mapeado', async () => {
    const errors = ['invalid_request', 'store_not_found', 'conversation_limit', 'llm_unavailable', 'internal'];
    for (const err of errors) {
      const fakeFetch = async () => new Response(JSON.stringify({ error: err }), { status: 400 });
      const client = createAdvisorClient({ baseUrl: 'http://test', storeId: '1', fetch: fakeFetch as any });
      const res = await client.getConfig();
      expect(res).toEqual({ ok: false, error: err });
    }
  });

  it('codigo de error desconocido o body ilegible -> internal', async () => {
    const fakeFetch = async () => new Response(JSON.stringify({ error: 'unknown_error' }), { status: 400 });
    const client = createAdvisorClient({ baseUrl: 'http://test', storeId: '1', fetch: fakeFetch as any });
    const res = await client.getConfig();
    expect(res).toEqual({ ok: false, error: 'internal' });

    const fakeFetchBadJson = async () => new Response('bad json', { status: 400 });
    const clientBadJson = createAdvisorClient({ baseUrl: 'http://test', storeId: '1', fetch: fakeFetchBadJson as any });
    const resBadJson = await clientBadJson.getConfig();
    expect(resBadJson).toEqual({ ok: false, error: 'internal' });
  });

  it('body 2xx que no cumple el schema -> internal', async () => {
    const fakeFetch = async () => new Response(JSON.stringify({
      checkoutMode: 'invalid', // invalid enum
      whatsappNumber: '1234',
      initialSuggestions: ['Hola']
    }), { status: 200 });
    const client = createAdvisorClient({ baseUrl: 'http://test', storeId: '1', fetch: fakeFetch as any });
    const res = await client.getConfig();
    expect(res).toEqual({ ok: false, error: 'internal' });
  });

  it('fetch que lanza -> network', async () => {
    const fakeFetch = async () => { throw new Error('network error'); };
    const client = createAdvisorClient({ baseUrl: 'http://test', storeId: '1', fetch: fakeFetch as any });
    const res = await client.getConfig();
    expect(res).toEqual({ ok: false, error: 'network' });
  });

  it('sendEvent 204 -> ok', async () => {
    const fakeFetch = async () => new Response(null, { status: 204 });
    const client = createAdvisorClient({ baseUrl: 'http://test', storeId: '1', fetch: fakeFetch as any });
    const res = await client.sendEvent('123', 'cart_added', 'b1');
    expect(res).toEqual({ ok: true, value: undefined });
  });
});
