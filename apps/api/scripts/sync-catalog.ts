import { parseArgs } from 'node:util';
import { createDb, syncStoreVariants } from '@pcadvisor/db';
import { createTnClient, toSyncVariants } from '@pcadvisor/tiendanube';
import { config, dbOptions } from '../src/config.js';

async function main() {
  if (!config.TN_STORE_ID) {
    throw new Error('Falta la variable de entorno requerida: TN_STORE_ID');
  }
  if (!config.TN_ACCESS_TOKEN) {
    throw new Error('Falta la variable de entorno requerida: TN_ACCESS_TOKEN');
  }
  if (!config.TN_USER_AGENT) {
    throw new Error('Falta la variable de entorno requerida: TN_USER_AGENT');
  }

  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: {
      name: { type: 'string' },
    },
    allowPositionals: true,
  });

  const tnClient = createTnClient({
    storeId: config.TN_STORE_ID,
    accessToken: config.TN_ACCESS_TOKEN,
    userAgent: config.TN_USER_AGENT,
  });

  const products = await tnClient.listProducts();
  const { variants, skippedUnmanagedStock } = toSyncVariants(products);

  const db = createDb(dbOptions(config));
  const result = await syncStoreVariants(db, {
    tnStoreId: config.TN_STORE_ID,
    storeName: values.name,
    variants,
  });

  console.log(
    JSON.stringify({
      products: products.length,
      variants: variants.length,
      inserted: result.inserted,
      updated: result.updated,
      rematched: result.rematched,
      missing: result.missing,
      skippedUnmanagedStock: {
        count: skippedUnmanagedStock.length,
        ids: skippedUnmanagedStock,
      },
    }),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
