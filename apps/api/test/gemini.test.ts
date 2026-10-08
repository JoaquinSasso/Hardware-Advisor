import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toGeminiContents, fromGeminiResponse, GeminiClient } from '../src/llm/gemini.js';
import { LlmUnavailableError } from '../src/llm/types.js';
import { type ChatTurn } from '@pcadvisor/shared';

describe('gemini.ts', () => {
  it('texto simple', () => {
    const textResp = fromGeminiResponse({
      candidates: [{ content: { parts: [{ text: 'respuesta' }] } }]
    } as any);
    expect(textResp).toEqual({ kind: 'text', text: 'respuesta' });
  });

  it('texto en varias partes se concatena', () => {
    const textResp = fromGeminiResponse({
      candidates: [{ content: { parts: [{ text: 'hola ' }, { text: 'mundo' }] } }]
    } as any);
    expect(textResp).toEqual({ kind: 'text', text: 'hola mundo' });
  });

  it('parte thought se ignora', () => {
    const textResp = fromGeminiResponse({
      candidates: [{ content: { parts: [{ text: 'thinking...', thought: true }, { text: 'hola' }] } }]
    } as any);
    expect(textResp).toEqual({ kind: 'text', text: 'hola' });
  });

  it('functionCall con firma -> providerData con las partes', () => {
    const parts = [{ functionCall: { name: 'recommend_builds', args: { b: 1 } } }, { signature: 'sig' }];
    const fnResp = fromGeminiResponse({
      candidates: [{ content: { parts } }]
    } as any);
    expect(fnResp.kind).toBe('tool_call');
    if (fnResp.kind === 'tool_call') {
      expect(fnResp.args).toEqual({ b: 1 });
      expect(fnResp.providerData).toEqual({ parts });
    }
  });

  it('functionCall sin args -> {}', () => {
    const fnResp = fromGeminiResponse({
      candidates: [{ content: { parts: [{ functionCall: { name: 'recommend_builds' } }] } }]
    } as any);
    expect(fnResp.kind).toBe('tool_call');
    if (fnResp.kind === 'tool_call') {
      expect(fnResp.args).toEqual({});
    }
  });

  it('respuesta vacía -> LlmUnavailableError', () => {
    expect(() => fromGeminiResponse({
      candidates: [{ content: { parts: [{ text: '   ' }] } }]
    } as any)).toThrow('empty response');
  });

  it('turno assistant con providerData se reenvía con las partes originales', () => {
    const history: ChatTurn[] = [
      { 
        role: 'assistant', 
        text: null, 
        toolCall: { name: 'recommend_builds', args: {} },
        providerData: { parts: [{ functionCall: { name: 'recommend_builds', args: {} } }, { thoughtSignature: 'sig' }] }
      },
    ];
    const contents = toGeminiContents(history);
    expect(contents[0].parts).toEqual([{ functionCall: { name: 'recommend_builds', args: {} } }, { thoughtSignature: 'sig' }]);
  });

  it('turno tool -> functionResponse', () => {
    const history: ChatTurn[] = [
      { role: 'tool', name: 'recommend_builds', result: { ok: true } },
    ];
    const contents = toGeminiContents(history);
    expect(contents[0]).toEqual({
      role: 'user',
      parts: [{ functionResponse: { name: 'recommend_builds', response: { ok: true } } }]
    });
  });

  describe('GeminiClient retries and fallback', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    const createInput = () => ({ system: 's', history: [], tools: [] });

    it('Timeout del principal -> respaldo', async () => {
      const inicio = Date.now();
      const calledModels: string[] = [];
      const callTimes: number[] = [];

      const callModel = vi.fn().mockImplementation((params) => {
        calledModels.push(params.model);
        callTimes.push(Date.now() - inicio);
        if (params.model === 'main-model') {
          return new Promise((_, reject) => {
            params.config.abortSignal.addEventListener('abort', () => {
              reject(Object.assign(new Error('request failed'), { name: 'ApiError' }));
            });
          });
        }
        return Promise.resolve({ candidates: [{ content: { parts: [{ text: 'fallback-ok' }] } }] });
      });

      const client = new GeminiClient('key', 'main-model', 'fallback-model', undefined, callModel);

      const p = client.generate(createInput());
      await vi.runAllTimersAsync();
      const res = await p;

      expect(res).toEqual({ kind: 'text', text: 'fallback-ok' });
      expect(calledModels).toEqual(['main-model', 'fallback-model']);
      expect(callTimes[1]).toBe(10000);
    });

    it('503 rápido (500 ms) -> reintento del principal -> ok', async () => {
      const callModel = vi.fn().mockImplementation(() => {
        if (callModel.mock.calls.length === 1) {
          return new Promise((_, reject) => {
            setTimeout(() => reject({ status: 503 }), 500);
          });
        }
        return Promise.resolve({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
      });

      const logs: any[] = [];
      const client = new GeminiClient('key', 'main-model', undefined, (entry) => logs.push(entry), callModel);

      const p = client.generate(createInput());
      await vi.runAllTimersAsync();
      const res = await p;

      expect(res).toEqual({ kind: 'text', text: 'ok' });
      expect(callModel).toHaveBeenCalledTimes(2);
      expect(callModel.mock.calls[0][0].model).toBe('main-model');
      expect(callModel.mock.calls[1][0].model).toBe('main-model');
    });

    it('503 rápido, 503 rápido -> respaldo ok', async () => {
      const callModel = vi.fn().mockImplementation((args) => {
        if (args.model === 'main-model') {
          return new Promise((_, reject) => {
            setTimeout(() => reject({ status: 503 }), 500);
          });
        }
        return Promise.resolve({ candidates: [{ content: { parts: [{ text: 'fallback-ok' }] } }] });
      });

      const logs: any[] = [];
      const client = new GeminiClient('key', 'main-model', 'fallback-model', (entry) => logs.push(entry), callModel);

      const p = client.generate(createInput());
      await vi.runAllTimersAsync();
      const res = await p;

      expect(res).toEqual({ kind: 'text', text: 'fallback-ok' });
      expect(callModel).toHaveBeenCalledTimes(3);
      expect(callModel.mock.calls[2][0].model).toBe('fallback-model');
    });

    it('503 lento (6 s) -> respaldo directo', async () => {
      const callModel = vi.fn().mockImplementation((args) => {
        if (args.model === 'main-model') {
          return new Promise((_, reject) => {
            setTimeout(() => reject({ status: 503 }), 6000);
          });
        }
        return Promise.resolve({ candidates: [{ content: { parts: [{ text: 'fallback-ok' }] } }] });
      });

      const logs: any[] = [];
      const client = new GeminiClient('key', 'main-model', 'fallback-model', (entry) => logs.push(entry), callModel);

      const p = client.generate(createInput());
      await vi.runAllTimersAsync();
      const res = await p;

      expect(res).toEqual({ kind: 'text', text: 'fallback-ok' });
      expect(callModel).toHaveBeenCalledTimes(2);
      expect(callModel.mock.calls[0][0].model).toBe('main-model');
      expect(callModel.mock.calls[1][0].model).toBe('fallback-model');
    });

    it('503 rápido y el reintento del principal se corta por timeout -> aún queda tiempo y se intenta el respaldo', async () => {
      const callModel = vi.fn().mockImplementation((args) => {
        if (callModel.mock.calls.length === 1) {
          return new Promise((_, reject) => {
            setTimeout(() => reject({ status: 503 }), 500);
          });
        }
        if (callModel.mock.calls.length === 2) {
          return new Promise((_, reject) => {
            args.config.abortSignal.addEventListener('abort', () => {
              reject(Object.assign(new Error('request failed'), { name: 'ApiError' }));
            });
          });
        }
        return Promise.resolve({ candidates: [{ content: { parts: [{ text: 'fallback-ok' }] } }] });
      });

      const logs: any[] = [];
      const client = new GeminiClient('key', 'main-model', 'fallback-model', (entry) => logs.push(entry), callModel);

      const p = client.generate(createInput());
      await vi.runAllTimersAsync();
      const res = await p;

      expect(res).toEqual({ kind: 'text', text: 'fallback-ok' });
      expect(callModel).toHaveBeenCalledTimes(3);
      expect(callModel.mock.calls[2][0].model).toBe('fallback-model');
    });

    it('Sin respaldo configurado: timeout del principal -> LlmUnavailableError tras 1 intento', async () => {
      const callModel = vi.fn().mockImplementation((args) => {
        return new Promise((_, reject) => {
          args.config.abortSignal.addEventListener('abort', () => {
            reject(Object.assign(new Error('request failed'), { name: 'ApiError' }));
          });
        });
      });

      const logs: any[] = [];
      const client = new GeminiClient('key', 'main-model', undefined, (entry) => logs.push(entry), callModel);

      const p = expect(client.generate(createInput())).rejects.toThrow(LlmUnavailableError);
      await vi.runAllTimersAsync();
      await p;

      expect(callModel).toHaveBeenCalledTimes(1);
    });

    it('400 -> fatal, 1 intento', async () => {
      const error400 = { status: 400 };
      const callModel = vi.fn().mockRejectedValueOnce(error400);

      const logs: any[] = [];
      const client = new GeminiClient('key', 'main-model', 'fallback-model', (entry) => logs.push(entry), callModel);

      const p = expect(client.generate(createInput())).rejects.toEqual(error400);
      await vi.runAllTimersAsync();
      await p;

      expect(callModel).toHaveBeenCalledTimes(1);
    });

    it('Nunca se supera TOTAL_BUDGET_MS (peor caso)', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.999);
      const inicio = Date.now();
      const calledModels: string[] = [];
      const callTimes: number[] = [];

      const callModel = vi.fn().mockImplementation((params) => {
        calledModels.push(params.model);
        callTimes.push(Date.now() - inicio);

        if (calledModels.length === 1) {
          return new Promise((_, reject) => {
            setTimeout(() => reject({ status: 503 }), 4999);
          });
        }

        return new Promise((_, reject) => {
          params.config.abortSignal.addEventListener('abort', () => {
            reject(Object.assign(new Error('request failed'), { name: 'ApiError' }));
          });
        });
      });

      const client = new GeminiClient('key', 'main-model', 'fallback-model', undefined, callModel);

      const p = expect(client.generate(createInput())).rejects.toThrow(LlmUnavailableError);
      await vi.runAllTimersAsync();
      await p;

      expect(calledModels).toEqual(['main-model', 'main-model', 'fallback-model']);
      expect(callTimes).toEqual([0, 6199, 16199]);
      expect(Date.now() - inicio).toBe(25000);
    });

    it('Timeout con un error de otro nombre -> respaldo', async () => {
      const calledModels: string[] = [];
      const logs: any[] = [];
      const callModel = vi.fn().mockImplementation((params) => {
        calledModels.push(params.model);
        if (params.model === 'main-model') {
          return new Promise((_, reject) => {
            params.config.abortSignal.addEventListener('abort', () => {
              reject(Object.assign(new Error('request failed'), { name: 'ApiError' }));
            });
          });
        }
        return Promise.resolve({ candidates: [{ content: { parts: [{ text: 'fallback-ok' }] } }] });
      });

      const client = new GeminiClient('key', 'main-model', 'fallback-model', (entry) => logs.push(entry), callModel);

      const p = client.generate(createInput());
      await vi.runAllTimersAsync();
      const res = await p;

      expect(res).toEqual({ kind: 'text', text: 'fallback-ok' });
      expect(calledModels).toEqual(['main-model', 'fallback-model']);
      expect(logs[0].outcome).toBe('timeout');
    });

    it('Error de red sin status (TypeError fetch failed) a los 100 ms -> reintento del principal -> ok', async () => {
      const calledModels: string[] = [];
      const callModel = vi.fn().mockImplementation((params) => {
        calledModels.push(params.model);
        if (calledModels.length === 1) {
          return new Promise((_, reject) => {
            setTimeout(() => reject(new TypeError('fetch failed')), 100);
          });
        }
        return Promise.resolve({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
      });

      const client = new GeminiClient('key', 'main-model', undefined, undefined, callModel);

      const p = client.generate(createInput());
      await vi.runAllTimersAsync();
      const res = await p;

      expect(res).toEqual({ kind: 'text', text: 'ok' });
      expect(calledModels).toEqual(['main-model', 'main-model']);
    });

    it('Un intento que responde antes del timeout no deja temporizadores pendientes', async () => {
      const callModel = vi.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'ok' }] } }]
      });

      const client = new GeminiClient('key', 'main-model', undefined, undefined, callModel);

      const res = await client.generate(createInput());
      expect(res).toEqual({ kind: 'text', text: 'ok' });
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
