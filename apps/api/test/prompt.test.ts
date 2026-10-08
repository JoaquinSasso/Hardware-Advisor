import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT } from '../src/chat/prompt.js';

describe('prompt.ts', () => {
  it('SYSTEM_PROMPT incluye la instrucción de texto plano', () => {
    expect(SYSTEM_PROMPT).toContain('Escribí en texto plano: sin asteriscos, numerales ni viñetas. Separá las ideas en párrafos cortos.');
  });
});
