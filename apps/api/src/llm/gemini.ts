import { GoogleGenAI, Type, FunctionDeclaration, Content, Part, GenerateContentResponse, ThinkingLevel } from '@google/genai';
import { type ChatTurn } from '@pcadvisor/shared';
import { LlmUnavailableError, type LlmClient, type LlmOutput, type ToolSpec } from './types.js';

export function toGeminiContents(history: ChatTurn[]): Content[] {
  return history.map((turn): Content => {
    if (turn.role === 'user') {
      return { role: 'user', parts: [{ text: turn.text }] };
    }
    if (turn.role === 'assistant') {
      if (turn.providerData && Array.isArray(turn.providerData.parts)) {
        // According to Google Gen AI docs: "When providing the model response in history,
        // pass the entire model response as the `parts` array to preserve any signatures 
        // or additional metadata like thoughtSignature."
        return { role: 'model', parts: turn.providerData.parts as Part[] };
      }
      
      const parts: Part[] = [];
      if (turn.text) {
        parts.push({ text: turn.text });
      }
      if (turn.toolCall) {
        parts.push({
          functionCall: {
            name: turn.toolCall.name,
            args: turn.toolCall.args,
          },
        });
      }
      return { role: 'model', parts };
    }
    if (turn.role === 'tool') {
      return {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: turn.name,
              response: turn.result,
            },
          },
        ],
      };
    }
    throw new Error('Unknown turn role');
  });
}

export function fromGeminiResponse(response: GenerateContentResponse, logger?: (entry: Record<string, unknown>) => void): LlmOutput {
  const parts = response.candidates?.[0]?.content?.parts || [];
  const functionCallParts = parts.filter((p: any) => p.functionCall);
  
  if (functionCallParts.length > 0) {
    if (functionCallParts.length > 1) {
      if (logger) {
        logger({ level: 'warn', message: 'Multiple function calls returned, using the first one' });
      }
    }
    const fcPart = functionCallParts[0];
    if (!fcPart || !fcPart.functionCall) throw new Error('functionCall missing');
    const fc = fcPart.functionCall;
    return {
      kind: 'tool_call',
      name: 'recommend_builds',
      args: fc.args ?? {},
      providerData: { parts },
    };
  }

  const textParts = parts.filter((p: any) => p.text && !p.thought);
  const fullText = textParts.map((p: any) => p.text).join('').trim();
  
  if (!fullText) {
    const finish = response.candidates?.[0]?.finishReason ?? 'unknown';
    throw new LlmUnavailableError(`empty response (finishReason=${finish})`);
  }

  return { kind: 'text', text: fullText };
}

export class GeminiClient implements LlmClient {
  private ai: GoogleGenAI;
  
  constructor(apiKey: string, private readonly modelName: string, private readonly logger?: (entry: Record<string, unknown>) => void) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generate(input: { system: string; history: ChatTurn[]; tools: ToolSpec[] }): Promise<LlmOutput> {
    const contents = toGeminiContents(input.history);
    
    const functionDeclarations: FunctionDeclaration[] = input.tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters as any, // Schema structure usually matches OpenAPI
    }));

    try {
      const response = await this.ai.models.generateContent({
        model: this.modelName,
        contents,
        config: {
          systemInstruction: input.system,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          tools: [{ functionDeclarations }],
          // SDK timeout (AbortSignal) is passed via config.abortSignal
          abortSignal: AbortSignal.timeout(20000),
        },
      });

      if (this.logger) {
        this.logger({
          level: 'info', msg: 'llm_usage',
          usage: response.usageMetadata, finish: response.candidates?.[0]?.finishReason
        });
      }
      return fromGeminiResponse(response, this.logger);
    } catch (err: any) {
      if (err.name === 'AbortError' || err.name === 'TimeoutError' || err.status === 429 || (err.status && err.status >= 500)) {
        throw new LlmUnavailableError('LLM temporarily unavailable', err);
      }
      throw err;
    }
  }
}
