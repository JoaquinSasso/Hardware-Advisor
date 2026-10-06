import { describe, it, expect } from 'vitest';
import { tierLabel, whatsappUrl, buildReference } from '../src/present.js';
import type { Build } from '@pcadvisor/shared';

describe('present', () => {
  it('tierLabel con 1 y con 3 builds', () => {
    const build = { tier: 'budget' } as Build;
    expect(tierLabel(build, 1)).toBeNull();
    expect(tierLabel(build, 3)).toBe('Económica');
    
    expect(tierLabel({ tier: 'balanced' } as Build, 3)).toBe('Equilibrada');
    expect(tierLabel({ tier: 'performance' } as Build, 3)).toBe('Rendimiento');
  });

  it('whatsappUrl formats correctly, drops non-digits from phone, handles qty, skips internalNotes', () => {
    const build: Build = {
      id: 'b1',
      tier: 'balanced',
      totalCents: 15000000, // 150000.00 -> $ 150.000 (actually formatArs logic)
      warnings: [],
      internalNotes: ['some secret'],
      items: [
        { type: 'cpu', componentId: 'c1', tnProductId: 1, tnVariantId: 1, name: 'CPU Intel', priceCents: 5000000, qty: 1 },
        { type: 'ram', componentId: 'r1', tnProductId: 2, tnVariantId: 2, name: 'RAM 8GB', priceCents: 5000000, qty: 2 }
      ]
    };
    
    const url = whatsappUrl('+54 9 264 123-4567', build, 'rec-12345678-abc');
    expect(url.startsWith('https://wa.me/5492641234567?text=')).toBe(true);
    
    const text = decodeURIComponent(url.split('?text=')[1]);
    expect(text).toBe(
`Hola! Quiero consultar por este armado de PC:
- CPU Intel
- RAM 8GB x2
Total: $ 150.000
Código de armado: rec-1234-balanced`);
    
    expect(text).not.toContain('some secret');
  });
});
