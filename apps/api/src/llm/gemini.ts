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

export const TOTAL_BUDGET_MS = 25000;
export const ATTEMPT_TIMEOUT_MS = 10000;
export const FAST_FAILURE_MS = 5000;
export const FALLBACK_RESERVE_MS = 8000;
export const MIN_ATTEMPT_MS = 3000;

export class GeminiClient implements LlmClient {
  private ai: GoogleGenAI;
  private callModel: (params: any) => Promise<GenerateContentResponse>;
  
  constructor(
    apiKey: string,
    private readonly modelName: string,
    private readonly fallbackModelName?: string,
    private readonly logger?: (entry: Record<string, unknown>) => void,
    callModel?: (params: any) => Promise<GenerateContentResponse>
  ) {
    this.ai = new GoogleGenAI({ apiKey });
    this.callModel = callModel ?? ((params) => this.ai.models.generateContent(params));
  }

  async generate(input: { system: string; history: ChatTurn[]; tools: ToolSpec[] }): Promise<LlmOutput> {
    const contents = toGeminiContents(input.history);
    
    const functionDeclarations: FunctionDeclaration[] = input.tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters as any,
    }));

    const generateStartTime = Date.now();
    let lastError: unknown;
    let attemptCount = 0;

    const runAttempt = async (
      model: string,
      attemptTimeoutMs: number
    ): Promise<{ kind: 'ok', result: LlmOutput } | { kind: 'retryable_error', error: any, isTimeout: boolean, elapsedMs: number } | { kind: 'fatal_error', error: any }> => {
      attemptCount++;
      const attemptStartTime = Date.now();
      let outcome: 'ok' | 'retryable_error' | 'fatal_error' | 'timeout' = 'ok';
      let status: number | undefined;
      let finish: string | undefined;
      let usage: any;
      let isTimeoutErr = false;

      try {
        const response = await this.callModel({
          model,
          contents,
          config: {
            systemInstruction: input.system,
            tools: [{ functionDeclarations }],
            abortSignal: AbortSignal.timeout(attemptTimeoutMs),
          },
        });

        finish = response.candidates?.[0]?.finishReason;
        usage = response.usageMetadata;

        const result = fromGeminiResponse(response, this.logger);

        if (this.logger) {
          this.logger({
            level: 'info', msg: 'llm_attempt', model, attempt: attemptCount,
            ms: Date.now() - attemptStartTime, outcome: 'ok', finish, usage
          });
        }
        return { kind: 'ok', result };
      } catch (err: any) {
        status = err.status;
        
        isTimeoutErr = err.name === 'AbortError' || err.name === 'TimeoutError';
        const isEmptyResponse = err instanceof LlmUnavailableError && err.message.startsWith('empty response');
        const isRetryableStatus = status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
        
        if (isTimeoutErr) {
          outcome = 'timeout';
        } else if (isEmptyResponse || isRetryableStatus) {
          outcome = 'retryable_error';
        } else {
          outcome = 'fatal_error';
        }

        if (this.logger) {
          this.logger({
            level: outcome === 'fatal_error' ? 'error' : 'warn',
            msg: 'llm_attempt', model, attempt: attemptCount,
            ms: Date.now() - attemptStartTime, outcome, status, finish, usage
          });
        }

        if (outcome === 'fatal_error') {
          return { kind: 'fatal_error', error: err };
        }
        return { kind: 'retryable_error', error: err, isTimeout: isTimeoutErr, elapsedMs: Date.now() - attemptStartTime };
      }
    };

    const getTimeRemaining = () => TOTAL_BUDGET_MS - (Date.now() - generateStartTime);

    // Intento 1
    let timeRemaining = getTimeRemaining();
    if (timeRemaining < MIN_ATTEMPT_MS) throw new LlmUnavailableError('Not enough time to start attempt 1');
    let res = await runAttempt(this.modelName, Math.min(ATTEMPT_TIMEOUT_MS, timeRemaining));
    if (res.kind === 'ok') return res.result;
    if (res.kind === 'fatal_error') throw res.error;
    lastError = res.error;

    // Intento 2
    if (!res.isTimeout && res.elapsedMs < FAST_FAILURE_MS) {
      const waitMs = 800 + Math.floor(Math.random() * 401);
      await new Promise(r => setTimeout(r, waitMs));

      timeRemaining = getTimeRemaining();
      const attempt2Timeout = Math.min(ATTEMPT_TIMEOUT_MS, timeRemaining - (this.fallbackModelName ? FALLBACK_RESERVE_MS : 0));
      
      if (attempt2Timeout >= MIN_ATTEMPT_MS) {
        res = await runAttempt(this.modelName, attempt2Timeout);
        if (res.kind === 'ok') return res.result;
        if (res.kind === 'fatal_error') throw res.error;
        lastError = res.error;
      }
    }

    // Respaldo
    if (this.fallbackModelName) {
      timeRemaining = getTimeRemaining();
      if (timeRemaining >= MIN_ATTEMPT_MS) {
        res = await runAttempt(this.fallbackModelName, Math.min(ATTEMPT_TIMEOUT_MS, timeRemaining));
        if (res.kind === 'ok') return res.result;
        if (res.kind === 'fatal_error') throw res.error;
        lastError = res.error;
      }
    }

    if (lastError instanceof LlmUnavailableError && lastError.message.startsWith('empty response')) {
      throw lastError;
    }

    throw new LlmUnavailableError('LLM temporarily unavailable', lastError);
  }
}
