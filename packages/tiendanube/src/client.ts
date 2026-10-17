import { z } from 'zod';
import { TnProductSchema, type TnProduct } from './schemas.js';

export class TnApiError extends Error {
  readonly status: number;

  constructor(status: number, bodySnippet: string) {
    super(`Tiendanube API error ${status}: ${bodySnippet}`);
    this.name = 'TnApiError';
    this.status = status;
  }
}

export interface CreateTnClientOptions {
  storeId: number;
  accessToken: string;
  userAgent: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_SLEEP = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const PER_PAGE = 200;
const FIELDS = 'id,handle,name,attributes,published,categories,variants';
const MAX_RATE_LIMIT_RETRIES = 3;

export function createTnClient(opts: CreateTnClientOptions): {
  listProducts(): Promise<TnProduct[]>;
} {
  const fetchFn = opts.fetch ?? globalThis.fetch;
  const sleepFn = opts.sleep ?? DEFAULT_SLEEP;

  return {
    async listProducts(): Promise<TnProduct[]> {
      const allProducts: TnProduct[] = [];
      let page = 1;

      while (true) {
        const url = `https://api.tiendanube.com/v1/${opts.storeId}/products?per_page=${PER_PAGE}&page=${page}&fields=${FIELDS}`;
        let retries = 0;
        let response: Response;

        while (true) {
          response = await fetchFn(url, {
            method: 'GET',
            headers: {
              Authentication: `bearer ${opts.accessToken}`,
              'User-Agent': opts.userAgent,
            },
          });

          if (response.status === 429) {
            if (retries >= MAX_RATE_LIMIT_RETRIES) {
              throw new Error(
                `Tiendanube rate limit (429) exceeded after ${MAX_RATE_LIMIT_RETRIES} retries on page ${page}`,
              );
            }
            const retryAfterHeader = response.headers.get('Retry-After');
            let waitMs = 1000;
            if (retryAfterHeader !== null) {
              const parsedSeconds = Number(retryAfterHeader);
              if (Number.isFinite(parsedSeconds) && parsedSeconds >= 0) {
                waitMs = parsedSeconds * 1000;
              }
            }
            retries++;
            await sleepFn(waitMs);
            continue;
          }

          break;
        }

        if (response.status === 404 && page > 1) {
          break;
        }

        if (!response.ok) {
          const text = await response.text();
          throw new TnApiError(response.status, text.slice(0, 200));
        }

        const data: unknown = await response.json();
        const parsed = z.array(TnProductSchema).safeParse(data);
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          const issueDesc = issue
            ? `${issue.path.join('.')}: ${issue.message}`
            : parsed.error.message;
          throw new Error(`Invalid Tiendanube product response on page ${page}: ${issueDesc}`);
        }

        allProducts.push(...parsed.data);

        if (parsed.data.length < PER_PAGE) {
          break;
        }

        page++;
      }

      return allProducts;
    },
  };
}
