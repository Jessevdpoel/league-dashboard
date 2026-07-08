# Benchmark Data Acquisition — Design

**Date:** 2026-07-08
**Status:** Approved
**Solves:** F1 + F2 in `07-remaining-work.md` — the `Benchmark` and `ParticipantFacts` tables are empty, so `computeMetrics` returns null category scores and the analysis page shows "Needs more data" for the skill radar and all category bars.

## Goal

Populate percentile benchmarks per `(patch, rankTier, role, metricName)` so the analysis page renders real scores, using a **lazy, demand-driven** acquisition model that works within the Riot development key rate limit (~100 requests / 2 minutes) and scales naturally with real traffic.

## Strategy (decisions made)

- **Lazy on-demand cohort fills + organic persistence.** No blanket seed crawl. A cohort's benchmark is crawled the first time traffic requests it; every match any user views also feeds the corpus for free. Traffic decides what gets built.
- **Dev API key** for now; the design does not change with a personal/production key — fills just finish faster.
- **Chunked cron route** as the job runtime: resumable jobs in the DB, processed ~50 requests per tick. Serverless-safe.
- **Previous-patch fallback** at lookup time, so a cohort cold-starts once ever, not once per patch.

## Data flow

```
User opens analysis page
  ├─ metrics computed (existing) ──► persist ParticipantFacts for all 10 players  [organic corpus]
  ├─ BenchmarkLookup: exact (patch, tier, role) ──► hit? → scores render
  │     └─ miss? → most recent previous patch for (tier, role) → still render scores
  └─ true miss (cohort never built) → enqueue BenchmarkJob + show "building" state

Cron route (every minute) ──► processes pending jobs in ~50-request chunks
  └─ at ~20 matches: publish rough benchmarks; at ~40: mark cohort done
```

## Cohort definition

- Key: `(patch, rankTier, role)` — matches the existing `Benchmark` PK (with `metricName`).
- Divisions merged: `GOLD`, not `GOLD II`.
- `MASTER`, `GRANDMASTER`, `CHALLENGER` merged into one apex tier (`MASTER_PLUS`).
- Ranked solo queue only (`queueId 420`); remakes / games shorter than 14 minutes excluded.
- Region-agnostic: the `Benchmark` schema has no region column; per-tier metric distributions are close enough across regions. (Future extension if ever needed: add a region column.)

### Tier-tagging shortcut

All 10 participants of a match are tagged with the **anchor player's tier** — the ladder seed for crawled matches, the viewed player for organic ones. Solo-queue lobbies are tier-homogeneous, and this avoids 10 LEAGUE-V4 rank lookups per match (a third of the request budget). Documented approximation, acceptable for tier-granularity cohorts.

## Components

### 1. `BenchmarkJob` model (new, Prisma)

```
BenchmarkJob {
  id            cuid PK
  patch         String
  rankTier      String
  status        pending | running | done | failed
  region        String            // routing region to crawl from (from the triggering match)
  seedPuuids    Json              // sampled ladder players
  pendingMatchIds Json            // dedup'd queue of matches still to fetch
  processedCount Int
  attempts      Int
  createdAt / updatedAt

  @@unique([patch, rankTier])     // concurrent visitors collide into ONE job
}
```

Enqueue is create-if-not-exists (fire-and-forget from the page render path; enqueue failure must never break the page).

### 2. Cron route + CLI

- `app/api/cron/benchmarks/route.ts`, guarded by `CRON_SECRET` env var. Scheduled every minute (Vercel Cron or any scheduler).
- Each tick: claim the oldest `pending`/`running` job (optimistic status update), spend a ~50-request budget via the existing rate-limited Riot client, persist cursor state, exit. A job survives restarts and finishes across ~2 ticks.
- `npm run benchmarks:fill` — CLI wrapper around the same job processor for dev/manual runs (e.g., pre-warming your own cohort).
- The tick also re-aggregates "dirty" cohorts whose organic `sampleN` grew ≥25% since the last aggregate.
- Failure handling: increment `attempts`, keep cursor; mark `failed` after 5 attempts. A `failed` job for a cohort does not block re-enqueue after 24h.

### 3. Fill job algorithm (~91 requests / cohort)

1. LEAGUE-V4 entries for the tier (1 req) → sample ~10 players across divisions.
2. Match-id lists per player (10 reqs, ranked queue filter) → dedupe → cap at 40 matches.
3. Per match: skip if already in `MatchRaw` (free); else fetch match + timeline (2 reqs). Extract facts for **all 10 participants** via the existing stats engine (`timelineFacts` + `computeMetrics` raw values), upsert `ParticipantFacts`.
4. Checkpoint at 20 processed matches: aggregate + publish rough benchmarks (~40 samples per role). At 40 matches: final aggregate, `status = done` (~80 samples per role).

### 4. Organic facts persistence

In the analysis flow (`analyzeMatch` / page load), after metrics are computed: extract raw metric values for all 10 participants and upsert `ParticipantFacts`, tagged with the viewed player's patch/tier. Idempotent by `@@id([matchId, puuid])`. Must be non-blocking for the page (best-effort write).

### 5. Benchmark lookup (`lib/analysis/benchmarkStore.ts`)

Implements the existing `BenchmarkLookup` type (`lib/analysis/metrics.ts:59`):

- Percentile from quantiles by **piecewise-linear interpolation** across `p25/p50/p75/p90`, clamped to 5–95 outside the known range. Coarse but sufficient: band edges sit at percentiles 25/45/65/85.
- Resolution order: exact `(patch, tier, role, metric)` → newest previous patch with the same `(tier, role, metric)` → `undefined`.
- On a true miss for the anchor player's cohort: enqueue a `BenchmarkJob` (fire-and-forget).
- One batched DB read per page render (all metrics for the cohort at once), not 14 queries.

### 6. Aggregation (pure function + thin DB wrapper)

`ParticipantFacts` rows for a cohort → per metric: `p25/p50/p75/p90` + `sampleN` → upsert `Benchmark` rows. Runs at job checkpoints and on the cron dirty-cohort sweep. Minimum publish threshold: `sampleN ≥ 30` per (role, metric) cell; below that the cell stays unpublished (lookup returns undefined for it).

### 7. UI touch (only one)

When category scores are null **and** a `BenchmarkJob` for the cohort is `pending`/`running`, `AnalysisView` shows "Building benchmarks for your rank — check back in a few minutes" instead of "Needs more data". No other UI changes; scores light up through existing components.

## Error handling

- Riot 429/5xx: already handled by the client's token bucket + exponential backoff; the job budget accounting treats retries as spent budget.
- Enqueue and organic-persist failures are logged and swallowed — they must never break the analysis page.
- Unranked anchor player: no cohort → skip enqueue, show existing empty state (rare on an analysis page for ranked matches).

## Testing

Existing vitest + fake-store pattern:

- Quantile aggregation: known distributions → expected p25/p50/p75/p90, `sampleN` threshold behavior.
- Interpolation: values at/below p25, between quantiles, above p90; band edge mapping.
- Lookup fallback: exact hit, previous-patch hit, true miss (returns undefined + enqueues once).
- Job state machine with a fake Riot client: budget exhaustion mid-job and resume, match dedupe against `MatchRaw`, checkpoint publishing at 20, unique-key collision on concurrent enqueue, failure/attempts path.

## Out of scope (YAGNI)

Multi-region benchmarks, per-division cohorts, per-champion benchmarks, production-key parallelism, SEO insight pages (O2). The schema supports all of these later without redesign.

## Request-budget reference (dev key: 100 req / 2 min)

| Item | Requests | Wall clock |
|---|---|---|
| One match (fetch + extract) | 2 | ~1 s |
| Cohort fill to rough (20 matches) | ~51 | ~1 min |
| Cohort fill to done (40 matches) | ~91 | ~2–3 min |
