# Benchmark Data Acquisition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the empty `Benchmark` and `ParticipantFacts` tables via lazy, demand-driven cohort crawls so the analysis page renders real percentile scores instead of "Needs more data".

**Architecture:** A `BenchmarkJob` row is enqueued the first time an analysis page misses its benchmark cohort (patch × rankTier × role). A cron-hit API route processes jobs in resumable ~50-request chunks through the existing rate-limited Riot client, extracting `ParticipantFacts` for all 10 players per match and aggregating p25/p50/p75/p90 quantiles into `Benchmark` rows. Lookup interpolates percentiles from quantiles with a previous-patch fallback. Every user-viewed match also persists facts organically.

**Tech Stack:** Next.js 15 (App Router, server components), Prisma 7 + Supabase Postgres, Vitest, existing `lib/riot` client (token-bucket rate limiter), TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-07-08-benchmark-data-acquisition-design.md`

## Model assignments

Per the project's model-routing convention (`06-model-assignments.md`): cheapest model that reliably does the job; escalate only on measured failure.

| Task | What | Model | Why |
|---|---|---|---|
| 1 | Prisma `BenchmarkJob` model + migration | **Haiku 4.5** | Mechanical schema edit, exact code given |
| 2 | Cohort helpers (`cohortTier`, `comparePatches`) | **Haiku 4.5** | Tiny pure functions, exact code given |
| 3 | Quantile aggregation | **Sonnet 4.6** | Numeric edge cases need care |
| 4 | Percentile interpolation + benchmark lookup | **Sonnet 4.6** | Interpolation edge cases + fallback merge logic |
| 5 | Per-participant facts extraction | **Sonnet 4.6** | Touches two existing modules' exports |
| 6 | Fill-job engine (state machine) | **Opus 4.8** | Most complex task: budget accounting, resumability, failure paths |
| 7 | Riot ladder endpoints + Prisma DB layer | **Sonnet 4.6** | Straightforward but many small pieces |
| 8 | Cron route + CLI + wiring | **Sonnet 4.6** | Glue code, env handling |
| 9 | Page integration + UI copy | **Sonnet 4.6** | React/Next server-component integration |
| 10 | Docs + full verification | **Sonnet 4.6** | Mechanical doc update + verification run |
| — | Review between tasks | **Fable 5** (this session) | Orchestrator reviews each task's diff before dispatching the next |

## Global Constraints

- TypeScript strict; path alias `@/` maps to repo root (`@/lib/...`).
- Tests: Vitest, files in `tests/` mirroring `lib/` (e.g. `tests/analysis/foo.test.ts`). Run with `npx vitest run <file>`.
- DB-backed modules follow the repo convention of `analysisStore.ts`: thin Prisma wrappers, **no unit tests** (tests inject fakes).
- All Riot HTTP goes through `riotClient` (`lib/riot/client.ts`) — never raw `fetch`.
- Dev-key budget: 100 requests / 2 min. Fill tick budget = **50 requests**.
- Cohort: divisions merged (`GOLD`), apex tiers merged to `MASTER_PLUS`, ranked solo only (`queueId 420`), games ≥ 14 min.
- Benchmark publish threshold: `sampleN ≥ 30` per (role, metric) cell.
- New dependency allowed: `tsx` (devDependency, CLI runner). Nothing else.
- Failures in enqueue/persist paths must be logged and swallowed — never break the page.
- Commit after every task (message style: `feat: ...`, `chore: ...` — see git log).

---

### Task 1: `BenchmarkJob` Prisma model + migration

**Model:** Haiku 4.5

**Files:**
- Modify: `prisma/schema.prisma` (append after `Benchmark` model)
- Create: `prisma/migrations/<generated>/migration.sql` (via `prisma migrate dev`)

**Interfaces:**
- Produces: Prisma client types `BenchmarkJob`, `BenchmarkJobStatus` (enum `pending | running | done | failed`), unique key `patch_rankTier` named `job_cohort_key`, used by Tasks 7–9.

- [ ] **Step 1: Add the model to `prisma/schema.prisma`** (append at end of file):

```prisma
/// Lifecycle of a lazy benchmark cohort fill (spec: benchmark-data-acquisition).
enum BenchmarkJobStatus {
  pending
  running
  done
  failed
}

/// Resumable crawl job that fills one (patch, rankTier) benchmark cohort.
/// Enqueued on a benchmark cache miss; processed in ~50-request chunks by the
/// cron route. The unique key makes concurrent visitors collide into ONE job.
model BenchmarkJob {
  id              String             @id @default(cuid())
  patch           String
  rankTier        String             @map("rank_tier")
  /// Platform region to crawl (e.g. euw1) — from the match that triggered the miss.
  region          String
  status          BenchmarkJobStatus @default(pending)
  /// Ladder players sampled as crawl seeds. Empty until the seeding step runs.
  seedPuuids      Json               @default("[]") @map("seed_puuids")
  /// Dedup'd match ids still to fetch (the resumable cursor).
  pendingMatchIds Json               @default("[]") @map("pending_match_ids")
  processedCount  Int                @default(0) @map("processed_count")
  attempts        Int                @default(0)
  createdAt       DateTime           @default(now()) @map("created_at")
  updatedAt       DateTime           @updatedAt @map("updated_at")

  @@unique([patch, rankTier], name: "job_cohort_key")
  @@index([status, createdAt])
  @@map("benchmark_jobs")
}
```

- [ ] **Step 2: Run the migration**

Run: `npx prisma migrate dev --name benchmark_jobs`
Expected: `Your database is now in sync with your schema.` and a new folder under `prisma/migrations/`. (Requires `DIRECT_URL` in `.env`; if the DB is unreachable, run `npx prisma migrate dev --name benchmark_jobs --create-only` and note it in the commit.)

- [ ] **Step 3: Verify the client compiles**

Run: `npx prisma generate && npm run typecheck`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add prisma/
git commit -m "feat: BenchmarkJob model for resumable cohort fill jobs"
```

---

### Task 2: Cohort helpers

**Model:** Haiku 4.5

**Files:**
- Create: `lib/analysis/cohort.ts`
- Test: `tests/analysis/cohort.test.ts`

**Interfaces:**
- Produces:
  - `cohortTier(tier: string): string` — uppercases; maps MASTER/GRANDMASTER/CHALLENGER → `'MASTER_PLUS'`.
  - `isBenchmarkableTier(tier: string): boolean` — true for the 8 cohort tiers, false for `'UNRANKED'`/unknown.
  - `comparePatches(a: string, b: string): number` — numeric segment compare (`'26.9' < '26.13'`); negative/zero/positive like a comparator.
  - `COHORT_TIERS: string[]` — `['IRON','BRONZE','SILVER','GOLD','PLATINUM','EMERALD','DIAMOND','MASTER_PLUS']`.
  - `MASTER_PLUS = 'MASTER_PLUS'` (exported const).

- [ ] **Step 1: Write the failing test** — create `tests/analysis/cohort.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { cohortTier, isBenchmarkableTier, comparePatches, COHORT_TIERS } from '../../lib/analysis/cohort';

describe('cohortTier', () => {
  it('passes normal tiers through uppercased', () => {
    expect(cohortTier('GOLD')).toBe('GOLD');
    expect(cohortTier('emerald')).toBe('EMERALD');
  });
  it('merges apex tiers into MASTER_PLUS', () => {
    expect(cohortTier('MASTER')).toBe('MASTER_PLUS');
    expect(cohortTier('GRANDMASTER')).toBe('MASTER_PLUS');
    expect(cohortTier('CHALLENGER')).toBe('MASTER_PLUS');
  });
});

describe('isBenchmarkableTier', () => {
  it('accepts every cohort tier', () => {
    for (const tier of COHORT_TIERS) expect(isBenchmarkableTier(tier)).toBe(true);
  });
  it('accepts raw apex tiers (they normalize to MASTER_PLUS)', () => {
    expect(isBenchmarkableTier('CHALLENGER')).toBe(true);
  });
  it('rejects UNRANKED and garbage', () => {
    expect(isBenchmarkableTier('UNRANKED')).toBe(false);
    expect(isBenchmarkableTier('')).toBe(false);
  });
});

describe('comparePatches', () => {
  it('compares numerically per segment, not lexically', () => {
    expect(comparePatches('26.9', '26.13')).toBeLessThan(0);
    expect(comparePatches('26.13', '26.9')).toBeGreaterThan(0);
    expect(comparePatches('26.13', '26.13')).toBe(0);
    expect(comparePatches('25.24', '26.1')).toBeLessThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/analysis/cohort.test.ts`
Expected: FAIL — cannot resolve `lib/analysis/cohort`.

- [ ] **Step 3: Write the implementation** — create `lib/analysis/cohort.ts`:

```typescript
/** Apex tiers are merged: their populations are too small for separate cohorts. */
const APEX_TIERS = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER']);

export const MASTER_PLUS = 'MASTER_PLUS';

export const COHORT_TIERS = [
  'IRON',
  'BRONZE',
  'SILVER',
  'GOLD',
  'PLATINUM',
  'EMERALD',
  'DIAMOND',
  MASTER_PLUS,
];

/** Normalize a Riot tier (LEAGUE-V4 `tier`) to its benchmark cohort tier. */
export function cohortTier(tier: string): string {
  const upper = tier.toUpperCase();
  return APEX_TIERS.has(upper) ? MASTER_PLUS : upper;
}

export function isBenchmarkableTier(tier: string): boolean {
  return COHORT_TIERS.includes(cohortTier(tier));
}

/** Numeric segment comparator for patch strings like "26.13" ("26.9" < "26.13"). */
export function comparePatches(a: string, b: string): number {
  const as = a.split('.').map(Number);
  const bs = b.split('.').map(Number);
  for (let i = 0; i < Math.max(as.length, bs.length); i++) {
    const diff = (as[i] ?? 0) - (bs[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/analysis/cohort.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/analysis/cohort.ts tests/analysis/cohort.test.ts
git commit -m "feat: cohort tier normalization and patch comparator"
```

---

### Task 3: Quantile aggregation

**Model:** Sonnet 4.6

**Files:**
- Create: `lib/analysis/benchmarkAggregate.ts`
- Test: `tests/analysis/benchmarkAggregate.test.ts`

**Interfaces:**
- Consumes: `MetricName` from `lib/analysis/metrics.ts`.
- Produces:
  - `interface BenchmarkRow { patch: string; rankTier: string; role: string; metricName: string; p25: number; p50: number; p75: number; p90: number; sampleN: number }`
  - `interface CohortFactRow { role: string; metrics: Partial<Record<MetricName, number>> }`
  - `aggregateCohort(patch: string, rankTier: string, facts: CohortFactRow[], minSampleN = 30): BenchmarkRow[]`
  - `MIN_SAMPLE_N = 30` (exported const)

- [ ] **Step 1: Write the failing test** — create `tests/analysis/benchmarkAggregate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { aggregateCohort, type CohortFactRow } from '../../lib/analysis/benchmarkAggregate';

/** n facts for one role where csAt10 runs 1..n (uniform). */
function uniformFacts(role: string, n: number): CohortFactRow[] {
  return Array.from({ length: n }, (_, i) => ({
    role,
    metrics: { csAt10: i + 1 },
  }));
}

describe('aggregateCohort', () => {
  it('computes linear-interpolation quantiles over a known distribution', () => {
    // csAt10 = 1..101 → p25 = 26, p50 = 51, p75 = 76, p90 = 91
    const rows = aggregateCohort('26.13', 'GOLD', uniformFacts('MIDDLE', 101));
    const cs = rows.find((r) => r.metricName === 'csAt10');
    expect(cs).toMatchObject({
      patch: '26.13',
      rankTier: 'GOLD',
      role: 'MIDDLE',
      p25: 26,
      p50: 51,
      p75: 76,
      p90: 91,
      sampleN: 101,
    });
  });

  it('interpolates between ranks for non-aligned quantiles', () => {
    // values 1..31: p25 index = 30 * 0.25 = 7.5 → 8.5
    const rows = aggregateCohort('26.13', 'GOLD', uniformFacts('TOP', 31));
    expect(rows.find((r) => r.metricName === 'csAt10')?.p25).toBeCloseTo(8.5, 5);
  });

  it('omits cells below the minimum sample threshold', () => {
    const rows = aggregateCohort('26.13', 'GOLD', uniformFacts('MIDDLE', 29));
    expect(rows).toHaveLength(0);
  });

  it('honors a custom threshold', () => {
    const rows = aggregateCohort('26.13', 'GOLD', uniformFacts('MIDDLE', 29), 10);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('groups by role — roles do not contaminate each other', () => {
    const facts = [...uniformFacts('MIDDLE', 30), ...uniformFacts('UTILITY', 30)];
    const rows = aggregateCohort('26.13', 'GOLD', facts);
    const roles = new Set(rows.map((r) => r.role));
    expect(roles).toEqual(new Set(['MIDDLE', 'UTILITY']));
    for (const r of rows) expect(r.sampleN).toBe(30);
  });

  it('skips metrics missing from a fact row without failing the others', () => {
    const facts: CohortFactRow[] = Array.from({ length: 30 }, (_, i) => ({
      role: 'MIDDLE',
      metrics: i < 10 ? { csAt10: i } : { csAt10: i, deaths: i },
    }));
    const rows = aggregateCohort('26.13', 'GOLD', facts, 30);
    // csAt10 has 30 samples → present; deaths has 20 → below threshold, absent.
    expect(rows.some((r) => r.metricName === 'csAt10')).toBe(true);
    expect(rows.some((r) => r.metricName === 'deaths')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/analysis/benchmarkAggregate.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the implementation** — create `lib/analysis/benchmarkAggregate.ts`:

```typescript
import type { MetricName } from './metrics';

/** Mirrors the Prisma `Benchmark` row (`prisma/schema.prisma`). */
export interface BenchmarkRow {
  patch: string;
  rankTier: string;
  role: string;
  metricName: string;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  sampleN: number;
}

/** The slice of a ParticipantFacts row aggregation needs. */
export interface CohortFactRow {
  role: string;
  metrics: Partial<Record<MetricName, number>>;
}

/** Below this many samples a (role, metric) cell stays unpublished. */
export const MIN_SAMPLE_N = 30;

/** Type-7 (linear interpolation) quantile of a pre-sorted array. */
function quantile(sorted: number[], p: number): number {
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Aggregate a cohort's facts into Benchmark rows: p25/p50/p75/p90 + sampleN per
 * (role, metric). Pure. Cells with fewer than `minSampleN` samples are omitted
 * so the lookup treats them as missing (graceful pre-benchmark mode).
 */
export function aggregateCohort(
  patch: string,
  rankTier: string,
  facts: CohortFactRow[],
  minSampleN: number = MIN_SAMPLE_N
): BenchmarkRow[] {
  // (role, metric) -> values
  const cells = new Map<string, { role: string; metricName: string; values: number[] }>();
  for (const fact of facts) {
    for (const [metricName, value] of Object.entries(fact.metrics)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      const key = `${fact.role} ${metricName}`;
      let cell = cells.get(key);
      if (!cell) {
        cell = { role: fact.role, metricName, values: [] };
        cells.set(key, cell);
      }
      cell.values.push(value);
    }
  }

  const rows: BenchmarkRow[] = [];
  for (const { role, metricName, values } of cells.values()) {
    if (values.length < minSampleN) continue;
    const sorted = [...values].sort((a, b) => a - b);
    rows.push({
      patch,
      rankTier,
      role,
      metricName,
      p25: quantile(sorted, 0.25),
      p50: quantile(sorted, 0.5),
      p75: quantile(sorted, 0.75),
      p90: quantile(sorted, 0.9),
      sampleN: sorted.length,
    });
  }
  return rows;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/analysis/benchmarkAggregate.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/analysis/benchmarkAggregate.ts tests/analysis/benchmarkAggregate.test.ts
git commit -m "feat: quantile aggregation of participant facts into benchmark rows"
```

---

### Task 4: Percentile interpolation + benchmark lookup

**Model:** Sonnet 4.6

**Files:**
- Create: `lib/analysis/benchmarkStore.ts`
- Test: `tests/analysis/benchmarkStore.test.ts`

**Interfaces:**
- Consumes: `BenchmarkRow` from Task 3; `BenchmarkLookup`, `MetricName`, `METRIC_META` from `lib/analysis/metrics.ts`.
- Produces:
  - `interface BenchmarkQuantiles { p25: number; p50: number; p75: number; p90: number }`
  - `percentileFromQuantiles(value: number, q: BenchmarkQuantiles): number` — 0–100, clamped to [5, 95].
  - `interface CohortKey { patch: string; rankTier: string; role: string }`
  - `interface BenchmarkReader { exactRows(cohort: CohortKey): Promise<BenchmarkRow[]>; previousPatchRows(cohort: CohortKey): Promise<BenchmarkRow[]> }` — `previousPatchRows` returns rows of the **newest patch older than** `cohort.patch` for the same (rankTier, role); empty array when none.
  - `loadBenchmarkLookup(cohort: CohortKey, reader: BenchmarkReader): Promise<BenchmarkLookup | null>` — `null` means true miss (no data on any patch).

- [ ] **Step 1: Write the failing test** — create `tests/analysis/benchmarkStore.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  percentileFromQuantiles,
  loadBenchmarkLookup,
  type BenchmarkReader,
  type CohortKey,
} from '../../lib/analysis/benchmarkStore';
import type { BenchmarkRow } from '../../lib/analysis/benchmarkAggregate';

const Q = { p25: 20, p50: 40, p75: 60, p90: 80 };

describe('percentileFromQuantiles', () => {
  it('returns anchor percentiles at the quantile values', () => {
    expect(percentileFromQuantiles(20, Q)).toBe(25);
    expect(percentileFromQuantiles(40, Q)).toBe(50);
    expect(percentileFromQuantiles(60, Q)).toBe(75);
    expect(percentileFromQuantiles(80, Q)).toBe(90);
  });

  it('interpolates linearly between anchors', () => {
    expect(percentileFromQuantiles(30, Q)).toBeCloseTo(37.5, 5); // midway p25→p50
    expect(percentileFromQuantiles(70, Q)).toBeCloseTo(82.5, 5); // midway p75→p90
  });

  it('extrapolates below p25 and clamps at 5', () => {
    expect(percentileFromQuantiles(16, Q)).toBeCloseTo(20, 5); // first-segment slope
    expect(percentileFromQuantiles(-1000, Q)).toBe(5);
  });

  it('extrapolates above p90 and clamps at 95', () => {
    expect(percentileFromQuantiles(84, Q)).toBeCloseTo(93, 5);
    expect(percentileFromQuantiles(1000, Q)).toBe(95);
  });

  it('averages tied anchors for zero-variance runs (e.g. soloDeathsLate mostly 0)', () => {
    const flat = { p25: 0, p50: 0, p75: 0, p90: 1 };
    expect(percentileFromQuantiles(0, flat)).toBe(50); // mean of 25, 50, 75
    const constant = { p25: 0, p50: 0, p75: 0, p90: 0 };
    expect(percentileFromQuantiles(0, constant)).toBeCloseTo(60, 5); // mean of all four
    expect(percentileFromQuantiles(-1, constant)).toBe(5);
    expect(percentileFromQuantiles(1, constant)).toBe(95);
  });
});

// --- loadBenchmarkLookup ----------------------------------------------------

const COHORT: CohortKey = { patch: '26.13', rankTier: 'GOLD', role: 'MIDDLE' };

function row(metricName: string, patch = '26.13'): BenchmarkRow {
  return { patch, rankTier: 'GOLD', role: 'MIDDLE', metricName, ...Q, sampleN: 40 };
}

function readerWith(exact: BenchmarkRow[], previous: BenchmarkRow[] = []): BenchmarkReader {
  return {
    exactRows: async () => exact,
    previousPatchRows: async () => previous,
  };
}

describe('loadBenchmarkLookup', () => {
  it('resolves metrics from the exact cohort', async () => {
    const lookup = await loadBenchmarkLookup(COHORT, readerWith([row('csAt10')]));
    expect(lookup).not.toBeNull();
    expect(lookup!('csAt10', 40)).toBe(50);
    expect(lookup!('deaths', 3)).toBeUndefined(); // metric not benchmarked
  });

  it('falls back to the previous patch per metric, exact rows winning', async () => {
    const exact = [{ ...row('csAt10'), p50: 40 }];
    const previous = [
      { ...row('csAt10', '26.12'), p50: 999 }, // must NOT override exact
      row('deaths', '26.12'),
    ];
    const lookup = await loadBenchmarkLookup(COHORT, readerWith(exact, previous));
    expect(lookup!('csAt10', 40)).toBe(50); // from exact, not 26.12
    expect(lookup!('deaths', 40)).toBe(50); // from fallback
  });

  it('returns null on a true miss (no rows on any patch)', async () => {
    expect(await loadBenchmarkLookup(COHORT, readerWith([], []))).toBeNull();
  });

  it('skips the fallback query when the exact patch covers all metrics', async () => {
    let fallbackCalls = 0;
    const allMetrics = [
      'csAt10', 'goldDiffAt10', 'xpDiffAt14', 'platesTaken', 'deathsPre14',
      'visionScorePerMin', 'controlWardsPurchased', 'wardsKilled', 'killParticipation',
      'soloKills', 'damagePerMin', 'damageShare', 'deaths', 'soloDeathsLate',
    ].map((m) => row(m));
    const reader: BenchmarkReader = {
      exactRows: async () => allMetrics,
      previousPatchRows: async () => { fallbackCalls++; return []; },
    };
    const lookup = await loadBenchmarkLookup(COHORT, reader);
    expect(lookup).not.toBeNull();
    expect(fallbackCalls).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/analysis/benchmarkStore.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the implementation** — create `lib/analysis/benchmarkStore.ts`:

```typescript
import type { BenchmarkRow } from './benchmarkAggregate';
import { METRIC_META, type BenchmarkLookup, type MetricName } from './metrics';

export interface BenchmarkQuantiles {
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface CohortKey {
  patch: string;
  rankTier: string;
  role: string;
}

/**
 * Read access to Benchmark rows. `previousPatchRows` returns the rows of the
 * NEWEST patch strictly older than `cohort.patch` for the same (rankTier, role);
 * empty array when no older patch has data. Prisma impl lives in benchmarkDb.ts;
 * tests inject fakes.
 */
export interface BenchmarkReader {
  exactRows(cohort: CohortKey): Promise<BenchmarkRow[]>;
  previousPatchRows(cohort: CohortKey): Promise<BenchmarkRow[]>;
}

const ANCHORS: { key: keyof BenchmarkQuantiles; pct: number }[] = [
  { key: 'p25', pct: 25 },
  { key: 'p50', pct: 50 },
  { key: 'p75', pct: 75 },
  { key: 'p90', pct: 90 },
];

function lerp(x: number, x0: number, y0: number, x1: number, y1: number): number {
  if (x1 === x0) return (y0 + y1) / 2;
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

const clamp = (pct: number): number => Math.min(95, Math.max(5, pct));

/**
 * Raw percentile (0–100) of `value` inside a quantile summary, by piecewise-linear
 * interpolation across the p25/p50/p75/p90 anchors. Outside the anchors we
 * extrapolate on the nearest segment's slope and clamp to [5, 95] — with only
 * four quantiles stored, tail claims beyond that are not supportable.
 * Ties with anchor values average the tied anchors' percentiles so zero-variance
 * runs (count metrics that are mostly 0) land mid-run instead of at its edge.
 */
export function percentileFromQuantiles(value: number, q: BenchmarkQuantiles): number {
  const pts = ANCHORS.map(({ key, pct }) => ({ v: q[key], pct }));

  const tied = pts.filter((p) => p.v === value);
  if (tied.length > 0) {
    return clamp(tied.reduce((sum, p) => sum + p.pct, 0) / tied.length);
  }
  if (value < pts[0].v) {
    return clamp(lerp(value, pts[0].v, pts[0].pct, pts[1].v, pts[1].pct));
  }
  if (value > pts[3].v) {
    return clamp(lerp(value, pts[2].v, pts[2].pct, pts[3].v, pts[3].pct));
  }
  for (let i = 0; i < pts.length - 1; i++) {
    if (value > pts[i].v && value < pts[i + 1].v) {
      return clamp(lerp(value, pts[i].v, pts[i].pct, pts[i + 1].v, pts[i + 1].pct));
    }
  }
  /* istanbul ignore next -- unreachable: the branches above are exhaustive */
  return 50;
}

const ALL_METRICS = Object.keys(METRIC_META) as MetricName[];

/**
 * Build a BenchmarkLookup for one cohort: exact patch first, previous patch
 * filling per-metric gaps, `null` on a true miss (caller enqueues a fill job).
 * One reader call per source — the page does one batched read, not 14.
 */
export async function loadBenchmarkLookup(
  cohort: CohortKey,
  reader: BenchmarkReader
): Promise<BenchmarkLookup | null> {
  const byMetric = new Map<string, BenchmarkRow>();
  for (const row of await reader.exactRows(cohort)) {
    byMetric.set(row.metricName, row);
  }
  if (byMetric.size < ALL_METRICS.length) {
    for (const row of await reader.previousPatchRows(cohort)) {
      if (!byMetric.has(row.metricName)) byMetric.set(row.metricName, row);
    }
  }
  if (byMetric.size === 0) return null;

  return (metric, value) => {
    const row = byMetric.get(metric);
    return row ? percentileFromQuantiles(value, row) : undefined;
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/analysis/benchmarkStore.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/analysis/benchmarkStore.ts tests/analysis/benchmarkStore.test.ts
git commit -m "feat: benchmark lookup with quantile interpolation and previous-patch fallback"
```

---

### Task 5: Per-participant facts extraction

**Model:** Sonnet 4.6

**Files:**
- Modify: `lib/analysis/metrics.ts:82` (export the private `rawValues` as `rawMetricValues`)
- Modify: `lib/analysis/factSheet.ts:53` (export the private `rolesByParticipantId`)
- Modify: `lib/riot/types.ts:43-67` (add `championId: number` to `ParticipantDto`)
- Create: `lib/analysis/participantFacts.ts`
- Test: `tests/analysis/participantFacts.test.ts`

**Interfaces:**
- Consumes: `extractTimelineFacts` (`lib/analysis/timelineFacts.ts`), `findLaneOpponentPuuid` + `rolesByParticipantId` (`lib/analysis/factSheet.ts`), `QUEUE_RANKED_SOLO` (`lib/riot/match.ts`).
- Produces:
  - `interface ParticipantFactsRow { matchId: string; puuid: string; role: string; championId: number; patch: string; rankTier: string; metrics: Record<MetricName, number> }`
  - `extractMatchFacts(match: MatchDto, timeline: MatchTimelineDto, opts: { patch: string; rankTier: string }): ParticipantFactsRow[]` — `[]` for non-420 queues, games < 14 min; skips participants with empty `teamPosition`.
  - `rawMetricValues(participant: ParticipantDto, timeline: TimelineFacts): Record<MetricName, number>` (exported from metrics.ts).

- [ ] **Step 1: Export the two private helpers.**

In `lib/analysis/metrics.ts`, change line 82:

```typescript
/** Raw metric values pulled from match `challenges` + timeline facts. */
function rawValues(participant: ParticipantDto, timeline: TimelineFacts): Record<MetricName, number> {
```

to:

```typescript
/** Raw metric values pulled from match `challenges` + timeline facts. */
export function rawMetricValues(
  participant: ParticipantDto,
  timeline: TimelineFacts
): Record<MetricName, number> {
```

and update its single call site in `computeMetrics` (line 113): `const raw = rawValues(participant, timeline);` → `const raw = rawMetricValues(participant, timeline);`.

In `lib/analysis/factSheet.ts`, change line 53 `function rolesByParticipantId(` to `export function rolesByParticipantId(`.

In `lib/riot/types.ts`, add to `ParticipantDto` (after `championName: string;`):

```typescript
  championId: number;
```

Run: `npm run typecheck` — expect **failures** in test fixtures that build `ParticipantDto` without `championId` (e.g. `tests/analysis/`, `tests/components/`). Add `championId: 1,` to each failing fixture object until typecheck passes.

- [ ] **Step 2: Write the failing test** — create `tests/analysis/participantFacts.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { extractMatchFacts } from '../../lib/analysis/participantFacts';
import type { MatchDto, MatchTimelineDto, ParticipantDto } from '../../lib/riot/types';

const ROLES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const;

function mkParticipant(i: number): ParticipantDto {
  return {
    puuid: `p${i}`,
    riotIdGameName: `Player${i}`,
    riotIdTagline: 'EUW',
    championName: 'Ahri',
    championId: 103,
    kills: i,
    deaths: 2,
    assists: 3,
    win: i < 5,
    teamId: i < 5 ? 100 : 200,
    teamPosition: ROLES[i % 5],
    item0: 0, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, item6: 0,
    summoner1Id: 4,
    summoner2Id: 12,
    totalDamageDealtToChampions: 10_000,
    visionScore: 20,
    challenges: { laneMinionsFirst10Minutes: 60 + i, killParticipation: 0.5 },
  };
}

function mkMatch(over: Partial<MatchDto['info']> = {}): MatchDto {
  const participants = Array.from({ length: 10 }, (_, i) => mkParticipant(i));
  return {
    metadata: { matchId: 'EUW1_1', participants: participants.map((p) => p.puuid) },
    info: { gameCreation: 0, gameDuration: 1800, queueId: 420, participants, ...over },
  };
}

function mkTimeline(): MatchTimelineDto {
  return {
    metadata: { matchId: 'EUW1_1', participants: [] },
    info: {
      frameInterval: 60_000,
      frames: [{ timestamp: 0, participantFrames: {}, events: [] }],
      participants: Array.from({ length: 10 }, (_, i) => ({ participantId: i + 1, puuid: `p${i}` })),
    },
  };
}

const OPTS = { patch: '26.13', rankTier: 'GOLD' };

describe('extractMatchFacts', () => {
  it('produces one row per participant with cohort tags and metrics', () => {
    const rows = extractMatchFacts(mkMatch(), mkTimeline(), OPTS);
    expect(rows).toHaveLength(10);
    expect(rows[0]).toMatchObject({
      matchId: 'EUW1_1',
      puuid: 'p0',
      role: 'TOP',
      championId: 103,
      patch: '26.13',
      rankTier: 'GOLD',
    });
    // Raw challenge metric flows through per participant.
    expect(rows[3].metrics.csAt10).toBe(63);
    expect(rows[0].metrics.deaths).toBe(2);
  });

  it('returns [] for non ranked-solo queues', () => {
    expect(extractMatchFacts(mkMatch({ queueId: 440 }), mkTimeline(), OPTS)).toEqual([]);
  });

  it('returns [] for remakes / games under 14 minutes', () => {
    expect(extractMatchFacts(mkMatch({ gameDuration: 700 }), mkTimeline(), OPTS)).toEqual([]);
  });

  it('skips participants with no teamPosition', () => {
    const match = mkMatch();
    match.info.participants[9] = { ...match.info.participants[9], teamPosition: '' };
    expect(extractMatchFacts(match, mkTimeline(), OPTS)).toHaveLength(9);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/analysis/participantFacts.test.ts`
Expected: FAIL — cannot resolve `lib/analysis/participantFacts`.

- [ ] **Step 4: Write the implementation** — create `lib/analysis/participantFacts.ts`:

```typescript
import type { MatchDto, MatchTimelineDto } from '../riot/types';
import { QUEUE_RANKED_SOLO } from '../riot/match';
import { extractTimelineFacts } from './timelineFacts';
import { findLaneOpponentPuuid, rolesByParticipantId } from './factSheet';
import { rawMetricValues, type MetricName } from './metrics';

/** Mirrors the Prisma `ParticipantFacts` row (`prisma/schema.prisma`). */
export interface ParticipantFactsRow {
  matchId: string;
  puuid: string;
  role: string;
  championId: number;
  patch: string;
  rankTier: string;
  metrics: Record<MetricName, number>;
}

const MIN_GAME_SECONDS = 14 * 60;

/**
 * Extract benchmark-corpus facts for ALL 10 participants of one match. Pure CPU
 * (no I/O). Returns [] for games the corpus excludes: non ranked-solo queues and
 * remakes (< 14 min). All participants are tagged with the anchor player's
 * cohort (patch, rankTier) — solo-queue lobbies are tier-homogeneous, which
 * saves 10 rank lookups per match (see design spec, "tier-tagging shortcut").
 */
export function extractMatchFacts(
  match: MatchDto,
  timeline: MatchTimelineDto,
  opts: { patch: string; rankTier: string }
): ParticipantFactsRow[] {
  if (match.info.queueId !== QUEUE_RANKED_SOLO) return [];
  if (match.info.gameDuration < MIN_GAME_SECONDS) return [];

  const roles = rolesByParticipantId(match, timeline);

  return match.info.participants.flatMap((participant) => {
    if (!participant.teamPosition) return [];
    const timelineFacts = extractTimelineFacts(timeline, participant.puuid, {
      opponentPuuid: findLaneOpponentPuuid(match, participant.puuid),
      rolesByParticipantId: roles,
    });
    return [
      {
        matchId: match.metadata.matchId,
        puuid: participant.puuid,
        role: participant.teamPosition,
        championId: participant.championId,
        patch: opts.patch,
        rankTier: opts.rankTier,
        metrics: rawMetricValues(participant, timelineFacts),
      },
    ];
  });
}
```

- [ ] **Step 5: Run the full suite** (the export changes touch shared modules)

Run: `npx vitest run && npm run typecheck`
Expected: all tests PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add lib/analysis/metrics.ts lib/analysis/factSheet.ts lib/analysis/participantFacts.ts lib/riot/types.ts tests/
git commit -m "feat: extract benchmark facts for all 10 participants of a match"
```

---

### Task 6: Fill-job engine (state machine)

**Model:** Opus 4.8 — budget accounting, resumability, and failure paths make this the highest-risk task.

**Files:**
- Create: `lib/analysis/benchmarkFill.ts`
- Test: `tests/analysis/benchmarkFill.test.ts`

**Interfaces:**
- Consumes: `extractMatchFacts`, `ParticipantFactsRow` (Task 5); `aggregateCohort`, `BenchmarkRow`, `CohortFactRow` (Task 3); `PlatformRegion` (`lib/riot/regions.ts`).
- Produces (Task 7 implements the real deps; Task 8 calls `processFillTick`/`sweepDirtyCohorts`):

```typescript
export interface FillJobRow {
  id: string;
  patch: string;
  rankTier: string;
  region: PlatformRegion;
  seedPuuids: string[];
  pendingMatchIds: string[];
  processedCount: number;
}

export interface RiotFetcher {
  ladderPuuids(region: PlatformRegion, rankTier: string): Promise<string[]>; // 1 request
  matchIds(region: PlatformRegion, puuid: string): Promise<string[]>;        // 1 request
  match(region: PlatformRegion, matchId: string): Promise<MatchDto>;         // 1 request
  timeline(region: PlatformRegion, matchId: string): Promise<MatchTimelineDto>; // 1 request
}

export interface FillStore {
  claimNextJob(): Promise<FillJobRow | null>; // oldest pending/running -> running
  saveCursor(id: string, cursor: { seedPuuids?: string[]; pendingMatchIds: string[]; processedCount: number }): Promise<void>;
  finishJob(id: string): Promise<void>;       // status = done
  recordAttemptFailure(id: string, maxAttempts: number): Promise<void>; // attempts+1; failed at max, else back to pending
  hasFacts(matchId: string): Promise<boolean>;
  saveFacts(rows: ParticipantFactsRow[]): Promise<void>;
  factsForCohort(patch: string, rankTier: string): Promise<CohortFactRow[]>;
  saveBenchmarks(rows: BenchmarkRow[]): Promise<void>;
  cohortStats(): Promise<CohortStat[]>;
}

export interface CohortStat {
  patch: string;
  rankTier: string;
  factCount: number;
  /** SUM(sampleN) of the 'deaths' benchmark rows for this cohort = fact count at last aggregation (deaths is defined for every participant). 0 when never aggregated. */
  benchmarkedCount: number;
}

export interface FillTickResult { jobId: string; requestsUsed: number; matchesProcessed: number; finished: boolean }

export const FILL_TARGET_MATCHES = 40;
export const DEFAULT_TICK_BUDGET = 50;
export const MAX_ATTEMPTS = 5;
export const SEED_PLAYERS = 10;

export function processFillTick(deps: { store: FillStore; riot: RiotFetcher; budget?: number }): Promise<FillTickResult | null>;
export function sweepDirtyCohorts(store: FillStore): Promise<number>; // returns cohorts re-aggregated
```

Design notes for the implementer:
- **Budget accounting:** every `RiotFetcher` call costs 1 from the budget; a call must never be made once `used` reaches `budget`. A match costs 2 (match + timeline); never start a match with fewer than 2 left.
- **Seeding (first tick of a job):** `seedPuuids` empty → fetch ladder (1 req), take first `SEED_PLAYERS`, fetch each player's match ids (1 req each, stop early if the budget would be exceeded), dedupe ids across players, drop ids where `store.hasFacts(id)` is true, cap at `FILL_TARGET_MATCHES`, then `saveCursor` with the seeds + queue. Continue into match processing with the remaining budget.
- **Processing:** pop from the front of `pendingMatchIds`; fetch match + timeline; `extractMatchFacts`; save facts when non-empty (a filtered-out match still counts as processed — it must leave the queue); `saveCursor` after **every** match so a crash never repeats work.
- **Aggregation:** once per tick, after the loop, only if ≥1 match was processed this tick: `saveBenchmarks(aggregateCohort(patch, rankTier, await factsForCohort(...)))`. This satisfies the spec's "publish at ~20 matches" — a 50-budget tick processes ~20 matches, so the first tick publishes rough benchmarks and the second finishes the job.
- **Completion:** queue empty → `finishJob`. This includes the degenerate seed-produced-nothing case.
- **Failure:** wrap the whole tick body in try/catch; on error `recordAttemptFailure(job.id, MAX_ATTEMPTS)` and return the partial result (`finished: false`). Cursor state saved so far is kept.
- **Dirty sweep:** re-aggregate a cohort when `factCount >= 30` and (`benchmarkedCount === 0` or `factCount >= ceil(benchmarkedCount * 1.25)`).

- [ ] **Step 1: Write the failing tests** — create `tests/analysis/benchmarkFill.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  processFillTick,
  sweepDirtyCohorts,
  FILL_TARGET_MATCHES,
  type FillStore,
  type FillJobRow,
  type RiotFetcher,
  type CohortStat,
} from '../../lib/analysis/benchmarkFill';
import type { MatchDto, MatchTimelineDto, ParticipantDto } from '../../lib/riot/types';
import type { CohortFactRow } from '../../lib/analysis/benchmarkAggregate';

// --- Fixtures ---------------------------------------------------------------

const ROLES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const;

function mkParticipant(i: number, matchId: string): ParticipantDto {
  return {
    puuid: `${matchId}-p${i}`,
    riotIdGameName: `Player${i}`, riotIdTagline: 'EUW',
    championName: 'Ahri', championId: 103,
    kills: i, deaths: 2, assists: 3, win: i < 5, teamId: i < 5 ? 100 : 200,
    teamPosition: ROLES[i % 5],
    item0: 0, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, item6: 0,
    summoner1Id: 4, summoner2Id: 12, totalDamageDealtToChampions: 10_000, visionScore: 20,
    challenges: { laneMinionsFirst10Minutes: 60 },
  };
}

function mkMatch(matchId: string, queueId = 420): MatchDto {
  const participants = Array.from({ length: 10 }, (_, i) => mkParticipant(i, matchId));
  return {
    metadata: { matchId, participants: participants.map((p) => p.puuid) },
    info: { gameCreation: 0, gameDuration: 1800, queueId, participants },
  };
}

function mkTimeline(matchId: string): MatchTimelineDto {
  return {
    metadata: { matchId, participants: [] },
    info: {
      frameInterval: 60_000,
      frames: [{ timestamp: 0, participantFrames: {}, events: [] }],
      participants: Array.from({ length: 10 }, (_, i) => ({
        participantId: i + 1,
        puuid: `${matchId}-p${i}`,
      })),
    },
  };
}

function mkJob(over: Partial<FillJobRow> = {}): FillJobRow {
  return {
    id: 'job1', patch: '26.13', rankTier: 'GOLD', region: 'euw1',
    seedPuuids: [], pendingMatchIds: [], processedCount: 0,
    ...over,
  };
}

interface StoreState {
  cursors: { seedPuuids?: string[]; pendingMatchIds: string[]; processedCount: number }[];
  savedFacts: string[];
  benchmarkSaves: number;
  finished: boolean;
  failures: number;
}

/** In-memory FillStore capturing all writes. */
function mkStore(
  job: FillJobRow | null,
  knownMatches = new Set<string>()
): { store: FillStore; state: StoreState } {
  const state: StoreState = {
    cursors: [],
    savedFacts: [],
    benchmarkSaves: 0,
    finished: false,
    failures: 0,
  };
  const store: FillStore = {
    claimNextJob: async () => job,
    saveCursor: async (_id, cursor) => { state.cursors.push(cursor); },
    finishJob: async () => { state.finished = true; },
    recordAttemptFailure: async () => { state.failures++; },
    hasFacts: async (matchId) => knownMatches.has(matchId),
    saveFacts: async (rows) => { state.savedFacts.push(...rows.map((r) => r.matchId)); },
    factsForCohort: async (): Promise<CohortFactRow[]> =>
      Array.from({ length: 35 }, (_, i) => ({ role: 'MIDDLE', metrics: { csAt10: i } })),
    saveBenchmarks: async () => { state.benchmarkSaves++; },
    cohortStats: async () => [],
  };
  return { store, state };
}

function mkRiot(over: Partial<RiotFetcher> = {}): RiotFetcher {
  return {
    ladderPuuids: async () => Array.from({ length: 10 }, (_, i) => `seed${i}`),
    matchIds: async (_r, puuid) => [`M_${puuid}_1`, `M_${puuid}_2`],
    match: async (_r, id) => mkMatch(id),
    timeline: async (_r, id) => mkTimeline(id),
    ...over,
  };
}

// --- Tests -------------------------------------------------------------------

describe('processFillTick', () => {
  it('returns null when there is no job to claim', async () => {
    const { store } = mkStore(null);
    expect(await processFillTick({ store, riot: mkRiot() })).toBeNull();
  });

  it('seeds from the ladder: dedupes, drops known matches, caps the queue', async () => {
    const { store, state } = mkStore(mkJob(), new Set(['M_seed0_1']));
    const riot = mkRiot({
      // Every player returns the same 45 ids -> dedupe to 45, minus 1 known, cap 40.
      matchIds: async () => Array.from({ length: 45 }, (_, i) => `M_seed0_${i + 1}`),
    });
    await processFillTick({ store, riot, budget: 11 }); // 1 ladder + 10 id lists, nothing left for matches
    const seeded = state.cursors[0];
    expect(seeded.seedPuuids).toHaveLength(10);
    expect(seeded.pendingMatchIds).toHaveLength(FILL_TARGET_MATCHES);
    expect(seeded.pendingMatchIds).not.toContain('M_seed0_1');
  });

  it('spends the budget 2-per-match and persists the cursor after every match', async () => {
    const pending = Array.from({ length: 10 }, (_, i) => `M_${i}`);
    const { store, state } = mkStore(mkJob({ seedPuuids: ['s'], pendingMatchIds: pending }));
    const result = await processFillTick({ store, riot: mkRiot(), budget: 9 });
    // budget 9 -> 4 matches (8 requests); the 9th request cannot start a match.
    expect(result).toMatchObject({ requestsUsed: 8, matchesProcessed: 4, finished: false });
    expect(state.cursors).toHaveLength(4);
    expect(state.cursors.at(-1)).toMatchObject({ pendingMatchIds: pending.slice(4), processedCount: 4 });
    expect(state.savedFacts).toHaveLength(4 * 10);
  });

  it('publishes aggregated benchmarks once per tick that processed matches', async () => {
    const { store, state } = mkStore(mkJob({ seedPuuids: ['s'], pendingMatchIds: ['M_1', 'M_2'] }));
    await processFillTick({ store, riot: mkRiot(), budget: 50 });
    expect(state.benchmarkSaves).toBe(1);
  });

  it('finishes the job when the queue empties', async () => {
    const { store, state } = mkStore(mkJob({ seedPuuids: ['s'], pendingMatchIds: ['M_1'] }));
    const result = await processFillTick({ store, riot: mkRiot(), budget: 50 });
    expect(result?.finished).toBe(true);
    expect(state.finished).toBe(true);
  });

  it('counts filtered-out matches as processed so they leave the queue', async () => {
    const { store, state } = mkStore(mkJob({ seedPuuids: ['s'], pendingMatchIds: ['M_1'] }));
    const riot = mkRiot({ match: async (_r, id) => mkMatch(id, 440) }); // wrong queue
    const result = await processFillTick({ store, riot, budget: 50 });
    expect(result?.finished).toBe(true);
    expect(state.savedFacts).toHaveLength(0);
  });

  it('records an attempt failure and keeps prior cursor progress on mid-tick errors', async () => {
    const { store, state } = mkStore(mkJob({ seedPuuids: ['s'], pendingMatchIds: ['M_1', 'M_2'] }));
    let calls = 0;
    const riot = mkRiot({
      match: async (_r, id) => {
        if (++calls === 2) throw new Error('riot 500');
        return mkMatch(id);
      },
    });
    const result = await processFillTick({ store, riot, budget: 50 });
    expect(result?.finished).toBe(false);
    expect(state.failures).toBe(1);
    expect(state.cursors).toHaveLength(1); // first match's progress survived
  });
});

describe('sweepDirtyCohorts', () => {
  function statsStore(stats: CohortStat[]) {
    const { store, state } = mkStore(null);
    store.cohortStats = async () => stats;
    return { store, state };
  }

  it('re-aggregates never-benchmarked cohorts once they have 30+ facts', async () => {
    const { store, state } = statsStore([
      { patch: '26.13', rankTier: 'GOLD', factCount: 35, benchmarkedCount: 0 },
    ]);
    expect(await sweepDirtyCohorts(store)).toBe(1);
    expect(state.benchmarkSaves).toBe(1);
  });

  it('skips cohorts that have not grown 25% since last aggregation', async () => {
    const { store } = statsStore([
      { patch: '26.13', rankTier: 'GOLD', factCount: 400, benchmarkedCount: 350 },
    ]);
    expect(await sweepDirtyCohorts(store)).toBe(0);
  });

  it('re-aggregates cohorts that grew 25%+', async () => {
    const { store } = statsStore([
      { patch: '26.13', rankTier: 'GOLD', factCount: 500, benchmarkedCount: 350 },
    ]);
    expect(await sweepDirtyCohorts(store)).toBe(1);
  });

  it('ignores cohorts under the 30-fact floor', async () => {
    const { store } = statsStore([
      { patch: '26.13', rankTier: 'GOLD', factCount: 20, benchmarkedCount: 0 },
    ]);
    expect(await sweepDirtyCohorts(store)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/analysis/benchmarkFill.test.ts`
Expected: FAIL — cannot resolve `lib/analysis/benchmarkFill`.

- [ ] **Step 3: Write the implementation** — create `lib/analysis/benchmarkFill.ts`:

```typescript
import type { MatchDto, MatchTimelineDto } from '../riot/types';
import type { PlatformRegion } from '../riot/regions';
import { aggregateCohort, type BenchmarkRow, type CohortFactRow } from './benchmarkAggregate';
import { extractMatchFacts, type ParticipantFactsRow } from './participantFacts';

export const FILL_TARGET_MATCHES = 40;
export const DEFAULT_TICK_BUDGET = 50;
export const MAX_ATTEMPTS = 5;
export const SEED_PLAYERS = 10;

export interface FillJobRow {
  id: string;
  patch: string;
  rankTier: string;
  region: PlatformRegion;
  seedPuuids: string[];
  pendingMatchIds: string[];
  processedCount: number;
}

/** Riot reads the fill needs — one budget unit per call. Real impl: benchmarkDb.ts. */
export interface RiotFetcher {
  ladderPuuids(region: PlatformRegion, rankTier: string): Promise<string[]>;
  matchIds(region: PlatformRegion, puuid: string): Promise<string[]>;
  match(region: PlatformRegion, matchId: string): Promise<MatchDto>;
  timeline(region: PlatformRegion, matchId: string): Promise<MatchTimelineDto>;
}

export interface CohortStat {
  patch: string;
  rankTier: string;
  factCount: number;
  /**
   * Fact count at the last aggregation, measured as SUM(sampleN) over the
   * cohort's 'deaths' benchmark rows — deaths is defined for every participant,
   * so that sum equals the fact count the aggregate was built from. 0 = never.
   */
  benchmarkedCount: number;
}

/** Persistence the fill needs. Real impl: benchmarkDb.ts; tests inject fakes. */
export interface FillStore {
  claimNextJob(): Promise<FillJobRow | null>;
  saveCursor(
    id: string,
    cursor: { seedPuuids?: string[]; pendingMatchIds: string[]; processedCount: number }
  ): Promise<void>;
  finishJob(id: string): Promise<void>;
  recordAttemptFailure(id: string, maxAttempts: number): Promise<void>;
  hasFacts(matchId: string): Promise<boolean>;
  saveFacts(rows: ParticipantFactsRow[]): Promise<void>;
  factsForCohort(patch: string, rankTier: string): Promise<CohortFactRow[]>;
  saveBenchmarks(rows: BenchmarkRow[]): Promise<void>;
  cohortStats(): Promise<CohortStat[]>;
}

export interface FillTickResult {
  jobId: string;
  requestsUsed: number;
  matchesProcessed: number;
  finished: boolean;
}

/**
 * One resumable chunk of a cohort fill: claim the oldest job, spend up to
 * `budget` Riot requests, persist the cursor after every match, aggregate once
 * at the end, finish when the queue empties. Errors mark an attempt failure and
 * keep all cursor progress. Returns null when no job is waiting.
 */
export async function processFillTick(deps: {
  store: FillStore;
  riot: RiotFetcher;
  budget?: number;
}): Promise<FillTickResult | null> {
  const { store, riot, budget = DEFAULT_TICK_BUDGET } = deps;
  const job = await store.claimNextJob();
  if (!job) return null;

  let used = 0;
  let processed = 0;

  try {
    let pending = job.pendingMatchIds;

    if (job.seedPuuids.length === 0) {
      const seeds = (await riot.ladderPuuids(job.region, job.rankTier)).slice(0, SEED_PLAYERS);
      used += 1;
      const ids = new Set<string>();
      for (const puuid of seeds) {
        if (used >= budget) break;
        for (const id of await riot.matchIds(job.region, puuid)) ids.add(id);
        used += 1;
      }
      pending = [];
      for (const id of ids) {
        if (pending.length >= FILL_TARGET_MATCHES) break;
        if (!(await store.hasFacts(id))) pending.push(id);
      }
      await store.saveCursor(job.id, {
        seedPuuids: seeds,
        pendingMatchIds: pending,
        processedCount: 0,
      });
    }

    while (pending.length > 0 && used + 2 <= budget) {
      const matchId = pending[0];
      const match = await riot.match(job.region, matchId);
      used += 1;
      const timeline = await riot.timeline(job.region, matchId);
      used += 1;
      // Filtered-out matches (wrong queue, remake) yield [] but still leave the queue.
      const rows = extractMatchFacts(match, timeline, { patch: job.patch, rankTier: job.rankTier });
      if (rows.length > 0) await store.saveFacts(rows);
      pending = pending.slice(1);
      processed += 1;
      await store.saveCursor(job.id, {
        pendingMatchIds: pending,
        processedCount: job.processedCount + processed,
      });
    }

    if (processed > 0) {
      const facts = await store.factsForCohort(job.patch, job.rankTier);
      await store.saveBenchmarks(aggregateCohort(job.patch, job.rankTier, facts));
    }

    const finished = pending.length === 0;
    if (finished) await store.finishJob(job.id);
    return { jobId: job.id, requestsUsed: used, matchesProcessed: processed, finished };
  } catch (error) {
    console.error(`benchmark fill ${job.id} (${job.patch} ${job.rankTier}) failed mid-tick —`, error);
    await store.recordAttemptFailure(job.id, MAX_ATTEMPTS);
    return { jobId: job.id, requestsUsed: used, matchesProcessed: processed, finished: false };
  }
}

/**
 * Re-aggregate cohorts whose organic fact corpus outgrew the published
 * benchmarks: ≥30 facts and never aggregated, or grown ≥25% since the last
 * aggregation. Costs zero Riot requests. Returns the number swept.
 */
export async function sweepDirtyCohorts(store: FillStore): Promise<number> {
  let swept = 0;
  for (const stat of await store.cohortStats()) {
    if (stat.factCount < 30) continue;
    const grown =
      stat.benchmarkedCount === 0 || stat.factCount >= Math.ceil(stat.benchmarkedCount * 1.25);
    if (!grown) continue;
    const facts = await store.factsForCohort(stat.patch, stat.rankTier);
    await store.saveBenchmarks(aggregateCohort(stat.patch, stat.rankTier, facts));
    swept += 1;
  }
  return swept;
}
```

Note for the implementer: the budget invariant is *every `RiotFetcher` call costs exactly 1, and no call may happen once `used` reaches `budget`*. If a test's `requestsUsed` expectation disagrees with your accounting, fix the implementation to uphold the invariant, not the test.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/analysis/benchmarkFill.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run && npm run typecheck`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/analysis/benchmarkFill.ts tests/analysis/benchmarkFill.test.ts
git commit -m "feat: resumable benchmark fill engine with budget accounting and dirty-cohort sweep"
```

---

### Task 7: Riot ladder endpoints + Prisma DB layer

**Model:** Sonnet 4.6

**Files:**
- Modify: `lib/riot/league.ts` (add tier-ladder endpoints)
- Modify: `lib/riot/types.ts:13-20` (add `puuid` to `LeagueEntryDto`, add `LeagueListDto`)
- Create: `lib/analysis/benchmarkDb.ts` (all Prisma-backed implementations — repo convention: DB wrappers are not unit-tested; logic lives in the tested pure modules)

**Interfaces:**
- Consumes: `FillStore`, `RiotFetcher`, `FillJobRow`, `CohortStat`, `MAX_ATTEMPTS` (Task 6); `BenchmarkReader`, `CohortKey` (Task 4); `BenchmarkRow`, `CohortFactRow` (Task 3); `ParticipantFactsRow` (Task 5); `comparePatches`, `MASTER_PLUS` (Task 2); `prisma` (`lib/db.ts`).
- Produces (consumed by Tasks 8–9):
  - `prismaFillStore: FillStore`
  - `riotFetcher: RiotFetcher`
  - `prismaBenchmarkReader: BenchmarkReader`
  - `enqueueBenchmarkJob(input: { patch: string; rankTier: string; region: string }): Promise<void>` — create-if-not-exists; revives `failed` jobs older than 24h; **swallows all errors** (logs them).
  - `hasActiveBenchmarkJob(patch: string, rankTier: string): Promise<boolean>` — status `pending` or `running`.
  - `saveParticipantFacts(rows: ParticipantFactsRow[]): Promise<void>` — `createMany` + `skipDuplicates`.

- [ ] **Step 1: Add ladder endpoints.** In `lib/riot/types.ts`, extend `LeagueEntryDto` and add `LeagueListDto`:

```typescript
export interface LeagueEntryDto {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  /** Present on tier-ladder entries (LEAGUE-V4 added puuid in 2024); absent on by-puuid responses. */
  puuid?: string;
}

/** LEAGUE-V4 master/grandmaster/challenger league list. */
export interface LeagueListDto {
  entries: { puuid: string; leaguePoints: number }[];
}
```

In `lib/riot/league.ts`, append (merge the type import with the existing one):

```typescript
import type { LeagueListDto } from './types';

export type LeagueDivision = 'I' | 'II' | 'III' | 'IV';

/**
 * One page of the ranked-solo ladder for a tier/division (IRON…DIAMOND).
 * Used to sample benchmark crawl seeds; cached an hour — seed freshness is
 * irrelevant, any current-tier players will do.
 */
export function getLeagueEntriesByTier(
  platform: PlatformRegion,
  tier: string,
  division: LeagueDivision = 'II',
  page = 1
): Promise<LeagueEntryDto[]> {
  const path = `/lol/league/v4/entries/RANKED_SOLO_5x5/${tier}/${division}?page=${page}`;
  return riotClient.platformFetch<LeagueEntryDto[]>(platform, path, { revalidateSeconds: 3600 });
}

/** The master league — seed source for the merged MASTER_PLUS cohort. */
export function getMasterLeague(platform: PlatformRegion): Promise<LeagueListDto> {
  const path = `/lol/league/v4/masterleagues/by-queue/RANKED_SOLO_5x5`;
  return riotClient.platformFetch<LeagueListDto>(platform, path, { revalidateSeconds: 3600 });
}
```

- [ ] **Step 2: Create `lib/analysis/benchmarkDb.ts`:**

```typescript
import { Prisma, type BenchmarkJob } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getLeagueEntriesByTier, getMasterLeague, type LeagueDivision } from '@/lib/riot/league';
import { getMatchById, getMatchIdsByPuuid, getMatchTimeline, QUEUE_RANKED_SOLO } from '@/lib/riot/match';
import { isPlatformRegion, type PlatformRegion } from '@/lib/riot/regions';
import type { BenchmarkRow, CohortFactRow } from './benchmarkAggregate';
import type { BenchmarkReader, CohortKey } from './benchmarkStore';
import type { CohortStat, FillJobRow, FillStore, RiotFetcher } from './benchmarkFill';
import type { ParticipantFactsRow } from './participantFacts';
import { comparePatches, MASTER_PLUS } from './cohort';

/*
 * Prisma + Riot implementations of the interfaces the pure benchmark modules
 * define. Repo convention (see analysisStore.ts): DB wrappers stay thin and
 * untested — all decision logic lives in the injected-dependency modules.
 */

// --- RiotFetcher -------------------------------------------------------------

const DIVISIONS: LeagueDivision[] = ['I', 'II', 'III', 'IV'];
const MATCHES_PER_SEED = 5;

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const riotFetcher: RiotFetcher = {
  async ladderPuuids(region, rankTier) {
    if (rankTier === MASTER_PLUS) {
      const league = await getMasterLeague(region);
      return shuffled(league.entries).map((e) => e.puuid);
    }
    const division = DIVISIONS[Math.floor(Math.random() * DIVISIONS.length)];
    const entries = await getLeagueEntriesByTier(region, rankTier, division);
    return shuffled(entries)
      .map((e) => e.puuid)
      .filter((p): p is string => Boolean(p));
  },
  matchIds: (region, puuid) =>
    getMatchIdsByPuuid(region, puuid, { queue: QUEUE_RANKED_SOLO, count: MATCHES_PER_SEED }),
  match: (region, matchId) => getMatchById(region, matchId),
  timeline: (region, matchId) => getMatchTimeline(region, matchId),
};

// --- FillStore ---------------------------------------------------------------

function toFillJobRow(job: BenchmarkJob): FillJobRow {
  const region: PlatformRegion = isPlatformRegion(job.region) ? job.region : 'euw1';
  return {
    id: job.id,
    patch: job.patch,
    rankTier: job.rankTier,
    region,
    seedPuuids: (job.seedPuuids as string[]) ?? [],
    pendingMatchIds: (job.pendingMatchIds as string[]) ?? [],
    processedCount: job.processedCount,
  };
}

export const prismaFillStore: FillStore = {
  async claimNextJob() {
    const job = await prisma.benchmarkJob.findFirst({
      where: { status: { in: ['pending', 'running'] } },
      orderBy: { createdAt: 'asc' },
    });
    if (!job) return null;
    await prisma.benchmarkJob.update({ where: { id: job.id }, data: { status: 'running' } });
    return toFillJobRow(job);
  },

  async saveCursor(id, cursor) {
    await prisma.benchmarkJob.update({
      where: { id },
      data: {
        ...(cursor.seedPuuids !== undefined && {
          seedPuuids: cursor.seedPuuids as Prisma.InputJsonValue,
        }),
        pendingMatchIds: cursor.pendingMatchIds as Prisma.InputJsonValue,
        processedCount: cursor.processedCount,
      },
    });
  },

  async finishJob(id) {
    await prisma.benchmarkJob.update({ where: { id }, data: { status: 'done' } });
  },

  async recordAttemptFailure(id, maxAttempts) {
    const job = await prisma.benchmarkJob.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
    await prisma.benchmarkJob.update({
      where: { id },
      data: { status: job.attempts >= maxAttempts ? 'failed' : 'pending' },
    });
  },

  async hasFacts(matchId) {
    const row = await prisma.participantFacts.findFirst({
      where: { matchId },
      select: { matchId: true },
    });
    return row !== null;
  },

  async saveFacts(rows) {
    await prisma.participantFacts.createMany({
      data: rows.map((r) => ({ ...r, metrics: r.metrics as Prisma.InputJsonValue })),
      skipDuplicates: true,
    });
  },

  async factsForCohort(patch, rankTier) {
    const rows = await prisma.participantFacts.findMany({
      where: { patch, rankTier },
      select: { role: true, metrics: true },
    });
    return rows as unknown as CohortFactRow[];
  },

  async saveBenchmarks(rows) {
    await prisma.$transaction(
      rows.map((r) =>
        prisma.benchmark.upsert({
          where: {
            patch_rankTier_role_metricName: {
              patch: r.patch,
              rankTier: r.rankTier,
              role: r.role,
              metricName: r.metricName,
            },
          },
          create: r,
          update: { p25: r.p25, p50: r.p50, p75: r.p75, p90: r.p90, sampleN: r.sampleN },
        })
      )
    );
  },

  async cohortStats(): Promise<CohortStat[]> {
    const facts = await prisma.participantFacts.groupBy({
      by: ['patch', 'rankTier'],
      _count: { _all: true },
    });
    const benches = await prisma.benchmark.groupBy({
      by: ['patch', 'rankTier'],
      where: { metricName: 'deaths' },
      _sum: { sampleN: true },
    });
    const benchedByCohort = new Map(
      benches.map((b) => [`${b.patch} ${b.rankTier}`, b._sum.sampleN ?? 0])
    );
    return facts.map((f) => ({
      patch: f.patch,
      rankTier: f.rankTier,
      factCount: f._count._all,
      benchmarkedCount: benchedByCohort.get(`${f.patch} ${f.rankTier}`) ?? 0,
    }));
  },
};

// --- BenchmarkReader ----------------------------------------------------------

export const prismaBenchmarkReader: BenchmarkReader = {
  async exactRows(cohort: CohortKey) {
    return prisma.benchmark.findMany({
      where: { patch: cohort.patch, rankTier: cohort.rankTier, role: cohort.role },
    });
  },

  async previousPatchRows(cohort: CohortKey) {
    // Small table (≤ tiers × roles × metrics × patches); filter/sort in memory.
    const rows = await prisma.benchmark.findMany({
      where: { rankTier: cohort.rankTier, role: cohort.role, patch: { not: cohort.patch } },
    });
    const older = rows.filter((r) => comparePatches(r.patch, cohort.patch) < 0);
    if (older.length === 0) return [];
    const newest = older.reduce((a, b) => (comparePatches(a.patch, b.patch) >= 0 ? a : b)).patch;
    return older.filter((r) => r.patch === newest);
  },
};

// --- Enqueue / job status / organic persistence --------------------------------

const FAILED_RETRY_MS = 24 * 60 * 60 * 1000;

/**
 * Create-if-not-exists enqueue for a cohort fill. Fire-and-forget from the page
 * render path: every failure (including unique-key races) is logged and
 * swallowed — a missed enqueue self-heals on the next page view.
 */
export async function enqueueBenchmarkJob(input: {
  patch: string;
  rankTier: string;
  region: string;
}): Promise<void> {
  try {
    const existing = await prisma.benchmarkJob.findUnique({
      where: { job_cohort_key: { patch: input.patch, rankTier: input.rankTier } },
    });
    if (!existing) {
      await prisma.benchmarkJob.create({ data: input });
      return;
    }
    const staleFailed =
      existing.status === 'failed' &&
      Date.now() - existing.updatedAt.getTime() > FAILED_RETRY_MS;
    if (staleFailed) {
      await prisma.benchmarkJob.update({
        where: { id: existing.id },
        data: {
          status: 'pending',
          attempts: 0,
          seedPuuids: [],
          pendingMatchIds: [],
          processedCount: 0,
        },
      });
    }
  } catch (error) {
    console.error('enqueueBenchmarkJob failed (non-fatal) —', error);
  }
}

export async function hasActiveBenchmarkJob(patch: string, rankTier: string): Promise<boolean> {
  const job = await prisma.benchmarkJob.findUnique({
    where: { job_cohort_key: { patch, rankTier } },
    select: { status: true },
  });
  return job !== null && (job.status === 'pending' || job.status === 'running');
}

/** Organic corpus write from the analysis page. Idempotent; caller catches errors. */
export async function saveParticipantFacts(rows: ParticipantFactsRow[]): Promise<void> {
  if (rows.length === 0) return;
  await prisma.participantFacts.createMany({
    data: rows.map((r) => ({ ...r, metrics: r.metrics as Prisma.InputJsonValue })),
    skipDuplicates: true,
  });
}
```

- [ ] **Step 3: Typecheck + full suite**

Run: `npm run typecheck && npx vitest run`
Expected: clean. (Note: the `Benchmark` upsert `where` key name is Prisma-generated from the composite `@@id` — if typecheck reports a different name than `patch_rankTier_role_metricName`, use the name the generated client suggests.)

- [ ] **Step 4: Commit**

```bash
git add lib/riot/league.ts lib/riot/types.ts lib/analysis/benchmarkDb.ts
git commit -m "feat: Prisma and Riot implementations for the benchmark fill pipeline"
```

---

### Task 8: Cron route + CLI

**Model:** Sonnet 4.6

**Files:**
- Create: `app/api/cron/benchmarks/route.ts`
- Create: `scripts/benchmarks-fill.ts`
- Modify: `package.json` (add `benchmarks:fill` script; add `tsx` devDependency)
- Modify: `lib/dataDragon.ts` (export `patchFromVersion`, moved from the analysis page)
- Modify: `app/[region]/[riotId]/match/[matchId]/analysis/page.tsx:16-19` (import `patchFromVersion` instead of defining it)
- Modify: `.env.example` (add `CRON_SECRET`)
- Create: `vercel.json` (cron schedule)

**Interfaces:**
- Consumes: `processFillTick`, `sweepDirtyCohorts` (Task 6); `prismaFillStore`, `riotFetcher`, `enqueueBenchmarkJob` (Task 7); `cohortTier` (Task 2).
- Produces: `GET /api/cron/benchmarks` (Bearer `CRON_SECRET`); `npm run benchmarks:fill [-- --enqueue <TIER> <region>]`; `patchFromVersion(version: string): string` exported from `lib/dataDragon.ts`.

- [ ] **Step 1: Move `patchFromVersion` into `lib/dataDragon.ts`** (append; keep the doc comment):

```typescript
/** DDragon version (e.g. 14.13.1) -> patch (14.13) used to key benchmarks. */
export function patchFromVersion(version: string): string {
  return version.split('.').slice(0, 2).join('.');
}
```

In `app/[region]/[riotId]/match/[matchId]/analysis/page.tsx`, delete the local `patchFromVersion` (lines 16–19) and add `patchFromVersion` to the existing `@/lib/dataDragon` import.

Run: `npm run typecheck` — expect clean.

- [ ] **Step 2: Create the cron route** — `app/api/cron/benchmarks/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { processFillTick, sweepDirtyCohorts } from '@/lib/analysis/benchmarkFill';
import { prismaFillStore, riotFetcher } from '@/lib/analysis/benchmarkDb';

// ~50 sequential Riot requests can take up to ~60s with backoff.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * One benchmark-fill tick. Schedule every minute (external scheduler or Vercel
 * Cron — see vercel.json; Hobby-tier crons are daily, use cron-job.org or the
 * `benchmarks:fill` CLI for minutely cadence). Guarded by CRON_SECRET.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const tick = await processFillTick({ store: prismaFillStore, riot: riotFetcher });
  const sweptCohorts = await sweepDirtyCohorts(prismaFillStore);
  return NextResponse.json({ tick, sweptCohorts });
}
```

- [ ] **Step 3: Create the CLI** — `scripts/benchmarks-fill.ts`:

```typescript
/**
 * Dev/manual benchmark filler:
 *   npm run benchmarks:fill                          # drain all pending jobs
 *   npm run benchmarks:fill -- --enqueue GOLD euw1   # pre-warm a cohort, then drain
 * Same engine as the cron route; the local rate limiter paces requests.
 */
process.loadEnvFile?.('.env');

async function main(): Promise<void> {
  // Import after env load: lib/db.ts reads DATABASE_URL at module init.
  const { processFillTick, sweepDirtyCohorts } = await import('../lib/analysis/benchmarkFill');
  const { prismaFillStore, riotFetcher, enqueueBenchmarkJob } = await import(
    '../lib/analysis/benchmarkDb'
  );
  const { cohortTier } = await import('../lib/analysis/cohort');
  const { getLatestDDragonVersion, patchFromVersion } = await import('../lib/dataDragon');

  const args = process.argv.slice(2);
  if (args[0] === '--enqueue') {
    const [, tier, region] = args;
    if (!tier || !region) {
      console.error('Usage: npm run benchmarks:fill -- --enqueue <TIER> <region>');
      process.exit(1);
    }
    const patch = patchFromVersion(await getLatestDDragonVersion());
    await enqueueBenchmarkJob({ patch, rankTier: cohortTier(tier), region });
    console.log(`Enqueued fill for ${patch} ${cohortTier(tier)} (${region})`);
  }

  for (;;) {
    const result = await processFillTick({ store: prismaFillStore, riot: riotFetcher });
    if (!result) break;
    console.log(
      `tick: job ${result.jobId} — ${result.requestsUsed} requests, ` +
        `${result.matchesProcessed} matches${result.finished ? ', FINISHED' : ''}`
    );
  }
  const swept = await sweepDirtyCohorts(prismaFillStore);
  console.log(`No pending jobs. Dirty cohorts re-aggregated: ${swept}.`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
```

- [ ] **Step 4: Wire up scripts + config.**

Run: `npm install -D tsx`

In `package.json` scripts, add:

```json
    "benchmarks:fill": "tsx scripts/benchmarks-fill.ts",
```

Create `vercel.json`:

```json
{
  "crons": [{ "path": "/api/cron/benchmarks", "schedule": "0 3 * * *" }]
}
```

(Daily on Vercel Hobby — Pro can tighten to `* * * * *`. For minutely cadence on Hobby, point an external scheduler such as cron-job.org at the route with the Bearer header, or run the CLI.)

In `.env.example`, append:

```bash
# Shared secret for /api/cron/benchmarks (send as "Authorization: Bearer <value>").
CRON_SECRET=
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npx vitest run && npm run build`
Expected: all clean; build lists `/api/cron/benchmarks` as a dynamic route.

Then smoke-test the auth guard (no DB needed for the 401 path):

```bash
npm run dev &
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/cron/benchmarks
kill %1
```

Expected: `401`.

- [ ] **Step 6: Commit**

```bash
git add app/api/cron/benchmarks/route.ts scripts/benchmarks-fill.ts package.json package-lock.json vercel.json .env.example lib/dataDragon.ts "app/[region]/[riotId]/match/[matchId]/analysis/page.tsx"
git commit -m "feat: benchmark fill cron route and CLI runner"
```

---

### Task 9: Page integration + UI copy

**Model:** Sonnet 4.6

**Files:**
- Modify: `app/[region]/[riotId]/match/[matchId]/analysis/page.tsx`
- Modify: `components/analysis/AnalysisView.tsx:19-32` (props) and `:50-78` (ScoreBars)

**Interfaces:**
- Consumes: `loadBenchmarkLookup` (Task 4); `prismaBenchmarkReader`, `enqueueBenchmarkJob`, `hasActiveBenchmarkJob`, `saveParticipantFacts` (Task 7); `extractMatchFacts` (Task 5); `cohortTier`, `isBenchmarkableTier` (Task 2); `BenchmarkLookup` (`lib/analysis/metrics.ts`).
- Produces: `AnalysisViewProps.benchmarkPending?: boolean`.

- [ ] **Step 1: Wire benchmarks into the page.** In `app/[region]/[riotId]/match/[matchId]/analysis/page.tsx`, add imports:

```typescript
import { cohortTier, isBenchmarkableTier } from '@/lib/analysis/cohort';
import { loadBenchmarkLookup } from '@/lib/analysis/benchmarkStore';
import {
  enqueueBenchmarkJob,
  hasActiveBenchmarkJob,
  prismaBenchmarkReader,
  saveParticipantFacts,
} from '@/lib/analysis/benchmarkDb';
import { extractMatchFacts } from '@/lib/analysis/participantFacts';
import type { BenchmarkLookup } from '@/lib/analysis/metrics';
```

Then replace the fact-sheet line (currently `const factSheet = buildSingleMatchFactSheet(match, timeline, account.puuid, { rank, patch });` at line 51) with:

```typescript
    // Benchmarks: batched lookup with previous-patch fallback; a true miss
    // enqueues a background cohort fill. Organic facts persist from every view.
    // All of it is best-effort — DB trouble must never break the page.
    const role = participant.teamPosition ?? '';
    const rankTier = isBenchmarkableTier(rank) ? cohortTier(rank) : null;
    let benchmark: BenchmarkLookup | undefined;
    let benchmarkPending = false;
    if (process.env.DATABASE_URL && rankTier && role) {
      try {
        benchmark =
          (await loadBenchmarkLookup({ patch, rankTier, role }, prismaBenchmarkReader)) ??
          undefined;
        await saveParticipantFacts(extractMatchFacts(match, timeline, { patch, rankTier }));
        if (!benchmark) {
          await enqueueBenchmarkJob({ patch, rankTier, region: platform });
          benchmarkPending = await hasActiveBenchmarkJob(patch, rankTier);
        }
      } catch (error) {
        console.error('benchmarks unavailable (non-fatal) —', error);
      }
    }

    const factSheet = buildSingleMatchFactSheet(match, timeline, account.puuid, {
      rank,
      patch,
      benchmark,
    });
```

And pass the flag to the view (inside the existing `<AnalysisView ... />` props):

```tsx
            benchmarkPending={benchmarkPending}
```

- [ ] **Step 2: UI copy.** In `components/analysis/AnalysisView.tsx`:

Add to `AnalysisViewProps` (after `deaths`):

```typescript
  /** A benchmark fill job is queued/running for this cohort — scores will appear shortly. */
  benchmarkPending?: boolean;
```

Change `ScoreBars` to accept and use the flag:

```typescript
/** Category scores — render instantly from the stats engine, no LLM. */
function ScoreBars({
  scores,
  benchmarkPending = false,
}: {
  scores: FactSheet['scores'];
  benchmarkPending?: boolean;
}) {
  const emptyCopy = benchmarkPending
    ? 'Building benchmarks for your rank — check back in a few minutes'
    : 'Needs more data';
```

and the empty-state line inside it becomes:

```tsx
            {score === null && <p className="mt-1 text-[11px] text-muted-foreground">{emptyCopy}</p>}
```

In the `AnalysisView` function signature, destructure `benchmarkPending` and pass it through:

```tsx
      <ScoreBars scores={factSheet.scores} benchmarkPending={benchmarkPending} />
```

(Presentational one-line copy swap — covered by typecheck + the Step 3 visual check, no unit test.)

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npx vitest run && npm run build`
Expected: all clean.

Manual check (needs `.env` with `DATABASE_URL` + `RIOT_API_KEY`): `npm run dev`, open the analysis page from the screenshot (`/euw1/Nel%20Frikandel-EUW/match/EUW1_7912431126/analysis`). Expected: the category bars now read "Building benchmarks for your rank — check back in a few minutes", and `benchmark_jobs` contains one `pending` row for (current patch, the player's tier). Then run `npm run benchmarks:fill` in another terminal (~2–3 min), reload the page: score gauge, radar, and bars show numbers.

- [ ] **Step 4: Commit**

```bash
git add "app/[region]/[riotId]/match/[matchId]/analysis/page.tsx" components/analysis/AnalysisView.tsx
git commit -m "feat: wire benchmark lookup, organic facts, and fill enqueue into the analysis page"
```

---

### Task 10 (final): Docs + full verification

**Model:** Sonnet 4.6

**Files:**
- Modify: `07-remaining-work.md` (mark F1/F2 shipped, note the lazy design supersedes the batch-job sketch)

- [ ] **Step 1: Update `07-remaining-work.md`** — move F1/F2 from "Foundational unlock" into "Shipped so far" with one line each:

```markdown
- **F2 — ParticipantFacts persistence** — organic writes from every analysis view + crawl writes
  from fill jobs (`lib/analysis/participantFacts.ts`, `benchmarkDb.ts`).
- **F1 — Benchmark pipeline** — lazy on-demand cohort fills (`BenchmarkJob` + cron route +
  `benchmarks:fill` CLI), quantile aggregation, previous-patch fallback at lookup. Design:
  `docs/superpowers/specs/2026-07-08-benchmark-data-acquisition-design.md`.
```

(Delete the old F1/F2 sections; adjust the "Suggested order" list to drop its step 1.)

- [ ] **Step 2: Full verification**

Run: `npx vitest run && npm run typecheck && npm run lint && npm run build`
Expected: everything green.

- [ ] **Step 3: Commit**

```bash
git add 07-remaining-work.md
git commit -m "docs: mark F1/F2 benchmark pipeline as shipped"
```

---

## Self-review (done at plan time)

- **Spec coverage:** BenchmarkJob model → T1; cohort defs + tier shortcut → T2/T5; fill algorithm + checkpoints → T6 (per-tick aggregation ≈ 20-match checkpoint at 50-budget); lookup interpolation + fallback + batched read → T4; organic persistence → T5/T9; cron route + CLI + dirty sweep → T6/T8; enqueue-on-miss + failed-job 24h revival → T7/T9; UI "building" copy → T9; error swallowing → T7/T9; unranked skip → T9 (`isBenchmarkableTier`); tests per spec list → T2–T6.
- **Known deviations from spec (intentional, minor):** dedupe checks `ParticipantFacts` instead of `MatchRaw` (nothing writes `MatchRaw` yet, so a MatchRaw check would always miss — facts presence is the real intent); "publish at 20 matches" is implemented as "aggregate at end of every tick that processed matches", which lands at ~20 matches given the 50-request budget and is simpler + idempotent; organic-persist is best-effort awaited (~ms of DB write) rather than fire-and-forget, avoiding `after()` version concerns.
- **Type consistency:** `BenchmarkRow` defined once (T3), consumed by T4/T6/T7; `FillStore`/`RiotFetcher`/`CohortStat` defined in T6, implemented in T7, consumed in T8; `ParticipantFactsRow` defined in T5, consumed by T6/T7/T9; `cohortTier`/`comparePatches` (T2) consumed by T7/T8/T9. Prisma unique key names: `job_cohort_key` (named in schema T1), `patch_rankTier_role_metricName` (generated — T7 Step 3 notes the fallback if the generated name differs).
