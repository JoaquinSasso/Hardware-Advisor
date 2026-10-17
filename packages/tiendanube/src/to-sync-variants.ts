import type { TnProduct } from './schemas.js';

export type TnSyncVariant = {
  tnProductId: number;
  tnVariantId: number;
  tnHandle: string;
  variantLabel: string | null;
  sku: string | null;
  name: string;
  categoryPath: string;
  priceCents: number;
  stock: number;
  published: boolean;
};

function decimalStringToCents(priceStr: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(priceStr)) {
    throw new Error(`Formato de precio inválido: "${priceStr}"`);
  }
  const [intPart, decPart = ''] = priceStr.split('.');
  const centsStr = decPart.padEnd(2, '0');
  const cents = Number.parseInt((intPart ?? '0') + centsStr, 10);
  if (!Number.isSafeInteger(cents)) {
    throw new Error(`Precio fuera de rango entero seguro: "${priceStr}"`);
  }
  return cents;
}

export function toSyncVariants(products: TnProduct[]): {
  variants: TnSyncVariant[];
  skippedUnmanagedStock: Array<{ tnProductId: number; tnVariantId: number }>;
} {
  const variants: TnSyncVariant[] = [];
  const skippedUnmanagedStock: Array<{ tnProductId: number; tnVariantId: number }> = [];

  for (const product of products) {
    const tnHandle = product.handle['es'];
    if (tnHandle === undefined) {
      throw new Error(`El producto ${product.id} no tiene handle.es`);
    }

    const name = product.name['es'];
    if (name === undefined) {
      throw new Error(`El producto ${product.id} no tiene name.es`);
    }

    const categoryNames: string[] = [];
    for (const cat of product.categories) {
      const catEs = cat.name['es'];
      if (catEs === undefined) {
        throw new Error(`La categoría ${cat.id} del producto ${product.id} no tiene name.es`);
      }
      categoryNames.push(catEs);
    }
    const categoryPath = categoryNames.join(', ');

    for (const variant of product.variants) {
      let variantLabel: string | null;
      if (variant.values.length === 0) {
        if (product.attributes.length !== 0) {
          throw new Error(
            `El producto ${product.id} variante ${variant.id} tiene distinto largo entre attributes (${product.attributes.length}) y values (0)`,
          );
        }
        variantLabel = null;
      } else {
        if (product.attributes.length !== variant.values.length) {
          throw new Error(
            `El producto ${product.id} variante ${variant.id} tiene distinto largo entre attributes (${product.attributes.length}) y values (${variant.values.length})`,
          );
        }
        const pairs: string[] = [];
        for (let i = 0; i < variant.values.length; i++) {
          const attrEs = product.attributes[i]?.['es'];
          const valEs = variant.values[i]?.['es'];
          if (attrEs === undefined || valEs === undefined) {
            throw new Error(
              `El producto ${product.id} variante ${variant.id} no tiene clave 'es' en attributes[${i}] o values[${i}]`,
            );
          }
          pairs.push(`${attrEs}: ${valEs}`);
        }
        variantLabel = pairs.join(', ');
      }

      const rawPrice = variant.promotional_price ?? variant.price;
      const priceCents = decimalStringToCents(rawPrice);

      if (variant.stock === null) {
        skippedUnmanagedStock.push({
          tnProductId: product.id,
          tnVariantId: variant.id,
        });
        continue;
      }

      if (variant.stock < 0) {
        throw new Error(
          `El producto ${product.id} variante ${variant.id} tiene stock negativo: ${variant.stock}`,
        );
      }

      variants.push({
        tnProductId: product.id,
        tnVariantId: variant.id,
        tnHandle,
        variantLabel,
        sku: variant.sku,
        name,
        categoryPath,
        priceCents,
        stock: variant.stock,
        published: product.published,
      });
    }
  }

  return { variants, skippedUnmanagedStock };
}
