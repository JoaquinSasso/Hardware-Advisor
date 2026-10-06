import { AdvisorConfigSchema, ChatResponseSchema, type AdvisorConfig, type ChatResponse } from '@pcadvisor/shared';

export type ClientError = 'invalid_request' | 'store_not_found' | 'conversation_limit' | 'llm_unavailable' | 'internal' | 'network';

export type Result<T> = { ok: true; value: T } | { ok: false; error: ClientError };

export function createAdvisorClient(opts: {
  baseUrl: string;
  storeId: string;
  fetch?: typeof fetch;
}): {
  getConfig(): Promise<Result<AdvisorConfig>>;
  sendMessage(sessionId: string, message: string): Promise<Result<ChatResponse>>;
  sendEvent(recommendationId: string, type: 'cart_added' | 'whatsapp_clicked', buildId: string): Promise<Result<void>>;
} {
  const doFetch = opts.fetch || fetch;
  const { baseUrl, storeId } = opts;

  async function handleResponse<T>(res: Response, schema?: { parse: (d: any) => T }): Promise<Result<T>> {
    if (res.ok) {
      if (res.status === 204) {
        return { ok: true, value: undefined as any };
      }
      try {
        const data = await res.json();
        if (schema) {
          const parsed = schema.parse(data);
          return { ok: true, value: parsed };
        }
        return { ok: true, value: data };
      } catch (e) {
        return { ok: false, error: 'internal' };
      }
    }

    try {
      const data = await res.json();
      if (typeof data.error === 'string') {
        const err = data.error as string;
        if (['invalid_request', 'store_not_found', 'conversation_limit', 'llm_unavailable', 'internal'].includes(err)) {
          return { ok: false, error: err as ClientError };
        }
      }
      return { ok: false, error: 'internal' };
    } catch (e) {
      return { ok: false, error: 'internal' };
    }
  }

  return {
    async getConfig(): Promise<Result<AdvisorConfig>> {
      try {
        const res = await doFetch(`${baseUrl}/v1/stores/${storeId}/advisor`);
        return await handleResponse(res, AdvisorConfigSchema);
      } catch (e) {
        return { ok: false, error: 'network' };
      }
    },

    async sendMessage(sessionId: string, message: string): Promise<Result<ChatResponse>> {
      try {
        const res = await doFetch(`${baseUrl}/v1/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ storeId, sessionId, message }),
        });
        return await handleResponse(res, ChatResponseSchema);
      } catch (e) {
        return { ok: false, error: 'network' };
      }
    },

    async sendEvent(recommendationId: string, type: 'cart_added' | 'whatsapp_clicked', buildId: string): Promise<Result<void>> {
      try {
        const res = await doFetch(`${baseUrl}/v1/recommendations/${recommendationId}/events`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Store-ID': storeId,
          },
          body: JSON.stringify({ type, buildId }),
        });
        return await handleResponse(res);
      } catch (e) {
        return { ok: false, error: 'network' };
      }
    }
  };
}
