import { type ChatTurn } from '@pcadvisor/shared';
import { LlmUnavailableError, type LlmClient, type LlmOutput, type ToolSpec } from './types.js';

export class FakeLlmClient implements LlmClient {
  public calls: Array<{ system: string; history: ChatTurn[]; tools: ToolSpec[] }> = [];

  constructor(
    private readonly outputs: LlmOutput[],
    private readonly throwOnCallIndex: number = -1
  ) {}

  async generate(input: { system: string; history: ChatTurn[]; tools: ToolSpec[] }): Promise<LlmOutput> {
    this.calls.push(input);
    if (this.calls.length - 1 === this.throwOnCallIndex) {
      throw new LlmUnavailableError('Fake LlmUnavailableError');
    }
    const output = this.outputs.shift();
    if (!output) {
      throw new Error('FakeLlmClient out of outputs');
    }
    return output;
  }
}
