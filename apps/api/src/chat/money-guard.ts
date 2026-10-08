import { type ChatTurn } from '@pcadvisor/shared';
import { ToolResultForLlmSchema } from './tool.js';

export function extractAmounts(text: string): number[] {
  const regex = /(?:\$\s*(\d{1,3}(?:\.\d{3})+(?!\.\d)|\d+(?!\.\d))|(?<![\p{L}\d])(\d{1,3}(?:\.\d{3})+(?!\.\d)|\d{6,}(?!\.\d)))(?:,\d+)?(?![\p{L}\d])/gu;
  const results: number[] = [];
  for (const match of text.matchAll(regex)) {
    const raw = match[1] ?? match[2];
    if (raw) {
      results.push(parseInt(raw.replace(/\./g, ''), 10));
    }
  }
  return results;
}

export function findMoneyViolations(reply: string, allowed: Set<number>): number[] {
  const replyAmounts = extractAmounts(reply);
  const violations: number[] = [];
  for (const amount of replyAmounts) {
    if (!allowed.has(amount)) {
      violations.push(amount);
    }
  }
  return violations;
}

export function collectAllowedAmounts(turns: ChatTurn[]): Set<number> {
  const allowed = new Set<number>();
  for (const turn of turns) {
    if (turn.role === 'user') {
      for (const amt of extractAmounts(turn.text)) {
        allowed.add(amt);
      }
    } else if (turn.role === 'tool') {
      const parsed = ToolResultForLlmSchema.safeParse(turn.result);
      if (!parsed.success) {
        throw new Error(`Tool turn result failed validation: ${parsed.error.message}`);
      }
      const res = parsed.data;
      if (res.status === 'ok') {
        for (const b of res.builds) {
          for (const amt of extractAmounts(b.totalLabel)) {
            allowed.add(amt);
          }
        }
      } else if (res.status === 'no_builds_in_budget') {
        if (res.minimumBudgetArs !== null) {
          allowed.add(res.minimumBudgetArs);
        }
        if (res.minimumBudgetLabel !== null) {
          for (const amt of extractAmounts(res.minimumBudgetLabel)) {
            allowed.add(amt);
          }
        }
      }
    }
  }
  return allowed;
}
