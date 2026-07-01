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

export interface RiotFetchOptions {
  revalidateSeconds: number;
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
    if (!this.limiter.tryConsume()) {
      throw new RiotRateLimitedError();
    }

    const url = `https://${host}.api.riotgames.com${path}`;
    const response = await this.fetchImpl(url, {
      headers: { 'X-Riot-Token': this.getApiKey() },
      next: { revalidate: options.revalidateSeconds },
    } as RequestInit);

    if (response.status === 404) {
      throw new RiotApiError('Not found', 404);
    }
    if (response.status === 429) {
      throw new RiotRateLimitedError();
    }
    if (!response.ok) {
      throw new RiotApiError(`Riot API error: ${response.status}`, response.status);
    }

    return (await response.json()) as T;
  }

  platformFetch<T>(platform: PlatformRegion, path: string, options: RiotFetchOptions): Promise<T> {
    return this.fetch<T>(platform, path, options);
  }

  regionalFetch<T>(platform: PlatformRegion, path: string, options: RiotFetchOptions): Promise<T> {
    return this.fetch<T>(toRegionalRoute(platform), path, options);
  }
}

export const riotClient = new RiotClient();
