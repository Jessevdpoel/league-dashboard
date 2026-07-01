# League Dashboard (op.gg Functionality Clone) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js + TypeScript app that replicates op.gg's summoner search, profile/rank display, and match history using the real Riot Games API, with a visual layout deliberately distinct from op.gg's.

**Architecture:** Next.js App Router with Server Components fetching Riot data directly for page render, backed by a rate-limited, cached Riot API client module (`lib/riot/`). A single Route Handler proxies match-detail lookups for client-side "expand match" interactions. No database, no accounts.

**Tech Stack:** Next.js (App Router), React, TypeScript, Tailwind CSS, Vitest + React Testing Library.

## Global Constraints

- Stack is Next.js App Router + TypeScript (per spec Architecture section) — do not introduce Pages Router, a separate Express server, or a non-TypeScript source file.
- `RIOT_API_KEY` is read only from `process.env` in server-side code (`lib/riot/client.ts` and Server Components/Route Handlers); it must never be passed to a Client Component or appear in any response body.
- Riot dev key rate limits: 20 requests/1 second, 100 requests/2 minutes (per spec Architecture section) — all outgoing Riot calls must go through the shared rate limiter in `lib/riot/client.ts`, no direct `fetch` calls to `*.api.riotgames.com` from anywhere else.
- No user accounts, no database, no persisted state (per spec Scope) — every page is derived from a live (or Next.js `fetch`-cached) Riot API response.
- No champion tier list feature (per spec Scope) — do not add win/pick/ban rate UI or endpoints.
- Supported regions for this iteration (locking spec's open item): `na1`, `euw1`, `eun1`, `kr`, `jp1`, `br1`, mapped to regional routing `americas` (na1, br1), `europe` (euw1, eun1), `asia` (kr, jp1).
- Visual direction (per spec): left-hand vertical nav rail (not a top bar), card-grid dashboard for profile stats (not stacked), match history as a vertical timeline (not flat rows), charcoal/graphite background with gold/amber accent, a distinct display font for headings paired with a plain sans for data-dense areas.
- Search is submit-on-enter only — no live/as-you-type autocomplete calls to the API (per spec Scope).
- Testing: Vitest unit tests for `lib/riot/` and rate limiter with mocked `fetch` (no real network calls in tests); component tests with React Testing Library for interactive UI. No e2e tests in this plan.

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `next-env.d.ts`
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `app/globals.css`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `.env.local.example`
- Create: `.gitignore`
- Create: `tests/smoke.test.ts`
- Modify: `README.md`

**Interfaces:**
- Produces: `@/*` TypeScript path alias resolving to the project root, used by every later task's imports (e.g. `@/lib/riot/client`, `@/components/NavRail`). Vitest config must resolve the same alias so tests can use identical import paths.
- Produces: `npm test` (runs Vitest once) and `npm run dev` (starts the Next.js dev server) as the standard commands every later task uses to verify its work.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "league-dashboard",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@types/node": "^22.7.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.3",
    "autoprefixer": "^10.4.20",
    "eslint": "^8.57.0",
    "eslint-config-next": "^15.0.0",
    "jsdom": "^25.0.1",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.14",
    "typescript": "^5.6.3",
    "vitest": "^2.1.3"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `next-env.d.ts`**

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

- [ ] **Step 4: Create `next.config.ts`**

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default nextConfig;
```

- [ ] **Step 5: Create `tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        charcoal: {
          800: '#2a2622',
          900: '#1c1a17',
          950: '#121110',
        },
        gold: {
          100: '#f5e9c8',
          200: '#e9d6a0',
          300: '#dcc178',
          400: '#c9a24f',
          500: '#b3893a',
          700: '#8a6a2c',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'serif'],
        sans: ['var(--font-body)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 6: Create `postcss.config.js`**

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 7: Create `app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply bg-charcoal-950 text-gold-100 font-sans;
}
```

- [ ] **Step 8: Create minimal `app/layout.tsx` and `app/page.tsx`**

`app/layout.tsx`:

```tsx
import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'League Dashboard',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`app/page.tsx`:

```tsx
export default function HomePage() {
  return <p>League Dashboard</p>;
}
```

(Both are placeholders — Task 7 replaces them with the full themed shell.)

- [ ] **Step 9: Create `vitest.config.ts` and `vitest.setup.ts`**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
```

`vitest.setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 10: Create `.env.local.example` and `.gitignore`**

`.env.local.example`:

```
# Get a personal dev key from https://developer.riotgames.com/ (expires every 24h, renew manually during development)
RIOT_API_KEY=your-dev-key-here
```

`.gitignore`:

```
node_modules/
.next/
out/
.env*.local
*.tsbuildinfo
```

- [ ] **Step 11: Create a smoke test at `tests/smoke.test.ts`**

```ts
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('runs', () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 12: Install dependencies**

Run: `npm install`
Expected: installs without errors, creates `node_modules/` and `package-lock.json`.

- [ ] **Step 13: Run the smoke test to verify the toolchain works**

Run: `npm test`
Expected: PASS — `tests/smoke.test.ts` shows 1 passed test.

- [ ] **Step 14: Verify the dev server boots**

Run: `npm run dev` (start it, confirm it logs `Ready` / listens on `http://localhost:3000`, then stop it)
Expected: no build errors; visiting `http://localhost:3000` shows the plain "League Dashboard" text from the placeholder `app/page.tsx`.

- [ ] **Step 15: Rewrite `README.md`**

```markdown
# League Dashboard

A summoner search, rank, and match history dashboard built on the real Riot Games API — an op.gg *functionality* clone with a distinct visual layout (see `docs/superpowers/specs/2026-07-01-opgg-clone-design.md`).

## Setup

1. `npm install`
2. Get a personal Riot developer API key from https://developer.riotgames.com/ (requires a Riot account; the key expires every 24 hours and must be renewed manually during development).
3. Copy `.env.local.example` to `.env.local` and paste your key in as `RIOT_API_KEY`.
4. `npm run dev` and open http://localhost:3000.

## Testing

`npm test` runs the unit and component test suite (Vitest + React Testing Library). No real Riot API calls are made in tests — all Riot responses are mocked.
```

- [ ] **Step 16: Commit**

```bash
git add package.json tsconfig.json next.config.ts next-env.d.ts tailwind.config.ts postcss.config.js vitest.config.ts vitest.setup.ts app/globals.css app/layout.tsx app/page.tsx .env.local.example .gitignore tests/smoke.test.ts README.md package-lock.json
git commit -m "chore: scaffold Next.js + TypeScript + Tailwind + Vitest project"
```

---

### Task 2: Region routing and rate limiter

**Files:**
- Create: `lib/riot/regions.ts`
- Create: `lib/riot/rateLimiter.ts`
- Test: `tests/riot/regions.test.ts`
- Test: `tests/riot/rateLimiter.test.ts`

**Interfaces:**
- Consumes: nothing (pure, foundational modules).
- Produces:
  - `type PlatformRegion = 'na1' | 'euw1' | 'eun1' | 'kr' | 'jp1' | 'br1'`
  - `type RegionalRoute = 'americas' | 'europe' | 'asia'`
  - `const PLATFORM_REGIONS: PlatformRegion[]`
  - `function isPlatformRegion(value: string): value is PlatformRegion`
  - `function toRegionalRoute(platform: PlatformRegion): RegionalRoute`
  - `function platformFromMatchId(matchId: string): PlatformRegion` (throws if the prefix isn't a known platform region)
  - `class TokenBucket` with `constructor(capacity: number, windowMs: number, now?: number)`, `hasToken(now?: number): boolean`, `consume(now?: number): void`, `msUntilNextToken(now?: number): number`
  - `class CompositeRateLimiter` with `constructor(buckets: TokenBucket[])`, `tryConsume(now?: number): boolean`, `msUntilAvailable(now?: number): number`
  - `function createRiotRateLimiter(now?: number): CompositeRateLimiter` (20/1s + 100/120s buckets)

- [ ] **Step 1: Write failing tests for `lib/riot/regions.ts`**

`tests/riot/regions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isPlatformRegion, toRegionalRoute, platformFromMatchId } from '../../lib/riot/regions';

describe('regions', () => {
  it('recognizes valid platform regions', () => {
    expect(isPlatformRegion('na1')).toBe(true);
    expect(isPlatformRegion('xx9')).toBe(false);
  });

  it('maps platform region to correct regional route', () => {
    expect(toRegionalRoute('na1')).toBe('americas');
    expect(toRegionalRoute('br1')).toBe('americas');
    expect(toRegionalRoute('euw1')).toBe('europe');
    expect(toRegionalRoute('eun1')).toBe('europe');
    expect(toRegionalRoute('kr')).toBe('asia');
    expect(toRegionalRoute('jp1')).toBe('asia');
  });

  it('derives the platform region from a match id prefix', () => {
    expect(platformFromMatchId('NA1_4567890123')).toBe('na1');
    expect(platformFromMatchId('EUW1_1111111111')).toBe('euw1');
  });

  it('throws for an unrecognized match id prefix', () => {
    expect(() => platformFromMatchId('ZZ9_123')).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/riot/regions.test.ts`
Expected: FAIL — `lib/riot/regions` module not found.

- [ ] **Step 3: Implement `lib/riot/regions.ts`**

```ts
export type PlatformRegion = 'na1' | 'euw1' | 'eun1' | 'kr' | 'jp1' | 'br1';
export type RegionalRoute = 'americas' | 'europe' | 'asia';

export const PLATFORM_REGIONS: PlatformRegion[] = ['na1', 'euw1', 'eun1', 'kr', 'jp1', 'br1'];

const PLATFORM_TO_REGIONAL: Record<PlatformRegion, RegionalRoute> = {
  na1: 'americas',
  br1: 'americas',
  euw1: 'europe',
  eun1: 'europe',
  kr: 'asia',
  jp1: 'asia',
};

export function isPlatformRegion(value: string): value is PlatformRegion {
  return (PLATFORM_REGIONS as string[]).includes(value);
}

export function toRegionalRoute(platform: PlatformRegion): RegionalRoute {
  return PLATFORM_TO_REGIONAL[platform];
}

export function platformFromMatchId(matchId: string): PlatformRegion {
  const prefix = matchId.split('_')[0]?.toLowerCase();
  if (!prefix || !isPlatformRegion(prefix)) {
    throw new Error(`Cannot determine platform region from match id: ${matchId}`);
  }
  return prefix;
}
```

- [ ] **Step 4: Run to verify regions tests pass**

Run: `npm test -- tests/riot/regions.test.ts`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Write failing tests for `lib/riot/rateLimiter.ts`**

`tests/riot/rateLimiter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TokenBucket, CompositeRateLimiter, createRiotRateLimiter } from '../../lib/riot/rateLimiter';

describe('TokenBucket', () => {
  it('allows consuming up to capacity within the window', () => {
    const bucket = new TokenBucket(2, 1000, 0);
    expect(bucket.hasToken(0)).toBe(true);
    bucket.consume(0);
    expect(bucket.hasToken(0)).toBe(true);
    bucket.consume(0);
    expect(bucket.hasToken(0)).toBe(false);
  });

  it('refills after the window elapses', () => {
    const bucket = new TokenBucket(1, 1000, 0);
    bucket.consume(0);
    expect(bucket.hasToken(500)).toBe(false);
    expect(bucket.hasToken(1000)).toBe(true);
  });
});

describe('CompositeRateLimiter', () => {
  it('only consumes when every bucket has capacity', () => {
    const limiter = new CompositeRateLimiter([
      new TokenBucket(1, 1000, 0),
      new TokenBucket(5, 1000, 0),
    ]);
    expect(limiter.tryConsume(0)).toBe(true);
    expect(limiter.tryConsume(0)).toBe(false);
  });
});

describe('createRiotRateLimiter', () => {
  it('allows 20 calls in the first second and rejects the 21st', () => {
    const limiter = createRiotRateLimiter(0);
    for (let i = 0; i < 20; i += 1) {
      expect(limiter.tryConsume(0)).toBe(true);
    }
    expect(limiter.tryConsume(0)).toBe(false);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm test -- tests/riot/rateLimiter.test.ts`
Expected: FAIL — `lib/riot/rateLimiter` module not found.

- [ ] **Step 7: Implement `lib/riot/rateLimiter.ts`**

```ts
export class TokenBucket {
  private tokens: number;
  private windowStart: number;

  constructor(
    private readonly capacity: number,
    private readonly windowMs: number,
    now: number = Date.now()
  ) {
    this.tokens = capacity;
    this.windowStart = now;
  }

  private refillIfNeeded(now: number): void {
    if (now - this.windowStart >= this.windowMs) {
      this.tokens = this.capacity;
      this.windowStart = now;
    }
  }

  hasToken(now: number = Date.now()): boolean {
    this.refillIfNeeded(now);
    return this.tokens > 0;
  }

  consume(now: number = Date.now()): void {
    this.refillIfNeeded(now);
    this.tokens = Math.max(0, this.tokens - 1);
  }

  msUntilNextToken(now: number = Date.now()): number {
    this.refillIfNeeded(now);
    if (this.tokens > 0) return 0;
    return this.windowMs - (now - this.windowStart);
  }
}

export class CompositeRateLimiter {
  constructor(private readonly buckets: TokenBucket[]) {}

  tryConsume(now: number = Date.now()): boolean {
    if (!this.buckets.every((bucket) => bucket.hasToken(now))) {
      return false;
    }
    this.buckets.forEach((bucket) => bucket.consume(now));
    return true;
  }

  msUntilAvailable(now: number = Date.now()): number {
    return Math.max(0, ...this.buckets.map((bucket) => bucket.msUntilNextToken(now)));
  }
}

export function createRiotRateLimiter(now: number = Date.now()): CompositeRateLimiter {
  return new CompositeRateLimiter([
    new TokenBucket(20, 1_000, now),
    new TokenBucket(100, 120_000, now),
  ]);
}
```

- [ ] **Step 8: Run to verify rate limiter tests pass**

Run: `npm test -- tests/riot/rateLimiter.test.ts`
Expected: PASS — 4 tests passed.

- [ ] **Step 9: Commit**

```bash
git add lib/riot/regions.ts lib/riot/rateLimiter.ts tests/riot/regions.test.ts tests/riot/rateLimiter.test.ts
git commit -m "feat: add region routing and rate limiter modules"
```

---

### Task 3: Riot API client core

**Files:**
- Create: `lib/riot/client.ts`
- Test: `tests/riot/client.test.ts`

**Interfaces:**
- Consumes: `CompositeRateLimiter`, `createRiotRateLimiter` from `lib/riot/rateLimiter` (Task 2); `PlatformRegion`, `RegionalRoute`, `toRegionalRoute` from `lib/riot/regions` (Task 2).
- Produces:
  - `class RiotApiError extends Error { status: number }`
  - `class RiotRateLimitedError extends RiotApiError` (status 429)
  - `interface RiotFetchOptions { revalidateSeconds: number }`
  - `class RiotClient` with `constructor(limiter?: CompositeRateLimiter, fetchImpl?: typeof fetch, getApiKey?: () => string)`, methods `fetch<T>(host: PlatformRegion | RegionalRoute, path: string, options: RiotFetchOptions): Promise<T>`, `platformFetch<T>(platform: PlatformRegion, path: string, options: RiotFetchOptions): Promise<T>`, `regionalFetch<T>(platform: PlatformRegion, path: string, options: RiotFetchOptions): Promise<T>`
  - `const riotClient: RiotClient` (default singleton, reads `RIOT_API_KEY` from `process.env`) — this is what Task 4 and Task 5's endpoint wrapper modules import and call.

- [ ] **Step 1: Write failing tests for `lib/riot/client.ts`**

`tests/riot/client.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { RiotClient, RiotApiError, RiotRateLimitedError } from '../../lib/riot/client';
import { CompositeRateLimiter, TokenBucket } from '../../lib/riot/rateLimiter';

function fakeFetch(status: number, body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

describe('RiotClient', () => {
  it('returns parsed JSON on success', async () => {
    const client = new RiotClient(
      new CompositeRateLimiter([new TokenBucket(10, 1000, 0)]),
      fakeFetch(200, { hello: 'world' }),
      () => 'fake-key'
    );
    const result = await client.platformFetch('na1', '/some/path', { revalidateSeconds: 60 });
    expect(result).toEqual({ hello: 'world' });
  });

  it('throws RiotApiError with status 404 when not found', async () => {
    const client = new RiotClient(
      new CompositeRateLimiter([new TokenBucket(10, 1000, 0)]),
      fakeFetch(404, {}),
      () => 'fake-key'
    );
    await expect(
      client.platformFetch('na1', '/missing', { revalidateSeconds: 60 })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('throws RiotRateLimitedError when the local bucket is exhausted', async () => {
    const client = new RiotClient(
      new CompositeRateLimiter([new TokenBucket(1, 1000, 0)]),
      fakeFetch(200, {}),
      () => 'fake-key'
    );
    await client.platformFetch('na1', '/a', { revalidateSeconds: 60 });
    await expect(
      client.platformFetch('na1', '/b', { revalidateSeconds: 60 })
    ).rejects.toBeInstanceOf(RiotRateLimitedError);
  });

  it('throws RiotRateLimitedError when Riot responds 429', async () => {
    const client = new RiotClient(
      new CompositeRateLimiter([new TokenBucket(10, 1000, 0)]),
      fakeFetch(429, {}),
      () => 'fake-key'
    );
    await expect(
      client.platformFetch('na1', '/a', { revalidateSeconds: 60 })
    ).rejects.toBeInstanceOf(RiotRateLimitedError);
  });

  it('regionalFetch resolves the platform to its regional route', async () => {
    const fetchImpl = fakeFetch(200, {});
    const client = new RiotClient(
      new CompositeRateLimiter([new TokenBucket(10, 1000, 0)]),
      fetchImpl,
      () => 'fake-key'
    );
    await client.regionalFetch('na1', '/lol/match/v5/matches/NA1_1', { revalidateSeconds: 60 });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://americas.api.riotgames.com/lol/match/v5/matches/NA1_1',
      expect.any(Object)
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/riot/client.test.ts`
Expected: FAIL — `lib/riot/client` module not found.

- [ ] **Step 3: Implement `lib/riot/client.ts`**

```ts
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
```

- [ ] **Step 4: Run to verify client tests pass**

Run: `npm test -- tests/riot/client.test.ts`
Expected: PASS — 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add lib/riot/client.ts tests/riot/client.test.ts
git commit -m "feat: add rate-limited Riot API client"
```

---

### Task 4: Riot API types and Account/Summoner/League wrappers

**Files:**
- Create: `lib/riot/types.ts`
- Create: `lib/riot/account.ts`
- Create: `lib/riot/summoner.ts`
- Create: `lib/riot/league.ts`
- Test: `tests/riot/account.test.ts`
- Test: `tests/riot/summoner.test.ts`
- Test: `tests/riot/league.test.ts`

**Interfaces:**
- Consumes: `riotClient` from `lib/riot/client` (Task 3); `PlatformRegion`, `toRegionalRoute` from `lib/riot/regions` (Task 2).
- Produces:
  - `interface AccountDto { puuid: string; gameName: string; tagLine: string }`
  - `interface SummonerDto { id: string; accountId: string; puuid: string; profileIconId: number; summonerLevel: number }`
  - `interface LeagueEntryDto { queueType: string; tier: string; rank: string; leaguePoints: number; wins: number; losses: number }`
  - `function getAccountByRiotId(platform: PlatformRegion, gameName: string, tagLine: string): Promise<AccountDto>`
  - `function getSummonerByPuuid(platform: PlatformRegion, puuid: string): Promise<SummonerDto>`
  - `function getLeagueEntriesBySummonerId(platform: PlatformRegion, summonerId: string): Promise<LeagueEntryDto[]>`

- [ ] **Step 1: Create `lib/riot/types.ts`** (shared types used across this and later tasks; no test needed for type-only declarations)

```ts
export interface AccountDto {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export interface SummonerDto {
  id: string;
  accountId: string;
  puuid: string;
  profileIconId: number;
  summonerLevel: number;
}

export interface LeagueEntryDto {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
}

export interface ParticipantDto {
  puuid: string;
  riotIdGameName: string;
  riotIdTagline: string;
  championName: string;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
  teamId: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
  summoner1Id: number;
  summoner2Id: number;
  totalDamageDealtToChampions: number;
  visionScore: number;
}

export interface MatchDto {
  metadata: {
    matchId: string;
    participants: string[];
  };
  info: {
    gameCreation: number;
    gameDuration: number;
    queueId: number;
    participants: ParticipantDto[];
  };
}
```

- [ ] **Step 2: Write failing test for `lib/riot/account.ts`**

`tests/riot/account.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { riotClient } from '../../lib/riot/client';
import { getAccountByRiotId } from '../../lib/riot/account';

vi.mock('../../lib/riot/client', () => ({
  riotClient: { fetch: vi.fn().mockResolvedValue({ puuid: 'abc', gameName: 'Foo', tagLine: 'NA1' }) },
}));

describe('getAccountByRiotId', () => {
  it('requests the regional account endpoint with the encoded name and tag', async () => {
    const result = await getAccountByRiotId('na1', 'Foo Bar', 'NA1');
    expect(riotClient.fetch).toHaveBeenCalledWith(
      'americas',
      '/riot/account/v1/accounts/by-riot-id/Foo%20Bar/NA1',
      { revalidateSeconds: 3600 }
    );
    expect(result.puuid).toBe('abc');
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- tests/riot/account.test.ts`
Expected: FAIL — `lib/riot/account` module not found.

- [ ] **Step 4: Implement `lib/riot/account.ts`**

```ts
import { riotClient } from './client';
import { toRegionalRoute, type PlatformRegion } from './regions';
import type { AccountDto } from './types';

export function getAccountByRiotId(
  platform: PlatformRegion,
  gameName: string,
  tagLine: string
): Promise<AccountDto> {
  const path = `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  return riotClient.fetch<AccountDto>(toRegionalRoute(platform), path, { revalidateSeconds: 3600 });
}
```

- [ ] **Step 5: Run to verify account test passes**

Run: `npm test -- tests/riot/account.test.ts`
Expected: PASS — 1 test passed.

- [ ] **Step 6: Write failing test for `lib/riot/summoner.ts`**

`tests/riot/summoner.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { riotClient } from '../../lib/riot/client';
import { getSummonerByPuuid } from '../../lib/riot/summoner';

vi.mock('../../lib/riot/client', () => ({
  riotClient: {
    platformFetch: vi.fn().mockResolvedValue({ id: 'sid', accountId: 'aid', puuid: 'abc', profileIconId: 1, summonerLevel: 200 }),
  },
}));

describe('getSummonerByPuuid', () => {
  it('requests the platform summoner-by-puuid endpoint', async () => {
    const result = await getSummonerByPuuid('na1', 'abc');
    expect(riotClient.platformFetch).toHaveBeenCalledWith(
      'na1',
      '/lol/summoner/v4/summoners/by-puuid/abc',
      { revalidateSeconds: 60 }
    );
    expect(result.summonerLevel).toBe(200);
  });
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `npm test -- tests/riot/summoner.test.ts`
Expected: FAIL — `lib/riot/summoner` module not found.

- [ ] **Step 8: Implement `lib/riot/summoner.ts`**

```ts
import { riotClient } from './client';
import type { PlatformRegion } from './regions';
import type { SummonerDto } from './types';

export function getSummonerByPuuid(platform: PlatformRegion, puuid: string): Promise<SummonerDto> {
  const path = `/lol/summoner/v4/summoners/by-puuid/${puuid}`;
  return riotClient.platformFetch<SummonerDto>(platform, path, { revalidateSeconds: 60 });
}
```

- [ ] **Step 9: Run to verify summoner test passes**

Run: `npm test -- tests/riot/summoner.test.ts`
Expected: PASS — 1 test passed.

- [ ] **Step 10: Write failing test for `lib/riot/league.ts`**

`tests/riot/league.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { riotClient } from '../../lib/riot/client';
import { getLeagueEntriesBySummonerId } from '../../lib/riot/league';

vi.mock('../../lib/riot/client', () => ({
  riotClient: {
    platformFetch: vi.fn().mockResolvedValue([
      { queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', rank: 'II', leaguePoints: 42, wins: 6, losses: 4 },
    ]),
  },
}));

describe('getLeagueEntriesBySummonerId', () => {
  it('requests the platform league-entries-by-summoner endpoint', async () => {
    const result = await getLeagueEntriesBySummonerId('na1', 'sid');
    expect(riotClient.platformFetch).toHaveBeenCalledWith(
      'na1',
      '/lol/league/v4/entries/by-summoner/sid',
      { revalidateSeconds: 60 }
    );
    expect(result).toHaveLength(1);
    expect(result[0].tier).toBe('GOLD');
  });
});
```

- [ ] **Step 11: Run to verify it fails**

Run: `npm test -- tests/riot/league.test.ts`
Expected: FAIL — `lib/riot/league` module not found.

- [ ] **Step 12: Implement `lib/riot/league.ts`**

```ts
import { riotClient } from './client';
import type { PlatformRegion } from './regions';
import type { LeagueEntryDto } from './types';

export function getLeagueEntriesBySummonerId(
  platform: PlatformRegion,
  summonerId: string
): Promise<LeagueEntryDto[]> {
  const path = `/lol/league/v4/entries/by-summoner/${summonerId}`;
  return riotClient.platformFetch<LeagueEntryDto[]>(platform, path, { revalidateSeconds: 60 });
}
```

- [ ] **Step 13: Run to verify league test passes**

Run: `npm test -- tests/riot/league.test.ts`
Expected: PASS — 1 test passed.

- [ ] **Step 14: Run the full test suite to confirm no regressions**

Run: `npm test`
Expected: all tests pass (Tasks 1-4 tests combined).

- [ ] **Step 15: Commit**

```bash
git add lib/riot/types.ts lib/riot/account.ts lib/riot/summoner.ts lib/riot/league.ts tests/riot/account.test.ts tests/riot/summoner.test.ts tests/riot/league.test.ts
git commit -m "feat: add Riot account, summoner, and league API wrappers"
```

---

### Task 5: Match-V5 wrappers

**Files:**
- Create: `lib/riot/match.ts`
- Test: `tests/riot/match.test.ts`

**Interfaces:**
- Consumes: `riotClient` from `lib/riot/client` (Task 3); `PlatformRegion` from `lib/riot/regions` (Task 2); `MatchDto` from `lib/riot/types` (Task 4).
- Produces:
  - `function getMatchIdsByPuuid(platform: PlatformRegion, puuid: string, count?: number): Promise<string[]>`
  - `function getMatchById(platform: PlatformRegion, matchId: string): Promise<MatchDto>`

- [ ] **Step 1: Write failing tests for `lib/riot/match.ts`**

`tests/riot/match.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { riotClient } from '../../lib/riot/client';
import { getMatchIdsByPuuid, getMatchById } from '../../lib/riot/match';

vi.mock('../../lib/riot/client', () => ({
  riotClient: {
    regionalFetch: vi.fn().mockResolvedValue(['NA1_1', 'NA1_2']),
  },
}));

describe('getMatchIdsByPuuid', () => {
  it('requests the regional match-ids-by-puuid endpoint with count', async () => {
    const result = await getMatchIdsByPuuid('na1', 'abc', 10);
    expect(riotClient.regionalFetch).toHaveBeenCalledWith(
      'na1',
      '/lol/match/v5/matches/by-puuid/abc/ids?start=0&count=10',
      { revalidateSeconds: 60 }
    );
    expect(result).toEqual(['NA1_1', 'NA1_2']);
  });

  it('defaults count to 10 when not provided', async () => {
    await getMatchIdsByPuuid('na1', 'abc');
    expect(riotClient.regionalFetch).toHaveBeenCalledWith(
      'na1',
      '/lol/match/v5/matches/by-puuid/abc/ids?start=0&count=10',
      { revalidateSeconds: 60 }
    );
  });
});

describe('getMatchById', () => {
  it('requests the regional match detail endpoint with a long cache TTL', async () => {
    (riotClient.regionalFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      metadata: { matchId: 'NA1_1', participants: [] },
      info: { gameCreation: 0, gameDuration: 0, queueId: 420, participants: [] },
    });
    const result = await getMatchById('na1', 'NA1_1');
    expect(riotClient.regionalFetch).toHaveBeenCalledWith(
      'na1',
      '/lol/match/v5/matches/NA1_1',
      { revalidateSeconds: 86_400 }
    );
    expect(result.metadata.matchId).toBe('NA1_1');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/riot/match.test.ts`
Expected: FAIL — `lib/riot/match` module not found.

- [ ] **Step 3: Implement `lib/riot/match.ts`**

```ts
import { riotClient } from './client';
import type { PlatformRegion } from './regions';
import type { MatchDto } from './types';

export function getMatchIdsByPuuid(
  platform: PlatformRegion,
  puuid: string,
  count = 10
): Promise<string[]> {
  const path = `/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}`;
  return riotClient.regionalFetch<string[]>(platform, path, { revalidateSeconds: 60 });
}

export function getMatchById(platform: PlatformRegion, matchId: string): Promise<MatchDto> {
  const path = `/lol/match/v5/matches/${matchId}`;
  return riotClient.regionalFetch<MatchDto>(platform, path, { revalidateSeconds: 86_400 });
}
```

- [ ] **Step 4: Run to verify match tests pass**

Run: `npm test -- tests/riot/match.test.ts`
Expected: PASS — 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add lib/riot/match.ts tests/riot/match.test.ts
git commit -m "feat: add Riot match-v5 wrappers"
```

---

### Task 6: Riot ID parsing and match stats derivation

**Files:**
- Create: `lib/riotId.ts`
- Create: `lib/matchStats.ts`
- Test: `tests/riotId.test.ts`
- Test: `tests/matchStats.test.ts`

**Interfaces:**
- Consumes: `MatchDto`, `ParticipantDto` from `lib/riot/types` (Task 4).
- Produces:
  - `interface ParsedRiotId { gameName: string; tagLine: string }`
  - `function parseRiotIdSegment(segment: string): ParsedRiotId | null`
  - `interface ChampionStat { championName: string; games: number; wins: number }`
  - `function computeTopChampions(participants: ParticipantDto[], limit?: number): ChampionStat[]`
  - `interface MatchSummary { matchId: string; championName: string; kills: number; deaths: number; assists: number; win: boolean; items: number[]; durationSeconds: number; queueId: number; gameCreation: number }`
  - `function toMatchSummary(match: MatchDto, puuid: string): MatchSummary` (throws if `puuid` is not a participant in `match`)

These are the pure data-transform functions Task 9 (display cards) and Task 11 (profile page) consume — no Riot API calls happen here.

- [ ] **Step 1: Write failing tests for `lib/riotId.ts`**

`tests/riotId.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseRiotIdSegment } from '../lib/riotId';

describe('parseRiotIdSegment', () => {
  it('splits gameName and tagLine on the last hyphen', () => {
    expect(parseRiotIdSegment('Faker-KR1')).toEqual({ gameName: 'Faker', tagLine: 'KR1' });
  });

  it('handles game names that themselves contain hyphens', () => {
    expect(parseRiotIdSegment('Foo-Bar-NA1')).toEqual({ gameName: 'Foo-Bar', tagLine: 'NA1' });
  });

  it('returns null for a segment with no hyphen', () => {
    expect(parseRiotIdSegment('NoTag')).toBeNull();
  });

  it('returns null when the tag half is empty', () => {
    expect(parseRiotIdSegment('Faker-')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/riotId.test.ts`
Expected: FAIL — `lib/riotId` module not found.

- [ ] **Step 3: Implement `lib/riotId.ts`**

```ts
export interface ParsedRiotId {
  gameName: string;
  tagLine: string;
}

export function parseRiotIdSegment(segment: string): ParsedRiotId | null {
  const lastDash = segment.lastIndexOf('-');
  if (lastDash <= 0 || lastDash === segment.length - 1) return null;
  return {
    gameName: decodeURIComponent(segment.slice(0, lastDash)),
    tagLine: decodeURIComponent(segment.slice(lastDash + 1)),
  };
}
```

- [ ] **Step 4: Run to verify riotId tests pass**

Run: `npm test -- tests/riotId.test.ts`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Write failing tests for `lib/matchStats.ts`**

`tests/matchStats.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeTopChampions, toMatchSummary } from '../lib/matchStats';
import type { MatchDto, ParticipantDto } from '../lib/riot/types';

function fakeParticipant(overrides: Partial<ParticipantDto>): ParticipantDto {
  return {
    puuid: 'me',
    riotIdGameName: 'Me',
    riotIdTagline: 'NA1',
    championName: 'Ahri',
    kills: 1,
    deaths: 1,
    assists: 1,
    win: true,
    teamId: 100,
    item0: 0,
    item1: 0,
    item2: 0,
    item3: 0,
    item4: 0,
    item5: 0,
    item6: 0,
    summoner1Id: 4,
    summoner2Id: 7,
    totalDamageDealtToChampions: 1000,
    visionScore: 10,
    ...overrides,
  };
}

describe('computeTopChampions', () => {
  it('aggregates games and wins per champion, sorted by games descending', () => {
    const participants = [
      fakeParticipant({ championName: 'Ahri', win: true }),
      fakeParticipant({ championName: 'Ahri', win: false }),
      fakeParticipant({ championName: 'Lux', win: true }),
    ];
    const result = computeTopChampions(participants, 5);
    expect(result[0]).toEqual({ championName: 'Ahri', games: 2, wins: 1 });
    expect(result[1]).toEqual({ championName: 'Lux', games: 1, wins: 1 });
  });

  it('respects the limit', () => {
    const participants = [
      fakeParticipant({ championName: 'Ahri' }),
      fakeParticipant({ championName: 'Lux' }),
      fakeParticipant({ championName: 'Zed' }),
    ];
    expect(computeTopChampions(participants, 2)).toHaveLength(2);
  });
});

describe('toMatchSummary', () => {
  function fakeMatch(participant: ParticipantDto): MatchDto {
    return {
      metadata: { matchId: 'NA1_1', participants: [participant.puuid] },
      info: { gameCreation: 1000, gameDuration: 1500, queueId: 420, participants: [participant] },
    };
  }

  it('extracts the searched player as a MatchSummary', () => {
    const match = fakeMatch(
      fakeParticipant({ puuid: 'me', championName: 'Ahri', kills: 5, deaths: 2, assists: 8, win: true })
    );
    const summary = toMatchSummary(match, 'me');
    expect(summary).toEqual({
      matchId: 'NA1_1',
      championName: 'Ahri',
      kills: 5,
      deaths: 2,
      assists: 8,
      win: true,
      items: [0, 0, 0, 0, 0, 0, 0],
      durationSeconds: 1500,
      queueId: 420,
      gameCreation: 1000,
    });
  });

  it('throws when the puuid is not a participant in the match', () => {
    const match = fakeMatch(fakeParticipant({ puuid: 'someone-else' }));
    expect(() => toMatchSummary(match, 'me')).toThrow();
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm test -- tests/matchStats.test.ts`
Expected: FAIL — `lib/matchStats` module not found.

- [ ] **Step 7: Implement `lib/matchStats.ts`**

```ts
import type { MatchDto, ParticipantDto } from './riot/types';

export interface ChampionStat {
  championName: string;
  games: number;
  wins: number;
}

export function computeTopChampions(participants: ParticipantDto[], limit = 3): ChampionStat[] {
  const byChampion = new Map<string, ChampionStat>();
  for (const participant of participants) {
    const existing = byChampion.get(participant.championName) ?? {
      championName: participant.championName,
      games: 0,
      wins: 0,
    };
    existing.games += 1;
    if (participant.win) existing.wins += 1;
    byChampion.set(participant.championName, existing);
  }
  return [...byChampion.values()].sort((a, b) => b.games - a.games).slice(0, limit);
}

export interface MatchSummary {
  matchId: string;
  championName: string;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
  items: number[];
  durationSeconds: number;
  queueId: number;
  gameCreation: number;
}

export function toMatchSummary(match: MatchDto, puuid: string): MatchSummary {
  const participant = match.info.participants.find((p) => p.puuid === puuid);
  if (!participant) {
    throw new Error(`Player ${puuid} not found in match ${match.metadata.matchId}`);
  }
  return {
    matchId: match.metadata.matchId,
    championName: participant.championName,
    kills: participant.kills,
    deaths: participant.deaths,
    assists: participant.assists,
    win: participant.win,
    items: [
      participant.item0,
      participant.item1,
      participant.item2,
      participant.item3,
      participant.item4,
      participant.item5,
      participant.item6,
    ],
    durationSeconds: match.info.gameDuration,
    queueId: match.info.queueId,
    gameCreation: match.info.gameCreation,
  };
}
```

- [ ] **Step 8: Run to verify matchStats tests pass**

Run: `npm test -- tests/matchStats.test.ts`
Expected: PASS — 4 tests passed.

- [ ] **Step 9: Commit**

```bash
git add lib/riotId.ts lib/matchStats.ts tests/riotId.test.ts tests/matchStats.test.ts
git commit -m "feat: add Riot ID parsing and match stats derivation helpers"
```

---

### Task 7: App shell — theme, layout, nav rail, search form

**Files:**
- Modify: `app/layout.tsx` (full rewrite)
- Modify: `app/page.tsx` (full rewrite)
- Create: `components/NavRail.tsx`
- Create: `components/SearchForm.tsx`
- Test: `tests/components/SearchForm.test.tsx`

**Interfaces:**
- Consumes: `PLATFORM_REGIONS`, `type PlatformRegion` from `lib/riot/regions` (Task 2); `useRouter` from `next/navigation`.
- Produces: `<NavRail />` and `<SearchForm />` components, rendered by `app/layout.tsx`. `SearchForm` navigates to `/${region}/${gameName}-${tagLine}`, the exact route shape Task 11's page must match.

- [ ] **Step 1: Write failing test for `components/SearchForm.tsx`**

`tests/components/SearchForm.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchForm } from '../../components/SearchForm';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

describe('SearchForm', () => {
  it('navigates to the profile route on a valid submit', () => {
    render(<SearchForm />);
    fireEvent.change(screen.getByLabelText('Riot ID'), { target: { value: 'Faker#KR1' } });
    fireEvent.click(screen.getByText('Search'));
    expect(push).toHaveBeenCalledWith('/na1/Faker-KR1');
  });

  it('shows a validation error and does not navigate when the tag is missing', () => {
    render(<SearchForm />);
    fireEvent.change(screen.getByLabelText('Riot ID'), { target: { value: 'Faker' } });
    fireEvent.click(screen.getByText('Search'));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a Riot ID');
    expect(push).not.toHaveBeenCalled();
  });

  it('navigates using the selected region', () => {
    render(<SearchForm />);
    fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'euw1' } });
    fireEvent.change(screen.getByLabelText('Riot ID'), { target: { value: 'Foo#Bar' } });
    fireEvent.click(screen.getByText('Search'));
    expect(push).toHaveBeenCalledWith('/euw1/Foo-Bar');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/components/SearchForm.test.tsx`
Expected: FAIL — `components/SearchForm` module not found.

- [ ] **Step 3: Implement `components/SearchForm.tsx`**

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { PLATFORM_REGIONS, type PlatformRegion } from '@/lib/riot/regions';

const REGION_LABELS: Record<PlatformRegion, string> = {
  na1: 'North America',
  euw1: 'EU West',
  eun1: 'EU Nordic & East',
  kr: 'Korea',
  jp1: 'Japan',
  br1: 'Brazil',
};

export function SearchForm() {
  const router = useRouter();
  const [region, setRegion] = useState<PlatformRegion>('na1');
  const [riotId, setRiotId] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parts = riotId.split('#');
    if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
      setError('Enter a Riot ID in the form GameName#Tag');
      return;
    }
    setError(null);
    const [gameName, tagLine] = parts;
    router.push(`/${region}/${encodeURIComponent(gameName.trim())}-${encodeURIComponent(tagLine.trim())}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm text-gold-300">
        Region
        <select
          value={region}
          onChange={(event) => setRegion(event.target.value as PlatformRegion)}
          aria-label="Region"
          className="rounded bg-charcoal-800 text-gold-200 px-3 py-2"
        >
          {PLATFORM_REGIONS.map((platform) => (
            <option key={platform} value={platform}>
              {REGION_LABELS[platform]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-gold-300">
        Riot ID
        <input
          value={riotId}
          onChange={(event) => setRiotId(event.target.value)}
          placeholder="GameName#Tag"
          aria-label="Riot ID"
          className="rounded bg-charcoal-800 text-gold-200 px-3 py-2"
        />
      </label>
      <button type="submit" className="rounded bg-gold-500 text-charcoal-900 px-3 py-2 font-semibold">
        Search
      </button>
      {error && (
        <p role="alert" className="text-red-400 text-sm">
          {error}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 4: Run to verify SearchForm tests pass**

Run: `npm test -- tests/components/SearchForm.test.tsx`
Expected: PASS — 3 tests passed.

- [ ] **Step 5: Implement `components/NavRail.tsx`** (no test — thin composition of `SearchForm`, which is already covered)

```tsx
import { SearchForm } from './SearchForm';

export function NavRail() {
  return (
    <nav className="w-64 shrink-0 bg-charcoal-900 text-gold-200 p-6 flex flex-col gap-6 min-h-screen">
      <h1 className="text-2xl font-display text-gold-400">League Dashboard</h1>
      <SearchForm />
    </nav>
  );
}
```

- [ ] **Step 6: Rewrite `app/layout.tsx`**

```tsx
import './globals.css';
import type { ReactNode } from 'react';
import { Cinzel, Inter } from 'next/font/google';
import { NavRail } from '@/components/NavRail';

const displayFont = Cinzel({ subsets: ['latin'], variable: '--font-display', weight: ['500', '700'] });
const bodyFont = Inter({ subsets: ['latin'], variable: '--font-body' });

export const metadata = {
  title: 'League Dashboard',
  description: 'Look up summoners, ranks, and match history.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body className="flex min-h-screen">
        <NavRail />
        <main className="flex-1 p-8">{children}</main>
      </body>
    </html>
  );
}
```

- [ ] **Step 7: Rewrite `app/page.tsx`**

```tsx
export default function HomePage() {
  return (
    <div className="max-w-xl">
      <h2 className="text-2xl font-display text-gold-300 mb-2">Welcome</h2>
      <p className="text-gold-200">
        Search for a summoner using the panel on the left to see their rank and recent match history.
      </p>
    </div>
  );
}
```

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 9: Verify visually in the dev server**

Run: `npm run dev`, open `http://localhost:3000`
Expected: left-hand charcoal nav rail with the "League Dashboard" title and search form; typing `Faker#KR1` and clicking Search navigates to `/na1/Faker-KR1` (this route 404s until Task 11 — that's expected at this point).

- [ ] **Step 10: Commit**

```bash
git add app/layout.tsx app/page.tsx components/NavRail.tsx components/SearchForm.tsx tests/components/SearchForm.test.tsx
git commit -m "feat: add themed app shell with nav rail and search form"
```

---

### Task 8: Profile display cards

**Files:**
- Create: `components/RankCard.tsx`
- Create: `components/RecentFormCard.tsx`
- Create: `components/TopChampionsCard.tsx`
- Test: `tests/components/RankCard.test.tsx`
- Test: `tests/components/RecentFormCard.test.tsx`
- Test: `tests/components/TopChampionsCard.test.tsx`

**Interfaces:**
- Consumes: `LeagueEntryDto` from `lib/riot/types` (Task 4); `ChampionStat` from `lib/matchStats` (Task 6).
- Produces: `<RankCard entry={LeagueEntryDto | null} />`, `<RecentFormCard results={boolean[]} />`, `<TopChampionsCard champions={ChampionStat[]} />` — all pure presentational components consumed by Task 11's profile page.

- [ ] **Step 1: Write failing test for `components/RankCard.tsx`**

`tests/components/RankCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RankCard } from '../../components/RankCard';

describe('RankCard', () => {
  it('renders tier, rank, and win rate when ranked', () => {
    render(
      <RankCard
        entry={{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', rank: 'II', leaguePoints: 42, wins: 6, losses: 4 }}
      />
    );
    expect(screen.getByText('GOLD II')).toBeInTheDocument();
    expect(screen.getByText('6W 4L (60% win rate)')).toBeInTheDocument();
  });

  it('renders Unranked when no entry is provided', () => {
    render(<RankCard entry={null} />);
    expect(screen.getByText('Unranked')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/components/RankCard.test.tsx`
Expected: FAIL — `components/RankCard` module not found.

- [ ] **Step 3: Implement `components/RankCard.tsx`**

```tsx
import type { LeagueEntryDto } from '@/lib/riot/types';

export interface RankCardProps {
  entry: LeagueEntryDto | null;
}

export function RankCard({ entry }: RankCardProps) {
  if (!entry) {
    return (
      <section aria-label="Ranked stats" className="rounded-lg bg-charcoal-800 p-5 text-gold-100">
        <p className="text-sm uppercase tracking-wide text-gold-400">Ranked Solo</p>
        <p className="text-xl font-display">Unranked</p>
      </section>
    );
  }

  const totalGames = entry.wins + entry.losses;
  const winRate = totalGames === 0 ? 0 : Math.round((entry.wins / totalGames) * 100);

  return (
    <section aria-label="Ranked stats" className="rounded-lg bg-charcoal-800 p-5 text-gold-100">
      <p className="text-sm uppercase tracking-wide text-gold-400">Ranked Solo</p>
      <p className="text-xl font-display">
        {entry.tier} {entry.rank}
      </p>
      <p className="text-sm">{entry.leaguePoints} LP</p>
      <p className="text-sm">
        {entry.wins}W {entry.losses}L ({winRate}% win rate)
      </p>
    </section>
  );
}
```

- [ ] **Step 4: Run to verify RankCard tests pass**

Run: `npm test -- tests/components/RankCard.test.tsx`
Expected: PASS — 2 tests passed.

- [ ] **Step 5: Write failing test for `components/RecentFormCard.tsx`**

`tests/components/RecentFormCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecentFormCard } from '../../components/RecentFormCard';

describe('RecentFormCard', () => {
  it('summarizes wins, losses, and win rate', () => {
    render(<RecentFormCard results={[true, true, false, true, false]} />);
    expect(screen.getByText('3W 2L')).toBeInTheDocument();
    expect(screen.getByText('60% over last 5 games')).toBeInTheDocument();
  });

  it('handles an empty result set without dividing by zero', () => {
    render(<RecentFormCard results={[]} />);
    expect(screen.getByText('0W 0L')).toBeInTheDocument();
    expect(screen.getByText('0% over last 0 games')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm test -- tests/components/RecentFormCard.test.tsx`
Expected: FAIL — `components/RecentFormCard` module not found.

- [ ] **Step 7: Implement `components/RecentFormCard.tsx`**

```tsx
export interface RecentFormCardProps {
  results: boolean[];
}

export function RecentFormCard({ results }: RecentFormCardProps) {
  const wins = results.filter(Boolean).length;
  const losses = results.length - wins;
  const winRate = results.length === 0 ? 0 : Math.round((wins / results.length) * 100);

  return (
    <section aria-label="Recent form" className="rounded-lg bg-charcoal-800 p-5 text-gold-100">
      <p className="text-sm uppercase tracking-wide text-gold-400">Recent Form</p>
      <p className="text-xl font-display">
        {wins}W {losses}L
      </p>
      <p className="text-sm">
        {winRate}% over last {results.length} games
      </p>
      <div className="flex gap-1 mt-2">
        {results.map((win, index) => (
          <span
            key={index}
            aria-label={win ? 'Win' : 'Loss'}
            className={`h-2 w-2 rounded-full ${win ? 'bg-emerald-400' : 'bg-red-400'}`}
          />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 8: Run to verify RecentFormCard tests pass**

Run: `npm test -- tests/components/RecentFormCard.test.tsx`
Expected: PASS — 2 tests passed.

- [ ] **Step 9: Write failing test for `components/TopChampionsCard.tsx`**

`tests/components/TopChampionsCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TopChampionsCard } from '../../components/TopChampionsCard';

describe('TopChampionsCard', () => {
  it('lists each champion with games played and win rate', () => {
    render(
      <TopChampionsCard
        champions={[
          { championName: 'Ahri', games: 4, wins: 3 },
          { championName: 'Lux', games: 2, wins: 0 },
        ]}
      />
    );
    expect(screen.getByText('4 games · 75%')).toBeInTheDocument();
    expect(screen.getByText('2 games · 0%')).toBeInTheDocument();
  });
});
```

- [ ] **Step 10: Run to verify it fails**

Run: `npm test -- tests/components/TopChampionsCard.test.tsx`
Expected: FAIL — `components/TopChampionsCard` module not found.

- [ ] **Step 11: Implement `components/TopChampionsCard.tsx`**

```tsx
import type { ChampionStat } from '@/lib/matchStats';

export interface TopChampionsCardProps {
  champions: ChampionStat[];
}

export function TopChampionsCard({ champions }: TopChampionsCardProps) {
  return (
    <section aria-label="Top champions" className="rounded-lg bg-charcoal-800 p-5 text-gold-100">
      <p className="text-sm uppercase tracking-wide text-gold-400">Top Champions</p>
      <ul className="mt-2 flex flex-col gap-2">
        {champions.map((champion) => {
          const winRate = champion.games === 0 ? 0 : Math.round((champion.wins / champion.games) * 100);
          return (
            <li key={champion.championName} className="flex justify-between text-sm">
              <span>{champion.championName}</span>
              <span>
                {champion.games} games · {winRate}%
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 12: Run to verify TopChampionsCard tests pass**

Run: `npm test -- tests/components/TopChampionsCard.test.tsx`
Expected: PASS — 1 test passed.

- [ ] **Step 13: Commit**

```bash
git add components/RankCard.tsx components/RecentFormCard.tsx components/TopChampionsCard.tsx tests/components/RankCard.test.tsx tests/components/RecentFormCard.test.tsx tests/components/TopChampionsCard.test.tsx
git commit -m "feat: add rank, recent form, and top champions display cards"
```

---

### Task 9: Match history components

**Files:**
- Create: `components/MatchScoreboard.tsx`
- Create: `components/MatchSummaryRow.tsx`
- Create: `components/MatchHistory.tsx`
- Test: `tests/components/MatchScoreboard.test.tsx`
- Test: `tests/components/MatchSummaryRow.test.tsx`
- Test: `tests/components/MatchHistory.test.tsx`

**Interfaces:**
- Consumes: `MatchSummary` from `lib/matchStats` (Task 6); `MatchDto` from `lib/riot/types` (Task 4).
- Produces: `<MatchHistory matches={MatchSummary[]} />`, consumed by Task 11's profile page. `MatchSummaryRow` fetches `GET /api/matches/[matchId]` (implemented in Task 10) when expanded — this task's test mocks `global.fetch` for that call.

- [ ] **Step 1: Write failing test for `components/MatchScoreboard.tsx`**

`tests/components/MatchScoreboard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MatchScoreboard } from '../../components/MatchScoreboard';
import type { MatchDto, ParticipantDto } from '../../lib/riot/types';

function fakeParticipant(overrides: Partial<ParticipantDto>): ParticipantDto {
  return {
    puuid: 'p1',
    riotIdGameName: 'Player',
    riotIdTagline: 'NA1',
    championName: 'Ahri',
    kills: 1,
    deaths: 1,
    assists: 1,
    win: true,
    teamId: 100,
    item0: 0,
    item1: 0,
    item2: 0,
    item3: 0,
    item4: 0,
    item5: 0,
    item6: 0,
    summoner1Id: 4,
    summoner2Id: 7,
    totalDamageDealtToChampions: 1000,
    visionScore: 10,
    ...overrides,
  };
}

describe('MatchScoreboard', () => {
  it('splits participants into Blue Team and Red Team tables', () => {
    const match: MatchDto = {
      metadata: { matchId: 'NA1_1', participants: [] },
      info: {
        gameCreation: 0,
        gameDuration: 0,
        queueId: 420,
        participants: [
          fakeParticipant({ puuid: 'blue1', riotIdGameName: 'BluePlayer', teamId: 100 }),
          fakeParticipant({ puuid: 'red1', riotIdGameName: 'RedPlayer', teamId: 200 }),
        ],
      },
    };
    render(<MatchScoreboard match={match} />);
    expect(screen.getByText('Blue Team')).toBeInTheDocument();
    expect(screen.getByText('Red Team')).toBeInTheDocument();
    expect(screen.getByText('BluePlayer#NA1')).toBeInTheDocument();
    expect(screen.getByText('RedPlayer#NA1')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/components/MatchScoreboard.test.tsx`
Expected: FAIL — `components/MatchScoreboard` module not found.

- [ ] **Step 3: Implement `components/MatchScoreboard.tsx`**

```tsx
import type { MatchDto, ParticipantDto } from '@/lib/riot/types';

export interface MatchScoreboardProps {
  match: MatchDto;
}

function TeamTable({ team, label }: { team: ParticipantDto[]; label: string }) {
  return (
    <table className="w-full text-sm">
      <caption className="text-left text-gold-400 mb-1">{label}</caption>
      <thead>
        <tr>
          <th className="text-left">Player</th>
          <th className="text-left">Champion</th>
          <th className="text-left">KDA</th>
          <th className="text-left">Damage</th>
          <th className="text-left">Vision</th>
        </tr>
      </thead>
      <tbody>
        {team.map((participant) => (
          <tr key={participant.puuid}>
            <td>
              {participant.riotIdGameName}#{participant.riotIdTagline}
            </td>
            <td>{participant.championName}</td>
            <td>
              {participant.kills}/{participant.deaths}/{participant.assists}
            </td>
            <td>{participant.totalDamageDealtToChampions}</td>
            <td>{participant.visionScore}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MatchScoreboard({ match }: MatchScoreboardProps) {
  const blueTeam = match.info.participants.filter((p) => p.teamId === 100);
  const redTeam = match.info.participants.filter((p) => p.teamId === 200);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-charcoal-950 p-4 rounded-md">
      <TeamTable team={blueTeam} label="Blue Team" />
      <TeamTable team={redTeam} label="Red Team" />
    </div>
  );
}
```

- [ ] **Step 4: Run to verify MatchScoreboard tests pass**

Run: `npm test -- tests/components/MatchScoreboard.test.tsx`
Expected: PASS — 1 test passed.

- [ ] **Step 5: Write failing test for `components/MatchSummaryRow.tsx`**

`tests/components/MatchSummaryRow.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MatchSummaryRow } from '../../components/MatchSummaryRow';
import type { MatchSummary } from '../../lib/matchStats';

const summary: MatchSummary = {
  matchId: 'NA1_1',
  championName: 'Ahri',
  kills: 5,
  deaths: 2,
  assists: 8,
  win: true,
  items: [1, 2, 3, 4, 5, 6, 7],
  durationSeconds: 1530,
  queueId: 420,
  gameCreation: 0,
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        metadata: { matchId: 'NA1_1', participants: [] },
        info: { gameCreation: 0, gameDuration: 1530, queueId: 420, participants: [] },
      }),
    })
  );
});

describe('MatchSummaryRow', () => {
  it('shows the summary line with formatted duration', () => {
    render(<MatchSummaryRow summary={summary} />);
    expect(screen.getByText(/Ahri/)).toBeInTheDocument();
    expect(screen.getByText(/5\/2\/8/)).toBeInTheDocument();
    expect(screen.getByText(/25:30/)).toBeInTheDocument();
    expect(screen.getByText(/Victory/)).toBeInTheDocument();
  });

  it('fetches and shows the full scoreboard when expanded', async () => {
    render(<MatchSummaryRow summary={summary} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/matches/NA1_1'));
    await waitFor(() => expect(screen.getByText('Blue Team')).toBeInTheDocument());
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm test -- tests/components/MatchSummaryRow.test.tsx`
Expected: FAIL — `components/MatchSummaryRow` module not found.

- [ ] **Step 7: Implement `components/MatchSummaryRow.tsx`**

```tsx
'use client';

import { useState } from 'react';
import type { MatchSummary } from '@/lib/matchStats';
import type { MatchDto } from '@/lib/riot/types';
import { MatchScoreboard } from './MatchScoreboard';

export interface MatchSummaryRowProps {
  summary: MatchSummary;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}:${remaining.toString().padStart(2, '0')}`;
}

export function MatchSummaryRow({ summary }: MatchSummaryRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<MatchDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (detail) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/matches/${summary.matchId}`);
      if (!response.ok) throw new Error('Failed to load match detail');
      const data = (await response.json()) as MatchDto;
      setDetail(data);
    } catch {
      setError('Could not load full match detail. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <li className="relative pl-6 border-l-2 border-gold-700">
      <button
        onClick={handleToggle}
        className={`w-full text-left rounded-md p-3 ${summary.win ? 'bg-emerald-950' : 'bg-red-950'}`}
      >
        <span className="font-semibold">{summary.championName}</span>{' '}
        <span>
          {summary.kills}/{summary.deaths}/{summary.assists}
        </span>{' '}
        <span>{formatDuration(summary.durationSeconds)}</span> <span>{summary.win ? 'Victory' : 'Defeat'}</span>
      </button>
      {expanded && (
        <div className="mt-2">
          {loading && <p>Loading full match...</p>}
          {error && <p role="alert">{error}</p>}
          {detail && <MatchScoreboard match={detail} />}
        </div>
      )}
    </li>
  );
}
```

- [ ] **Step 8: Run to verify MatchSummaryRow tests pass**

Run: `npm test -- tests/components/MatchSummaryRow.test.tsx`
Expected: PASS — 2 tests passed.

- [ ] **Step 9: Write failing test for `components/MatchHistory.tsx`**

`tests/components/MatchHistory.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MatchHistory } from '../../components/MatchHistory';
import type { MatchSummary } from '../../lib/matchStats';

describe('MatchHistory', () => {
  it('renders one row per match', () => {
    const matches: MatchSummary[] = [
      { matchId: 'NA1_1', championName: 'Ahri', kills: 5, deaths: 2, assists: 8, win: true, items: [], durationSeconds: 1500, queueId: 420, gameCreation: 0 },
      { matchId: 'NA1_2', championName: 'Lux', kills: 2, deaths: 4, assists: 3, win: false, items: [], durationSeconds: 1800, queueId: 420, gameCreation: 0 },
    ];
    render(<MatchHistory matches={matches} />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('shows an empty state with no matches', () => {
    render(<MatchHistory matches={[]} />);
    expect(screen.getByText('No recent matches found.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 10: Run to verify it fails**

Run: `npm test -- tests/components/MatchHistory.test.tsx`
Expected: FAIL — `components/MatchHistory` module not found.

- [ ] **Step 11: Implement `components/MatchHistory.tsx`**

```tsx
import type { MatchSummary } from '@/lib/matchStats';
import { MatchSummaryRow } from './MatchSummaryRow';

export interface MatchHistoryProps {
  matches: MatchSummary[];
}

export function MatchHistory({ matches }: MatchHistoryProps) {
  if (matches.length === 0) {
    return <p className="text-gold-300">No recent matches found.</p>;
  }
  return (
    <ul className="flex flex-col gap-4">
      {matches.map((match) => (
        <MatchSummaryRow key={match.matchId} summary={match} />
      ))}
    </ul>
  );
}
```

- [ ] **Step 12: Run to verify MatchHistory tests pass**

Run: `npm test -- tests/components/MatchHistory.test.tsx`
Expected: PASS — 2 tests passed.

- [ ] **Step 13: Commit**

```bash
git add components/MatchScoreboard.tsx components/MatchSummaryRow.tsx components/MatchHistory.tsx tests/components/MatchScoreboard.test.tsx tests/components/MatchSummaryRow.test.tsx tests/components/MatchHistory.test.tsx
git commit -m "feat: add match history timeline and expandable scoreboard components"
```

---

### Task 10: Match detail Route Handler

**Files:**
- Create: `app/api/matches/[matchId]/route.ts`
- Test: `tests/api/matches.test.ts`

**Interfaces:**
- Consumes: `getMatchById` from `lib/riot/match` (Task 5); `platformFromMatchId` from `lib/riot/regions` (Task 2); `RiotApiError` from `lib/riot/client` (Task 3).
- Produces: `GET /api/matches/[matchId]` returning `MatchDto` JSON on success, `{ error: string }` with the upstream status code on Riot errors — this is the exact endpoint `components/MatchSummaryRow.tsx` (Task 9) calls.

- [ ] **Step 1: Write failing tests for the route handler**

`tests/api/matches.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { GET } from '../../app/api/matches/[matchId]/route';
import { getMatchById } from '../../lib/riot/match';
import { RiotApiError } from '../../lib/riot/client';

vi.mock('../../lib/riot/match', () => ({ getMatchById: vi.fn() }));

describe('GET /api/matches/[matchId]', () => {
  it('returns match JSON for a known match id', async () => {
    (getMatchById as ReturnType<typeof vi.fn>).mockResolvedValue({
      metadata: { matchId: 'NA1_1', participants: [] },
      info: { gameCreation: 0, gameDuration: 0, queueId: 420, participants: [] },
    });
    const response = await GET(new Request('http://localhost/api/matches/NA1_1'), {
      params: { matchId: 'NA1_1' },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.metadata.matchId).toBe('NA1_1');
    expect(getMatchById).toHaveBeenCalledWith('na1', 'NA1_1');
  });

  it('returns 404 when Riot reports the match was not found', async () => {
    (getMatchById as ReturnType<typeof vi.fn>).mockRejectedValue(new RiotApiError('Not found', 404));
    const response = await GET(new Request('http://localhost/api/matches/NA1_2'), {
      params: { matchId: 'NA1_2' },
    });
    expect(response.status).toBe(404);
  });

  it('returns 500 for an unrecognized match id prefix', async () => {
    const response = await GET(new Request('http://localhost/api/matches/ZZ9_1'), {
      params: { matchId: 'ZZ9_1' },
    });
    expect(response.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/api/matches.test.ts`
Expected: FAIL — `app/api/matches/[matchId]/route` module not found.

- [ ] **Step 3: Implement `app/api/matches/[matchId]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { getMatchById } from '@/lib/riot/match';
import { platformFromMatchId } from '@/lib/riot/regions';
import { RiotApiError } from '@/lib/riot/client';

export async function GET(_request: Request, { params }: { params: { matchId: string } }) {
  try {
    const platform = platformFromMatchId(params.matchId);
    const match = await getMatchById(platform, params.matchId);
    return NextResponse.json(match);
  } catch (error) {
    if (error instanceof RiotApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run to verify route handler tests pass**

Run: `npm test -- tests/api/matches.test.ts`
Expected: PASS — 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add app/api/matches/[matchId]/route.ts tests/api/matches.test.ts
git commit -m "feat: add match detail route handler"
```

---

### Task 11: Summoner profile page (integration)

**Files:**
- Create: `app/[region]/[riotId]/page.tsx`
- Create: `app/[region]/[riotId]/error.tsx`

**Interfaces:**
- Consumes: `isPlatformRegion`, `type PlatformRegion` from `lib/riot/regions` (Task 2); `getAccountByRiotId` from `lib/riot/account` (Task 4); `getSummonerByPuuid` from `lib/riot/summoner` (Task 4); `getLeagueEntriesBySummonerId` from `lib/riot/league` (Task 4); `getMatchIdsByPuuid`, `getMatchById` from `lib/riot/match` (Task 5); `parseRiotIdSegment` from `lib/riotId` (Task 6); `toMatchSummary`, `computeTopChampions` from `lib/matchStats` (Task 6); `RiotApiError` from `lib/riot/client` (Task 3); `RankCard`, `RecentFormCard`, `TopChampionsCard` (Task 8); `MatchHistory` (Task 9).
- Produces: the `/[region]/[riotId]` route that `components/SearchForm.tsx` (Task 7) navigates to.

This task has no new unit-testable logic of its own (`parseRiotIdSegment`, `toMatchSummary`, and `computeTopChampions` are already tested in Task 6; the display components are already tested in Tasks 8-9) — it is verified by manual walkthrough against the live Riot API, consistent with the spec's decision not to add e2e tests requiring a live API key in CI.

- [ ] **Step 1: Implement `app/[region]/[riotId]/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import { isPlatformRegion, type PlatformRegion } from '@/lib/riot/regions';
import { getAccountByRiotId } from '@/lib/riot/account';
import { getSummonerByPuuid } from '@/lib/riot/summoner';
import { getLeagueEntriesBySummonerId } from '@/lib/riot/league';
import { getMatchIdsByPuuid, getMatchById } from '@/lib/riot/match';
import { parseRiotIdSegment } from '@/lib/riotId';
import { toMatchSummary, computeTopChampions } from '@/lib/matchStats';
import { RiotApiError } from '@/lib/riot/client';
import { RankCard } from '@/components/RankCard';
import { RecentFormCard } from '@/components/RecentFormCard';
import { TopChampionsCard } from '@/components/TopChampionsCard';
import { MatchHistory } from '@/components/MatchHistory';

export default async function SummonerProfilePage({
  params,
}: {
  params: { region: string; riotId: string };
}) {
  if (!isPlatformRegion(params.region)) notFound();
  const platform: PlatformRegion = params.region;

  const parsed = parseRiotIdSegment(params.riotId);
  if (!parsed) notFound();

  try {
    const account = await getAccountByRiotId(platform, parsed.gameName, parsed.tagLine);
    const summoner = await getSummonerByPuuid(platform, account.puuid);
    const [leagueEntries, matchIds] = await Promise.all([
      getLeagueEntriesBySummonerId(platform, summoner.id),
      getMatchIdsByPuuid(platform, account.puuid, 10),
    ]);
    const matches = await Promise.all(matchIds.map((id) => getMatchById(platform, id)));
    const summaries = matches.map((match) => toMatchSummary(match, account.puuid));
    const soloQueueEntry = leagueEntries.find((entry) => entry.queueType === 'RANKED_SOLO_5x5') ?? null;
    const recentResults = summaries.map((summary) => summary.win);
    const championParticipants = matches
      .map((match) => match.info.participants.find((p) => p.puuid === account.puuid))
      .filter((p): p is NonNullable<typeof p> => Boolean(p));
    const topChampions = computeTopChampions(championParticipants);

    return (
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-3xl font-display text-gold-300">
            {account.gameName}#{account.tagLine}
          </h1>
          <p className="text-gold-400">Level {summoner.summonerLevel}</p>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <RankCard entry={soloQueueEntry} />
          <RecentFormCard results={recentResults} />
          <TopChampionsCard champions={topChampions} />
        </div>
        <section>
          <h2 className="text-xl font-display text-gold-300 mb-3">Match History</h2>
          <MatchHistory matches={summaries} />
        </section>
      </div>
    );
  } catch (error) {
    if (error instanceof RiotApiError && error.status === 404) {
      return (
        <p className="text-gold-100">
          We couldn&apos;t find that summoner. Double check the name, tag, and region.
        </p>
      );
    }
    if (error instanceof RiotApiError && error.status === 429) {
      return (
        <p className="text-gold-100">
          We&apos;re being rate limited by Riot right now. Please wait a moment and try again.
        </p>
      );
    }
    throw error;
  }
}
```

- [ ] **Step 2: Implement `app/[region]/[riotId]/error.tsx`**

```tsx
'use client';

export default function ProfileError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="text-gold-100">
      <p>Something went wrong loading this profile.</p>
      <button onClick={reset} className="mt-2 rounded bg-gold-500 text-charcoal-900 px-3 py-2">
        Try again
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Run the full automated test suite**

Run: `npm test`
Expected: all tests from Tasks 1-10 still pass (this task adds no new test files, per the note above).

- [ ] **Step 4: Manually verify against the live Riot API**

Prerequisite: `.env.local` contains a valid `RIOT_API_KEY` (see `README.md` from Task 1).

Run: `npm run dev`, open `http://localhost:3000`

1. Enter a real Riot ID (e.g. your own summoner, `GameName#Tag`) and a matching region, click Search.
   Expected: navigates to `/na1/GameName-Tag` (or the chosen region) and shows the rank card, recent-form card, top-champions card, and match history timeline populated with real data.
2. Click a match in the timeline.
   Expected: it expands in place to show the full 10-player scoreboard (Blue Team / Red Team tables).
3. Search for a Riot ID that doesn't exist.
   Expected: the "We couldn't find that summoner" message, not a raw error page.
4. Search for a valid Riot ID with no ranked solo games.
   Expected: the Rank card shows "Unranked" instead of crashing.

- [ ] **Step 5: Commit**

```bash
git add "app/[region]/[riotId]/page.tsx" "app/[region]/[riotId]/error.tsx"
git commit -m "feat: add summoner profile page wiring rank, form, champions, and match history"
```

---

### Task 12: Final polish and verification pass

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this task is a full-suite regression check and documentation pass before calling the plan complete.

- [ ] **Step 1: Run the full automated test suite one more time**

Run: `npm test`
Expected: every test file from Tasks 1-10 passes (regions, rate limiter, client, account, summoner, league, match, riotId, matchStats, SearchForm, RankCard, RecentFormCard, TopChampionsCard, MatchScoreboard, MatchSummaryRow, MatchHistory, matches route handler).

- [ ] **Step 2: Run the linter**

Run: `npm run lint`
Expected: no errors. Fix any that appear (e.g. unused imports) and re-run until clean.

- [ ] **Step 3: Run a production build**

Run: `npm run build`
Expected: builds successfully with no type errors.

- [ ] **Step 4: Update `README.md` with the full feature list**

```markdown
# League Dashboard

A summoner search, rank, and match history dashboard built on the real Riot Games API — an op.gg *functionality* clone with a distinct visual layout (see `docs/superpowers/specs/2026-07-01-opgg-clone-design.md`).

## Features

- Summoner search by Riot ID (`GameName#Tag`) across NA, EUW, EUNE, KR, JP, and BR1.
- Rank, recent form, and top-champions summary cards.
- Match history rendered as a vertical timeline, expandable per match into a full 10-player scoreboard.

## Setup

1. `npm install`
2. Get a personal Riot developer API key from https://developer.riotgames.com/ (requires a Riot account; the key expires every 24 hours and must be renewed manually during development).
3. Copy `.env.local.example` to `.env.local` and paste your key in as `RIOT_API_KEY`.
4. `npm run dev` and open http://localhost:3000.

## Testing

`npm test` runs the unit and component test suite (Vitest + React Testing Library). No real Riot API calls are made in tests — all Riot responses are mocked. `npm run build` runs a full production type-check and build.

## Out of scope (see design spec for why)

- Champion tier list (win/pick/ban rates) — no honest free data source exists.
- User accounts, saved summoners, persisted search history.
- Live game / spectate.
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: finalize README with feature list and setup instructions"
```
