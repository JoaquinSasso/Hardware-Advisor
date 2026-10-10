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

const wordToNum: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10
};

export function extractUserAmounts(text: string): number[] {
  const results = new Set<number>(extractAmounts(text));

  const regexMillions = /(?<![\p{L}\d])(un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|\d+(?:[.,]\d+)?)\s*(millones|millón|millon|palos|palo|m)(?:\s+(y\s+medio)|\s+(\d{3}))?(?![\p{L}])/giu;
  for (const match of text.matchAll(regexMillions)) {
    const nStr = match[1]!.toLowerCase();
    const n = wordToNum[nStr] !== undefined ? wordToNum[nStr] : parseFloat(nStr.replace(',', '.'));
    
    let total = Math.round(n * 1_000_000);
    if (match[3]) {
      total += 500_000;
    } else if (match[4]) {
      total += parseInt(match[4], 10) * 1_000;
    }
    
    if (!isNaN(total)) {
      results.add(total);
    }
  }

  const regexThousands = /(?<![\p{L}\d])(\d+(?:[.,]\d+)?)\s*(lucas|luca|k|mil)(?![\p{L}])/giu;
  for (const match of text.matchAll(regexThousands)) {
    const n = parseFloat(match[1]!.replace(',', '.'));
    if (!isNaN(n)) {
      results.add(Math.round(n * 1_000));
    }
  }

  const regexStandalone = /(?<![\p{L}\d])(entre|y|hasta|con|tengo|presupuesto|de|por|x|unos|maso)\s+(\d{3,4})(?![\p{L}\d.,])/giu;
  for (const match of text.matchAll(regexStandalone)) {
    const n = parseInt(match[2]!, 10);
    if (n >= 100 && n <= 9999) {
      results.add(n);
      results.add(n * 1_000);
    }
  }

  return Array.from(results).sort((a, b) => a - b);
}

export function collectAllowedAmounts(turns: ChatTurn[]): Set<number> {
  const allowed = new Set<number>();
  for (const turn of turns) {
    if (turn.role === 'user') {
      for (const amt of extractUserAmounts(turn.text)) {
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
