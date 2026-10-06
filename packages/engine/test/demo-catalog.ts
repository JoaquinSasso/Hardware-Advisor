import fs from 'fs';
import path from 'path';
import { CatalogItem } from '@pcadvisor/shared';

function parseCsv(csv: string) {
  const lines = csv.split(/\r?\n/);
  const result: string[][] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const row: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ';' && !inQuotes) {
        row.push(current);
        current = '';
      } else {
        current += c;
      }
    }
    row.push(current);
    result.push(row);
  }
  return result;
}

export function getDemoCatalog(): CatalogItem[] {
  const seedDir = path.resolve(__dirname, '../../db/seed/demo');
  const componentsPath = path.join(seedDir, 'components.json');
  const mappingsPath = path.join(seedDir, 'mappings.json');
  const csvPath = path.join(seedDir, 'tiendanube-demo.csv');

  if (!fs.existsSync(componentsPath)) throw new Error('components.json not found');
  if (!fs.existsSync(mappingsPath)) throw new Error('mappings.json not found');
  if (!fs.existsSync(csvPath)) throw new Error('tiendanube-demo.csv not found');

  const components = JSON.parse(fs.readFileSync(componentsPath, 'utf-8'));
  const mappings = JSON.parse(fs.readFileSync(mappingsPath, 'utf-8'));
  const csvData = parseCsv(fs.readFileSync(csvPath, 'utf-8'));

  const headers = csvData[0];
  const col = (name: string) => {
    const idx = headers.findIndex((h) => h.trim() === name);
    if (idx === -1) throw new Error(`Column ${name} not found`);
    return idx;
  };

  const idIdx = col('Identificador de URL');
  const priceIdx = col('Precio');
  const stockIdx = col('Stock');
  const showIdx = col('Mostrar en tienda');
  const nameIdx = col('Nombre');
  const var1Idx = headers.findIndex(h => h.trim() === 'Valor de propiedad 1');
  const var2Idx = headers.findIndex(h => h.trim() === 'Valor de propiedad 2');
  const var3Idx = headers.findIndex(h => h.trim() === 'Valor de propiedad 3');

  const rows = csvData.slice(1);
  const catalog: CatalogItem[] = [];

  let nextId = 1;

  for (const m of mappings) {
    if (m.status !== 'confirmed' || !m.advisorEnabled) continue;
    
    const row = rows.find(r => {
      if (r[idIdx] !== m.tnHandle) return false;
      if (!m.variantLabel) return true;
      const v1 = var1Idx !== -1 ? r[var1Idx] : '';
      const v2 = var2Idx !== -1 ? r[var2Idx] : '';
      const v3 = var3Idx !== -1 ? r[var3Idx] : '';
      const parts = m.variantLabel.split(': ');
      if (parts.length === 2) {
        const val = parts[1].trim();
        if (v1 === val || v2 === val || v3 === val) return true;
      }
      return false;
    });

    if (!row) continue;
    if (row[showIdx] !== 'SI') continue;
    
    const stockStr = row[stockIdx];
    const stock = stockStr === '' ? 999 : parseInt(stockStr, 10);
    if (isNaN(stock) || stock <= 0) continue;

    const priceStr = row[priceIdx].replace(/,/g, '');
    const price = Math.round(parseFloat(priceStr) * 100); 
    const tnProductId = nextId++;
    const tnVariantId = nextId++;

    const comp = components.find((c: any) => c.canonicalName === m.canonicalName);
    if (!comp) continue;

    catalog.push({
      type: comp.type,
      componentId: comp.id || m.canonicalName,
      tnProductId,
      tnVariantId,
      name: row[nameIdx],
      priceCents: price,
      stock,
      specs: comp.specs,
    } as any);
  }

  return catalog;
}
