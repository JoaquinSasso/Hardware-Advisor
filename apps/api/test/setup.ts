import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, migrate, importCsv, seedComponents, applyMappings, updateStoreConfig } from '@pcadvisor/db';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function setupDemoDb() {
  const db = createDb({ pglite: true });
  await migrate(db, { log: () => {} });
  
  const seedDir = path.join(__dirname, '../../../packages/db/seed/demo');
  
  await seedComponents(db, path.join(seedDir, 'components.json'));
  await importCsv(db, { tnStoreId: 900000001, storeName: 'Demo Store', filePath: path.join(seedDir, 'tiendanube-demo.csv') });
  await applyMappings(db, 900000001, path.join(seedDir, 'mappings.json'));
  
  await updateStoreConfig(db, { tnStoreId: 900000001,
    checkoutMode: 'cart',
    whatsappNumber: null,
  });

  return db;
}
