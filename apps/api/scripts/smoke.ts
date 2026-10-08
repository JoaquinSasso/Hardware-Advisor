import { createDb, getOrCreateConversation } from '@pcadvisor/db';
import { GeminiClient } from '../src/llm/gemini.js';
import { config, dbOptions } from '../src/config.js';
import { runChatTurn } from '../src/chat/orchestrator.js';
import { formatArs } from '@pcadvisor/shared';
import { randomUUID } from 'crypto';

async function main() {
  if (!config.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is required for smoke test');
  }
  if (!config.GEMINI_MODEL) {
    throw new Error('GEMINI_MODEL is required for smoke test');
  }

  const opts = dbOptions(config);
  const db = createDb(opts);

  if ('url' in opts) {
    const parsed = new URL(opts.url);
    console.log(`Database host: ${parsed.host}`);
  } else {
    console.log(`Database path: ${opts.dataDir}`);
  }

  const logger = (entry: Record<string, unknown>) => console.log(JSON.stringify(entry));
  const llm = new GeminiClient(config.GEMINI_API_KEY, config.GEMINI_MODEL, config.GEMINI_FALLBACK_MODEL, logger);
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
    logger,
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
