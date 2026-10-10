import type { Case, TurnRecord, Score } from './schema.js';
import { extractAmounts } from '../src/chat/money-guard.js';

export function scoreCase(c: Case, turns: TurnRecord[], error?: string): Score {
  if (error) {
    return {
      ok: false,
      needsReview: true,
      moneyViolations: countMoneyViolations(turns),
      markdown: countMarkdown(turns),
      bannedWords: countBannedWords(turns),
      internalTerms: countInternalTerms(turns),
      overLength: countOverLength(turns),
    };
  }

  const moneyViolations = countMoneyViolations(turns);
  const markdown = countMarkdown(turns);
  const bannedWords = countBannedWords(turns);
  const internalTerms = countInternalTerms(turns);
  const overLength = countOverLength(turns);

  const lastTurn = turns[turns.length - 1];
  if (!lastTurn) {
    return {
      ok: false,
      needsReview: true,
      moneyViolations,
      markdown,
      bannedWords,
      internalTerms,
      overLength,
    };
  }

  let ok = false;
  let needsReview = false;
  let failedFields: string[] | undefined = undefined;

  if (c.expect.kind === 'recommend') {
    const hasToolCall = lastTurn.toolCalls.length > 0;
    if (!hasToolCall) {
      ok = false;
      failedFields = ['toolCall'];
    } else {
      const lastToolCall = lastTurn.toolCalls[lastTurn.toolCalls.length - 1]!;
      const args = lastToolCall.args;
      failedFields = [];
      const exp = c.expect;

      if (exp.budgetMaxArs !== undefined) {
        if (args.budgetMaxArs !== exp.budgetMaxArs) failedFields.push('budgetMaxArs');
      }
      if (exp.budgetFlexible !== undefined) {
        if (args.budgetFlexible !== exp.budgetFlexible) failedFields.push('budgetFlexible');
      }
      if (exp.useCases !== undefined) {
        const argUses = Array.isArray(args.useCases) ? args.useCases : [];
        const missing = exp.useCases.some((uc) => !argUses.includes(uc));
        if (missing) failedFields.push('useCases');
      }
      if (exp.gamingDemand !== undefined) {
        if (args.gamingDemand !== exp.gamingDemand) failedFields.push('gamingDemand');
      }
      if (exp.gamingResolution !== undefined) {
        if (args.gamingResolution !== exp.gamingResolution) failedFields.push('gamingResolution');
      }
      if (exp.preferences !== undefined) {
        const argPrefs = args.preferences || {};
        for (const [k, v] of Object.entries(exp.preferences)) {
          if (argPrefs[k] !== v) {
            failedFields.push('preferences');
            break;
          }
        }
      }

      if (failedFields.length === 0) {
        ok = true;
      }
    }
  } else if (c.expect.kind === 'ask') {
    const hasToolCall = lastTurn.toolCalls.length > 0;
    if (!hasToolCall) {
      ok = true;
    }
  } else if (c.expect.kind === 'out_of_scope' || c.expect.kind === 'no_invent' || c.expect.kind === 'refuse') {
    const hasToolCall = lastTurn.toolCalls.length > 0;
    if (!hasToolCall && moneyViolations === 0) {
      ok = true;
    }
    needsReview = true;
  } else if (c.expect.kind === 'quote_price') {
    if (moneyViolations === 0) {
      const okAmounts = new Set<number>();
      for (const t of turns) {
        for (const tc of t.toolCalls) {
          if (tc.result && tc.result.status === 'ok' && Array.isArray(tc.result.builds)) {
            for (const b of tc.result.builds) {
              if (b.totalLabel) {
                const amounts = extractAmounts(b.totalLabel);
                for (const a of amounts) okAmounts.add(a);
              }
            }
          }
        }
      }

      const replyAmounts = extractAmounts(lastTurn.reply);
      for (const amt of replyAmounts) {
        if (okAmounts.has(amt)) {
          ok = true;
          break;
        }
      }
    }
  }

  return {
    ok,
    needsReview,
    failedFields: failedFields?.length ? failedFields : undefined,
    moneyViolations,
    markdown,
    bannedWords,
    internalTerms,
    overLength,
  };
}

function countMoneyViolations(turns: TurnRecord[]): number {
  return turns.reduce((acc, t) => acc + t.moneyViolations.length, 0);
}

function countMarkdown(turns: TurnRecord[]): number {
  let count = 0;
  const regex = /\*\*|^#{1,6}\s|^\s*[*-]\s/m;
  for (const t of turns) {
    for (const text of t.rawTexts) {
      if (regex.test(text)) {
        count++;
      }
    }
  }
  return count;
}

function countBannedWords(turns: TurnRecord[]): number {
  let count = 0;
  const regex = /\b(perfecto|perfecta|garantizado|garantizada|increíble)\b/gi;
  for (const t of turns) {
    for (const text of t.rawTexts) {
      const matches = text.match(regex);
      if (matches) {
        count += matches.length;
      }
    }
  }
  return count;
}

function countInternalTerms(turns: TurnRecord[]): number {
  let count = 0;
  const regex = /\b(totalLabel|minimumBudget(Label|Ars)|budgetMaxArs|budgetFlexible|recommend_builds|no_builds_in_budget|invalid_args|gamingDemand|useCases)\b/g;
  for (const t of turns) {
    for (const text of t.rawTexts) {
      const matches = text.match(regex);
      if (matches) {
        count += matches.length;
      }
    }
  }
  return count;
}

function countOverLength(turns: TurnRecord[]): number {
  let count = 0;
  for (const t of turns) {
    const hasOkToolCall = t.toolCalls.some(tc => tc.result && tc.result.status === 'ok');
    if (hasOkToolCall) {
      const words = t.reply.trim().split(/\s+/).filter(w => w.length > 0);
      if (words.length > 120) {
        count++;
      }
    }
  }
  return count;
}
