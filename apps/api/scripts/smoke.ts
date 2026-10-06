import { createDb, getOrCreateConversation } from '@pcadvisor/db';
import { GeminiClient } from '../src/llm/gemini.js';
import { config } from '../src/config.js';
import { runChatTurn } from '../src/chat/orchestrator.js';
import { formatArs } from '../src/format.js';
import { randomUUID } from 'crypto';

async function main() {
  if (!config.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is required for smoke test');
  }
  if (!config.GEMINI_MODEL) {
    throw new Error('GEMINI_MODEL is required for smoke test');
  }

  const db = createDb({
    connectionString: config.DATABASE_URL,
    pgliteDir: config.DATABASE_URL ? undefined : config.PGLITE_DIR,
  });

  const llm = new GeminiClient(config.GEMINI_API_KEY, config.GEMINI_MODEL);
  const storeId = 900000001;
  const sessionId = randomUUID();

  const { id: conversationId } = await getOrCreateConversation(db, { tnStoreId: storeId, sessionId });

  console.log('Sending message: "Quiero jugar Valorant y LoL, tengo 1300000 pesos"');
  
  const result = await runChatTurn({
    db,
    llm,
    conversationId,
    storeId,
    history: [],
    userMessage: 'Quiero jugar Valorant y LoL, tengo 1300000 pesos',
  });

  console.log('\n--- LLM REPLY ---');
  console.log(result.reply);

  console.log('\n--- BUILDS ---');
  if (result.builds) {
    for (const b of result.builds) {
      let ramTotal = 0;
      let storageTotal = 0;
      let cpu = '';
      let gpu = '';
      for (const item of b.items) {
         if (item.type === 'cpu') cpu = item.name;
         if (item.type === 'gpu') gpu = item.name;
      }
      
      console.log(`\nTier: ${b.tier} | Total: ${formatArs(b.totalCents)}`);
      console.log(`CPU: ${cpu}`);
      if (gpu) console.log(`GPU: ${gpu}`);
      if (b.warnings.length > 0) {
        console.log(`Warnings: ${b.warnings.join(', ')}`);
      }
    }
  } else {
    console.log('No builds.');
  }

  console.log('\n--- SUGGESTIONS ---');
  console.log(result.suggestions);
}

main().catch(console.error);
