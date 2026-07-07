import { createRiotRateLimiter, type CompositeRateLimiter } from './rateLimiter';
import { toRegionalRoute, type PlatformRegion, type RegionalRoute } from './regions';

export class RiotApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'RiotApiError';
  }
}

export class RiotRateLimitedError extends RiotApiError {
  constructor() {
    super('Rate limited by Riot API', 429);
    this.name = 'RiotRateLimitedError';
  }
}

/**
 * Retry behaviour for a single fetch. Opt-in per call so interactive requests
 * (profile page) can do a single quick retry while background jobs (timeline
 * ingestion) can do full exponential backoff. Defaults to no retries so the
 * caller sees a 429 immediately unless it asks otherwise.
 */
export interface RetryPolicy {
  /** Max retry attempts after the first try. Default 0 (no retry). */
  maxRetries?: number;
  /** Base delay for exponential backoff, doubled per attempt. Default 500ms. */
  baseDelayMs?: number;
  /** Upper bound on any single wait. Default 10_000ms. */
  maxDelayMs?: number;
  /** Injectable sleep, mainly for tests. Default real setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

export interface RiotFetchOptions {
  revalidateSeconds: number;
  retry?: RetryPolicy;
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Parse the `Retry-After` header (delta-seconds) into milliseconds; 0 if absent/invalid. */
function retryAfterMs(response: { headers?: { get?(name: string): string | null } }): number {
  const raw = response.headers?.get?.('retry-after');
  const seconds = raw ? Number(raw) : NaN;
  return Number.isFinite(seconds) ? seconds * 1_000 : 0;
}

function defaultApiKey(): string {
  const key = process.env.RIOT_API_KEY;
  if (!key) {
    throw new Error('RIOT_API_KEY is not set. Add it to .env.local.');
  }
  return key;
}

export class RiotClient {
  constructor(
    private readonly limiter: CompositeRateLimiter = createRiotRateLimiter(),
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly getApiKey: () => string = defaultApiKey
  ) {}

  async fetch<T>(
    host: PlatformRegion | RegionalRoute,
    path: string,
    options: RiotFetchOptions
  ): Promise<T> {
    const { maxRetries = 0, baseDelayMs = 500, maxDelayMs = 10_000, sleep = realSleep } =
      options.retry ?? {};
    const url = `https://${host}.api.riotgames.com${path}`;

    for (let attempt = 0; ; attempt++) {
      // Local token-bucket limiter: wait for a token to free up if we can retry.
      if (!this.limiter.tryConsume()) {
        if (attempt < maxRetries) {
          await sleep(Math.min(this.limiter.msUntilAvailable(), maxDelayMs));
          continue;
        }
        throw new RiotRateLimitedError();
      }

      const response = await this.fetchImpl(url, {
        headers: { 'X-Riot-Token': this.getApiKey() },
        next: { revalidate: options.revalidateSeconds },
      } as RequestInit);

      if (response.status === 404) {
        throw new RiotApiError('Not found', 404);
      }
      if (response.status === 429) {
        // Respect Retry-After, but never wait less than exponential backoff.
        if (attempt < maxRetries) {
          const backoff = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
          await sleep(Math.max(retryAfterMs(response), backoff));
          continue;
        }
        throw new RiotRateLimitedError();
      }
      if (!response.ok) {
        throw new RiotApiError(`Riot API error: ${response.status}`, response.status);
      }

      return (await response.json()) as T;
    }
  }

  platformFetch<T>(platform: PlatformRegion, path: string, options: RiotFetchOptions): Promise<T> {
    return this.fetch<T>(platform, path, options);
  }

  regionalFetch<T>(platform: PlatformRegion, path: string, options: RiotFetchOptions): Promise<T> {
    return this.fetch<T>(toRegionalRoute(platform), path, options);
  }
}

export const riotClient = new RiotClient();
