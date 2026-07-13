# Face-Off Match Scoreboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bare `MatchScoreboard` table with the "face-off" match detail view: lane-matchup rows against a center spine, in-match 0–10 grades with MVP/ACE, lazy-fetched rank emblems, items, team totals, and an objectives strip.

**Architecture:** The existing client expansion flow (`MatchSummaryRow` → `GET /api/matches/[matchId]`) stays; the route gains an opt-in `?ranks=1` mode returning `{ match, grades, ranks }`. Grades come from a pure, TDD'd `lib/matchGrade.ts` (in-match relative ranking — no benchmark dependency); payload assembly is a pure-ish `lib/matchDetail.ts` tested with a stubbed league fetcher; `components/match/MatchFaceOff.tsx` is purely presentational.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind v4 (summit tokens), Vitest + RTL. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-13-scoreboard-faceoff-design.md` (committed).

## Agent & model assignments

| Task | Model | Why |
|---|---|---|
| 1. Riot type additions | **Haiku** | Exact code below, typecheck-verified transcription |
| 2. `lib/matchGrade.ts` (TDD) | **Sonnet** | Ranking/normalization math correctness |
| 3. `lib/matchDetail.ts` + route (TDD) | **Sonnet** | Async settle semantics, route wiring |
| 4. `MatchFaceOff` component (TDD helpers + RTL) | **Sonnet** | Largest UI task |
| 5. Wire-up + delete old scoreboard | **Sonnet** | Cross-file prop threading |
| Per-task reviews | Sonnet | Task-scoped gates |
| Final whole-branch review | Sonnet (diff is modest; Opus not warranted here) | One pass before merge |

## Global Constraints

- Riot "not endorsed" disclaimer footer must remain on every page (unrelated files — do not touch layout/footer).
- Never fetch Riot from client code — all Riot calls stay behind the rate-limited server client.
- Rank lookups are best-effort: a failed lookup yields `null` for that player and must never fail the response.
- Grade formula is exactly the spec's: 8 metrics, weights damage 1.2 · kp 1.1 · deaths 1.1 · goldPerMin 0.9 · csPerMin 0.8 · vision 0.8 · tanking 0.6 · objectives 0.5; rank 1 = best with ties sharing the better rank; per-metric points = weight × (n+1−rank)/n; total min–max scaled to 0.0–10.0, one decimal.
- MVP = top score on winning team; ACE = top on losing team; no badges when `gameDuration < 300` (remake) or when all participants share one `win` value.
- Summit palette only: `bg-panel`, `bg-panel-2`, `border-panel-border`, `gold`/`gold-light`, `coach` (ACE), semantic tokens. **No blue/red full-row team tints.**
- Optional DTO fields render as "—" (or are skipped) when absent — never NaN.
- After every task: `npm run typecheck && npm test` green before commit.

## File structure

```
lib/riot/types.ts                        modify (Task 1: ParticipantDto fields, TeamDto, info.teams)
lib/matchGrade.ts                        create (Task 2)
tests/matchGrade.test.ts                 create (Task 2)
lib/matchDetail.ts                       create (Task 3)
tests/matchDetail.test.ts                create (Task 3)
app/api/matches/[matchId]/route.ts       modify (Task 3)
components/match/MatchFaceOff.tsx        create (Task 4)
tests/components/MatchFaceOff.test.tsx   create (Task 4)
app/[region]/[riotId]/page.tsx           modify (Task 5: pass viewerPuuid)
components/MatchHistory.tsx              modify (Task 5: thread viewerPuuid)
components/MatchSummaryRow.tsx           modify (Task 5: new payload + render MatchFaceOff)
components/MatchScoreboard.tsx           delete (Task 5)
```

---

### Task 1: Riot type additions

**Agent/model:** general-purpose / **Haiku**.

**Files:**
- Modify: `lib/riot/types.ts`

**Interfaces:**
- Consumes: existing `ParticipantDto` (lines ~50–79) and `MatchDto` (lines ~81–92).
- Produces: `ParticipantDto` gains `champLevel: number`, `goldEarned: number`, `totalDamageTaken: number`, `wardsPlaced?: number`, `wardsKilled?: number`, `detectorWardsPlaced?: number`, `damageDealtToObjectives?: number`; new `TeamDto` export; `MatchDto.info` gains `teams?: TeamDto[]`. Tasks 2–4 depend on these exact names.

- [ ] **Step 1: Add the participant fields** — inside `interface ParticipantDto`, after the existing `visionScore: number;` line, insert:

```ts
  champLevel: number;
  goldEarned: number;
  totalDamageTaken: number;
  wardsPlaced?: number;
  wardsKilled?: number;
  detectorWardsPlaced?: number;
  damageDealtToObjectives?: number;
```

- [ ] **Step 2: Add `TeamDto` and wire it into `MatchDto`** — directly above `export interface MatchDto`, insert:

```ts
/** Match-V5 team object — only the objective counts the scoreboard shows. */
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

and inside `MatchDto`'s `info` object type, after `queueId: number;`, insert:

```ts
    teams?: TeamDto[];
```

- [ ] **Step 3: Check existing tests still compile** — the new required fields (`champLevel`, `goldEarned`, `totalDamageTaken`) will break any test fixture that builds a full `ParticipantDto`. Run:

Run: `npm run typecheck`
If fixtures fail, add `champLevel: 15, goldEarned: 10_000, totalDamageTaken: 15_000,` (values arbitrary) to each broken fixture object — smallest change that compiles; do not restructure fixtures.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test`
Expected: clean, all tests pass (currently 182).

- [ ] **Step 5: Commit**

```powershell
git add lib/riot/types.ts tests
git commit -m "feat: match-v5 team objectives and scoreboard participant fields"
```

---

### Task 2: `lib/matchGrade.ts` (TDD)

**Agent/model:** general-purpose / **Sonnet**.

**Files:**
- Create: `lib/matchGrade.ts`
- Test: `tests/matchGrade.test.ts`

**Interfaces:**
- Consumes: `MatchDto`, `ParticipantDto` from `@/lib/riot/types` (with Task 1 fields).
- Produces: `gradeMatch(match: MatchDto): MatchGrades`; `interface ParticipantGrade { puuid: string; score: number; ordinal: number; badge: 'MVP' | 'ACE' | null }`; `interface MatchGrades { byPuuid: Record<string, ParticipantGrade> }`. Tasks 3–4 rely on these exact names.

- [ ] **Step 1: Write the failing tests** — `tests/matchGrade.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { gradeMatch } from '@/lib/matchGrade';
import type { MatchDto, ParticipantDto } from '@/lib/riot/types';

let counter = 0;
function participant(overrides: Partial<ParticipantDto>): ParticipantDto {
  counter += 1;
  return {
    puuid: `p${counter}`,
    riotIdGameName: `Player${counter}`,
    riotIdTagline: 'EUW',
    championName: 'Ahri',
    championId: 103,
    kills: 2,
    deaths: 4,
    assists: 6,
    win: counter <= 5,
    teamId: counter <= 5 ? 100 : 200,
    teamPosition: ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'][(counter - 1) % 5],
    item0: 0, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, item6: 0,
    summoner1Id: 4, summoner2Id: 7,
    totalDamageDealtToChampions: 10_000,
    visionScore: 20,
    totalMinionsKilled: 150,
    neutralMinionsKilled: 0,
    champLevel: 15,
    goldEarned: 10_000,
    totalDamageTaken: 15_000,
    damageDealtToObjectives: 2_000,
    ...overrides,
  };
}

function matchWith(participants: ParticipantDto[], gameDuration = 1800): MatchDto {
  return {
    metadata: { matchId: 'EUW1_TEST', participants: participants.map((p) => p.puuid) },
    info: { gameCreation: 0, gameDuration, queueId: 420, participants },
  };
}

/** 10 identical players except overrides for the first (winning) and sixth (losing). */
function tenPlayers(first: Partial<ParticipantDto> = {}, sixth: Partial<ParticipantDto> = {}): ParticipantDto[] {
  counter = 0;
  return Array.from({ length: 10 }, (_, i) =>
    participant(i === 0 ? first : i === 5 ? sixth : {})
  );
}

describe('gradeMatch', () => {
  it('gives a clean sweep 10.0 and dead-last 0.0', () => {
    const players = tenPlayers(
      { totalDamageDealtToChampions: 99_999, kills: 20, assists: 20, deaths: 0, visionScore: 99, totalMinionsKilled: 400, goldEarned: 25_000, totalDamageTaken: 60_000, damageDealtToObjectives: 30_000 },
      { totalDamageDealtToChampions: 1, kills: 0, assists: 0, deaths: 20, visionScore: 1, totalMinionsKilled: 1, goldEarned: 1_000, totalDamageTaken: 1_000, damageDealtToObjectives: 0 }
    );
    const grades = gradeMatch(matchWith(players)).byPuuid;
    expect(grades['p1'].score).toBe(10);
    expect(grades['p6'].score).toBe(0);
    expect(grades['p1'].ordinal).toBe(1);
    expect(grades['p6'].ordinal).toBe(10);
  });

  it('awards MVP to the best winner and ACE to the best loser', () => {
    const players = tenPlayers(
      { totalDamageDealtToChampions: 99_999, kills: 20, deaths: 0 },
      { totalDamageDealtToChampions: 50_000, kills: 15, deaths: 1 }
    );
    const grades = gradeMatch(matchWith(players)).byPuuid;
    expect(grades['p1'].badge).toBe('MVP');
    expect(grades['p6'].badge).toBe('ACE');
    expect(grades['p2'].badge).toBeNull();
  });

  it('omits badges for remakes (gameDuration < 300)', () => {
    const grades = gradeMatch(matchWith(tenPlayers(), 250)).byPuuid;
    for (const grade of Object.values(grades)) expect(grade.badge).toBeNull();
  });

  it('omits badges when everyone has the same win value', () => {
    counter = 0;
    const players = Array.from({ length: 10 }, () => participant({ win: false }));
    const grades = gradeMatch(matchWith(players)).byPuuid;
    for (const grade of Object.values(grades)) expect(grade.badge).toBeNull();
  });

  it('shares the better ordinal between tied players', () => {
    const grades = gradeMatch(matchWith(tenPlayers())).byPuuid;
    // All 10 identical -> everyone ties at ordinal 1 with the same score.
    const all = Object.values(grades);
    expect(new Set(all.map((g) => g.ordinal))).toEqual(new Set([1]));
    expect(new Set(all.map((g) => g.score)).size).toBe(1);
  });

  it('handles zero team kills without NaN', () => {
    counter = 0;
    const players = Array.from({ length: 10 }, () => participant({ kills: 0, assists: 0 }));
    const grades = gradeMatch(matchWith(players)).byPuuid;
    for (const grade of Object.values(grades)) expect(Number.isFinite(grade.score)).toBe(true);
  });

  it('treats missing optional fields as 0', () => {
    const players = tenPlayers({ totalMinionsKilled: undefined, neutralMinionsKilled: undefined, damageDealtToObjectives: undefined });
    const grades = gradeMatch(matchWith(players)).byPuuid;
    expect(Number.isFinite(grades['p1'].score)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/matchGrade.test.ts`
Expected: FAIL — module `@/lib/matchGrade` not found.

- [ ] **Step 3: Implement** — `lib/matchGrade.ts`:

```ts
import type { MatchDto, ParticipantDto } from '@/lib/riot/types';

/*
 * In-match relative performance grade (spec: 2026-07-13-scoreboard-faceoff).
 * Every player is ranked against the other participants of the SAME match on
 * 8 weighted metrics — no external benchmarks, fully deterministic.
 */

export interface ParticipantGrade {
  puuid: string;
  /** 0.0–10.0, one decimal. Clean sweep of every metric = 10. */
  score: number;
  /** 1–n placement within the match (ties share the better ordinal). */
  ordinal: number;
  badge: 'MVP' | 'ACE' | null;
}

export interface MatchGrades {
  byPuuid: Record<string, ParticipantGrade>;
}

const WEIGHTS = {
  damage: 1.2,
  kp: 1.1,
  deaths: 1.1,
  goldPerMin: 0.9,
  csPerMin: 0.8,
  vision: 0.8,
  tanking: 0.6,
  objectives: 0.5,
} as const;

type MetricKey = keyof typeof WEIGHTS;

const METRIC_KEYS = Object.keys(WEIGHTS) as MetricKey[];
const WEIGHT_SUM = METRIC_KEYS.reduce((sum, key) => sum + WEIGHTS[key], 0);
const REMAKE_SECONDS = 300;

function metricsFor(
  p: ParticipantDto,
  minutes: number,
  teamKills: number
): Record<MetricKey, number> {
  return {
    damage: p.totalDamageDealtToChampions,
    tanking: p.totalDamageTaken,
    kp: (p.kills + p.assists) / Math.max(teamKills, 1),
    deaths: -p.deaths,
    vision: p.visionScore,
    csPerMin: ((p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0)) / minutes,
    goldPerMin: p.goldEarned / minutes,
    objectives: p.damageDealtToObjectives ?? 0,
  };
}

/** Rank 1 = best (highest value); ties share the better (lower) rank. */
function rankOf(value: number, all: number[]): number {
  return all.filter((other) => other > value).length + 1;
}

export function gradeMatch(match: MatchDto): MatchGrades {
  const participants = match.info.participants;
  const n = participants.length;
  const minutes = Math.max(match.info.gameDuration / 60, 1);

  const killsByTeam = new Map<number, number>();
  for (const p of participants) {
    killsByTeam.set(p.teamId, (killsByTeam.get(p.teamId) ?? 0) + p.kills);
  }

  const metrics = participants.map((p) =>
    metricsFor(p, minutes, killsByTeam.get(p.teamId) ?? 0)
  );

  const totals = participants.map((_, i) =>
    METRIC_KEYS.reduce((sum, key) => {
      const rank = rankOf(metrics[i][key], metrics.map((m) => m[key]));
      return sum + WEIGHTS[key] * ((n + 1 - rank) / n);
    }, 0)
  );

  // Min–max scale: all ranks 1 -> WEIGHT_SUM; all ranks n -> WEIGHT_SUM / n.
  const maxPossible = WEIGHT_SUM;
  const minPossible = WEIGHT_SUM / n;
  const scores = totals.map(
    (total) => Math.round(((total - minPossible) / (maxPossible - minPossible)) * 100) / 10
  );

  const ordinals = totals.map((total) => totals.filter((other) => other > total).length + 1);

  const isRemake = match.info.gameDuration < REMAKE_SECONDS;
  const outcomes = new Set(participants.map((p) => p.win));
  let mvpIndex = -1;
  let aceIndex = -1;
  if (!isRemake && outcomes.size === 2) {
    participants.forEach((p, i) => {
      if (p.win) {
        if (mvpIndex === -1 || totals[i] > totals[mvpIndex]) mvpIndex = i;
      } else if (aceIndex === -1 || totals[i] > totals[aceIndex]) {
        aceIndex = i;
      }
    });
  }

  const byPuuid: Record<string, ParticipantGrade> = {};
  participants.forEach((p, i) => {
    byPuuid[p.puuid] = {
      puuid: p.puuid,
      score: scores[i],
      ordinal: ordinals[i],
      badge: i === mvpIndex ? 'MVP' : i === aceIndex ? 'ACE' : null,
    };
  });
  return { byPuuid };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/matchGrade.test.ts`
Expected: 7 passed. Then `npm test` — full suite green.

- [ ] **Step 5: Commit**

```powershell
git add lib/matchGrade.ts tests/matchGrade.test.ts
git commit -m "feat: in-match relative performance grade with MVP/ACE"
```

---

### Task 3: `lib/matchDetail.ts` + API route enrichment (TDD)

**Agent/model:** general-purpose / **Sonnet**.

**Files:**
- Create: `lib/matchDetail.ts`
- Test: `tests/matchDetail.test.ts`
- Modify: `app/api/matches/[matchId]/route.ts`

**Interfaces:**
- Consumes: `gradeMatch`/`MatchGrades` (Task 2); `LeagueEntryDto`, `MatchDto` from `@/lib/riot/types`; existing `getLeagueEntriesByPuuid(platform, puuid)` from `@/lib/riot/league`; existing route pattern in `app/api/matches/[matchId]/route.ts`.
- Produces: `interface RankSummary { tier: string; division: string }`; `interface MatchDetailPayload { match: MatchDto; grades: MatchGrades; ranks: Record<string, RankSummary | null> }`; `buildMatchDetailPayload(match: MatchDto, fetchLeague: ((puuid: string) => Promise<LeagueEntryDto[]>) | null): Promise<MatchDetailPayload>`; route behavior `GET /api/matches/[matchId]?ranks=1` → `MatchDetailPayload` (without the flag: raw `MatchDto`, unchanged). Tasks 4–5 rely on these names.

- [ ] **Step 1: Write the failing tests** — `tests/matchDetail.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildMatchDetailPayload } from '@/lib/matchDetail';
import type { LeagueEntryDto, MatchDto, ParticipantDto } from '@/lib/riot/types';

function participant(puuid: string, teamId: number): ParticipantDto {
  return {
    puuid,
    riotIdGameName: puuid,
    riotIdTagline: 'EUW',
    championName: 'Ahri',
    championId: 103,
    kills: 1, deaths: 1, assists: 1,
    win: teamId === 100,
    teamId,
    item0: 0, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, item6: 0,
    summoner1Id: 4, summoner2Id: 7,
    totalDamageDealtToChampions: 1000,
    visionScore: 10,
    champLevel: 10,
    goldEarned: 5000,
    totalDamageTaken: 5000,
  };
}

const match: MatchDto = {
  metadata: { matchId: 'EUW1_1', participants: ['a', 'b'] },
  info: {
    gameCreation: 0,
    gameDuration: 1800,
    queueId: 420,
    participants: [participant('a', 100), participant('b', 200)],
  },
};

const soloEntry = (tier: string, rank: string): LeagueEntryDto =>
  ({ queueType: 'RANKED_SOLO_5x5', tier, rank, leaguePoints: 10, wins: 1, losses: 1 }) as LeagueEntryDto;

describe('buildMatchDetailPayload', () => {
  it('summarizes solo-queue entries into tier/division', async () => {
    const payload = await buildMatchDetailPayload(match, async () => [soloEntry('DIAMOND', 'III')]);
    expect(payload.ranks['a']).toEqual({ tier: 'DIAMOND', division: 'III' });
  });

  it('yields null for players without a solo entry', async () => {
    const flexOnly = { ...soloEntry('GOLD', 'I'), queueType: 'RANKED_FLEX_SR' } as LeagueEntryDto;
    const payload = await buildMatchDetailPayload(match, async () => [flexOnly]);
    expect(payload.ranks['a']).toBeNull();
  });

  it('yields null (not a rejection) when a lookup fails', async () => {
    const payload = await buildMatchDetailPayload(match, async (puuid) => {
      if (puuid === 'a') throw new Error('429');
      return [soloEntry('SILVER', 'II')];
    });
    expect(payload.ranks['a']).toBeNull();
    expect(payload.ranks['b']).toEqual({ tier: 'SILVER', division: 'II' });
  });

  it('yields all-null ranks with a null fetcher and still grades', async () => {
    const payload = await buildMatchDetailPayload(match, null);
    expect(payload.ranks).toEqual({ a: null, b: null });
    expect(payload.grades.byPuuid['a']).toBeDefined();
    expect(payload.grades.byPuuid['b']).toBeDefined();
  });
});
```

If `LeagueEntryDto` requires more fields than the cast provides, extend the `soloEntry` helper with the real required fields rather than loosening types.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/matchDetail.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `lib/matchDetail.ts`:

```ts
import type { LeagueEntryDto, MatchDto } from '@/lib/riot/types';
import { gradeMatch, type MatchGrades } from '@/lib/matchGrade';

export interface RankSummary {
  tier: string;
  division: string;
}

export interface MatchDetailPayload {
  match: MatchDto;
  grades: MatchGrades;
  /** puuid → solo-queue rank; null when unranked or the lookup failed. */
  ranks: Record<string, RankSummary | null>;
}

export type LeagueFetcher = (puuid: string) => Promise<LeagueEntryDto[]>;

/**
 * Assembles the scoreboard payload. Rank lookups are best-effort: any
 * rejection becomes null for that player — the scoreboard must render
 * without ranks rather than fail because of them.
 */
export async function buildMatchDetailPayload(
  match: MatchDto,
  fetchLeague: LeagueFetcher | null
): Promise<MatchDetailPayload> {
  const grades = gradeMatch(match);
  const puuids = match.info.participants.map((p) => p.puuid);
  const ranks: Record<string, RankSummary | null> = Object.fromEntries(
    puuids.map((puuid) => [puuid, null])
  );

  if (fetchLeague) {
    const settled = await Promise.allSettled(puuids.map((puuid) => fetchLeague(puuid)));
    settled.forEach((result, i) => {
      if (result.status !== 'fulfilled') return;
      const solo = result.value.find((entry) => entry.queueType === 'RANKED_SOLO_5x5');
      if (solo) ranks[puuids[i]] = { tier: solo.tier, division: solo.rank };
    });
  }

  return { match, grades, ranks };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/matchDetail.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Update the route** — replace the content of `app/api/matches/[matchId]/route.ts` with:

```ts
import { NextResponse } from 'next/server';
import { getMatchById } from '@/lib/riot/match';
import { getLeagueEntriesByPuuid } from '@/lib/riot/league';
import { platformFromMatchId } from '@/lib/riot/regions';
import { RiotApiError } from '@/lib/riot/client';
import { buildMatchDetailPayload } from '@/lib/matchDetail';

export async function GET(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  try {
    const { matchId } = await params;
    const platform = platformFromMatchId(matchId);
    const match = await getMatchById(platform, matchId);
    if (new URL(request.url).searchParams.get('ranks') !== '1') {
      return NextResponse.json(match);
    }
    const payload = await buildMatchDetailPayload(match, (puuid) =>
      getLeagueEntriesByPuuid(platform, puuid)
    );
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof RiotApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm test`
Expected: clean, all green.

- [ ] **Step 7: Commit**

```powershell
git add lib/matchDetail.ts tests/matchDetail.test.ts "app/api/matches/[matchId]/route.ts"
git commit -m "feat: enriched match detail payload with grades and best-effort ranks"
```

---

### Task 4: `MatchFaceOff` component

**Agent/model:** general-purpose / **Sonnet**.

**Files:**
- Create: `components/match/MatchFaceOff.tsx`
- Test: `tests/components/MatchFaceOff.test.tsx`

**Interfaces:**
- Consumes: `MatchGrades`, `ParticipantGrade` (Task 2); `RankSummary` (Task 3); `MatchDto`, `ParticipantDto`, `TeamDto` (Task 1); `championIconUrl`, `itemIconUrl`, `rankEmblemUrl` from `@/lib/dataDragon`; `IconImg` from `@/components/IconImg`.
- Produces: `<MatchFaceOff match grades ranks version viewerPuuid />` and exported pure helper `lanePairs(participants: ParticipantDto[]): LanePair[]` with `interface LanePair { blue: ParticipantDto; red: ParticipantDto; role: string | null }`. Task 5 renders this component.

- [ ] **Step 1: Write the failing tests** — `tests/components/MatchFaceOff.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MatchFaceOff, lanePairs } from '@/components/match/MatchFaceOff';
import { gradeMatch } from '@/lib/matchGrade';
import type { MatchDto, ParticipantDto } from '@/lib/riot/types';

let counter = 0;
function participant(overrides: Partial<ParticipantDto>): ParticipantDto {
  counter += 1;
  return {
    puuid: `p${counter}`,
    riotIdGameName: `Player${counter}`,
    riotIdTagline: 'EUW',
    championName: 'Ahri',
    championId: 103,
    kills: 2, deaths: 4, assists: 6,
    win: counter <= 5,
    teamId: counter <= 5 ? 100 : 200,
    teamPosition: ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'][(counter - 1) % 5],
    item0: 0, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, item6: 0,
    summoner1Id: 4, summoner2Id: 7,
    totalDamageDealtToChampions: 10_000,
    visionScore: 20,
    totalMinionsKilled: 150,
    champLevel: 15,
    goldEarned: 10_000,
    totalDamageTaken: 15_000,
    ...overrides,
  };
}

function tenPlayerMatch(): MatchDto {
  counter = 0;
  const participants = Array.from({ length: 10 }, () => participant({}));
  return {
    metadata: { matchId: 'EUW1_T', participants: participants.map((p) => p.puuid) },
    info: { gameCreation: 0, gameDuration: 1800, queueId: 420, participants },
  };
}

describe('lanePairs', () => {
  it('pairs lane opponents by teamPosition in role order', () => {
    const match = tenPlayerMatch();
    const pairs = lanePairs(match.info.participants);
    expect(pairs).toHaveLength(5);
    expect(pairs[0].role).toBe('TOP');
    expect(pairs[0].blue.puuid).toBe('p1');
    expect(pairs[0].red.puuid).toBe('p6');
  });

  it('falls back to index pairing when positions are missing', () => {
    const match = tenPlayerMatch();
    const stripped = match.info.participants.map((p) => ({ ...p, teamPosition: undefined }));
    const pairs = lanePairs(stripped);
    expect(pairs).toHaveLength(5);
    expect(pairs.every((pair) => pair.role === null)).toBe(true);
  });
});

describe('MatchFaceOff', () => {
  it('renders all players, highlights the viewer, and shows rank + MVP', () => {
    const match = tenPlayerMatch();
    match.info.participants[0].totalDamageDealtToChampions = 99_999; // p1 = MVP
    const grades = gradeMatch(match);
    render(
      <MatchFaceOff
        match={match}
        grades={grades}
        ranks={{ p1: { tier: 'DIAMOND', division: 'III' } }}
        version="14.23.1"
        viewerPuuid="p4"
      />
    );
    expect(screen.getByText('Player1')).toBeInTheDocument();
    expect(screen.getByText('Player10')).toBeInTheDocument();
    expect(screen.getByText('MVP')).toBeInTheDocument();
    expect(screen.getByText('D3')).toBeInTheDocument();
    expect(screen.getByTestId('viewer-row-p4')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/components/MatchFaceOff.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `components/match/MatchFaceOff.tsx`:

```tsx
import type { MatchDto, ParticipantDto, TeamDto } from '@/lib/riot/types';
import type { MatchGrades, ParticipantGrade } from '@/lib/matchGrade';
import type { RankSummary } from '@/lib/matchDetail';
import { championIconUrl, itemIconUrl, rankEmblemUrl } from '@/lib/dataDragon';
import { IconImg } from '@/components/IconImg';

/*
 * "Face-off" match detail: lane opponents rendered against a center spine
 * (spec: 2026-07-13-scoreboard-faceoff). Purely presentational — all data
 * arrives via props from /api/matches/[matchId]?ranks=1.
 */

const ROLE_ORDER = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const;
const ROLE_LABEL: Record<string, string> = {
  TOP: 'TOP', JUNGLE: 'JG', MIDDLE: 'MID', BOTTOM: 'BOT', UTILITY: 'SUP',
};
const TIER_SHORT: Record<string, string> = {
  IRON: 'I', BRONZE: 'B', SILVER: 'S', GOLD: 'G', PLATINUM: 'P',
  EMERALD: 'E', DIAMOND: 'D', MASTER: 'M', GRANDMASTER: 'GM', CHALLENGER: 'C',
};
const DIVISION_SHORT: Record<string, string> = { I: '1', II: '2', III: '3', IV: '4' };
const APEX = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER']);

export interface LanePair {
  blue: ParticipantDto;
  red: ParticipantDto;
  role: string | null;
}

/** Role-order pairing when both teams have all five positions; index fallback otherwise. */
export function lanePairs(participants: ParticipantDto[]): LanePair[] {
  const blue = participants.filter((p) => p.teamId === 100);
  const red = participants.filter((p) => p.teamId === 200);
  const byRolePossible =
    blue.length === 5 &&
    red.length === 5 &&
    ROLE_ORDER.every(
      (role) =>
        blue.some((p) => p.teamPosition === role) && red.some((p) => p.teamPosition === role)
    );
  if (byRolePossible) {
    return ROLE_ORDER.map((role) => ({
      blue: blue.find((p) => p.teamPosition === role)!,
      red: red.find((p) => p.teamPosition === role)!,
      role,
    }));
  }
  const count = Math.min(blue.length, red.length);
  return Array.from({ length: count }, (_, i) => ({ blue: blue[i], red: red[i], role: null }));
}

function shortRank(rank: RankSummary): string {
  const tier = TIER_SHORT[rank.tier] ?? '?';
  return APEX.has(rank.tier) ? tier : `${tier}${DIVISION_SHORT[rank.division] ?? ''}`;
}

function gradeClass(score: number): string {
  if (score >= 8) return 'text-gold';
  if (score >= 5) return 'text-foreground';
  return 'text-muted-foreground';
}

function kpPercent(p: ParticipantDto, teamKills: number): number {
  return Math.round(((p.kills + p.assists) / Math.max(teamKills, 1)) * 100);
}

function csOf(p: ParticipantDto): number | null {
  if (p.totalMinionsKilled === undefined && p.neutralMinionsKilled === undefined) return null;
  return (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0);
}

function Items({ p, version }: { p: ParticipantDto; version: string }) {
  const slots = [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5];
  const trinketUrl = itemIconUrl(version, p.item6);
  return (
    <span className="flex items-center gap-0.5">
      {slots.map((itemId, i) => {
        const url = itemIconUrl(version, itemId);
        return url ? (
          <IconImg key={i} src={url} alt="" className="h-4.5 w-4.5 rounded-sm border border-panel-border" />
        ) : (
          <span key={i} className="h-4.5 w-4.5 rounded-sm border border-panel-border/60 bg-panel-2" />
        );
      })}
      <span className="ml-1">
        {trinketUrl ? (
          <IconImg src={trinketUrl} alt="" className="h-4.5 w-4.5 rounded-full border border-panel-border" />
        ) : (
          <span className="block h-4.5 w-4.5 rounded-full border border-panel-border/60 bg-panel-2" />
        )}
      </span>
    </span>
  );
}

function PlayerCell({
  p, grade, rank, version, teamKills, minutes, isViewer, side,
}: {
  p: ParticipantDto;
  grade: ParticipantGrade;
  rank: RankSummary | null;
  version: string;
  teamKills: number;
  minutes: number;
  isViewer: boolean;
  side: 'left' | 'right';
}) {
  const cs = csOf(p);
  const rowDir = side === 'right' ? 'flex-row-reverse text-right' : '';
  return (
    <div
      data-testid={isViewer ? `viewer-row-${p.puuid}` : undefined}
      className={`flex flex-col gap-1 rounded-lg p-2 ${isViewer ? 'bg-gold/5 shadow-[inset_2px_0_0_0_var(--color-gold)]' : ''}`}
    >
      <div className={`flex items-center gap-2 ${rowDir}`}>
        <span className="relative flex-none">
          <IconImg src={championIconUrl(version, p.championName)} alt={p.championName} className="h-8 w-8 rounded-md border border-panel-border" />
          <span className="absolute -bottom-1 -right-1 rounded bg-panel-2 px-0.5 text-[8px] font-extrabold text-muted-foreground">
            {p.champLevel}
          </span>
        </span>
        <span className="min-w-0 flex-1 truncate">
          <span className="block truncate text-xs font-extrabold text-foreground">{p.riotIdGameName}</span>
          <span className={`flex items-center gap-1 text-[10px] font-bold text-muted-foreground ${side === 'right' ? 'justify-end' : ''}`}>
            {rank && (
              <>
                <IconImg src={rankEmblemUrl(rank.tier)} alt={`${rank.tier} emblem`} className="h-4 w-4" />
                <span>{shortRank(rank)}</span>
                <span aria-hidden>·</span>
              </>
            )}
            <span className={`font-extrabold ${gradeClass(grade.score)}`}>{grade.score.toFixed(1)}</span>
            {grade.badge === 'MVP' && (
              <span className="rounded bg-gradient-to-r from-gold-light to-gold px-1 text-[9px] font-extrabold text-black">MVP</span>
            )}
            {grade.badge === 'ACE' && (
              <span className="rounded bg-coach px-1 text-[9px] font-extrabold text-white">ACE</span>
            )}
          </span>
        </span>
      </div>
      <div className={`flex items-center gap-2 text-[10px] font-bold text-muted-foreground ${rowDir}`}>
        <span className="text-foreground">
          {p.kills}/<span className="text-loss">{p.deaths}</span>/{p.assists}
        </span>
        <span>{kpPercent(p, teamKills)}% KP</span>
        <span>{cs === null ? '—' : `${cs} (${(cs / minutes).toFixed(1)})`} CS</span>
        <span>{(p.goldEarned / 1000).toFixed(1)}k</span>
      </div>
      <div className={`flex ${side === 'right' ? 'justify-end' : ''}`}>
        <Items p={p} version={version} />
      </div>
    </div>
  );
}

function SpineBars({
  pair, maxDamage, maxTaken, role,
}: {
  pair: LanePair;
  maxDamage: number;
  maxTaken: number;
  role: string | null;
}) {
  const width = (value: number, max: number) => `${Math.round((value / Math.max(max, 1)) * 100)}%`;
  return (
    <div className="flex w-24 flex-none flex-col items-center justify-center gap-1 md:w-32">
      {role && (
        <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">
          {ROLE_LABEL[role] ?? role}
        </span>
      )}
      {(
        [
          ['dealt', pair.blue.totalDamageDealtToChampions, pair.red.totalDamageDealtToChampions, maxDamage, 'bg-gold/80'],
          ['taken', pair.blue.totalDamageTaken, pair.red.totalDamageTaken, maxTaken, 'bg-muted-foreground/40'],
        ] as const
      ).map(([label, blueValue, redValue, max, fill]) => (
        <div key={label} className="w-full">
          <div className="flex h-1.5 w-full items-stretch">
            <div className="flex flex-1 justify-end">
              <div className={`${fill} rounded-l-sm`} style={{ width: width(blueValue, max) }} />
            </div>
            <div className="w-px flex-none bg-panel-border" />
            <div className="flex flex-1">
              <div className={`${fill} rounded-r-sm`} style={{ width: width(redValue, max) }} />
            </div>
          </div>
          <div className="flex justify-between text-[8px] font-bold text-muted-foreground">
            <span>{(blueValue / 1000).toFixed(1)}k</span>
            <span className="uppercase">{label}</span>
            <span>{(redValue / 1000).toFixed(1)}k</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamHeader({
  team, participants, side,
}: {
  team: TeamDto | undefined;
  participants: ParticipantDto[];
  side: 'Blue side' | 'Red side';
}) {
  const won = participants[0]?.win ?? false;
  const kills = participants.reduce((sum, p) => sum + p.kills, 0);
  const gold = participants.reduce((sum, p) => sum + p.goldEarned, 0);
  return (
    <div className="flex-1">
      <p className={`text-[11px] font-extrabold uppercase tracking-widest ${won ? 'text-win' : 'text-loss'}`}>
        {won ? 'Victory' : 'Defeat'} <span className="text-muted-foreground">· {side}</span>
      </p>
      <p className="text-[10px] font-bold text-muted-foreground">
        {kills} kills · {(gold / 1000).toFixed(1)}k gold
        {team && (
          <>
            {' '}· Drakes {team.objectives.dragon.kills} · Barons {team.objectives.baron.kills} ·
            Heralds {team.objectives.riftHerald.kills} · Towers {team.objectives.tower.kills}
          </>
        )}
      </p>
    </div>
  );
}

function ShareBar({ blue, red, label }: { blue: number; red: number; label: string }) {
  const total = Math.max(blue + red, 1);
  return (
    <div className="my-1">
      <div className="flex h-1.5 overflow-hidden rounded-full">
        <div className="bg-gold/80" style={{ width: `${(blue / total) * 100}%` }} />
        <div className="bg-muted-foreground/40" style={{ width: `${(red / total) * 100}%` }} />
      </div>
      <p className="mt-0.5 text-center text-[8px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
    </div>
  );
}

export interface MatchFaceOffProps {
  match: MatchDto;
  grades: MatchGrades;
  ranks: Record<string, RankSummary | null>;
  version: string;
  /** The profile being viewed — their rows get the gold accent. */
  viewerPuuid: string;
}

export function MatchFaceOff({ match, grades, ranks, version, viewerPuuid }: MatchFaceOffProps) {
  const participants = match.info.participants;
  const pairs = lanePairs(participants);
  const minutes = Math.max(match.info.gameDuration / 60, 1);
  const blueTeam = participants.filter((p) => p.teamId === 100);
  const redTeam = participants.filter((p) => p.teamId === 200);
  const killsFor = (team: ParticipantDto[]) => team.reduce((sum, p) => sum + p.kills, 0);
  const goldFor = (team: ParticipantDto[]) => team.reduce((sum, p) => sum + p.goldEarned, 0);
  const maxDamage = Math.max(...participants.map((p) => p.totalDamageDealtToChampions));
  const maxTaken = Math.max(...participants.map((p) => p.totalDamageTaken));
  const teams = match.info.teams;
  const blueMeta = teams?.find((t) => t.teamId === 100);
  const redMeta = teams?.find((t) => t.teamId === 200);
  const gradeOf = (p: ParticipantDto): ParticipantGrade =>
    grades.byPuuid[p.puuid] ?? { puuid: p.puuid, score: 0, ordinal: participants.length, badge: null };

  return (
    <div className="rounded-xl border border-panel-border bg-gradient-to-b from-panel to-panel-2 p-3">
      <div className="flex items-start gap-4">
        <TeamHeader team={blueMeta} participants={blueTeam} side="Blue side" />
        <TeamHeader team={redMeta} participants={redTeam} side="Red side" />
      </div>
      <ShareBar blue={killsFor(blueTeam)} red={killsFor(redTeam)} label="Kill share" />
      <ShareBar blue={goldFor(blueTeam)} red={goldFor(redTeam)} label="Gold share" />
      <div className="mt-2 flex flex-col gap-1.5">
        {pairs.map((pair) => (
          <div key={pair.blue.puuid} className="grid grid-cols-1 items-center gap-1 md:grid-cols-[1fr_auto_1fr]">
            <PlayerCell
              p={pair.blue}
              grade={gradeOf(pair.blue)}
              rank={ranks[pair.blue.puuid] ?? null}
              version={version}
              teamKills={killsFor(blueTeam)}
              minutes={minutes}
              isViewer={pair.blue.puuid === viewerPuuid}
              side="left"
            />
            <div className="hidden md:block">
              <SpineBars pair={pair} maxDamage={maxDamage} maxTaken={maxTaken} role={pair.role} />
            </div>
            <PlayerCell
              p={pair.red}
              grade={gradeOf(pair.red)}
              rank={ranks[pair.red.puuid] ?? null}
              version={version}
              teamKills={killsFor(redTeam)}
              minutes={minutes}
              isViewer={pair.red.puuid === viewerPuuid}
              side="right"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
```

Note for the implementer: `h-4.5`/`w-4.5` are valid Tailwind v4 spacing values. If `IconImg`'s props don't accept what's written here, adapt the call sites to IconImg's actual signature (read `components/IconImg.tsx`) — keep the visual intent and record the deviation in your report.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/components/MatchFaceOff.test.tsx`
Expected: 3 passed. Then `npm run typecheck`.

- [ ] **Step 5: Commit**

```powershell
git add components/match/MatchFaceOff.tsx tests/components/MatchFaceOff.test.tsx
git commit -m "feat: face-off match detail component with lane matchups and grades"
```

---

### Task 5: Wire-up and legacy removal

**Agent/model:** general-purpose / **Sonnet**.

**Files:**
- Modify: `app/[region]/[riotId]/page.tsx` (pass `viewerPuuid` to `MatchHistory`)
- Modify: `components/MatchHistory.tsx` (thread `viewerPuuid`)
- Modify: `components/MatchSummaryRow.tsx` (new payload + render `MatchFaceOff`)
- Delete: `components/MatchScoreboard.tsx`

**Interfaces:**
- Consumes: `MatchDetailPayload` (Task 3), `MatchFaceOff` (Task 4).
- Produces: `MatchHistoryProps` and `MatchSummaryRowProps` each gain `viewerPuuid: string`.

- [ ] **Step 1: Thread the viewer puuid.** In `app/[region]/[riotId]/page.tsx`, find the `<MatchHistory` element and add `viewerPuuid={account.puuid}` (the page already has `account` in scope). In `components/MatchHistory.tsx`, add to `MatchHistoryProps`:

```ts
  /** Profile owner's puuid — their rows get highlighted in the detail view. */
  viewerPuuid: string;
```

destructure it in the component signature and pass `viewerPuuid={viewerPuuid}` to each `<MatchSummaryRow ... />`.

- [ ] **Step 2: Switch `MatchSummaryRow` to the enriched payload.** In `components/MatchSummaryRow.tsx`:

Replace the `MatchDto` type import and the `MatchScoreboard` import with:

```ts
import type { MatchDetailPayload } from '@/lib/matchDetail';
import { MatchFaceOff } from '@/components/match/MatchFaceOff';
```

Add `viewerPuuid: string;` to `MatchSummaryRowProps` (doc comment: `/** Profile owner's puuid — highlighted in the expanded detail. */`) and destructure it.

Change the state and fetch:

```ts
  const [detail, setDetail] = useState<MatchDetailPayload | null>(null);
```

```ts
      const response = await fetch(`/api/matches/${summary.matchId}?ranks=1`);
      if (!response.ok) throw new Error('Failed to load match detail');
      setDetail((await response.json()) as MatchDetailPayload);
```

Replace the expanded render line (`{detail && <MatchScoreboard match={detail} version={version} />}`) with:

```tsx
          {detail && (
            <MatchFaceOff
              match={detail.match}
              grades={detail.grades}
              ranks={detail.ranks}
              version={version}
              viewerPuuid={viewerPuuid}
            />
          )}
```

- [ ] **Step 3: Delete the legacy scoreboard.** First verify nothing else imports it:

Run: Grep for `MatchScoreboard` across `app`, `components`, `tests`.
Expected: only `components/MatchScoreboard.tsx` itself and `components/MatchSummaryRow.tsx` (which Step 2 already cleaned). Then delete `components/MatchScoreboard.tsx`. If a test file references it, delete that test file too (superseded by `MatchFaceOff.test.tsx`) and say so in the commit body.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test && npm run build`
Expected: all green.

Manual check (requires a valid `RIOT_API_KEY`): `npm run dev` (lands on port 3001 if 3000 is busy), open a profile, expand a match — face-off rows with grades render; rank emblems appear; the viewer's rows carry the gold accent; an ARAM match still renders (index pairing, no role labels).

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "feat: replace match scoreboard with face-off detail view"
```

---

## Final gate (after Task 5)

- `npm run lint && npm run typecheck && npm test && npm run build` — all clean.
- Whole-branch review (Sonnet reviewer) over the range from the commit before Task 1 to HEAD; fix Critical/Important findings before merge.
- Live visual pass needs the user (valid Riot key): grades sane (MVP on winner), spine bars proportional, mobile stacking at <md.

## Self-review notes

- Spec coverage: types ✅ (T1), grade formula ✅ (T2 — weights/normalization/badges verbatim), payload + best-effort ranks + `?ranks=1` opt-in ✅ (T3), face-off UI with spine bars/objectives strip/share bars/viewer accent/ARAM fallback ✅ (T4), wire-up + old component removal ✅ (T5). Mobile behavior = single-column grid collapse with the spine hidden below `md` — simpler than the spec's "inline bars inside cells" sentence; deliberate simplification, noted here.
- Type consistency: `MatchGrades.byPuuid`, `RankSummary{tier,division}`, `MatchDetailPayload{match,grades,ranks}`, `lanePairs`, `viewerPuuid` used identically across Tasks 2–5.
- Known judgment calls: `LeagueEntryDto` test cast in Task 3 may need real required fields (instruction included); `IconImg` prop drift guarded by an explicit adapt note in Task 4.
