import { describe, it, expect } from 'vitest';
import {
  createTnClient,
  TnApiError,
  toSyncVariants,
  type TnProduct,
} from '../src/index.js';

function makeProduct(overrides: Partial<TnProduct> = {}): TnProduct {
  return {
    id: 101,
    handle: { es: 'ryzen-5-5600' },
    name: { es: 'AMD Ryzen 5 5600' },
    attributes: [],
    published: true,
    categories: [
      { id: 1, name: { es: 'Componentes' } },
      { id: 2, name: { es: 'Procesadores' } },
    ],
    variants: [
      {
        id: 1001,
        values: [],
        price: '100',
        promotional_price: null,
        stock: 5,
        sku: 'SKU-5600',
      },
    ],
    ...overrides,
  };
}

describe('toSyncVariants', () => {
  it('producto sin variantes con propiedades produce variantLabel null y categoryPath unido por ", "', () => {
    const product = makeProduct();
    const res = toSyncVariants([product]);

    expect(res.skippedUnmanagedStock).toEqual([]);
    expect(res.variants).toHaveLength(1);
    expect(res.variants[0]).toEqual({
      tnProductId: 101,
      tnVariantId: 1001,
      tnHandle: 'ryzen-5-5600',
      variantLabel: null,
      sku: 'SKU-5600',
      name: 'AMD Ryzen 5 5600',
      categoryPath: 'Componentes, Procesadores',
      priceCents: 10000,
      stock: 5,
      published: true,
    });
  });

  it('producto con 2 propiedades produce variantLabel "Color: Negro, Capacidad: 1 TB"', () => {
    const product = makeProduct({
      attributes: [{ es: 'Color' }, { es: 'Capacidad' }],
      variants: [
        {
          id: 1002,
          values: [{ es: 'Negro' }, { es: '1 TB' }],
          price: '150.00',
          promotional_price: null,
          stock: 3,
          sku: null,
        },
      ],
    });

    const res = toSyncVariants([product]);
    expect(res.variants).toHaveLength(1);
    expect(res.variants[0]?.variantLabel).toBe('Color: Negro, Capacidad: 1 TB');
  });

  it.each([
    { price: '429603.28', expectedCents: 42960328 },
    { price: '100', expectedCents: 10000 },
    { price: '99.5', expectedCents: 9950 },
  ])('convierte precio "$price" a $expectedCents centavos sin punto flotante', ({ price, expectedCents }) => {
    const product = makeProduct({
      variants: [
        {
          id: 1001,
          values: [],
          price,
          promotional_price: null,
          stock: 1,
          sku: null,
        },
      ],
    });

    const res = toSyncVariants([product]);
    expect(res.variants[0]?.priceCents).toBe(expectedCents);
  });

  it('promotional_price gana sobre price cuando no es null', () => {
    const product = makeProduct({
      variants: [
        {
          id: 1001,
          values: [],
          price: '500000.00',
          promotional_price: '429603.28',
          stock: 2,
          sku: 'PROMO-1',
        },
      ],
    });

    const res = toSyncVariants([product]);
    expect(res.variants[0]?.priceCents).toBe(42960328);
  });

  it('variante con stock null va a skippedUnmanagedStock y no a variants', () => {
    const product = makeProduct({
      id: 50,
      variants: [
        {
          id: 501,
          values: [],
          price: '100.00',
          promotional_price: null,
          stock: null,
          sku: 'UNMANAGED',
        },
        {
          id: 502,
          values: [],
          price: '200.00',
          promotional_price: null,
          stock: 4,
          sku: 'MANAGED',
        },
      ],
    });

    const res = toSyncVariants([product]);
    expect(res.variants).toHaveLength(1);
    expect(res.variants[0]?.tnVariantId).toBe(502);
    expect(res.skippedUnmanagedStock).toEqual([{ tnProductId: 50, tnVariantId: 501 }]);
  });

  it('lanza Error si stock es negativo', () => {
    const product = makeProduct({
      variants: [
        {
          id: 1001,
          values: [],
          price: '100.00',
          promotional_price: null,
          stock: -1,
          sku: null,
        },
      ],
    });

    expect(() => toSyncVariants([product])).toThrow();
  });

  it.each([
    {
      desc: 'falta handle.es',
      override: { handle: { pt: 'produto' } },
    },
    {
      desc: 'falta name.es',
      override: { name: { pt: 'Produto' } },
    },
    {
      desc: 'falta es en attributes',
      override: {
        attributes: [{ pt: 'Cor' }],
        variants: [
          {
            id: 1001,
            values: [{ es: 'Negro' }],
            price: '100',
            promotional_price: null,
            stock: 1,
            sku: null,
          },
        ],
      },
    },
    {
      desc: 'falta es en values',
      override: {
        attributes: [{ es: 'Color' }],
        variants: [
          {
            id: 1001,
            values: [{ pt: 'Preto' }],
            price: '100',
            promotional_price: null,
            stock: 1,
            sku: null,
          },
        ],
      },
    },
  ])('lanza Error cuando $desc', ({ override }) => {
    const product = makeProduct(override);
    expect(() => toSyncVariants([product])).toThrow();
  });

  it('lanza Error cuando attributes y values tienen distinto largo', () => {
    const product = makeProduct({
      attributes: [{ es: 'Color' }, { es: 'Capacidad' }],
      variants: [
        {
          id: 1001,
          values: [{ es: 'Negro' }],
          price: '100',
          promotional_price: null,
          stock: 1,
          sku: null,
        },
      ],
    });

    expect(() => toSyncVariants([product])).toThrow();
  });
});

describe('createTnClient', () => {
  function rawProduct(id: number): Record<string, unknown> {
    return {
      id,
      handle: { es: `prod-${id}` },
      name: { es: `Producto ${id}` },
      attributes: [],
      published: true,
      categories: [],
      variants: [
        {
          id: id * 10,
          values: [],
          price: '100.00',
          promotional_price: null,
          stock: 1,
          sku: `SKU-${id}`,
        },
      ],
    };
  }

  it('2 páginas (200 + 3 productos) devuelve 203 productos y pide exactamente las páginas 1 y 2', async () => {
    const requestedUrls: string[] = [];
    const page1 = Array.from({ length: 200 }, (_, i) => rawProduct(i + 1));
    const page2 = Array.from({ length: 3 }, (_, i) => rawProduct(201 + i));

    const fakeFetch: typeof fetch = async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes('page=1')) {
        return new Response(JSON.stringify(page1), { status: 200 });
      }
      if (url.includes('page=2')) {
        return new Response(JSON.stringify(page2), { status: 200 });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const client = createTnClient({
      storeId: 12345,
      accessToken: 'secret-token',
      userAgent: 'TestAgent (test@example.com)',
      fetch: fakeFetch,
    });

    const products = await client.listProducts();
    expect(products).toHaveLength(203);
    expect(requestedUrls).toEqual([
      'https://api.tiendanube.com/v1/12345/products?per_page=200&page=1&fields=id,handle,name,attributes,published,categories,variants',
      'https://api.tiendanube.com/v1/12345/products?per_page=200&page=2&fields=id,handle,name,attributes,published,categories,variants',
    ]);
  });

  it('página exacta de 200 seguida de 404 en la página 2 devuelve 200 productos', async () => {
    const requestedUrls: string[] = [];
    const page1 = Array.from({ length: 200 }, (_, i) => rawProduct(i + 1));

    const fakeFetch: typeof fetch = async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes('page=1')) {
        return new Response(JSON.stringify(page1), { status: 200 });
      }
      if (url.includes('page=2')) {
        return new Response(JSON.stringify({ code: 404, message: 'Not Found' }), { status: 404 });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const client = createTnClient({
      storeId: 12345,
      accessToken: 'secret-token',
      userAgent: 'TestAgent (test@example.com)',
      fetch: fakeFetch,
    });

    const products = await client.listProducts();
    expect(products).toHaveLength(200);
    expect(requestedUrls).toHaveLength(2);
  });

  it('429 con Retry-After: 2 y luego 200 reintenta la misma página y llama sleep(2000)', async () => {
    const sleepCalls: number[] = [];
    const requestedUrls: string[] = [];
    let attempt = 0;

    const fakeFetch: typeof fetch = async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      attempt++;
      if (attempt === 1) {
        return new Response('Too Many Requests', {
          status: 429,
          headers: { 'Retry-After': '2' },
        });
      }
      return new Response(JSON.stringify([rawProduct(1)]), { status: 200 });
    };

    const client = createTnClient({
      storeId: 12345,
      accessToken: 'secret-token',
      userAgent: 'TestAgent (test@example.com)',
      fetch: fakeFetch,
      sleep: async (ms) => {
        sleepCalls.push(ms);
      },
    });

    const products = await client.listProducts();
    expect(products).toHaveLength(1);
    expect(sleepCalls).toEqual([2000]);
    expect(requestedUrls).toHaveLength(2);
    expect(requestedUrls[0]).toBe(requestedUrls[1]);
  });

  it('429 cuatro veces seguidas lanza Error después de 3 reintentos', async () => {
    const sleepCalls: number[] = [];
    let calls = 0;

    const fakeFetch: typeof fetch = async () => {
      calls++;
      return new Response('Rate limit exceeded', { status: 429 });
    };

    const client = createTnClient({
      storeId: 12345,
      accessToken: 'secret-token',
      userAgent: 'TestAgent (test@example.com)',
      fetch: fakeFetch,
      sleep: async (ms) => {
        sleepCalls.push(ms);
      },
    });

    await expect(client.listProducts()).rejects.toThrow();
    expect(calls).toBe(4);
    expect(sleepCalls).toEqual([1000, 1000, 1000]);
  });

  it('401 lanza TnApiError con status 401 y sin incluir el token', async () => {
    const secretToken = 'super-secret-token-xyz';
    const fakeFetch: typeof fetch = async () => {
      return new Response('Unauthorized access to store', { status: 401 });
    };

    const client = createTnClient({
      storeId: 12345,
      accessToken: secretToken,
      userAgent: 'TestAgent (test@example.com)',
      fetch: fakeFetch,
    });

    let caught: unknown;
    try {
      await client.listProducts();
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(TnApiError);
    const apiErr = caught as TnApiError;
    expect(apiErr.status).toBe(401);
    expect(apiErr.message).toContain('Unauthorized access to store');
    expect(apiErr.message).not.toContain(secretToken);
  });

  it('los headers enviados incluyen Authentication: bearer X y User-Agent', async () => {
    let capturedHeaders: Record<string, string> = {};

    const fakeFetch: typeof fetch = async (_input, init) => {
      const headers = new Headers(init?.headers);
      capturedHeaders = {
        authentication: headers.get('Authentication') ?? '',
        userAgent: headers.get('User-Agent') ?? '',
      };
      return new Response(JSON.stringify([rawProduct(1)]), { status: 200 });
    };

    const client = createTnClient({
      storeId: 12345,
      accessToken: 'X',
      userAgent: 'MyStore (admin@mystore.com)',
      fetch: fakeFetch,
    });

    await client.listProducts();
    expect(capturedHeaders.authentication).toBe('bearer X');
    expect(capturedHeaders.userAgent).toBe('MyStore (admin@mystore.com)');
  });

  it('una variante con cost en el JSON es parseada descartando cost', async () => {
    const productWithCost = {
      ...rawProduct(1),
      variants: [
        {
          id: 10,
          values: [],
          price: '100.00',
          promotional_price: null,
          stock: 5,
          sku: 'SKU-1',
          cost: '50.00',
        },
      ],
    };

    const fakeFetch: typeof fetch = async () => {
      return new Response(JSON.stringify([productWithCost]), { status: 200 });
    };

    const client = createTnClient({
      storeId: 12345,
      accessToken: 'X',
      userAgent: 'MyStore (admin@mystore.com)',
      fetch: fakeFetch,
    });

    const products = await client.listProducts();
    expect(products).toHaveLength(1);
    const variant = products[0]?.variants[0];
    expect(variant).toBeDefined();
    expect('cost' in (variant ?? {})).toBe(false);
  });
});
