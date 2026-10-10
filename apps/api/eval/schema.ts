import { z } from 'zod';

export const CaseExpectSchema = z.object({
	kind: z.enum([
		"recommend",
		"ask",
		"out_of_scope",
		"no_invent",
		"refuse",
		"quote_price",
	]),
	useCases: z.array(z.string()).optional(),
	budgetMaxArs: z.number().optional(),
	budgetFlexible: z.boolean().optional(),
	gamingDemand: z.string().optional(),
	gamingResolution: z.string().optional(),
	preferences: z.record(z.union([z.string(), z.boolean()])).optional(),
});

export const CaseSchema = z.object({
  id: z.string(),
  source: z.string().min(1),
  turns: z.array(z.string()),
  expect: CaseExpectSchema,
  note: z.string().optional(),
});

export type Case = z.infer<typeof CaseSchema>;

export type TurnRecord = {
  message: string;
  reply: string;
  rawTexts: string[];
  toolCalls: Array<{ args: Record<string, any>; result?: any }>;
  ms: number;
  attempts: Array<{ model: string; outcome: string; ms: number }>;
  moneyViolations: number[];
};

export type Score = {
  ok: boolean;
  needsReview: boolean;
  failedFields?: string[];
  moneyViolations: number;
  markdown: number;
  bannedWords: number;
  internalTerms: number;
  overLength: number;
};
