# Game Analysis Feature — Master Plan

## Business model (decided)

**Ads-first, free core product.** Traffic is the business: the analysis feature exists to raise pageviews, session time, and return visits, monetized via display ads (see `05-monetization-ads.md`). A paid "Supporter/Plus" tier (ad-free, higher analysis quota, instant trend re-analysis) is a Phase 3 add-on once retention proves out — never a paywall on the core feature. Rationale: an op.gg-style site lives on anonymous drive-by traffic; a subscription gate before the product has habitual users kills growth. This is the same sequencing op.gg and Mobalytics used.

## Current codebase status (verified 2026-07-06)

What exists today (op.gg-clone MVP, Next.js 15 App Router + React 19 + Tailwind + Vitest):

- **Routes:** `/` (search) and `/[region]/[riotId]` (profile: rank card, recent form, top champions, match history with expandable scoreboard). `riotId` is a `name-tag` slug.
- **Riot client** (`lib/riot/`): shared `RiotClient` with composite token-bucket limiter (20/s + 100/2min), Account-V1, Summoner-V4, League-V4 by-puuid, Match-V5 (ids + match). Caching via Next.js `fetch` revalidate only (match: 24h).
- **Stats seed:** `lib/matchStats.ts` (match summaries, top champions). Well-tested (`tests/`).
- **Design system:** "Arcane Neon" — frost color tokens, Rajdhani font, dark theme.

Gaps this plan must close (all verified missing):

1. No database — no persistence at all; everything refetched via HTTP cache. Blocks the `analyses` cache, benchmarks, and cost logging (see `01-data-pipeline.md`).
2. No timeline endpoint, no `challenges`/`teamPosition` fields in `ParticipantDto` (`lib/riot/types.ts`).
3. `getMatchIdsByPuuid` has no queue filter (fetches all queues, count 10).
4. No 429 retry/backoff — the client throws immediately and the page shows an error; no `Retry-After` handling.
5. No Riot "not endorsed" disclaimer anywhere (no site footer exists).
6. Region coverage: only 6 platforms (na1, euw1, eun1, kr, jp1, br1); no `sea` regional route.
7. No LLM/Anthropic integration, no ads, no CMP (expected — that's this plan).

## What we are building

A "Match Insights" feature for our op.gg-style League of Legends stats site. After a user looks up their profile, they can open an analysis view that tells them:

1. **What you did well** — 2–4 concrete strengths from the game(s)
2. **What to improve** — 2–4 concrete weaknesses, each tied to real numbers
3. **General tips** — role/champion/rank-appropriate coaching advice

Two levels of analysis:
- **Single-match analysis** — deep dive on one game (uses match + timeline data)
- **Trend analysis (last 20 games)** — recurring patterns, playstyle profile, biggest rank-blocker

## Core architecture principle: stats first, LLM second

**Do NOT send raw match JSON to an LLM.** A single match response is ~3,000 lines of JSON and a timeline is larger. That is expensive, slow, and produces vague output.

Instead, use a 3-layer pipeline:

```
Layer 1: DATA        Riot API (match-v5 + timeline) → normalize → store  [no LLM]
Layer 2: STATS       Deterministic metric engine + percentile benchmarks [no LLM]
Layer 3: INSIGHT     Small pre-digested "fact sheet" → Claude API → prose [LLM]
```

This mirrors how Mobalytics' GPI works: raw stats are run through formulas that fire "triggers/conditions" (e.g., "dies to ganks often" → vision/positioning advice). We compute the triggers ourselves in code, then use Claude only to turn the structured findings into personalized, readable coaching text. The LLM input becomes ~1–2 KB instead of ~300 KB.

Benefits: 100–300x cheaper LLM calls, deterministic and testable scoring, cacheable results, and the numeric claims in the output can never hallucinate because they come from our own engine.

## File map (read in this order)

| File | Owns | Suggested agent model |
|---|---|---|
| `01-data-pipeline.md` | Riot API ingestion, timeline parsing, storage, rate limits | Sonnet |
| `02-stats-engine.md` | Metric computation, benchmarking, trigger rules | Opus for metric/trigger design review, Sonnet for implementation |
| `03-ai-analysis.md` | Claude API integration, prompts, runtime model routing, cost control | Sonnet (prompts reviewed by Opus once) |
| `04-frontend.md` | Analysis page UI, loading states, ad slots | Sonnet |
| `05-monetization-ads.md` | Google AdSense strategy, SEO pages, policy compliance | Haiku/Sonnet (mostly config + content decisions) |
| `06-model-assignments.md` | Full model-per-task table (runtime API + Claude Code agents) | Reference doc |

## Build phases

**Phase 1 (MVP):** Data pipeline for match + timeline → stats engine with ~15 core metrics → single-match analysis with one Claude call → basic UI.

**Phase 2:** 20-game trend analysis, percentile benchmarks per rank/role, caching of analyses, shareable/SEO-friendly analysis pages.

**Phase 3:** Champion-specific advice packs, "focus goal" tracking between games, freshness re-analysis after patches, optional "Supporter" tier (see business model above).

**Phase 0 (prerequisites, before Phase 1):** close codebase gaps 1–5 above — add a database, extend the Riot client (queue filter, retry/backoff, `challenges`/`teamPosition` types, timeline endpoint), and ship the Riot disclaimer footer.

## Hard constraints (all agents must respect these)

1. **Riot API rate limits.** Personal keys: 20 req/s and 100 req/2min. A production key must be applied for. Every fetch goes through a central rate-limited client with retry/backoff on 429. Never fetch in a loop from frontend code.
2. **Riot policy.** Show the required "not endorsed by Riot Games" disclaimer. Do not store data longer than policy allows without refresh.
3. **LLM cost ceiling.** Target: average LLM cost per analysis ≤ $0.005 (see `03-ai-analysis.md`). Every analysis result is cached permanently keyed by `(puuid, matchId, promptVersion)` — a finished game never changes, so never re-analyze the same match.
4. **Ad revenue model.** The feature must increase pageviews and session time (that's how we earn). See `05-monetization-ads.md`. Never place ads in a way that violates AdSense policy (no ads inside loading skeletons, no accidental-click layouts).
5. **Analysis must be grounded.** Every claim shown to the user must trace back to a computed metric. The LLM formats and explains; it does not invent numbers.
