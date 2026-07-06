# 01 — Data Pipeline (Riot API ingestion)

**Goal:** Given a player's PUUID, reliably fetch and store everything the stats engine needs. No LLM anywhere in this layer.

## Endpoints used

All under MATCH-V5 (regional routing: `americas`, `europe`, `asia`, `sea`):

1. `GET /lol/match/v5/matches/by-puuid/{puuid}/ids?queue=420&count=20`
   Recent ranked solo match IDs (queue 420 = ranked solo; also support 440 flex).
2. `GET /lol/match/v5/matches/{matchId}`
   Full match data: per-participant KDA, CS, gold, damage, vision score, objectives, items, runes, `challenges` object (contains dozens of pre-computed advanced stats — use these, they save us work: `laneMinionsFirst10Minutes`, `kda`, `visionScorePerMinute`, `soloKills`, `turretPlatesTaken`, `damagePerMinute`, etc.)
3. `GET /lol/match/v5/matches/{matchId}/timeline`
   Minute-by-minute participant frames (gold, xp, cs, position) + event stream (kills with positions, wards placed/killed, objectives, item purchases, plates). **Only fetch the timeline for matches the user actually requests deep analysis on** — it's the largest payload and not needed for profile pages.
4. `LEAGUE-V4 /lol/league/v4/entries/by-puuid/{puuid}` (platform routing) — current rank, needed to pick the right benchmark cohort.

**Verified against the codebase (2026-07-06):** 1, 2, and 4 exist in `lib/riot/` (`match.ts`, `league.ts`) but need upgrades:

- `getMatchIdsByPuuid` (`lib/riot/match.ts`) has **no queue filter** and defaults to `count=10`. Add `queue=420` (+ optional 440) and `count=20` for analysis fetches. The profile page can keep showing all queues; the analysis pipeline must filter to ranked.
- `ParticipantDto` (`lib/riot/types.ts`) is minimal — **no `challenges` object, no `teamPosition`**. Extend the types; `challenges` is where most advanced metrics come from.
- Endpoint 3 (timeline) does not exist yet — new work.
- Region support (`lib/riot/regions.ts`) covers 6 platforms and lacks the `sea` route (oc1/ph2/sg2/th2/tw2/vn2). Fine for MVP; add before broad launch.

## Rate limiting (critical)

- Single shared API client (server-side only) with a token-bucket limiter configured per key limits (dev key: 20/s, 100/2min). **Already exists** (`lib/riot/client.ts` + `lib/riot/rateLimiter.ts`).
- On HTTP 429: respect `Retry-After` header, exponential backoff, max 3 retries. **Gap:** the current client throws `RiotRateLimitedError` immediately with no retry — the profile page just shows an error message. Add retry/backoff inside the client (interactive requests: 1 quick retry; background jobs: full backoff). The limiter's `msUntilAvailable()` is already there to schedule waits.
- Queue timeline fetches as background jobs; the analysis page shows a progress state while the job runs.
- Cache raw responses: a finished match is immutable. Store the raw JSON (compressed) once; never re-fetch a matchId we already have.

## Storage schema (new tables)

**There is no database today** — the app is stateless and relies on Next.js fetch revalidation (match responses cached 24h, not permanently). That is not enough for this feature: the `analyses` permanent cache, `benchmarks` aggregates, and cost logging all need real persistence.

**Decision: Postgres** (the schema below assumes JSONB). Use a managed free-tier instance (Neon or Supabase) so it works from both local dev and Vercel-style hosting; talk to it via Prisma or Drizzle. SQLite is acceptable for a local-only spike, but benchmarks + concurrent background jobs will want Postgres — don't build twice.

```
matches_raw        (match_id PK, region, patch, fetched_at, raw_json JSONB/compressed)
timelines_raw      (match_id PK, fetched_at, raw_json compressed)
participant_facts  (match_id, puuid, role, champion_id, patch, rank_tier,
                    ~40 numeric columns of extracted metrics — see 02-stats-engine.md)
analyses           (id, puuid, match_id NULLABLE, type single|trend,
                    prompt_version, model_used, input_facts JSONB,
                    output_json JSONB, created_at, tokens_in, tokens_out, cost_usd)
benchmarks         (patch, rank_tier, role, metric_name, p25, p50, p75, p90, sample_n)
```

`analyses` is the permanent cache: unique index on `(puuid, match_id, type, prompt_version)`. Log tokens and cost per row so we can monitor spend per user.

## Timeline extraction

Write a pure function `extractTimelineFacts(timeline, puuid)` producing:

- Gold/XP/CS diff vs lane opponent at 5, 10, 14, 20 min (lane opponent = same `teamPosition` on enemy team)
- Deaths list: `{minute, position, killerRole, wasSoloDeath, wasNearOwnTower, wasWhileSidePushing}`
- Death timing buckets: deaths pre-14min (laning), 14–25 (mid), 25+ (late)
- Wards placed/killed per game phase; first control ward purchase minute
- First recall timing, first item completion minute
- Objective participation: was the player within X units of dragon/baron fights (from kill/objective event positions)
- Kill participation windows: fights joined vs fights missed while farming elsewhere

Unit-test this function against 3–5 stored real timelines (fixtures in repo).

## Benchmark data job

Nightly/weekly batch job: sample matches per rank tier (Iron→Challenger) from players already in our DB, compute the same `participant_facts`, aggregate into the `benchmarks` table (p25/p50/p75/p90 per metric, per role, per rank, per patch). Start coarse (rank tier only); refine later. This is what makes advice like "your CS@10 is bottom-25% for Gold mid laners" possible — without benchmarks the analysis is generic.

## Definition of done

- [ ] Rate-limited client with retry, shared by all fetchers
- [ ] Background job: fetch match + timeline for a requested analysis, idempotent
- [ ] `extractTimelineFacts` + unit tests on real fixtures
- [ ] Benchmark aggregation job producing percentiles for ≥15 metrics
- [ ] Riot disclaimer present in site footer — **currently missing entirely**: `app/layout.tsx` has no footer. Add one with the standard text ("[Site] isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties…")
- [ ] Riot client upgrades: `queue` filter + `count` param, `challenges`/`teamPosition` types, timeline fetcher, 429 retry/backoff
- [ ] Postgres provisioned + migrations for the 5 tables above
