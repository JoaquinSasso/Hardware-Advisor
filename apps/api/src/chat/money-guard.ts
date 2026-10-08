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
