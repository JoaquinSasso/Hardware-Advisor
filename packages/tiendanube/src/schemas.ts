import { z } from 'zod';

const I18n = z.record(z.string(), z.string()); // {"es": "..."}

// Non-passthrough object: extra fields such as cost are stripped by Zod and never read, saved or logged.
export const TnVariantSchema = z.object({
  id: z.number().int().positive(),
  values: z.array(I18n),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/),
  promotional_price: z.string().regex(/^\d+(\.\d{1,2})?$/).nullable(),
  stock: z.number().int().nullable(), // null = stock no controlado
  sku: z.string().nullable(),
});

export const TnCategorySchema = z.object({
  id: z.number().int(),
  name: I18n,
});

export const TnProductSchema = z.object({
  id: z.number().int().positive(),
  handle: I18n,
  name: I18n,
  attributes: z.array(I18n),
  published: z.boolean(),
  categories: z.array(TnCategorySchema),
  variants: z.array(TnVariantSchema).min(1),
});

export type TnVariant = z.infer<typeof TnVariantSchema>;
export type TnCategory = z.infer<typeof TnCategorySchema>;
export type TnProduct = z.infer<typeof TnProductSchema>;
