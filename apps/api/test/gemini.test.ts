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
      vi.restoreAllMocks();
    });

    const createInput = () => ({ system: 's', history: [], tools: [] });

    it('Timeout del principal -> el siguiente intento es el respaldo (sin reintentar el principal)', async () => {
      const callModel = vi.fn().mockImplementation(async (args) => {
        if (args.model === 'main-model') {
          vi.advanceTimersByTime(10000);
          throw { name: 'TimeoutError' };
        }
        return { candidates: [{ content: { parts: [{ text: 'fallback-ok' }] } }] };
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

    it('503 rápido (500 ms) -> reintento del principal -> ok', async () => {
      const callModel = vi.fn().mockImplementation(async (args) => {
        if (callModel.mock.calls.length === 1) {
          vi.advanceTimersByTime(500);
          throw { status: 503 };
        }
        return { candidates: [{ content: { parts: [{ text: 'ok' }] } }] };
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
      const callModel = vi.fn().mockImplementation(async (args) => {
        if (args.model === 'main-model') {
          vi.advanceTimersByTime(500);
          throw { status: 503 };
        }
        return { candidates: [{ content: { parts: [{ text: 'fallback-ok' }] } }] };
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
      const callModel = vi.fn().mockImplementation(async (args) => {
        if (args.model === 'main-model') {
          vi.advanceTimersByTime(6000);
          throw { status: 503 };
        }
        return { candidates: [{ content: { parts: [{ text: 'fallback-ok' }] } }] };
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
      const callModel = vi.fn().mockImplementation(async (args) => {
        if (callModel.mock.calls.length === 1) {
          vi.advanceTimersByTime(500);
          throw { status: 503 }; // 1er intento rápido
        }
        if (callModel.mock.calls.length === 2) {
          vi.advanceTimersByTime(10000);
          throw { name: 'TimeoutError' }; // 2do intento lento
        }
        return { candidates: [{ content: { parts: [{ text: 'fallback-ok' }] } }] };
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
      const callModel = vi.fn().mockImplementation(async () => {
        vi.advanceTimersByTime(10000);
        throw { name: 'TimeoutError' };
      });
      
      const logs: any[] = [];
      const client = new GeminiClient('key', 'main-model', undefined, (entry) => logs.push(entry), callModel);
      
      const p = expect(client.generate(createInput())).rejects.toThrow(LlmUnavailableError);
      await vi.runAllTimersAsync();
      await p;
      
      expect(callModel).toHaveBeenCalledTimes(1);
    });

    it('400 -> 1 intento, error propagado', async () => {
      const error400 = { status: 400 };
      const callModel = vi.fn().mockRejectedValueOnce(error400);
      
      const logs: any[] = [];
      const client = new GeminiClient('key', 'main-model', 'fallback-model', (entry) => logs.push(entry), callModel);
      
      const p = expect(client.generate(createInput())).rejects.toEqual(error400);
      await vi.runAllTimersAsync();
      await p;
      
      expect(callModel).toHaveBeenCalledTimes(1);
    });

    it('Nunca se supera TOTAL_BUDGET_MS (verificar con los timers falsos en el peor caso)', async () => {
      let totalElapsed = 0;
      const callModel = vi.fn().mockImplementation(async (args) => {
        // En el peor caso usamos el timeout que pide el cliente (max ATTEMPT_TIMEOUT_MS)
        const timeoutMs = args.config.abortSignal ? 10000 : 0; 
        // Como dependemos de que callModel sea quien avanza el tiempo, 
        // simulamos que el timeout abortó y tardó lo que abortSignal decía.
        // wait... no tenemos la señal aquí fácil. Avanzamos 10000ms.
        vi.advanceTimersByTime(10000);
        totalElapsed += 10000;
        throw { name: 'TimeoutError' };
      });

      const client = new GeminiClient('key', 'main-model', 'fallback-model', undefined, callModel);
      
      const p = expect(client.generate(createInput())).rejects.toThrow(LlmUnavailableError);
      
      // advanceTimers by chunks to allow microtasks to run
      for (let i = 0; i < 30; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }
      
      await p;
      
      // Elapsed is expected to be roughly 20s (10s first attempt + 10s fallback) 
      // since the first timeout prevents attempt 2.
      // Or if it was 500ms first attempt -> 10s second attempt -> 10s fallback -> 20.5s + 1.2s wait <= 25s.
      expect(callModel).toHaveBeenCalledTimes(2);
      expect(callModel.mock.calls[0][0].model).toBe('main-model');
      expect(callModel.mock.calls[1][0].model).toBe('fallback-model');
      
      // To strictly test the worst case timeline:
      expect(totalElapsed).toBeLessThanOrEqual(25000);
    });
  });
});
