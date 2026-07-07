# Riot ID Search: Default-Tag Fallback + Self-Built Tag Suggestions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users search a player by game name alone — falling back to the region's default tag — and offer tag autocomplete powered by a `RiotIdIndex` table we populate ourselves from every match payload the site fetches.

**Architecture:** Two independent features that ship together. (1) *Default-tag fallback*: pure client-side — `SearchForm` maps each platform region to its conventional default tag (`na1 → NA1`, `euw1 → EUW`, …) and uses it when the input has no `#`. (2) *Self-built suggestions*: Riot's API has **no** name→tags lookup (Account-V1 is exact-match only), so we build our own index. Every `MatchDto` we already fetch contains `riotIdGameName` + `riotIdTagline` per participant; the profile page upserts those into a `riot_id_index` Postgres table via Next 15's `after()` (non-blocking, best-effort), and a small GET endpoint serves the top-5 tags for a typed name prefix, which `SearchForm` renders as a debounced dropdown.

**Tech Stack:** Next 15 App Router (server components + route handlers, `after()` from `next/server`), React 19 client components, Prisma 7 with `@prisma/adapter-pg` (Supabase Postgres), Vitest + React Testing Library (jsdom), Tailwind with the project's `ink`/`frost`/`line` design tokens.

## Global Constraints

- **Riot ToS:** index only data from our own Riot API responses. Never scrape third-party aggregators (op.gg, u.gg, tracker.gg) for name→tag data.
- **Indexing is best-effort:** a DB failure while indexing or suggesting must never break profile rendering or search. Log with `console.error` and continue.
- **Prisma 7 driver adapter:** all DB access goes through the shared `prisma` client in `lib/db.ts` (pooled Supabase `DATABASE_URL`). Migrations use `DIRECT_URL` via `npm run db:migrate:dev`.
- **Pattern to follow:** pure logic in a plain module with unit tests + a thin Prisma-backed store without unit tests, exactly like `lib/analysis/analyzeMatch.ts` / `lib/analysis/analysisStore.ts`. Prisma-backed stores in this repo are intentionally untested at unit level.
- **Route params are Promises** (Next 15): `await params` before use.
- **Path alias:** `@/` resolves to the repo root (see `tsconfig.json` / `vitest.config.ts`).
- **Verification commands:** `npm test` (vitest run), `npm run typecheck` (tsc --noEmit).
- **Commits:** conventional-commit style (`feat:`, `test:`), matching existing history.

## Why there is no "search all of Riot" option

Account-V1 only supports `gameName + tagLine → puuid` (exact) and `puuid → account`. There is no reverse or fuzzy endpoint — the tag line exists precisely to make names non-unique. So suggestions can only come from Riot IDs *this site has already seen*. The index starts empty and grows with traffic: every profile view indexes ~100 riot IDs (10 matches × 10 participants). That is the honest ceiling of this feature and the plan embraces it.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `lib/riot/regions.ts` | Modify | Add `DEFAULT_TAGS` map + `defaultTagForRegion()` |
| `components/SearchForm.tsx` | Modify | Default-tag fallback on submit; debounced suggestion dropdown |
| `prisma/schema.prisma` | Modify | Add `RiotIdIndex` model |
| `prisma/migrations/<ts>_riot_id_index/migration.sql` | Create (generated) | `riot_id_index` table + `(region, game_name_normalized)` index |
| `lib/riotIdIndex.ts` | Create | Pure logic: `normalizeGameName`, `observationsFromMatch`, `mergeObservations` |
| `lib/riotIdIndexStore.ts` | Create | Prisma-backed `upsertRiotIdRows` (raw batched upsert) + `suggestRiotIds` query |
| `app/api/riot-ids/suggest/route.ts` | Create | GET `?q=&region=` → top-5 suggestions JSON |
| `app/[region]/[riotId]/page.tsx` | Modify | Index participants after render via `after()` |
| `tests/riot/regions.test.ts` | Modify | Default-tag tests |
| `tests/components/SearchForm.test.tsx` | Modify | Fallback navigation + dropdown tests (one existing test changes behavior) |
| `tests/riotIdIndex.test.ts` | Create | Pure-logic tests |
| `tests/api/riotIdSuggest.test.ts` | Create | Route handler tests (store mocked) |

---

### Task 1: Default tag per region (`lib/riot/regions.ts`)

Riot assigns a conventional default tag to accounts created in each region (players who never customized their tag). These are the highest-probability guesses when someone types a bare name.

**Files:**
- Modify: `lib/riot/regions.ts`
- Test: `tests/riot/regions.test.ts`

**Interfaces:**
- Consumes: existing `PlatformRegion` type from the same file.
- Produces: `defaultTagForRegion(platform: PlatformRegion): string` — used by Task 2.

- [ ] **Step 1: Write the failing test**

Append to `tests/riot/regions.test.ts` (extend the existing import from `../../lib/riot/regions` rather than adding a duplicate one):

```ts
import { defaultTagForRegion } from '../../lib/riot/regions';

describe('defaultTagForRegion', () => {
  it('returns the conventional default tag for each supported region', () => {
    expect(defaultTagForRegion('na1')).toBe('NA1');
    expect(defaultTagForRegion('euw1')).toBe('EUW');
    expect(defaultTagForRegion('eun1')).toBe('EUNE');
    expect(defaultTagForRegion('kr')).toBe('KR1');
    expect(defaultTagForRegion('jp1')).toBe('JP1');
    expect(defaultTagForRegion('br1')).toBe('BR1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/riot/regions.test.ts`
Expected: FAIL — `defaultTagForRegion` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `lib/riot/regions.ts`:

```ts
/**
 * Riot's conventional default tag line per platform region — the tag assigned
 * to accounts that never customized theirs. Used as the best-guess fallback
 * when a user searches a bare game name without "#Tag".
 */
const DEFAULT_TAGS: Record<PlatformRegion, string> = {
  na1: 'NA1',
  euw1: 'EUW',
  eun1: 'EUNE',
  kr: 'KR1',
  jp1: 'JP1',
  br1: 'BR1',
};

export function defaultTagForRegion(platform: PlatformRegion): string {
  return DEFAULT_TAGS[platform];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/riot/regions.test.ts`
Expected: PASS (all tests in file).

- [ ] **Step 5: Commit**

```bash
git add lib/riot/regions.ts tests/riot/regions.test.ts
git commit -m "feat: add default tag line per platform region"
```

---

### Task 2: SearchForm default-tag fallback

Typing `Faker` (no `#`) currently shows a validation error. New behavior: navigate to `/{region}/Faker-{DEFAULT_TAG}`. The validation error remains only for genuinely malformed input (empty name, empty tag after `#`, multiple `#`).

> **Behavior change to an existing test:** `tests/components/SearchForm.test.tsx` has a test named *"shows a validation error and does not navigate when the tag is missing"*. A missing tag is no longer an error — that test must be **replaced**, not kept.

**Files:**
- Modify: `components/SearchForm.tsx`
- Test: `tests/components/SearchForm.test.tsx`

**Interfaces:**
- Consumes: `defaultTagForRegion(platform: PlatformRegion): string` from Task 1.
- Produces: no new exports; navigation behavior only. Defines `navigateTo(gameName: string, tagLine: string)` inside the component — Task 7 reuses it.

- [ ] **Step 1: Write the failing tests**

In `tests/components/SearchForm.test.tsx`, **delete** the test `'shows a validation error and does not navigate when the tag is missing'` and add:

```tsx
  it('falls back to the region default tag when no tag is given', () => {
    render(<SearchForm />);
    fireEvent.change(screen.getByLabelText('Riot ID'), { target: { value: 'Faker' } });
    fireEvent.click(screen.getByText('Search'));
    expect(push).toHaveBeenCalledWith('/na1/Faker-NA1');
  });

  it('uses the selected region default tag for bare names', () => {
    render(<SearchForm />);
    fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'kr' } });
    fireEvent.change(screen.getByLabelText('Riot ID'), { target: { value: 'Faker' } });
    fireEvent.click(screen.getByText('Search'));
    expect(push).toHaveBeenCalledWith('/kr/Faker-KR1');
  });

  it('still rejects input with an empty tag after the separator', () => {
    render(<SearchForm />);
    fireEvent.change(screen.getByLabelText('Riot ID'), { target: { value: 'Faker#' } });
    fireEvent.click(screen.getByText('Search'));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a Riot ID');
    expect(push).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run tests/components/SearchForm.test.tsx`
Expected: FAIL — bare-name submits currently set the error instead of navigating.

- [ ] **Step 3: Implement the fallback**

In `components/SearchForm.tsx`, import the helper and rewrite `handleSubmit`:

```tsx
import { PLATFORM_REGIONS, defaultTagForRegion, type PlatformRegion } from '@/lib/riot/regions';
```

```tsx
  function navigateTo(gameName: string, tagLine: string) {
    setError(null);
    router.push(`/${region}/${encodeRiotIdPart(gameName)}-${encodeRiotIdPart(tagLine)}`);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const raw = riotId.trim();
    const parts = raw.split('#');
    if (parts.length === 1 && parts[0].trim()) {
      // Bare game name: assume the region's default tag (e.g. "Faker" → "Faker#KR1").
      navigateTo(parts[0].trim(), defaultTagForRegion(region));
      return;
    }
    if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
      setError('Enter a Riot ID in the form GameName#Tag');
      return;
    }
    navigateTo(parts[0].trim(), parts[1].trim());
  }
```

Also update the input placeholder so the affordance is honest:

```tsx
          placeholder="GameName#Tag (tag optional)"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/components/SearchForm.test.tsx`
Expected: PASS — all SearchForm tests, including the three pre-existing ones that remain.

- [ ] **Step 5: Commit**

```bash
git add components/SearchForm.tsx tests/components/SearchForm.test.tsx
git commit -m "feat: search falls back to region default tag when no tag given"
```

---

### Task 3: `RiotIdIndex` Prisma model + migration

One row per **puuid** (a puuid maps to exactly one current Riot ID; names change over time, so the newest observation wins). `seenCount` counts matches we've observed the account in — the popularity signal for ranking suggestions.

**Files:**
- Modify: `prisma/schema.prisma`
- Create (generated): `prisma/migrations/<timestamp>_riot_id_index/migration.sql`

**Interfaces:**
- Produces: Prisma model `RiotIdIndex` with client accessor `prisma.riotIdIndex`, columns as below — Task 5 depends on these exact names.

- [ ] **Step 1: Add the model to `prisma/schema.prisma`** (append after `Benchmark`):

```prisma
/// Riot IDs observed in match payloads we fetched ourselves (Account-V1 has no
/// name→tags lookup, so this self-built index powers tag autocomplete).
/// One row per puuid; the newest observation wins when a name changes.
model RiotIdIndex {
  puuid              String   @id
  region             String
  gameName           String   @map("game_name")
  gameNameNormalized String   @map("game_name_normalized")
  tagLine            String   @map("tag_line")
  seenCount          Int      @default(1) @map("seen_count")
  lastSeenAt         DateTime @map("last_seen_at")

  @@index([region, gameNameNormalized])
  @@map("riot_id_index")
}
```

- [ ] **Step 2: Generate and apply the migration**

Run: `npm run db:migrate:dev -- --name riot_id_index`
(Requires `DATABASE_URL`/`DIRECT_URL` in `.env`; both already exist in this repo. If the DB is unreachable in this session, run `npx prisma migrate dev --create-only --name riot_id_index` to just write the SQL and apply later with `npm run db:migrate`.)

Expected generated SQL (verify it matches):

```sql
-- CreateTable
CREATE TABLE "riot_id_index" (
    "puuid" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "game_name" TEXT NOT NULL,
    "game_name_normalized" TEXT NOT NULL,
    "tag_line" TEXT NOT NULL,
    "seen_count" INTEGER NOT NULL DEFAULT 1,
    "last_seen_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "riot_id_index_pkey" PRIMARY KEY ("puuid")
);

-- CreateIndex
CREATE INDEX "riot_id_index_region_game_name_normalized_idx" ON "riot_id_index"("region", "game_name_normalized");
```

> Note: prefix `LIKE 'x%'` queries only use a btree index under C collation (`text_pattern_ops`). At this table's early scale a scan is fine — do **not** hand-edit the migration now. If suggestion latency ever matters, add a `text_pattern_ops` index in a later migration.

- [ ] **Step 3: Regenerate the client and typecheck**

Run: `npm run db:generate && npm run typecheck`
Expected: client generates; typecheck passes (no code references the model yet).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add RiotIdIndex table for self-built riot id search index"
```

---

### Task 4: Pure indexing logic (`lib/riotIdIndex.ts`)

Extracting observations from a match and merging them into upsert-ready rows is pure and fully unit-testable. Key subtlety: a match payload records the Riot ID **as of when the match was played** (`info.gameCreation`), so when the same puuid appears with different names across matches, the observation with the newest timestamp must win.

**Files:**
- Create: `lib/riotIdIndex.ts`
- Test: `tests/riotIdIndex.test.ts`

**Interfaces:**
- Consumes: `MatchDto`, `ParticipantDto` from `@/lib/riot/types`; `PlatformRegion` from `@/lib/riot/regions`.
- Produces (Tasks 5 and 8 depend on these exact signatures):
  - `normalizeGameName(name: string): string`
  - `interface RiotIdObservation { puuid: string; gameName: string; tagLine: string; observedAtMs: number }`
  - `interface RiotIdIndexRow { puuid: string; region: PlatformRegion; gameName: string; gameNameNormalized: string; tagLine: string; seenCount: number; lastSeenAt: Date }`
  - `observationsFromMatch(match: MatchDto): RiotIdObservation[]`
  - `mergeObservations(region: PlatformRegion, observations: RiotIdObservation[]): RiotIdIndexRow[]`

- [ ] **Step 1: Write the failing tests** — create `tests/riotIdIndex.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  normalizeGameName,
  observationsFromMatch,
  mergeObservations,
} from '../lib/riotIdIndex';
import type { MatchDto, ParticipantDto } from '../lib/riot/types';

function participant(overrides: Partial<ParticipantDto>): ParticipantDto {
  return {
    puuid: 'p1',
    riotIdGameName: 'Faker',
    riotIdTagline: 'KR1',
    championName: 'Azir',
    kills: 0,
    deaths: 0,
    assists: 0,
    win: true,
    teamId: 100,
    item0: 0, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, item6: 0,
    summoner1Id: 4,
    summoner2Id: 12,
    totalDamageDealtToChampions: 0,
    visionScore: 0,
    ...overrides,
  };
}

function match(gameCreation: number, participants: ParticipantDto[]): MatchDto {
  return {
    metadata: { matchId: 'KR_1', participants: participants.map((p) => p.puuid) },
    info: { gameCreation, gameDuration: 1800, queueId: 420, participants },
  };
}

describe('normalizeGameName', () => {
  it('lowercases, trims, and applies NFKC so lookups are width/case-insensitive', () => {
    expect(normalizeGameName('  FaKer ')).toBe('faker');
    expect(normalizeGameName('Ｆａｋｅｒ')).toBe('faker'); // fullwidth → NFKC → ascii
  });
});

describe('observationsFromMatch', () => {
  it('extracts one observation per participant stamped with gameCreation', () => {
    const m = match(1_700_000_000_000, [
      participant({ puuid: 'p1', riotIdGameName: 'Faker', riotIdTagline: 'KR1' }),
      participant({ puuid: 'p2', riotIdGameName: 'Zeus', riotIdTagline: 'T1' }),
    ]);
    expect(observationsFromMatch(m)).toEqual([
      { puuid: 'p1', gameName: 'Faker', tagLine: 'KR1', observedAtMs: 1_700_000_000_000 },
      { puuid: 'p2', gameName: 'Zeus', tagLine: 'T1', observedAtMs: 1_700_000_000_000 },
    ]);
  });

  it('skips participants with a missing name or tag (old matches / bots)', () => {
    const m = match(1, [participant({ puuid: 'p1', riotIdGameName: '', riotIdTagline: 'KR1' })]);
    expect(observationsFromMatch(m)).toEqual([]);
  });
});

describe('mergeObservations', () => {
  it('dedupes by puuid, counts occurrences, and keeps the newest name', () => {
    const rows = mergeObservations('kr', [
      { puuid: 'p1', gameName: 'OldName', tagLine: 'OLD', observedAtMs: 100 },
      { puuid: 'p1', gameName: 'Faker', tagLine: 'KR1', observedAtMs: 200 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      puuid: 'p1',
      region: 'kr',
      gameName: 'Faker',
      gameNameNormalized: 'faker',
      tagLine: 'KR1',
      seenCount: 2,
      lastSeenAt: new Date(200),
    });
  });

  it('does not let an older observation overwrite a newer name', () => {
    const rows = mergeObservations('kr', [
      { puuid: 'p1', gameName: 'Faker', tagLine: 'KR1', observedAtMs: 200 },
      { puuid: 'p1', gameName: 'OldName', tagLine: 'OLD', observedAtMs: 100 },
    ]);
    expect(rows[0]).toMatchObject({ gameName: 'Faker', tagLine: 'KR1', seenCount: 2 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/riotIdIndex.test.ts`
Expected: FAIL — module `lib/riotIdIndex` does not exist.

- [ ] **Step 3: Write the implementation** — create `lib/riotIdIndex.ts`:

```ts
import type { PlatformRegion } from './riot/regions';
import type { MatchDto } from './riot/types';

/** One sighting of a Riot ID at a point in time (match gameCreation, or "now" for Account-V1). */
export interface RiotIdObservation {
  puuid: string;
  gameName: string;
  tagLine: string;
  observedAtMs: number;
}

/** Upsert-ready row for the riot_id_index table. */
export interface RiotIdIndexRow {
  puuid: string;
  region: PlatformRegion;
  gameName: string;
  gameNameNormalized: string;
  tagLine: string;
  seenCount: number;
  lastSeenAt: Date;
}

/** Case/width-insensitive key used for prefix lookups. */
export function normalizeGameName(name: string): string {
  return name.normalize('NFKC').toLowerCase().trim();
}

/**
 * Riot IDs in a match payload are the names as of when the match was played,
 * so each observation is stamped with gameCreation — newer matches win merges.
 */
export function observationsFromMatch(match: MatchDto): RiotIdObservation[] {
  return match.info.participants
    .filter((p) => p.riotIdGameName && p.riotIdTagline)
    .map((p) => ({
      puuid: p.puuid,
      gameName: p.riotIdGameName,
      tagLine: p.riotIdTagline,
      observedAtMs: match.info.gameCreation,
    }));
}

/**
 * Collapse observations to one row per puuid: seenCount accumulates, the
 * newest observation supplies the display name. Dedup is required before the
 * batched upsert — Postgres rejects ON CONFLICT hitting the same row twice
 * in one statement.
 */
export function mergeObservations(
  region: PlatformRegion,
  observations: RiotIdObservation[]
): RiotIdIndexRow[] {
  const byPuuid = new Map<string, RiotIdIndexRow>();
  for (const obs of observations) {
    const existing = byPuuid.get(obs.puuid);
    if (!existing) {
      byPuuid.set(obs.puuid, {
        puuid: obs.puuid,
        region,
        gameName: obs.gameName,
        gameNameNormalized: normalizeGameName(obs.gameName),
        tagLine: obs.tagLine,
        seenCount: 1,
        lastSeenAt: new Date(obs.observedAtMs),
      });
      continue;
    }
    existing.seenCount += 1;
    if (obs.observedAtMs >= existing.lastSeenAt.getTime()) {
      existing.gameName = obs.gameName;
      existing.gameNameNormalized = normalizeGameName(obs.gameName);
      existing.tagLine = obs.tagLine;
      existing.lastSeenAt = new Date(obs.observedAtMs);
    }
  }
  return [...byPuuid.values()];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/riotIdIndex.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/riotIdIndex.ts tests/riotIdIndex.test.ts
git commit -m "feat: pure riot id observation extraction and merge logic"
```

---

### Task 5: Prisma-backed store (`lib/riotIdIndexStore.ts`)

Thin DB layer, mirroring `lib/analysis/analysisStore.ts` (which has no unit tests — the pattern here is pure-logic-tested / store-thin). The upsert is one raw batched `INSERT … ON CONFLICT` round trip because Prisma's `upsert` would issue ~100 queries per profile view.

**Files:**
- Create: `lib/riotIdIndexStore.ts`

**Interfaces:**
- Consumes: `RiotIdIndexRow`, `normalizeGameName` from Task 4; `prisma` from `@/lib/db`; `Prisma` from `@prisma/client`.
- Produces (Tasks 6 and 8 depend on these exact signatures):
  - `upsertRiotIdRows(rows: RiotIdIndexRow[]): Promise<void>`
  - `interface RiotIdSuggestion { gameName: string; tagLine: string }`
  - `suggestRiotIds(region: string, query: string, limit?: number): Promise<RiotIdSuggestion[]>`

- [ ] **Step 1: Write the store** — create `lib/riotIdIndexStore.ts`:

```ts
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { normalizeGameName, type RiotIdIndexRow } from './riotIdIndex';

/**
 * Batched upsert in a single statement (a profile view produces ~100 rows;
 * per-row prisma.upsert would be ~100 round trips through pgBouncer).
 * Rows must already be deduped by puuid (mergeObservations guarantees this).
 * On conflict: seen counts accumulate; name fields only move forward in time.
 */
export async function upsertRiotIdRows(rows: RiotIdIndexRow[]): Promise<void> {
  if (rows.length === 0) return;
  const values = rows.map(
    (r) =>
      Prisma.sql`(${r.puuid}, ${r.region}, ${r.gameName}, ${r.gameNameNormalized}, ${r.tagLine}, ${r.seenCount}, ${r.lastSeenAt})`
  );
  await prisma.$executeRaw`
    INSERT INTO riot_id_index
      (puuid, region, game_name, game_name_normalized, tag_line, seen_count, last_seen_at)
    VALUES ${Prisma.join(values)}
    ON CONFLICT (puuid) DO UPDATE SET
      seen_count = riot_id_index.seen_count + EXCLUDED.seen_count,
      game_name = CASE WHEN EXCLUDED.last_seen_at >= riot_id_index.last_seen_at
        THEN EXCLUDED.game_name ELSE riot_id_index.game_name END,
      game_name_normalized = CASE WHEN EXCLUDED.last_seen_at >= riot_id_index.last_seen_at
        THEN EXCLUDED.game_name_normalized ELSE riot_id_index.game_name_normalized END,
      tag_line = CASE WHEN EXCLUDED.last_seen_at >= riot_id_index.last_seen_at
        THEN EXCLUDED.tag_line ELSE riot_id_index.tag_line END,
      region = CASE WHEN EXCLUDED.last_seen_at >= riot_id_index.last_seen_at
        THEN EXCLUDED.region ELSE riot_id_index.region END,
      last_seen_at = GREATEST(riot_id_index.last_seen_at, EXCLUDED.last_seen_at)
  `;
}

export interface RiotIdSuggestion {
  gameName: string;
  tagLine: string;
}

/** Top Riot IDs we've indexed whose name starts with `query`, most-seen first. */
export async function suggestRiotIds(
  region: string,
  query: string,
  limit = 5
): Promise<RiotIdSuggestion[]> {
  const normalized = normalizeGameName(query);
  if (!normalized) return [];
  return prisma.riotIdIndex.findMany({
    where: { region, gameNameNormalized: { startsWith: normalized } },
    orderBy: [{ seenCount: 'desc' }, { lastSeenAt: 'desc' }],
    take: limit,
    select: { gameName: true, tagLine: true },
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (If `riotIdIndex` is missing on the Prisma client type, re-run `npm run db:generate` — Task 3 Step 3 must have completed.)

- [ ] **Step 3: Commit**

```bash
git add lib/riotIdIndexStore.ts
git commit -m "feat: prisma store for riot id index (batched upsert + suggest query)"
```

---

### Task 6: Suggest API route (`GET /api/riot-ids/suggest`)

Query params: `q` (name prefix, min 2 chars after trim) and `region` (must be a `PlatformRegion`). Always returns `{ suggestions: [...] }` with HTTP 200 — invalid input and DB failures both yield an empty list, because autocomplete must never surface an error state in the search box.

**Files:**
- Create: `app/api/riot-ids/suggest/route.ts`
- Test: `tests/api/riotIdSuggest.test.ts`

**Interfaces:**
- Consumes: `suggestRiotIds(region, query)` from Task 5; `isPlatformRegion` from `@/lib/riot/regions`.
- Produces: JSON `{ suggestions: { gameName: string; tagLine: string }[] }` — Task 7's fetch depends on this exact shape.

- [ ] **Step 1: Write the failing tests** — create `tests/api/riotIdSuggest.test.ts` (same pattern as `tests/api/matches.test.ts`: mock the lib module, call the exported handler):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../../app/api/riot-ids/suggest/route';
import { suggestRiotIds } from '../../lib/riotIdIndexStore';

vi.mock('../../lib/riotIdIndexStore', () => ({ suggestRiotIds: vi.fn() }));
const suggestMock = suggestRiotIds as ReturnType<typeof vi.fn>;

describe('GET /api/riot-ids/suggest', () => {
  beforeEach(() => {
    suggestMock.mockReset();
  });

  it('returns suggestions for a valid region and query', async () => {
    suggestMock.mockResolvedValue([{ gameName: 'Faker', tagLine: 'KR1' }]);
    const response = await GET(new Request('http://localhost/api/riot-ids/suggest?q=Fak&region=kr'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ suggestions: [{ gameName: 'Faker', tagLine: 'KR1' }] });
    expect(suggestMock).toHaveBeenCalledWith('kr', 'Fak');
  });

  it('returns an empty list without querying for an unknown region', async () => {
    const response = await GET(new Request('http://localhost/api/riot-ids/suggest?q=Fak&region=mars'));
    expect(await response.json()).toEqual({ suggestions: [] });
    expect(suggestMock).not.toHaveBeenCalled();
  });

  it('returns an empty list without querying when q is shorter than 2 chars', async () => {
    const response = await GET(new Request('http://localhost/api/riot-ids/suggest?q=F&region=kr'));
    expect(await response.json()).toEqual({ suggestions: [] });
    expect(suggestMock).not.toHaveBeenCalled();
  });

  it('degrades to an empty list when the store throws', async () => {
    suggestMock.mockRejectedValue(new Error('db down'));
    const response = await GET(new Request('http://localhost/api/riot-ids/suggest?q=Fak&region=kr'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ suggestions: [] });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/api/riotIdSuggest.test.ts`
Expected: FAIL — route module does not exist.

- [ ] **Step 3: Write the route** — create `app/api/riot-ids/suggest/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { isPlatformRegion } from '@/lib/riot/regions';
import { suggestRiotIds } from '@/lib/riotIdIndexStore';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim();
  const region = searchParams.get('region') ?? '';
  if (!isPlatformRegion(region) || q.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }
  try {
    return NextResponse.json({ suggestions: await suggestRiotIds(region, q) });
  } catch (error) {
    // Autocomplete is best-effort: an index outage must not break the search box.
    console.error('riot id suggest failed', error);
    return NextResponse.json({ suggestions: [] });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/api/riotIdSuggest.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/riot-ids/suggest/route.ts tests/api/riotIdSuggest.test.ts
git commit -m "feat: riot id tag suggestion endpoint"
```

---

### Task 7: SearchForm autocomplete dropdown

Debounced (250 ms) fetch of suggestions while the user types a bare name (≥2 chars, no `#` yet). Suggestions render as buttons below the input; clicking one navigates straight to that profile. A monotonically increasing request sequence discards out-of-order responses.

**Files:**
- Modify: `components/SearchForm.tsx`
- Test: `tests/components/SearchForm.test.tsx`

**Interfaces:**
- Consumes: `GET /api/riot-ids/suggest?q=&region=` returning `{ suggestions: { gameName; tagLine }[] }` (Task 6); `navigateTo` from Task 2.
- Produces: no new exports.

- [ ] **Step 1: Write the failing tests** — append to `tests/components/SearchForm.test.tsx` (add `act` to the `@testing-library/react` import and `afterEach` to the vitest import):

```tsx
describe('SearchForm suggestions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function stubFetch(suggestions: { gameName: string; tagLine: string }[]) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ suggestions }),
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('fetches and shows tag suggestions after the debounce', async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch([
      { gameName: 'Faker', tagLine: 'KR1' },
      { gameName: 'Faker', tagLine: 'T1' },
    ]);
    render(<SearchForm />);
    fireEvent.change(screen.getByLabelText('Riot ID'), { target: { value: 'Fak' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/riot-ids/suggest?q=Fak&region=na1');
    expect(screen.getByText('Faker#KR1')).toBeInTheDocument();
    expect(screen.getByText('Faker#T1')).toBeInTheDocument();
  });

  it('navigates to the suggested profile when a suggestion is clicked', async () => {
    vi.useFakeTimers();
    stubFetch([{ gameName: 'Faker', tagLine: 'KR1' }]);
    render(<SearchForm />);
    fireEvent.change(screen.getByLabelText('Riot ID'), { target: { value: 'Fak' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    fireEvent.click(screen.getByText('Faker#KR1'));
    expect(push).toHaveBeenCalledWith('/na1/Faker-KR1');
  });

  it('does not fetch for short input or once a tag separator is typed', async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch([]);
    render(<SearchForm />);
    fireEvent.change(screen.getByLabelText('Riot ID'), { target: { value: 'F' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    fireEvent.change(screen.getByLabelText('Riot ID'), { target: { value: 'Faker#KR' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/SearchForm.test.tsx`
Expected: FAIL — no fetch is made, no suggestions render.

- [ ] **Step 3: Implement the dropdown.** Full updated `components/SearchForm.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { PLATFORM_REGIONS, defaultTagForRegion, type PlatformRegion } from '@/lib/riot/regions';

const REGION_LABELS: Record<PlatformRegion, string> = {
  na1: 'North America',
  euw1: 'EU West',
  eun1: 'EU Nordic & East',
  kr: 'Korea',
  jp1: 'Japan',
  br1: 'Brazil',
};

const SUGGEST_DEBOUNCE_MS = 250;

interface RiotIdSuggestion {
  gameName: string;
  tagLine: string;
}

function encodeRiotIdPart(part: string): string {
  return encodeURIComponent(part).replace(/-/g, '%2D');
}

export interface SearchFormProps {
  variant?: 'hero' | 'compact';
}

export function SearchForm({ variant = 'hero' }: SearchFormProps) {
  const router = useRouter();
  const [region, setRegion] = useState<PlatformRegion>('na1');
  const [riotId, setRiotId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<RiotIdSuggestion[]>([]);
  // Discards responses that arrive after a newer request was issued.
  const requestSeq = useRef(0);

  useEffect(() => {
    const query = riotId.trim();
    if (query.length < 2 || query.includes('#')) {
      setSuggestions([]);
      return;
    }
    const seq = ++requestSeq.current;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/riot-ids/suggest?q=${encodeURIComponent(query)}&region=${region}`
        );
        if (!response.ok) return;
        const body = (await response.json()) as { suggestions: RiotIdSuggestion[] };
        if (seq === requestSeq.current) setSuggestions(body.suggestions);
      } catch {
        // Best-effort autocomplete: stay silent on network failure.
      }
    }, SUGGEST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [riotId, region]);

  function navigateTo(gameName: string, tagLine: string) {
    setError(null);
    setSuggestions([]);
    router.push(`/${region}/${encodeRiotIdPart(gameName)}-${encodeRiotIdPart(tagLine)}`);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const raw = riotId.trim();
    const parts = raw.split('#');
    if (parts.length === 1 && parts[0].trim()) {
      // Bare game name: assume the region's default tag (e.g. "Faker" → "Faker#KR1").
      navigateTo(parts[0].trim(), defaultTagForRegion(region));
      return;
    }
    if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
      setError('Enter a Riot ID in the form GameName#Tag');
      return;
    }
    navigateTo(parts[0].trim(), parts[1].trim());
  }

  const isHero = variant === 'hero';

  return (
    <form onSubmit={handleSubmit} className="relative flex flex-col gap-2">
      <div
        className={`flex items-center gap-1 rounded-xl border border-line-strong bg-ink-900 p-1.5 ${
          isHero ? 'shadow-[0_0_24px_rgba(56,232,255,0.25)]' : ''
        }`}
      >
        <select
          value={region}
          onChange={(event) => setRegion(event.target.value as PlatformRegion)}
          aria-label="Region"
          className={`bg-transparent text-frost-500 font-semibold border-r border-line-subtle px-3 ${
            isHero ? 'py-2.5 text-sm' : 'py-1.5 text-xs'
          }`}
        >
          {PLATFORM_REGIONS.map((platform) => (
            <option key={platform} value={platform} className="bg-ink-900">
              {REGION_LABELS[platform]}
            </option>
          ))}
        </select>
        <input
          value={riotId}
          onChange={(event) => setRiotId(event.target.value)}
          placeholder="GameName#Tag (tag optional)"
          aria-label="Riot ID"
          autoComplete="off"
          className={`flex-1 bg-transparent text-frost-100 placeholder:text-frost-500/60 outline-none px-3 ${
            isHero ? 'py-2.5 text-sm' : 'py-1.5 text-xs w-40'
          }`}
        />
        <button
          type="submit"
          className={`uppercase rounded-lg bg-gradient-to-br from-cyan-400 to-indigo-500 font-bold text-ink-950 tracking-wide ${
            isHero ? 'px-6 py-2.5 text-sm' : 'px-4 py-1.5 text-xs'
          }`}
        >
          Search
        </button>
      </div>
      {suggestions.length > 0 && (
        <ul
          aria-label="Riot ID suggestions"
          className="absolute top-full left-0 right-0 z-20 mt-1 overflow-hidden rounded-xl border border-line-strong bg-ink-900 shadow-lg"
        >
          {suggestions.map((suggestion) => (
            <li key={`${suggestion.gameName}#${suggestion.tagLine}`}>
              <button
                type="button"
                onClick={() => navigateTo(suggestion.gameName, suggestion.tagLine)}
                className="w-full px-4 py-2 text-left text-sm text-frost-100 hover:bg-ink-950"
              >
                {`${suggestion.gameName}#${suggestion.tagLine}`}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-loss text-sm font-semibold">
          {error}
        </p>
      )}
    </form>
  );
}
```

(The suggestion label is deliberately a single text node — `` {`${suggestion.gameName}#${suggestion.tagLine}`} `` — so the `screen.getByText('Faker#KR1')` queries in Step 1 match. If you later split the tag into a styled `<span>`, switch those queries to `screen.getByRole('button', { name: … })`.)

- [ ] **Step 4: Run the full SearchForm suite**

Run: `npx vitest run tests/components/SearchForm.test.tsx`
Expected: PASS — all tests including Task 2's.

- [ ] **Step 5: Commit**

```bash
git add components/SearchForm.tsx tests/components/SearchForm.test.tsx
git commit -m "feat: tag autocomplete dropdown in search form"
```

---

### Task 8: Index participants from the profile page

The profile page already fetches 10 matches per view — that's ~100 Riot IDs flowing through untouched. Index them (plus the searched account itself, whose Account-V1 name is authoritative *now*) inside `after()` from `next/server` so the write happens once the response has streamed, never blocking or breaking the page. Next 15.5 is installed; `after` is stable there.

**Files:**
- Modify: `app/[region]/[riotId]/page.tsx`

**Interfaces:**
- Consumes: `observationsFromMatch`, `mergeObservations` (Task 4); `upsertRiotIdRows` (Task 5); `after` from `next/server`.
- Produces: none (side effect only).

- [ ] **Step 1: Add the indexing hook.** In `app/[region]/[riotId]/page.tsx`, add imports:

```tsx
import { after } from 'next/server';
import { observationsFromMatch, mergeObservations } from '@/lib/riotIdIndex';
import { upsertRiotIdRows } from '@/lib/riotIdIndexStore';
```

Then, inside the `try` block, immediately after the line
`const matches = await Promise.all(matchIds.map((id) => getMatchById(platform, id)));`, insert:

```tsx
    // Feed every Riot ID we just saw into the self-built search index.
    // Runs after the response streams; failures must never affect the page.
    after(async () => {
      try {
        const observations = matches.flatMap(observationsFromMatch);
        observations.push({
          puuid: account.puuid,
          gameName: account.gameName,
          tagLine: account.tagLine,
          observedAtMs: Date.now(),
        });
        await upsertRiotIdRows(mergeObservations(platform, observations));
      } catch (error) {
        console.error('riot id indexing failed', error);
      }
    });
```

(The searched account is appended with `Date.now()` because Account-V1 returns the *current* name — it must win over stale match-payload names in the merge.)

- [ ] **Step 2: Typecheck and run the whole suite**

Run: `npm run typecheck && npm test`
Expected: both PASS. (Server components aren't unit-tested in this repo; DB effects are verified manually next.)

- [ ] **Step 3: Manual end-to-end verification** (requires `RIOT_API_KEY` + `DATABASE_URL` in `.env`):

1. `npm run dev`
2. Visit a known profile, e.g. `http://localhost:3000/euw1/SomeName-EUW`.
3. Confirm rows landed: `npx prisma studio` → `riot_id_index` should hold ~100 rows (or run `SELECT count(*) FROM riot_id_index;`).
4. On the home page, type the first 3 letters of an indexed name with the same region selected → dropdown appears; clicking navigates to the profile.
5. Type a bare name and press Search → lands on `/{region}/Name-{DEFAULTTAG}` (404 message if that account doesn't exist — expected).

- [ ] **Step 4: Commit**

```bash
git add app/[region]/[riotId]/page.tsx
git commit -m "feat: index riot ids from fetched matches after profile render"
```

---

### Task 9: Documentation

- [ ] **Step 1:** In `07-remaining-work.md`, add (or update, if a search-related entry exists) a line noting: *Riot ID search — default-tag fallback + self-built `riot_id_index` suggestions implemented per `08-riot-id-search.md`; "search all of Riot by name" is impossible via the official API (no name→tags endpoint) and stays out of scope.*

- [ ] **Step 2: Commit**

```bash
git add 07-remaining-work.md 08-riot-id-search.md
git commit -m "docs: riot id search plan + remaining-work update"
```

---

## Explicitly Out of Scope (YAGNI)

- **Cross-region suggestions** — the dropdown is scoped to the selected region; a global fallback query can come later if wanted.
- **`text_pattern_ops` index** — prefix `LIKE` scans are fine until the table has real volume (see Task 3 note).
- **Keyboard navigation (↑/↓/Enter) in the dropdown** — click/tap only for v1; add ARIA combobox semantics when polishing.
- **Indexing from the analysis pipeline** (`analyzeMatch` fetches 20 more ranked matches) — the same helpers would drop in, but profile views already cover the hot path; add only if index growth feels slow.
- **Retrying the default tag with alternates** (e.g. bare name 404 → try `EUW` then `EUNE`) — each retry is a Riot API call; revisit with data on fallback miss rates.
