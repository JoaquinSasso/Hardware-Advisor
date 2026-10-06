import { describe, it, expect } from 'vitest';
import { initialChatState, chatReducer, type ChatState } from '../src/state.js';

describe('chatReducer', () => {
  it('config_loaded sets suggestions', () => {
    const prevState = { ...initialChatState };
    const state = chatReducer(prevState, {
      type: 'config_loaded',
      config: { checkoutMode: 'cart', whatsappNumber: null, initialSuggestions: ['s1', 's2'] }
    });
    expect(state.suggestions).toEqual(['s1', 's2']);
    expect(prevState).toEqual(initialChatState); // immutability
  });

  it('user_sent adds message and sets pending', () => {
    const prevState = { ...initialChatState };
    const state = chatReducer(prevState, { type: 'user_sent', text: 'hello' });
    expect(state.messages).toEqual([{ kind: 'user', text: 'hello' }]);
    expect(state.pending).toBe(true);
    expect(prevState).toEqual(initialChatState);
  });

  it('response_received adds assistant message, sets suggestions, unsets pending', () => {
    const prevState: ChatState = { ...initialChatState, pending: true };
    const state = chatReducer(prevState, {
      type: 'response_received',
      response: { reply: 'hi', suggestions: ['s3'], builds: [], recommendationId: 'r1' }
    });
    expect(state.messages).toEqual([
      { kind: 'assistant', text: 'hi', builds: [], recommendationId: 'r1' }
    ]);
    expect(state.suggestions).toEqual(['s3']);
    expect(state.pending).toBe(false);
    expect(prevState.pending).toBe(true);
  });

  it('request_failed adds error, unsets pending', () => {
    const prevState: ChatState = { ...initialChatState, pending: true, suggestions: ['s1'] };
    const state = chatReducer(prevState, { type: 'request_failed', error: 'internal' });
    expect(state.messages).toEqual([{ kind: 'error', error: 'internal' }]);
    expect(state.pending).toBe(false);
    expect(state.suggestions).toEqual(['s1']);
  });

  it('request_failed with conversation_limit sets limitReached and clears suggestions', () => {
    const prevState: ChatState = { ...initialChatState, pending: true, suggestions: ['s1'] };
    const state = chatReducer(prevState, { type: 'request_failed', error: 'conversation_limit' });
    expect(state.messages).toEqual([{ kind: 'error', error: 'conversation_limit' }]);
    expect(state.pending).toBe(false);
    expect(state.limitReached).toBe(true);
    expect(state.suggestions).toEqual([]);
  });

  it('reset returns to initial but with new suggestions', () => {
    const prevState: ChatState = { messages: [{ kind: 'user', text: 'a' }], suggestions: ['a'], pending: true, limitReached: true };
    const state = chatReducer(prevState, { type: 'reset', initialSuggestions: ['new'] });
    expect(state).toEqual({
      ...initialChatState,
      suggestions: ['new']
    });
  });
});
