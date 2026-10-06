import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Restricciones de ambiente', () => {
  it('no usa APIs del DOM o navegador', () => {
    const srcDir = path.resolve(__dirname, '../src');
    const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.ts'));
    
    for (const file of files) {
      const content = fs.readFileSync(path.join(srcDir, file), 'utf-8');
      expect(content).not.toMatch(/\bwindow\b/);
      expect(content).not.toMatch(/\bdocument\b/);
      expect(content).not.toMatch(/\blocalStorage\b/);
      expect(content).not.toMatch(/\bsessionStorage\b/);
    }
  });
});
