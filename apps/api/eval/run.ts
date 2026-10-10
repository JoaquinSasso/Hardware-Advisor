import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createDb, migrate, importCsv, seedComponents, applyMappings, getCatalog, getRecentTurns, getOrCreateConversation } from '@pcadvisor/db';
import { config } from '../src/config.js';
import { GeminiClient } from '../src/llm/gemini.js';
import type { LlmClient, LlmOutput, ToolSpec } from '../src/llm/types.js';
import { runChatTurn } from '../src/chat/orchestrator.js';
import { toPlainText } from '../src/chat/plain-text.js';
import type { Case, TurnRecord, Score } from './schema.js';
import { CaseSchema } from "./schema.js";
import { scoreCase } from './score.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = parseArgs({
  args: process.argv.slice(2).filter(a => a !== '--'),
  options: {
    model: { type: 'string', default: config.GEMINI_MODEL },
    fallback: { type: 'string', default: config.GEMINI_FALLBACK_MODEL },
    label: { type: 'string' },
    only: { type: 'string' },
    'delay-ms': { type: 'string', default: '4000' },
    repeat: { type: 'string', default: '1' },
  },
  allowPositionals: true,
});

if (!args.values.label || !/^[a-z0-9-]+$/.test(args.values.label)) {
  console.error("Error: --label es obligatorio y solo puede contener [a-z0-9-]");
  process.exit(1);
}

const db = createDb({ pglite: true });
await migrate(db);

const dbDir = path.join(__dirname, '../../../packages/db');
await importCsv(db, { tnStoreId: 900000001, storeName: 'Tienda Demo', filePath: path.join(dbDir, 'seed/demo/tiendanube-demo.csv') });
await seedComponents(db, path.join(dbDir, 'seed/demo/components.json'));
await applyMappings(db, 900000001, path.join(dbDir, 'seed/demo/mappings.json'));

const catalog = await getCatalog(db, 900000001);
if (catalog.length !== 55) {
  throw new Error(`Catalog length is ${catalog.length}, expected 55`);
}

const casesText = fs.readFileSync(path.join(__dirname, 'cases.jsonl'), 'utf8');
const allCases = casesText
	.trim()
	.split("\n")
	.filter(Boolean)
	.map((l) => CaseSchema.parse(JSON.parse(l)));
const filteredCases = args.values.only 
  ? allCases.filter(c => args.values.only!.split(',').includes(c.id)) 
  : allCases;

const repeatCount = parseInt(args.values.repeat!);
const delayMs = parseInt(args.values['delay-ms']!);

const resultsDir = path.join(__dirname, `results`);
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}
const now = new Date();
const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
const outDir = path.join(resultsDir, `${dateStr}-${args.values.label}`);
fs.mkdirSync(outDir, { recursive: true });

let llmRecords: { result?: LlmOutput; ms: number }[] = [];
let currentAttempts: { model: string; outcome: string; ms: number }[] = [];
let currentMoneyViolations: number[] = [];

class RecordingLlmClient implements LlmClient {
  constructor(private delegate: LlmClient) {}
  async generate(input: { system: string; history: any[]; tools: ToolSpec[] }) {
    const start = Date.now();
    try {
      const result = await this.delegate.generate(input);
      llmRecords.push({ result, ms: Date.now() - start });
      return result;
    } catch (e) {
      llmRecords.push({ ms: Date.now() - start });
      throw e;
    }
  }
}

const logger = (entry: Record<string, unknown>) => {
  if (entry.msg === 'llm_attempt') {
    currentAttempts.push({
      model: entry.model as string,
      outcome: entry.outcome as string,
      ms: entry.ms as number,
    });
  } else if (entry.msg === 'money_guard_violation') {
    const amounts = entry.amounts as number[];
    currentMoneyViolations.push(...amounts);
  }
};

if (!config.GEMINI_API_KEY) throw new Error("Falta GEMINI_API_KEY en .env");
if (!args.values.model) throw new Error("Falta el modelo: --model o GEMINI_MODEL en .env");
    
const gemini = new GeminiClient(
  config.GEMINI_API_KEY,
  args.values.model,
  args.values.fallback,
  logger
);
const llmClient = new RecordingLlmClient(gemini);

const summary = {
  model: args.values.model,
  fallback: args.values.fallback,
  label: args.values.label,
  date: now.toISOString(),
  casesCount: filteredCases.length * repeatCount,
  approvedByKind: {} as Record<string, { ok: number; total: number }>,
  approvedBySource: {} as Record<string, { ok: number; total: number }>,
  needsReviewCount: 0,
  needsReviewAutoOkCount: 0,
  recommendFailedFields: {} as Record<string, string[][]>,
  moneyViolations: { total: 0, cases: [] as string[] },
  markdown: { total: 0, cases: [] as string[] },
  bannedWords: { total: 0, cases: [] as string[] },
  internalTerms: { total: 0, cases: [] as string[] },
  overLength: { total: 0, cases: [] as string[] },
  errors: { total: 0, cases: [] as string[] },
  latencies: [] as number[],
  attempts: {} as Record<string, Record<string, number>>,
};

let caseIdx = 0;
for (const c of filteredCases) {
  for (let run = 1; run <= repeatCount; run++) {
    caseIdx++;
    const sessionId = randomUUID();
    const conv = await getOrCreateConversation(db, { tnStoreId: 900000001, sessionId });
    const conversationId = conv.id;
    
    let errorStr: string | undefined;
    const turnRecords: TurnRecord[] = [];

    for (const userMessage of c.turns) {
      llmRecords = [];
      currentAttempts = [];
      currentMoneyViolations = [];
      
      const history = await getRecentTurns(db, conversationId, 30);
      try {
        const res = await runChatTurn({
          db,
          llm: llmClient,
          conversationId,
          storeId: 900000001,
          history,
          userMessage,
          logger,
        });

        const ms = llmRecords.reduce((acc, r) => acc + r.ms, 0);
        summary.latencies.push(ms);
        
        turnRecords.push({
          message: userMessage,
          reply: toPlainText(res.reply),
          rawTexts: llmRecords.filter(r => r.result?.kind === 'text').map(r => (r.result as any).text),
          toolCalls: llmRecords.filter(r => r.result?.kind === 'tool_call').map(r => ({ args: (r.result as any).args, result: undefined })),
          ms,
          attempts: [...currentAttempts],
          moneyViolations: [...currentMoneyViolations],
        });

        for (const att of currentAttempts) {
          if (!summary.attempts[att.model]) summary.attempts[att.model] = {};
          summary.attempts[att.model]![att.outcome] = (summary.attempts[att.model]![att.outcome] || 0) + 1;
        }

        if (delayMs > 0) {
          await new Promise(r => setTimeout(r, delayMs));
        }

      } catch (e) {
        errorStr = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        const ms = llmRecords.reduce((acc, r) => acc + r.ms, 0);
        summary.latencies.push(ms);
        turnRecords.push({
          message: userMessage,
          reply: '',
          rawTexts: llmRecords.filter(r => r.result?.kind === 'text').map(r => (r.result as any).text),
          toolCalls: llmRecords.filter(r => r.result?.kind === 'tool_call').map(r => ({ args: (r.result as any).args, result: undefined })),
          ms,
          attempts: [...currentAttempts],
          moneyViolations: [...currentMoneyViolations],
        });
        
        for (const att of currentAttempts) {
          if (!summary.attempts[att.model]) summary.attempts[att.model] = {};
          summary.attempts[att.model]![att.outcome] = (summary.attempts[att.model]![att.outcome] || 0) + 1;
        }
        
        break;
      }
    }

    const finalHistory = await getRecentTurns(db, conversationId, 100);
    const toolResults = finalHistory.filter(t => t.role === 'tool').map(t => (t as any).result);
    let toolIdx = 0;
    for (const tr of turnRecords) {
      for (const tc of tr.toolCalls) {
        if (toolIdx < toolResults.length) {
          tc.result = toolResults[toolIdx++];
        }
      }
    }

    const score = scoreCase(c, turnRecords, errorStr);
    
    const isAuto = ['recommend', 'ask', 'quote_price'].includes(c.expect.kind);
    if (isAuto) {
      if (!summary.approvedByKind[c.expect.kind]) summary.approvedByKind[c.expect.kind] = { ok: 0, total: 0 };
      summary.approvedByKind[c.expect.kind]!.total++;
      if (score.ok) summary.approvedByKind[c.expect.kind]!.ok++;

      if (!summary.approvedBySource[c.source]) summary.approvedBySource[c.source] = { ok: 0, total: 0 };
      summary.approvedBySource[c.source]!.total++;
      if (score.ok) summary.approvedBySource[c.source]!.ok++;
    }

    if (score.needsReview) {
      summary.needsReviewCount++;
      if (score.ok) summary.needsReviewAutoOkCount++;
    }
    
    if (c.expect.kind === 'recommend' && !score.ok && score.failedFields) {
      if (!summary.recommendFailedFields[c.id]) summary.recommendFailedFields[c.id] = [];
      summary.recommendFailedFields[c.id]!.push(score.failedFields);
    }
    
    const track = (metric: keyof Score, summObj: { total: number; cases: string[] }) => {
      const val = score[metric] as number;
      if (val > 0) {
        summObj.total += val;
        summObj.cases.push(c.id);
      }
    };
    
    track('moneyViolations', summary.moneyViolations);
    track('markdown', summary.markdown);
    track('bannedWords', summary.bannedWords);
    track('internalTerms', summary.internalTerms);
    track('overLength', summary.overLength);

    if (errorStr) {
      summary.errors.total++;
      summary.errors.cases.push(c.id);
    }

    const resultLine = {
      id: c.id,
      source: c.source,
      kind: c.expect.kind,
      run,
      error: errorStr,
      turns: turnRecords,
      score,
    };
    
    fs.appendFileSync(path.join(outDir, 'results.jsonl'), JSON.stringify(resultLine) + '\n');

    if (score.needsReview || errorStr) {
      let md = `## ${c.id} (${c.source})\n`;
      if (c.note) md += `**Note**: ${c.note}\n`;
      if (errorStr) md += `**Error**: ${errorStr}\n`;
      md += `**Veredicto auto**: ${score.ok ? 'OK' : 'FAIL'}\n\n`;
      for (const t of turnRecords) {
        md += `**User**: ${t.message}\n\n`;
        md += `**Asistente**: ${t.reply}\n\n`;
      }
      md += `Veredicto humano: \n\n`;
      fs.appendFileSync(path.join(outDir, 'review.md'), md);
    }

    const timeStr = (turnRecords.reduce((acc, t) => acc + t.ms, 0) / 1000).toFixed(1);
    console.log(`[${caseIdx}/${summary.casesCount}] ${c.id} ${score.ok ? 'ok' : 'fail'} ${timeStr}s${errorStr ? ' (error)' : ''}`);
  }
}

summary.latencies.sort((a, b) => a - b);
const p50 = summary.latencies[Math.floor(summary.latencies.length * 0.50)] || 0;
const p95 = summary.latencies[Math.floor(summary.latencies.length * 0.95)] || 0;

const summaryOut = {
  ...summary,
  latencies: { p50, p95 }
};

fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summaryOut, null, 2));

console.log(`\n-- Resumen --`);
for (const [k, v] of Object.entries(summary.approvedByKind)) {
  console.log(`${k}: ${v.ok}/${v.total}`);
}
for (const [s, v] of Object.entries(summary.approvedBySource)) {
  console.log(`Source ${s}: ${v.ok}/${v.total}`);
}
console.log(`A revisar: ${summary.needsReviewCount} (auto-ok ${summary.needsReviewAutoOkCount})`);
if (Object.keys(summary.recommendFailedFields).length > 0) {
  console.log(`Recommend fallidos:`);
  for (const [id, fails] of Object.entries(summary.recommendFailedFields)) {
    console.log(`  ${id}: ${JSON.stringify(fails)}`);
  }
}
const printMetric = (name: string, obj: { total: number; cases: string[] }) => {
  if (obj.total > 0) {
    console.log(`${name}: ${obj.total} (en ${[...new Set(obj.cases)].join(', ')})`);
  }
};
printMetric('Money violations', summary.moneyViolations);
printMetric('Markdown', summary.markdown);
printMetric('Banned words', summary.bannedWords);
printMetric('Internal terms', summary.internalTerms);
printMetric('Over length', summary.overLength);
printMetric('Errores', summary.errors);

console.log(`Latencia: p50=${p50}ms, p95=${p95}ms`);
for (const [model, outcomes] of Object.entries(summary.attempts)) {
  console.log(`Intentos ${model}: ${JSON.stringify(outcomes)}`);
}
