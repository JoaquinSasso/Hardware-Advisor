import { describe, it, expect } from 'vitest';
import { toPlainText } from '../src/chat/plain-text.js';

describe('toPlainText', () => {
  it('negrita en medio de una oración', () => {
    const input = 'Esta es una **oración con negrita** en el medio.';
    const expected = 'Esta es una oración con negrita en el medio.';
    expect(toPlainText(input)).toBe(expected);
  });

  it('una lista numerada con negritas (conserva 1. y los saltos de línea)', () => {
    const input = '1. **Procesador**: Ryzen 5 5600\n2. **Motherboard**: B550M\n3. **RAM**: 16 GB DDR4';
    const expected = '1. Procesador: Ryzen 5 5600\n2. Motherboard: B550M\n3. RAM: 16 GB DDR4';
    expect(toPlainText(input)).toBe(expected);
  });

  it('un texto sin markdown (queda idéntico)', () => {
    const input = 'Este es un texto simple sin ningún formato ni etiquetas de markdown.';
    expect(toPlainText(input)).toBe(input);
  });
});
