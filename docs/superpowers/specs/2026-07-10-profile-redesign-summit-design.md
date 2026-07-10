# Summoner Profile Redesign — "Summit"

**Date:** 2026-07-10
**Status:** Approved design, pending implementation plan
**Mockup:** `.superpowers/brainstorm/93933-1783631073/content/concept-summit.html`

## Goal

Redesign the summoner profile page (`app/[region]/[riotId]/page.tsx`) from a plain stat
sheet into a coaching dashboard. Visual direction synthesizes op.gg (data density),
Mobalytics (insight-first premium dark), and Probuilds (build strip per match row),
anchored by our differentiator: the AI match analysis, promoted from a buried per-match
link to the page's core loop.

## Scope

**In:**
- Full visual restyle of the profile page in the "Summit" palette
- New hero header (icon + level badge, ladder percentile chip, Update affordance)
- AI Coach strip: 2–3 plain-language insight chips derived from benchmark data
- Stat deck row: Ranked Solo card (with LP sparkline + Flex sub-row), recent-window
  performance card (win% donut, KDA, streak), Skill Profile radar card
- Champion pool grid (4 tiles, best-champion highlight)
- Match history rows: role badge, KDA + CS, performance badge, final-build item strip,
  queue filter pills, Analyzed/Analyze state on the CTA
- Rank snapshot recording (new table) to feed the LP sparkline over time

**Out (deferred):**
- Live Game / spectator integration
- Season history table (needs historical snapshots we don't have)
- AI patch-notes callout
- Item *purchase order* in match rows (needs per-match timeline fetches; we show final
  build, which `MatchSummary.items` already has)

## Visual system

Palette additions (globals.css tokens; existing `--color-win`/`--color-loss` stay):

| Token | Value | Use |
|---|---|---|
| `--color-gold` | `#c9a86a` (light `#e9cf94`) | Identity, CTAs, panel top-rail accent |
| `--color-coach` | `#6577f3` (light `#8ea2ff`) | AI elements only (coach strip, radar) |
| page background | `#0e1015` → `#0a0c10` gradient + faint radial washes | Profile page |
| panel surface | `#141821` → `#10131a` gradient, `#232936` border, 12px radius | All cards |

Rules: gold = identity/CTA only; indigo = AI only; green/red = outcomes only. Panels get
a 2px gold gradient top-rail (left-aligned, fades out). No LoL-client motifs (no corner
brackets, no hextech).

## Page structure & data flow

All new data elements follow the existing convention: best-effort, fire-and-forget where
possible, page never breaks on DB/derived-data failure (`page.tsx` benchmark pattern).

### 1. Hero
- Data already fetched: account, summoner (icon, level), league entries.
- **Ladder percentile chip** ("Top ~3.6% · EUW"): approximated from a static
  tier/division distribution table (constant in `lib/analysis/`), not a live ladder
  query. Marked with `~`. Hidden when unranked.
- "Update" button: v1 = `router.refresh()` styling affordance (Next revalidation),
  not a job system.

### 2. AI Coach strip (`components/profile/CoachStrip.tsx`)
- New pure module `lib/analysis/coachInsights.ts`:
  `deriveCoachInsights(recentParticipants, benchmarkLookup) → CoachInsight[]` (0–3).
- Inputs: the player's per-match participant rows from the 10 already-fetched matches
  (metrics computable without timeline: CS/min, deaths, vision score/min, kill
  participation), compared against the cohort benchmark (`loadBenchmarkLookup` by
  current patch / rankTier / dominant role, i.e. the most frequent `teamPosition`
  in the window — same reader the analysis page uses).
- Output chips: (a) largest negative gap vs cohort p50 ("biggest lever"), (b) best
  positive gap, (c) optional trend chip (first 5 vs last 5 games of the window).
- Strip renders nothing when: unranked, no benchmark rows for cohort, or fewer than 5
  recent ranked games. No layout hole when absent.

### 3. Stat deck
- **Ranked Solo card**: emblem, tier, LP, W/L% (existing data). LP sparkline from rank
  snapshots (below); shows "collecting data" microcopy until ≥2 snapshots on distinct
  days. Flex entry as a sub-row (existing `leagueEntries` data, currently unused).
- **Performance card**: win% donut (CSS conic-gradient), KDA ratio + per-game K/D/A
  averages, P/kill, current streak — all computed in `lib/matchStats.ts` extensions
  from fetched matches. Labeled "Last N" where N = fetched match count (10 for now;
  see Open decision #1.)
- **Skill radar**: reuse `components/analysis/SkillRadar.tsx` with profile-level
  aggregate scores (new pure function aggregating the same per-match inputs the
  analysis page uses, minus timeline-dependent axes if unavailable — axes degrade to
  the subset we can compute; card hidden if fewer than 3 axes).

### 4. Champion pool
- Existing `computeTopChampions` extended to include KDA and CS/min per champion;
  render 4 tiles, first tile ("best") = highest winrate with ≥3 games, gold-tinted.

### 5. Match history
- Row layout per mockup: champion icon + role badge, result + duration + relative time,
  KDA (deaths red) + CS, performance badge, final-build item strip, CTA.
- **Performance badge**: pure function over participant fields already in `MatchDto`
  (largestMultiKill, firstBlood, etc.) → one short label or none. No new fetches.
- **Analyzed state**: new store method on the analysis store — list matchIds having a
  stored analysis for (puuid, current PROMPT_VERSION) — one query for the page's 10
  ids. `✓ Analyzed` links to the same analysis page; `✦ Analyze` unchanged.
- **Queue filters** (All / Solo / Flex / ARAM): client-side filter over the fetched
  matches (`queueId` already in the DTO). No extra fetching; a filter with zero matches
  shows an empty-state line.
- Expandable scoreboard (`MatchScoreboard`) behavior stays.

### 6. Rank snapshots (new)
- Prisma model `RankSnapshot`: `id, puuid, queueType, tier, division, leaguePoints,
  recordedAt` + index on `(puuid, queueType, recordedAt)`.
- Recorded inside the existing `after()` block on profile view, fire-and-forget, only
  when `DATABASE_URL` is set. Dedupe: skip if the latest snapshot for (puuid, queue) is
  the same calendar day (UTC) with the same tier/division/LP.
- Sparkline: last 30 days of solo-queue snapshots bucketed per day (last snapshot of
  each day), rendered as SVG bars; current-day bar gold, others indigo.

## Component & file plan

New: `components/profile/` (ProfileHero, CoachStrip, RankPanel, PerformancePanel,
SkillProfilePanel, ChampionPool, MatchFilters), `lib/analysis/coachInsights.ts`,
`lib/analysis/ladderPercentile.ts`, `lib/rankSnapshots.ts` (record + read),
Prisma migration.
Restyled/extended: `page.tsx` (profile), `MatchSummaryRow`, `MatchHistory`,
`matchStats.ts`, analysis store (analyzed-ids query), `globals.css` (tokens).
Removed after cutover: `RankCard`, `RecentFormCard`, `TopChampionsCard` (replaced by
profile components).

## Error handling

Everything below the hero degrades independently: coach strip, sparkline, analyzed
state, and percentile each catch-and-hide on failure (log via `console.error`, same as
existing benchmark path). Riot API 404/429 page-level handling unchanged.

## Testing

Pure logic gets vitest coverage, DB wrappers stay thin/untested (repo convention):
`coachInsights` (gap ranking, hide conditions), `ladderPercentile` (boundaries,
unranked), snapshot dedupe decision function, performance-badge function, extended
`matchStats` (streak, KDA aggregates, champion KDA/CS), queue filtering. Component
render tests only where logic branches (CoachStrip hidden states, filter empty state).

## Open decisions resolved

1. **"Last 20" vs fetched 10**: profile fetch stays at 10 matches (rate-limit budget);
   the performance card is labeled "Last 10" until we raise the fetch count behind the
   production API key. Mockup's "20" was illustrative.
2. **Theme blast radius**: only the profile page adopts the new background/panels in
   this pass; nav/analysis pages inherit nothing yet. Token additions are global so a
   follow-up can unify.
3. **Percentile accuracy**: static distribution constant, refreshed manually per season;
   acceptable because it's presentational (`~` prefix communicates approximation).
