import { parseArgs } from 'node:util';
import path from 'node:path';
import { createDb } from './client.js';
import { migrate } from './migrate.js';
import { importCsv } from './import-csv.js';
import { seedComponents } from './seed-components.js';
import { applyMappings } from './apply-mappings.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const dbUrl = process.env.DATABASE_URL;
  const dbOpts = dbUrl ? { url: dbUrl } : { pglite: true, dataDir: path.join(process.cwd(), '.pglite') };
  const db = createDb(dbOpts as any);

  if (command === 'db:migrate') {
    await migrate(db);
    console.log('Migration complete.');
  } else if (command === 'import:csv') {
    const { values } = parseArgs({
      args,
      options: {
        store: { type: 'string' },
        name: { type: 'string' },
        file: { type: 'string' },
      },
      allowPositionals: true
    });
    if (!values.store || !values.name || !values.file) throw new Error('Missing args');
    const res = await importCsv(db, { tnStoreId: parseInt(values.store, 10), storeName: values.name, filePath: values.file });
    console.log(`Import CSV result: inserted=${res.inserted}, updated=${res.updated}, skipped=${res.skipped}, warnings=${res.warnings.length}`);
  } else if (command === 'seed:components') {
    const { values } = parseArgs({ args, options: { file: { type: 'string' } }, allowPositionals: true });
    if (!values.file) throw new Error('Missing args');
    const { total, inserted, updated } = await seedComponents(db, values.file);
    console.log(`${total} componentes (insertados ${inserted}, actualizados ${updated})`);
  } else if (command === 'apply:mappings') {
    const { values } = parseArgs({ args, options: { store: { type: 'string' }, file: { type: 'string' } }, allowPositionals: true });
    if (!values.store || !values.file) throw new Error('Missing args');
    const { total, confirmed, ignored } = await applyMappings(db, parseInt(values.store, 10), values.file);
    console.log(`${total} vínculos (confirmados ${confirmed}, ignorados ${ignored})`);
  } else {
    console.error('Unknown command');
    process.exit(1);
  }
  process.exit(0);
}
main().catch(e => {
  console.error(e);
  process.exit(1);
});
