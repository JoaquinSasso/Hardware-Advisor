import type { ChatTurn } from '@pcadvisor/shared';

export type ToolSpec = {
  name: 'recommend_builds';
  description: string;
  parameters: object;
};

export type LlmOutput =
  | { kind: 'text'; text: string }
  | {
      kind: 'tool_call';
      name: 'recommend_builds';
      args: Record<string, unknown>;
      providerData: Record<string, unknown> | null;
    };

export interface LlmClient {
  generate(input: {
    system: string;
    history: ChatTurn[];
    tools: ToolSpec[];
  }): Promise<LlmOutput>;
}

export class LlmUnavailableError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'LlmUnavailableError';
    this.cause = cause;
  }
}
