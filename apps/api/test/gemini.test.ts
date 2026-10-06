import { describe, it, expect } from 'vitest';
import { toGeminiContents, fromGeminiResponse } from '../src/llm/gemini.js';
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
});
