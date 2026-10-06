import { type ChatTurn, type Build, type CatalogItem } from '@pcadvisor/shared';
import { type DbClient, getCatalog, saveRecommendation, appendTurns } from '@pcadvisor/db';
import { recommend } from '@pcadvisor/engine';
import { type LlmClient } from '../llm/types.js';
import { SYSTEM_PROMPT } from './prompt.js';
import { toolSpec, RecommendToolArgsSchema, toRequirements, toolResultForLlm, type ToolResult } from './tool.js';
import { getSuggestions } from './suggestions.js';

export async function runChatTurn(deps: {
  db: DbClient;
  llm: LlmClient;
  conversationId: string;
  storeId: number;
  history: ChatTurn[];
  userMessage: string;
}) {
  const { db, llm, conversationId, storeId, history, userMessage } = deps;
  
  const newTurns: ChatTurn[] = [];
  const userTurn: ChatTurn = { role: 'user', text: userMessage };
  newTurns.push(userTurn);

  let currentHistory = [...history, userTurn];
  let callsCount = 0;
  let finalReply = '';
  
  let lastValidBuilds: Build[] | undefined = undefined;
  let lastRecommendationId: string | undefined = undefined;

  while (true) {
    if (callsCount >= 2) {
      // If the LLM tries to make a 3rd call, we stop and force the fallback message.
      const llmOutput = await llm.generate({
        system: SYSTEM_PROMPT,
        history: currentHistory,
        tools: [toolSpec],
      });
      
      if (llmOutput.kind === 'tool_call') {
        finalReply = "Perdón, no pude completar la recomendación. ¿Podés contarme de nuevo qué necesitás o escribirnos por WhatsApp?";
        newTurns.push({ role: 'assistant', text: finalReply, toolCall: null, providerData: null });
        break;
      }
      
      finalReply = llmOutput.text;
      newTurns.push({ role: 'assistant', text: finalReply, toolCall: null, providerData: null });
      break;
    }

    const llmOutput = await llm.generate({
      system: SYSTEM_PROMPT,
      history: currentHistory,
      tools: [toolSpec],
    });

    if (llmOutput.kind === 'text') {
      finalReply = llmOutput.text;
      newTurns.push({ role: 'assistant', text: finalReply, toolCall: null, providerData: null });
      break;
    }

    if (llmOutput.kind === 'tool_call') {
      callsCount++;
      const assistantTurn: ChatTurn = {
        role: 'assistant',
        text: null,
        toolCall: { name: llmOutput.name, args: llmOutput.args },
        providerData: llmOutput.providerData,
      };
      newTurns.push(assistantTurn);
      currentHistory.push(assistantTurn);

      const parsedArgs = RecommendToolArgsSchema.safeParse(llmOutput.args);
      let toolResult: ToolResult;
      let catalogForLlm: CatalogItem[] = [];

      if (!parsedArgs.success) {
        const issues = parsedArgs.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
        toolResult = { status: 'invalid_args', issues };
      } else {
        const reqs = toRequirements(parsedArgs.data);
        const catalog = await getCatalog(db, storeId);
        catalogForLlm = catalog;
        const rec = recommend(reqs, catalog);
        
        const recId = await saveRecommendation(db, {
          conversationId,
          requirements: reqs,
          builds: rec.builds,
          cheapestValidTotalCents: rec.cheapestValidTotalCents,
        });

        if (rec.builds.length > 0) {
          lastValidBuilds = rec.builds;
          lastRecommendationId = recId;
          toolResult = { status: 'ok', builds: rec.builds };
        } else {
          toolResult = { status: 'no_builds_in_budget', cheapestValidTotalCents: rec.cheapestValidTotalCents };
        }
      }

      const llmResult = toolResultForLlm(toolResult, catalogForLlm);
      const toolTurn: ChatTurn = {
        role: 'tool',
        name: 'recommend_builds',
        result: llmResult,
      };
      newTurns.push(toolTurn);
      currentHistory.push(toolTurn);
    }
  }

  await appendTurns(db, conversationId, newTurns);

  return {
    reply: finalReply,
    builds: lastValidBuilds,
    recommendationId: lastRecommendationId,
    suggestions: getSuggestions(history, newTurns),
  };
}
