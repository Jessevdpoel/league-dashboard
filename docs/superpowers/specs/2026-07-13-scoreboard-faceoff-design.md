# Match Scoreboard "Face-Off" — Design

**Date:** 2026-07-13 · **Status:** approved pending user spec review

## Goal

Replace the bare `MatchScoreboard` table with a dense, distinctive match-detail
view: per-player in-match performance grades with MVP/ACE, lazy-fetched rank
emblems, damage bars, wards/CS/gold, items, team totals, and an objectives
strip. Deliberately **not** an op.gg lookalike: instead of two stacked
full-width tables, we use a **face-off layout** — lane opponents rendered
side-by-side against a center spine, which is both visually distinct and more
League-native (you read the page as five lane matchups, not two tables).

## Decisions already made (with user)

- Scope: single Overview (no tabs). Team-analysis graphs are out of scope.
- Player ranks: yes — lazy-fetched server-side when a match is expanded
  (10 league-API calls, 1h cache, best-effort).
- Approach A: enrich the existing `/api/matches/[matchId]` route; scoreboard
  stays presentational; score logic is a pure, tested lib module.
- Visual: differentiate from op.gg (face-off layout, summit palette, no
  blue/red table tints — team identity comes from the spine and headers).

## Non-goals

- No timeline-based tabs (build order, skill order, gold graphs).
- No persistence of scores/ranks (compute on request; HTTP cache does the rest).
- No benchmark dependency — the grade is strictly in-match relative.

## Data flow

```
MatchSummaryRow (client, on expand)
  → GET /api/matches/[matchId]?ranks=1
      route (server):
        match  = getMatchById(...)                    (cached 24h, existing)
        grades = gradeMatch(match)                    (pure, lib/matchGrade.ts)
        ranks  = getLeagueEntriesByPuuid × 10         (cached 1h, best-effort,
                 Promise.allSettled — a rejection ⇒ null for that player)
      → { match, grades, ranks }
  → <MatchFaceOff match grades ranks version />       (presentational)
```

The `ranks=1` query flag keeps the old raw-match behavior available and makes
the rank fan-out opt-in from the scoreboard only. Response shape:

```ts
interface MatchDetailPayload {
  match: MatchDto;
  grades: MatchGrades;                       // see below
  /** puuid → solo-queue entry summary, null when lookup failed/unranked. */
  ranks: Record<string, { tier: string; division: string } | null>;
}
```

## Type additions (lib/riot/types.ts)

Added to `ParticipantDto` (all present in every Match-V5 response):
`champLevel: number`, `goldEarned: number`, `totalDamageTaken: number`,
`wardsPlaced?: number`, `wardsKilled?: number`, `detectorWardsPlaced?: number`,
`damageDealtToObjectives?: number`.

Added to `MatchDto.info`: `teams?: TeamDto[]` with

```ts
export interface TeamDto {
  teamId: number;
  win: boolean;
  objectives: {
    baron: { kills: number };
    dragon: { kills: number };
    riftHerald: { kills: number };
    tower: { kills: number };
    champion: { kills: number };
  };
}
```

Optional fields stay optional; the UI renders "—" when absent (old cached
fixtures / non-SR modes).

## In-match grade (lib/matchGrade.ts — pure, TDD)

For each participant compute raw metrics:

| key | formula |
|---|---|
| damage | totalDamageDealtToChampions |
| tanking | totalDamageTaken |
| kp | (kills + assists) / max(teamKills, 1) — teamKills = Σ kills on own team |
| deaths | −deaths (fewer is better) |
| vision | visionScore |
| csPerMin | ((totalMinionsKilled ?? 0) + (neutralMinionsKilled ?? 0)) / minutes |
| goldPerMin | goldEarned / minutes |
| objectives | damageDealtToObjectives ?? 0 |

Each metric is ranked across all 10 participants (rank 1 = best, ties share
the better rank). Weighted rank-points (weight × (11 − rank) / 10):

damage 1.2 · kp 1.1 · deaths 1.1 · goldPerMin 0.9 · csPerMin 0.8 ·
vision 0.8 · tanking 0.6 · objectives 0.5

The total is min–max scaled to **0.0–10.0**: score = (total − minPossible) /
(maxPossible − minPossible) × 10, where maxPossible = all ranks 1 and
minPossible = all ranks 10 (so a clean sweep = 10.0, dead last in every
metric = 0.0). Output:

```ts
export interface ParticipantGrade {
  puuid: string;
  score: number;          // 0–10, one decimal
  ordinal: number;        // 1–10 within the match
  badge: 'MVP' | 'ACE' | null;
}
export interface MatchGrades { byPuuid: Record<string, ParticipantGrade>; }
export function gradeMatch(match: MatchDto): MatchGrades;
```

MVP = highest score on the **winning** team; ACE = highest score on the
losing team. Remakes/arena (no clear winner): both badges omitted.
`minutes = max(gameDuration / 60, 1)`.

## UI — components/match/MatchFaceOff.tsx (+ small pieces)

**Desktop (md+): face-off grid.** One row per lane pairing:

```
[ blue player cell ←ltr ] [ center spine ] [ rtl→ red player cell ]
```

- Pairing: match `teamPosition` (TOP/JUNGLE/MIDDLE/BOTTOM/UTILITY order).
  Fallback (ARAM/missing positions): pair by array order within team.
- Player cell: champion icon + level badge, name (link-styled; the viewed
  player's row gets the gold left-edge accent), rank emblem (h-4) + short
  division ("D3") when available, grade chip (score, colored by band:
  ≥8 gold, ≥5 foreground, else muted; MVP chip gold-filled, ACE chip
  coach-filled), KDA + KP%, CS (cs/min), gold, items row (6 slots + trinket
  separated).
- Center spine per row: two thin horizontal bars — damage dealt and damage
  taken — extending left/right from center, scaled to the match maximum, so
  each lane reads as a head-to-head. Numbers in 10px muted text.
- Team headers above the grid: side label ("Victory"/"Defeat" + Blue/Red
  side), totals (kills, gold), and the **objectives strip** (dragon/baron/
  herald/turret counts with small glyphs) from `teams[]`; omitted when
  `teams` is absent.
- Between headers: a single **kill/gold split bar** (two segments sized by
  share, gold-vs-slate — not op.gg's red/blue).

**Mobile (< md): stacked team panels** — same cells, one team after the
other; center-spine bars collapse into small inline bars inside each cell.

**Styling:** summit palette only (`bg-panel`, `border-panel-border`, gold
identity, coach purple for ACE). No full-row win/loss tints.

## States & errors

- Ranks lookup failed / unranked → no emblem, no division text.
- `teams` absent → no objectives strip; split bar computed from participants.
- Remake (< 5 min) → grades still render, badges omitted.
- API failure → existing error text in `MatchSummaryRow` (unchanged).

## Testing

- `tests/matchGrade.test.ts` (TDD): rank/tie handling, weight application,
  normalization bounds, MVP on winning team & ACE on losing, remake rule,
  KP with zero team kills, missing optional fields.
- Route: unit test for payload assembly with a stubbed league fetcher
  (rank failure → null, not thrown).
- `MatchFaceOff`: RTL smoke — renders pairings, viewed-player accent,
  fallback pairing without teamPosition; no Recharts involved so jsdom is
  fine.

## Rate limits / perf

- 10 league calls per expansion go through the existing token-bucket client,
  1h HTTP cache per puuid; repeated expansions of the same match are free
  (route response itself is cacheable per matchId+ranks for 5 min).
- Grade computation is O(10 × 8 ranks) — negligible.

## Follow-ups (explicitly out)

- Persist grades for "analyzed" badge reuse; team-analysis tab with
  `extractGoldDiffSeries`; build-order tab (timeline extraction).
