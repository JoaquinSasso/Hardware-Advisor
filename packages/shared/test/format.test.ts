import { describe, it, expect } from 'vitest';
import { formatArs } from '../src/format.js';

describe('formatArs', () => {
  it('formatArs(116523060) === "$ 1.165.231"', () => {
    expect(formatArs(116523060)).toBe('$ 1.165.231');
  });
});
