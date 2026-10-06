import type { Build, AdvisorConfig, ChatResponse } from '@pcadvisor/shared';
import type { ClientError } from './api.js';

export type ChatMessage =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string; builds: Build[]; recommendationId: string | null }
  | { kind: 'error'; error: ClientError };

export type ChatState = {
  messages: ChatMessage[];
  suggestions: string[];
  pending: boolean;
  limitReached: boolean;
};

export type ChatAction =
  | { type: 'config_loaded'; config: AdvisorConfig }
  | { type: 'user_sent'; text: string }
  | { type: 'response_received'; response: ChatResponse }
  | { type: 'request_failed'; error: ClientError }
  | { type: 'reset'; initialSuggestions: string[] };

export const initialChatState: ChatState = {
  messages: [],
  suggestions: [],
  pending: false,
  limitReached: false,
};

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'config_loaded':
      return {
        ...state,
        suggestions: action.config.initialSuggestions,
      };
    case 'user_sent':
      return {
        ...state,
        messages: [...state.messages, { kind: 'user', text: action.text }],
        pending: true,
      };
    case 'response_received':
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            kind: 'assistant',
            text: action.response.reply,
            builds: action.response.builds || [],
            recommendationId: action.response.recommendationId || null,
          }
        ],
        suggestions: action.response.suggestions,
        pending: false,
      };
    case 'request_failed':
      return {
        ...state,
        messages: [...state.messages, { kind: 'error', error: action.error }],
        pending: false,
        limitReached: action.error === 'conversation_limit' ? true : state.limitReached,
        suggestions: action.error === 'conversation_limit' ? [] : state.suggestions,
      };
    case 'reset':
      return {
        ...initialChatState,
        suggestions: action.initialSuggestions,
      };
    default:
      return state;
  }
}
