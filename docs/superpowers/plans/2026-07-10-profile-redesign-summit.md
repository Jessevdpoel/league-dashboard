# Summit Profile Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the summoner profile page as the "Summit" coaching dashboard — hero header, AI Coach strip, stat deck (rank + LP sparkline, performance donut, skill radar), champion pool, and restyled match history with queue filters and analyzed-state CTAs.

**Architecture:** Pure logic lives in `lib/` modules with injected dependencies and vitest coverage; Prisma/DB wrappers stay thin and untested (repo convention, see `lib/analysis/benchmarkDb.ts` header). New profile UI lives in `components/profile/`. Everything DB-backed on the page is best-effort: catch, log, hide — the page must render on Riot data alone.

**Tech Stack:** Next.js App Router (server components + small client islands), Tailwind v4 tokens in `app/globals.css`, Prisma/Postgres, vitest, recharts (existing SkillRadar).

**Spec:** `docs/superpowers/specs/2026-07-10-profile-redesign-summit-design.md`

## Global Constraints

- Palette rules: gold `#c9a86a` = identity/CTA only; indigo `#6577f3` = AI elements only; `--color-win`/`--color-loss` = outcomes only. No LoL-client motifs (no corner brackets, no hextech).
- Profile page only adopts the new background/panels; nav and analysis pages untouched.
- No new Riot API calls anywhere in this plan (10-match fetch stays; no timeline fetches on the profile).
- All new DB reads/writes wrapped in try/catch on the page; failures log via `console.error` and hide the element.
- Performance card label uses the real window size ("Last 10"), not the mockup's "Last 20".
- Test commands: `npx vitest run <file>`. Typecheck: `npx tsc --noEmit`. Existing tests must stay green.

---

### Task 1: Summit theme tokens + profile icon URL

**Files:**
- Modify: `app/globals.css` (add tokens inside `@theme inline`, add `.summit-bg` after the `body` rule)
- Modify: `lib/dataDragon.ts` (add `profileIconUrl`)
- Test: `tests/dataDragon.test.ts` (create)

**Interfaces:**
- Produces: CSS color utilities `text-gold`, `bg-gold`, `border-gold`, `text-gold-light`, `text-coach`, `bg-coach`, `border-panel-border`, `bg-panel`, `bg-panel-2` (via Tailwind v4 `--color-*` tokens); CSS class `summit-bg`; `profileIconUrl(version: string, profileIconId: number): string`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/dataDragon.test.ts
import { describe, it, expect } from 'vitest';
import { profileIconUrl } from '../lib/dataDragon';

describe('profileIconUrl', () => {
  it('builds the ddragon profile icon URL', () => {
    expect(profileIconUrl('14.13.1', 685)).toBe(
      'https://ddragon.leagueoflegends.com/cdn/14.13.1/img/profileicon/685.png'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/dataDragon.test.ts`
Expected: FAIL — `profileIconUrl` is not exported.

- [ ] **Step 3: Implement**

In `lib/dataDragon.ts`, after `rankEmblemUrl`:

```ts
export function profileIconUrl(version: string, profileIconId: number): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${profileIconId}.png`;
}
```

In `app/globals.css`, inside the `@theme inline` block after the status colors:

```css
  /* Summit palette — gold = identity/CTA, coach = AI-only */
  --color-gold: #c9a86a;
  --color-gold-light: #e9cf94;
  --color-coach: #6577f3;
  --color-coach-light: #8ea2ff;
  --color-panel: #141821;
  --color-panel-2: #10131a;
  --color-panel-border: #232936;
```

After the `body` rule:

```css
.summit-bg {
  background:
    radial-gradient(1000px 500px at 75% -15%, rgba(88, 101, 242, 0.14), transparent 55%),
    radial-gradient(800px 400px at 5% 10%, rgba(201, 168, 106, 0.07), transparent 50%),
    linear-gradient(180deg, #0e1015 0%, #0a0c10 100%);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/dataDragon.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/globals.css lib/dataDragon.ts tests/dataDragon.test.ts
git commit -m "feat: summit theme tokens and profile icon url"
```

---

### Task 2: Recent performance aggregates (`computeRecentPerformance`)

**Files:**
- Modify: `lib/matchStats.ts`
- Test: `tests/matchStats.test.ts` (create)

**Interfaces:**
- Consumes: `ParticipantDto` from `lib/riot/types` (fields: `kills`, `deaths`, `assists`, `win`, `challenges?.killParticipation`).
- Produces:

```ts
export interface RecentPerformance {
  games: number;
  wins: number;
  losses: number;
  winRatePct: number;          // 0–100, rounded
  kdaRatio: number | null;     // (K+A)/max(D,1), 1 decimal; null when 0 games
  avgKills: number;            // 1 decimal
  avgDeaths: number;
  avgAssists: number;
  avgKillParticipationPct: number | null; // mean of challenges.killParticipation × 100; null if none present
  streak: { result: 'win' | 'loss'; count: number } | null; // consecutive from most recent; null when 0 games
}
export function computeRecentPerformance(participants: ParticipantDto[]): RecentPerformance;
// `participants` MUST be ordered newest-first (Riot match-id order).
```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/matchStats.test.ts
import { describe, it, expect } from 'vitest';
import { computeRecentPerformance } from '../lib/matchStats';
import type { ParticipantDto } from '../lib/riot/types';

function p(over: Partial<ParticipantDto>): ParticipantDto {
  return {
    puuid: 'me', riotIdGameName: 'a', riotIdTagline: 'b',
    championName: 'Aatrox', championId: 266,
    kills: 5, deaths: 4, assists: 6, win: true, teamId: 100,
    item0: 0, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, item6: 0,
    summoner1Id: 4, summoner2Id: 14,
    totalDamageDealtToChampions: 20000, visionScore: 20,
    ...over,
  };
}

describe('computeRecentPerformance', () => {
  it('aggregates wins, KDA and averages', () => {
    const result = computeRecentPerformance([
      p({ kills: 10, deaths: 5, assists: 10, win: true, challenges: { killParticipation: 0.6 } }),
      p({ kills: 2, deaths: 5, assists: 2, win: false, challenges: { killParticipation: 0.4 } }),
    ]);
    expect(result.games).toBe(2);
    expect(result.wins).toBe(1);
    expect(result.winRatePct).toBe(50);
    expect(result.kdaRatio).toBe(2.4); // (12+12)/10
    expect(result.avgKills).toBe(6);
    expect(result.avgKillParticipationPct).toBe(50);
  });

  it('counts streak from the most recent game', () => {
    const result = computeRecentPerformance([
      p({ win: true }), p({ win: true }), p({ win: false }),
    ]);
    expect(result.streak).toEqual({ result: 'win', count: 2 });
  });

  it('handles zero deaths and empty input', () => {
    expect(computeRecentPerformance([p({ kills: 3, deaths: 0, assists: 3 })]).kdaRatio).toBe(6);
    const empty = computeRecentPerformance([]);
    expect(empty.games).toBe(0);
    expect(empty.kdaRatio).toBeNull();
    expect(empty.streak).toBeNull();
    expect(empty.avgKillParticipationPct).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/matchStats.test.ts`
Expected: FAIL — `computeRecentPerformance` is not exported.

- [ ] **Step 3: Implement**

Append to `lib/matchStats.ts`:

```ts
export interface RecentPerformance {
  games: number;
  wins: number;
  losses: number;
  winRatePct: number;
  kdaRatio: number | null;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  avgKillParticipationPct: number | null;
  streak: { result: 'win' | 'loss'; count: number } | null;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** `participants` ordered newest-first (the order the match-id list arrives in). */
export function computeRecentPerformance(participants: ParticipantDto[]): RecentPerformance {
  const games = participants.length;
  if (games === 0) {
    return {
      games: 0, wins: 0, losses: 0, winRatePct: 0, kdaRatio: null,
      avgKills: 0, avgDeaths: 0, avgAssists: 0,
      avgKillParticipationPct: null, streak: null,
    };
  }
  const wins = participants.filter((p) => p.win).length;
  const kills = participants.reduce((s, p) => s + p.kills, 0);
  const deaths = participants.reduce((s, p) => s + p.deaths, 0);
  const assists = participants.reduce((s, p) => s + p.assists, 0);
  const kps = participants
    .map((p) => p.challenges?.killParticipation)
    .filter((v): v is number => v !== undefined);

  let count = 1;
  const first = participants[0].win;
  while (count < games && participants[count].win === first) count++;

  return {
    games,
    wins,
    losses: games - wins,
    winRatePct: Math.round((wins / games) * 100),
    kdaRatio: round1((kills + assists) / Math.max(deaths, 1)),
    avgKills: round1(kills / games),
    avgDeaths: round1(deaths / games),
    avgAssists: round1(assists / games),
    avgKillParticipationPct: kps.length
      ? Math.round((kps.reduce((a, b) => a + b, 0) / kps.length) * 100)
      : null,
    streak: { result: first ? 'win' : 'loss', count },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/matchStats.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/matchStats.ts tests/matchStats.test.ts
git commit -m "feat: recent performance aggregates for profile"
```

---

### Task 3: Champion pool (`computeChampionPool`, `bestChampionIndex`)

**Files:**
- Modify: `lib/riot/types.ts` (two optional `ParticipantDto` fields)
- Modify: `lib/matchStats.ts`
- Test: `tests/matchStats.test.ts` (extend)

**Interfaces:**
- Consumes: `MatchDto` (has `info.gameDuration`, `info.participants`).
- Produces:

```ts
export interface ChampionPoolEntry {
  championName: string;
  games: number;
  wins: number;
  winRatePct: number;
  kda: number | null;      // (K+A)/max(D,1) across the champion's games, 2 decimals
  csPerMin: number | null; // null when minion fields absent on every game
}
export function computeChampionPool(matches: MatchDto[], puuid: string, limit?: number): ChampionPoolEntry[]; // sorted games desc, limit default 4
export function bestChampionIndex(pool: ChampionPoolEntry[]): number; // highest winRatePct among entries with games >= 3; falls back to 0; -1 for empty pool
```

New `ParticipantDto` fields (optional — older fixtures stay valid):

```ts
  totalMinionsKilled?: number;
  neutralMinionsKilled?: number;
```

- [ ] **Step 1: Add the DTO fields**

In `lib/riot/types.ts`, inside `ParticipantDto` after `visionScore: number;`:

```ts
  totalMinionsKilled?: number;
  neutralMinionsKilled?: number;
```

- [ ] **Step 2: Write the failing tests**

Append to `tests/matchStats.test.ts` (reuse the `p()` helper; add a match helper):

```ts
import { computeChampionPool, bestChampionIndex } from '../lib/matchStats';
import type { MatchDto } from '../lib/riot/types';

function match(id: string, participant: ParticipantDto, durationSeconds = 1800): MatchDto {
  return {
    metadata: { matchId: id, participants: [participant.puuid] },
    info: { gameCreation: 0, gameDuration: durationSeconds, queueId: 420, participants: [participant] },
  };
}

describe('computeChampionPool', () => {
  it('aggregates per champion with kda and cs/min', () => {
    const pool = computeChampionPool(
      [
        match('m1', p({ championName: 'Aatrox', kills: 8, deaths: 2, assists: 4, win: true, totalMinionsKilled: 180, neutralMinionsKilled: 0 })),
        match('m2', p({ championName: 'Aatrox', kills: 2, deaths: 6, assists: 4, win: false, totalMinionsKilled: 150, neutralMinionsKilled: 30 })),
        match('m3', p({ championName: 'Fiora', kills: 5, deaths: 5, assists: 5, win: true })),
      ],
      'me'
    );
    expect(pool[0]).toMatchObject({ championName: 'Aatrox', games: 2, wins: 1, winRatePct: 50 });
    expect(pool[0].kda).toBe(2.25); // (10+8)/8
    expect(pool[0].csPerMin).toBe(6); // 360 cs / 60 min
    expect(pool[1].csPerMin).toBeNull(); // fields absent
  });

  it('picks best champion by winrate with >=3 games', () => {
    const pool = [
      { championName: 'A', games: 5, wins: 2, winRatePct: 40, kda: 2, csPerMin: 6 },
      { championName: 'B', games: 3, wins: 3, winRatePct: 100, kda: 3, csPerMin: 7 },
      { championName: 'C', games: 1, wins: 1, winRatePct: 100, kda: 9, csPerMin: 8 },
    ];
    expect(bestChampionIndex(pool)).toBe(1); // C excluded: fewer than 3 games
    expect(bestChampionIndex([])).toBe(-1);
    expect(bestChampionIndex([pool[2]])).toBe(0); // nobody qualifies → first
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/matchStats.test.ts`
Expected: FAIL — `computeChampionPool` is not exported.

- [ ] **Step 4: Implement**

Append to `lib/matchStats.ts`:

```ts
export interface ChampionPoolEntry {
  championName: string;
  games: number;
  wins: number;
  winRatePct: number;
  kda: number | null;
  csPerMin: number | null;
}

export function computeChampionPool(
  matches: MatchDto[],
  puuid: string,
  limit = 4
): ChampionPoolEntry[] {
  interface Acc { games: number; wins: number; k: number; d: number; a: number; cs: number; csSeconds: number }
  const byChampion = new Map<string, Acc>();
  for (const m of matches) {
    const part = m.info.participants.find((x) => x.puuid === puuid);
    if (!part) continue;
    const acc = byChampion.get(part.championName) ?? { games: 0, wins: 0, k: 0, d: 0, a: 0, cs: 0, csSeconds: 0 };
    acc.games += 1;
    if (part.win) acc.wins += 1;
    acc.k += part.kills; acc.d += part.deaths; acc.a += part.assists;
    if (part.totalMinionsKilled !== undefined) {
      acc.cs += part.totalMinionsKilled + (part.neutralMinionsKilled ?? 0);
      acc.csSeconds += m.info.gameDuration;
    }
    byChampion.set(part.championName, acc);
  }
  return [...byChampion.entries()]
    .sort((a, b) => b[1].games - a[1].games)
    .slice(0, limit)
    .map(([championName, acc]) => ({
      championName,
      games: acc.games,
      wins: acc.wins,
      winRatePct: Math.round((acc.wins / acc.games) * 100),
      kda: Math.round(((acc.k + acc.a) / Math.max(acc.d, 1)) * 100) / 100,
      csPerMin: acc.csSeconds > 0 ? Math.round((acc.cs / (acc.csSeconds / 60)) * 10) / 10 : null,
    }));
}

export function bestChampionIndex(pool: ChampionPoolEntry[]): number {
  if (pool.length === 0) return -1;
  let best = -1;
  for (let i = 0; i < pool.length; i++) {
    if (pool[i].games < 3) continue;
    if (best === -1 || pool[i].winRatePct > pool[best].winRatePct) best = i;
  }
  return best === -1 ? 0 : best;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/matchStats.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/riot/types.ts lib/matchStats.ts tests/matchStats.test.ts
git commit -m "feat: champion pool aggregates with kda and cs/min"
```

---

### Task 4: Performance badge + match summary extensions

**Files:**
- Modify: `lib/riot/types.ts` (two optional `ParticipantDto` fields)
- Create: `lib/matchBadges.ts`
- Modify: `lib/matchStats.ts` (`MatchSummary` + `toMatchSummary` gain `role`, `cs`, `badge`)
- Test: `tests/matchBadges.test.ts` (create), `tests/matchStats.test.ts` (extend)

**Interfaces:**
- Produces:

```ts
// lib/matchBadges.ts
export function performanceBadge(participant: ParticipantDto): string | null;
// Priority: PENTA KILL (largestMultiKill>=5), QUADRA KILL (4), TRIPLE KILL (3),
// SOLO KILL ×N (challenges.soloKills>=2), FIRST BLOOD (firstBloodKill),
// DOUBLE KILL (largestMultiKill===2), else null.

// MatchSummary gains:
//   role: string | null;   (participant.teamPosition ?? null)
//   cs: number | null;     (totalMinionsKilled + neutralMinionsKilled, null when absent)
//   badge: string | null;  (performanceBadge(participant))
```

New `ParticipantDto` fields:

```ts
  largestMultiKill?: number;
  firstBloodKill?: boolean;
```

- [ ] **Step 1: Add DTO fields**

In `lib/riot/types.ts`, inside `ParticipantDto` after `neutralMinionsKilled?: number;`:

```ts
  largestMultiKill?: number;
  firstBloodKill?: boolean;
```

- [ ] **Step 2: Write the failing badge tests**

```ts
// tests/matchBadges.test.ts
import { describe, it, expect } from 'vitest';
import { performanceBadge } from '../lib/matchBadges';
import type { ParticipantDto } from '../lib/riot/types';

function p(over: Partial<ParticipantDto>): ParticipantDto {
  return {
    puuid: 'me', riotIdGameName: 'a', riotIdTagline: 'b',
    championName: 'Aatrox', championId: 266,
    kills: 5, deaths: 4, assists: 6, win: true, teamId: 100,
    item0: 0, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, item6: 0,
    summoner1Id: 4, summoner2Id: 14,
    totalDamageDealtToChampions: 20000, visionScore: 20,
    ...over,
  };
}

describe('performanceBadge', () => {
  it('ranks multikills above solo kills above first blood', () => {
    expect(performanceBadge(p({ largestMultiKill: 5 }))).toBe('PENTA KILL');
    expect(performanceBadge(p({ largestMultiKill: 3, challenges: { soloKills: 4 } }))).toBe('TRIPLE KILL');
    expect(performanceBadge(p({ challenges: { soloKills: 2 }, firstBloodKill: true }))).toBe('SOLO KILL ×2');
    expect(performanceBadge(p({ firstBloodKill: true }))).toBe('FIRST BLOOD');
    expect(performanceBadge(p({ largestMultiKill: 2 }))).toBe('DOUBLE KILL');
    expect(performanceBadge(p({}))).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/matchBadges.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the badge**

```ts
// lib/matchBadges.ts
import type { ParticipantDto } from './riot/types';

/** One short highlight per match, or null. Priority: rarest feat first. */
export function performanceBadge(participant: ParticipantDto): string | null {
  const multi = participant.largestMultiKill ?? 0;
  if (multi >= 5) return 'PENTA KILL';
  if (multi === 4) return 'QUADRA KILL';
  if (multi === 3) return 'TRIPLE KILL';
  const solo = participant.challenges?.soloKills ?? 0;
  if (solo >= 2) return `SOLO KILL ×${solo}`;
  if (participant.firstBloodKill) return 'FIRST BLOOD';
  if (multi === 2) return 'DOUBLE KILL';
  return null;
}
```

- [ ] **Step 5: Extend MatchSummary — failing test**

Append to `tests/matchStats.test.ts`:

```ts
import { toMatchSummary } from '../lib/matchStats';

describe('toMatchSummary extensions', () => {
  it('carries role, cs and badge', () => {
    const summary = toMatchSummary(
      match('m9', p({ teamPosition: 'TOP', totalMinionsKilled: 100, neutralMinionsKilled: 20, largestMultiKill: 2 })),
      'me'
    );
    expect(summary.role).toBe('TOP');
    expect(summary.cs).toBe(120);
    expect(summary.badge).toBe('DOUBLE KILL');
  });

  it('nulls cs and role when source fields absent', () => {
    const summary = toMatchSummary(match('m10', p({})), 'me');
    expect(summary.role).toBeNull();
    expect(summary.cs).toBeNull();
    expect(summary.badge).toBeNull();
  });
});
```

Run: `npx vitest run tests/matchStats.test.ts` — expected FAIL (missing fields).

- [ ] **Step 6: Implement MatchSummary extensions**

In `lib/matchStats.ts`: add to the `MatchSummary` interface:

```ts
  role: string | null;
  cs: number | null;
  badge: string | null;
```

Add import at top: `import { performanceBadge } from './matchBadges';`
Add to the returned object in `toMatchSummary`:

```ts
    role: participant.teamPosition ?? null,
    cs:
      participant.totalMinionsKilled !== undefined
        ? participant.totalMinionsKilled + (participant.neutralMinionsKilled ?? 0)
        : null,
    badge: performanceBadge(participant),
```

- [ ] **Step 7: Run all touched tests**

Run: `npx vitest run tests/matchBadges.test.ts tests/matchStats.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add lib/riot/types.ts lib/matchBadges.ts lib/matchStats.ts tests/matchBadges.test.ts tests/matchStats.test.ts
git commit -m "feat: performance badges and match summary role/cs"
```

---

### Task 5: Ladder percentile approximation

**Files:**
- Create: `lib/analysis/ladderPercentile.ts`
- Test: `tests/analysis/ladderPercentile.test.ts`

**Interfaces:**
- Produces:

```ts
export function ladderPercentile(tier: string, division: string): number | null;
// ≈ share of ranked players ABOVE the bottom of this tier+division, in percent (e.g. DIAMOND III → 2.8). Null for unknown input.
export function formatLadderChip(tier: string, division: string): string | null;
// "Top ~2.8%" | null
```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/analysis/ladderPercentile.test.ts
import { describe, it, expect } from 'vitest';
import { ladderPercentile, formatLadderChip } from '../../lib/analysis/ladderPercentile';

describe('ladderPercentile', () => {
  it('maps tier+division to approximate top share', () => {
    expect(ladderPercentile('DIAMOND', 'III')).toBe(2.8);
    expect(ladderPercentile('CHALLENGER', 'I')).toBe(0.02);
    expect(ladderPercentile('IRON', 'IV')).toBe(99.9);
  });
  it('is case-insensitive on tier and null on unknowns', () => {
    expect(ladderPercentile('diamond', 'III')).toBe(2.8);
    expect(ladderPercentile('WOOD', 'IV')).toBeNull();
    expect(ladderPercentile('GOLD', 'V')).toBeNull();
  });
  it('formats the chip', () => {
    expect(formatLadderChip('DIAMOND', 'III')).toBe('Top ~2.8%');
    expect(formatLadderChip('WOOD', 'I')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/analysis/ladderPercentile.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/analysis/ladderPercentile.ts
/*
 * Static approximation of the ranked-ladder distribution (share of players ABOVE
 * the bottom of each tier+division, %). Presentational only — the chip renders
 * with a "~" prefix. Refresh the numbers once per season from public
 * distribution stats; exactness is not a goal.
 */
const TOP_SHARE: Record<string, number> = {
  'CHALLENGER I': 0.02,
  'GRANDMASTER I': 0.06,
  'MASTER I': 0.5,
  'DIAMOND I': 1.0, 'DIAMOND II': 1.7, 'DIAMOND III': 2.8, 'DIAMOND IV': 4.5,
  'EMERALD I': 7, 'EMERALD II': 10, 'EMERALD III': 13, 'EMERALD IV': 18,
  'PLATINUM I': 22, 'PLATINUM II': 26, 'PLATINUM III': 31, 'PLATINUM IV': 37,
  'GOLD I': 43, 'GOLD II': 49, 'GOLD III': 55, 'GOLD IV': 62,
  'SILVER I': 68, 'SILVER II': 74, 'SILVER III': 79, 'SILVER IV': 84,
  'BRONZE I': 88, 'BRONZE II': 91, 'BRONZE III': 94, 'BRONZE IV': 96,
  'IRON I': 97.5, 'IRON II': 98.6, 'IRON III': 99.3, 'IRON IV': 99.9,
};

export function ladderPercentile(tier: string, division: string): number | null {
  return TOP_SHARE[`${tier.toUpperCase()} ${division.toUpperCase()}`] ?? null;
}

export function formatLadderChip(tier: string, division: string): string | null {
  const share = ladderPercentile(tier, division);
  return share === null ? null : `Top ~${share}%`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/analysis/ladderPercentile.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/analysis/ladderPercentile.ts tests/analysis/ladderPercentile.test.ts
git commit -m "feat: static ladder percentile approximation"
```

---

### Task 6: Profile metric means + skill scores

**Files:**
- Create: `lib/analysis/coachInsights.ts`
- Test: `tests/analysis/coachInsights.test.ts`

**Interfaces:**
- Consumes: `BenchmarkLookup`, `MetricName`, `METRIC_META`, `MetricCategory` from `lib/analysis/metrics`; `ParticipantDto`.
- Produces:

```ts
export const PROFILE_METRICS: readonly MetricName[]; // the 8 timeline-free metrics
export function profileMetricMeans(participants: ParticipantDto[]): Partial<Record<MetricName, number>>;
export function profileSkillScores(
  participants: ParticipantDto[],
  lookup: BenchmarkLookup
): Record<MetricCategory, number | null>;
```

Metric → participant field mapping (challenges are optional; a metric skips participants that lack the field; a metric with zero samples is absent from the means):

| metric | source |
|---|---|
| csAt10 | `challenges.laneMinionsFirst10Minutes` |
| platesTaken | `challenges.turretPlatesTaken` |
| visionScorePerMin | `challenges.visionScorePerMinute` |
| killParticipation | `challenges.killParticipation` |
| soloKills | `challenges.soloKills` |
| damagePerMin | `challenges.damagePerMinute` |
| damageShare | `challenges.teamDamagePercentage` |
| deaths | `participant.deaths` (always present) |

- [ ] **Step 1: Write the failing tests**

```ts
// tests/analysis/coachInsights.test.ts
import { describe, it, expect } from 'vitest';
import {
  PROFILE_METRICS,
  profileMetricMeans,
  profileSkillScores,
} from '../../lib/analysis/coachInsights';
import type { BenchmarkLookup } from '../../lib/analysis/metrics';
import type { ParticipantDto } from '../../lib/riot/types';

function p(over: Partial<ParticipantDto>): ParticipantDto {
  return {
    puuid: 'me', riotIdGameName: 'a', riotIdTagline: 'b',
    championName: 'Aatrox', championId: 266,
    kills: 5, deaths: 4, assists: 6, win: true, teamId: 100,
    item0: 0, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, item6: 0,
    summoner1Id: 4, summoner2Id: 14,
    totalDamageDealtToChampions: 20000, visionScore: 20,
    ...over,
  };
}

describe('profileMetricMeans', () => {
  it('averages available challenge values and skips missing ones', () => {
    const means = profileMetricMeans([
      p({ deaths: 4, challenges: { laneMinionsFirst10Minutes: 60 } }),
      p({ deaths: 6, challenges: {} }),
    ]);
    expect(means.deaths).toBe(5);
    expect(means.csAt10).toBe(60); // only one sample
    expect(means.damagePerMin).toBeUndefined(); // zero samples
  });
});

describe('profileSkillScores', () => {
  it('direction-adjusts and buckets per category', () => {
    // Lookup: everything sits at raw percentile 80.
    const lookup: BenchmarkLookup = () => 80;
    const scores = profileSkillScores(
      [p({ deaths: 3, challenges: { laneMinionsFirst10Minutes: 70, damagePerMinute: 600 } })],
      lookup
    );
    expect(scores.laning).toBe(80);
    expect(scores.fighting).toBe(80);
    expect(scores.survivability).toBe(20); // deaths: higher is worse → 100-80
    expect(scores.vision).toBeNull(); // no vision samples
  });

  it('returns all-null when the lookup has no rows', () => {
    const lookup: BenchmarkLookup = () => undefined;
    const scores = profileSkillScores([p({})], lookup);
    for (const key of ['laning', 'vision', 'fighting', 'survivability'] as const) {
      expect(scores[key]).toBeNull();
    }
  });
});

it('PROFILE_METRICS contains only timeline-free metrics', () => {
  expect(PROFILE_METRICS).not.toContain('goldDiffAt10');
  expect(PROFILE_METRICS).toContain('deaths');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/analysis/coachInsights.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/analysis/coachInsights.ts
import type { ParticipantDto } from '../riot/types';
import {
  METRIC_META,
  type BenchmarkLookup,
  type MetricCategory,
  type MetricName,
} from './metrics';

/*
 * Profile-level insight derivation. Works ONLY from participant fields available
 * without a timeline fetch — the profile page must not add Riot API calls.
 */

export const PROFILE_METRICS = [
  'csAt10',
  'platesTaken',
  'visionScorePerMin',
  'killParticipation',
  'soloKills',
  'damagePerMin',
  'damageShare',
  'deaths',
] as const satisfies readonly MetricName[];

function rawValue(p: ParticipantDto, metric: MetricName): number | undefined {
  const c = p.challenges;
  switch (metric) {
    case 'csAt10': return c?.laneMinionsFirst10Minutes;
    case 'platesTaken': return c?.turretPlatesTaken;
    case 'visionScorePerMin': return c?.visionScorePerMinute;
    case 'killParticipation': return c?.killParticipation;
    case 'soloKills': return c?.soloKills;
    case 'damagePerMin': return c?.damagePerMinute;
    case 'damageShare': return c?.teamDamagePercentage;
    case 'deaths': return p.deaths;
    default: return undefined;
  }
}

export function profileMetricMeans(
  participants: ParticipantDto[]
): Partial<Record<MetricName, number>> {
  const means: Partial<Record<MetricName, number>> = {};
  for (const metric of PROFILE_METRICS) {
    const samples = participants
      .map((p) => rawValue(p, metric))
      .filter((v): v is number => v !== undefined);
    if (samples.length > 0) {
      means[metric] = samples.reduce((a, b) => a + b, 0) / samples.length;
    }
  }
  return means;
}

/** "Goodness" percentile (higher = better) of the window mean for one metric. */
function goodness(
  metric: MetricName,
  mean: number,
  lookup: BenchmarkLookup
): number | undefined {
  const raw = lookup(metric, mean);
  if (raw === undefined) return undefined;
  return METRIC_META[metric].higherIsBetter ? raw : 100 - raw;
}

export function profileSkillScores(
  participants: ParticipantDto[],
  lookup: BenchmarkLookup
): Record<MetricCategory, number | null> {
  const means = profileMetricMeans(participants);
  const buckets: Record<MetricCategory, number[]> = {
    laning: [], vision: [], fighting: [], survivability: [],
  };
  for (const metric of PROFILE_METRICS) {
    const mean = means[metric];
    if (mean === undefined) continue;
    const g = goodness(metric, mean, lookup);
    if (g === undefined) continue;
    buckets[METRIC_META[metric].category].push(g);
  }
  const scores = {} as Record<MetricCategory, number | null>;
  for (const category of Object.keys(buckets) as MetricCategory[]) {
    const vals = buckets[category];
    scores[category] = vals.length
      ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
      : null;
  }
  return scores;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/analysis/coachInsights.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/analysis/coachInsights.ts tests/analysis/coachInsights.test.ts
git commit -m "feat: profile metric means and skill scores"
```

---

### Task 7: Coach insight chips (`deriveCoachInsights`)

**Files:**
- Modify: `lib/analysis/coachInsights.ts`
- Test: `tests/analysis/coachInsights.test.ts` (extend)

**Interfaces:**
- Produces:

```ts
export interface CoachInsight {
  kind: 'lever' | 'strength' | 'trend';
  message: string;
  good: boolean;
}
export function deriveCoachInsights(
  participants: ParticipantDto[], // newest-first
  lookup: BenchmarkLookup,
  cohortLabel: string             // e.g. "DIAMOND"
): CoachInsight[];                // 0–3, order: lever, strength, trend
```

Rules:
- Fewer than 5 participants → `[]`.
- Lever: metric with the LOWEST goodness percentile, only if < 45. Message: `` `${label} sits at the ~${ordinal(p)} percentile for ${cohortLabel} — your biggest lever` ``, `good: false`.
- Strength: metric with the HIGHEST goodness percentile, only if > 65. Message: `` `${label} sits at the ~${ordinal(p)} percentile for ${cohortLabel}` ``, `good: true`.
- Trend: only with ≥ 10 participants. Compare mean deaths of the 5 most recent vs the previous 5. Change % = `(older − recent) / older × 100` (older > 0 required). If |change| ≥ 15: down → `` `Deaths per game down ${x}% over your last 5 games` `` good, up → `` `Deaths per game up ${x}% over your last 5 games` `` bad. `x = Math.abs(Math.round(change))`.
- Metric labels: csAt10 "CS at 10", platesTaken "Plates taken", visionScorePerMin "Vision score/min", killParticipation "Kill participation", soloKills "Solo kills", damagePerMin "Damage/min", damageShare "Damage share", deaths "Deaths".
- `ordinal(n)`: 1→1st, 2→2nd, 3→3rd, 11/12/13→th, else by last digit.

- [ ] **Step 1: Write the failing tests**

Append to `tests/analysis/coachInsights.test.ts`:

```ts
import { deriveCoachInsights } from '../../lib/analysis/coachInsights';

describe('deriveCoachInsights', () => {
  const tenGames = (deaths: number[]) =>
    deaths.map((d) =>
      p({ deaths: d, challenges: { laneMinionsFirst10Minutes: 50, damagePerMinute: 700 } })
    );

  it('returns empty below 5 games', () => {
    const lookup: BenchmarkLookup = () => 50;
    expect(deriveCoachInsights(tenGames([1, 2, 3, 4]), lookup, 'DIAMOND')).toEqual([]);
  });

  it('emits lever for the worst metric and strength for the best', () => {
    // csAt10 raw pct 20 (goodness 20 → lever), damagePerMin raw 90 (goodness 90 → strength)
    const lookup: BenchmarkLookup = (metric) =>
      metric === 'csAt10' ? 20 : metric === 'damagePerMin' ? 90 : 50;
    const insights = deriveCoachInsights(tenGames([4, 4, 4, 4, 4]), lookup, 'DIAMOND');
    expect(insights[0]).toEqual({
      kind: 'lever',
      message: 'CS at 10 sits at the ~20th percentile for DIAMOND — your biggest lever',
      good: false,
    });
    expect(insights[1]).toEqual({
      kind: 'strength',
      message: 'Damage/min sits at the ~90th percentile for DIAMOND',
      good: true,
    });
  });

  it('emits a deaths trend across halves of a 10-game window', () => {
    const lookup: BenchmarkLookup = () => 50; // no lever/strength triggers
    // newest-first: recent 5 avg 2 deaths, older 5 avg 4 deaths → down 50%
    const insights = deriveCoachInsights(
      tenGames([2, 2, 2, 2, 2, 4, 4, 4, 4, 4]),
      lookup,
      'DIAMOND'
    );
    expect(insights).toEqual([
      { kind: 'trend', message: 'Deaths per game down 50% over your last 5 games', good: true },
    ]);
  });

  it('stays silent when nothing crosses thresholds', () => {
    const lookup: BenchmarkLookup = () => 50;
    expect(deriveCoachInsights(tenGames([3, 3, 3, 3, 3, 3, 3, 3, 3, 3]), lookup, 'DIAMOND')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/analysis/coachInsights.test.ts`
Expected: FAIL — `deriveCoachInsights` not exported.

- [ ] **Step 3: Implement**

Append to `lib/analysis/coachInsights.ts`:

```ts
const METRIC_LABELS: Record<(typeof PROFILE_METRICS)[number], string> = {
  csAt10: 'CS at 10',
  platesTaken: 'Plates taken',
  visionScorePerMin: 'Vision score/min',
  killParticipation: 'Kill participation',
  soloKills: 'Solo kills',
  damagePerMin: 'Damage/min',
  damageShare: 'Damage share',
  deaths: 'Deaths',
};

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

export interface CoachInsight {
  kind: 'lever' | 'strength' | 'trend';
  message: string;
  good: boolean;
}

const LEVER_BELOW = 45;
const STRENGTH_ABOVE = 65;
const TREND_MIN_CHANGE_PCT = 15;

/** `participants` newest-first. 0–3 chips; empty means "hide the strip". */
export function deriveCoachInsights(
  participants: ParticipantDto[],
  lookup: BenchmarkLookup,
  cohortLabel: string
): CoachInsight[] {
  if (participants.length < 5) return [];
  const means = profileMetricMeans(participants);

  const scored: { metric: MetricName; pct: number }[] = [];
  for (const metric of PROFILE_METRICS) {
    const mean = means[metric];
    if (mean === undefined) continue;
    const g = goodness(metric, mean, lookup);
    if (g !== undefined) scored.push({ metric, pct: Math.round(g) });
  }

  const insights: CoachInsight[] = [];
  if (scored.length > 0) {
    const worst = scored.reduce((a, b) => (b.pct < a.pct ? b : a));
    if (worst.pct < LEVER_BELOW) {
      insights.push({
        kind: 'lever',
        message: `${METRIC_LABELS[worst.metric as keyof typeof METRIC_LABELS]} sits at the ~${ordinal(worst.pct)} percentile for ${cohortLabel} — your biggest lever`,
        good: false,
      });
    }
    const best = scored.reduce((a, b) => (b.pct > a.pct ? b : a));
    if (best.pct > STRENGTH_ABOVE) {
      insights.push({
        kind: 'strength',
        message: `${METRIC_LABELS[best.metric as keyof typeof METRIC_LABELS]} sits at the ~${ordinal(best.pct)} percentile for ${cohortLabel}`,
        good: true,
      });
    }
  }

  if (participants.length >= 10) {
    const mean = (xs: ParticipantDto[]) => xs.reduce((s, x) => s + x.deaths, 0) / xs.length;
    const recent = mean(participants.slice(0, 5));
    const older = mean(participants.slice(5, 10));
    if (older > 0) {
      const changePct = ((older - recent) / older) * 100;
      if (Math.abs(changePct) >= TREND_MIN_CHANGE_PCT) {
        const x = Math.abs(Math.round(changePct));
        insights.push(
          changePct > 0
            ? { kind: 'trend', message: `Deaths per game down ${x}% over your last 5 games`, good: true }
            : { kind: 'trend', message: `Deaths per game up ${x}% over your last 5 games`, good: false }
        );
      }
    }
  }

  return insights.slice(0, 3);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/analysis/coachInsights.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/analysis/coachInsights.ts tests/analysis/coachInsights.test.ts
git commit -m "feat: coach insight chips from benchmark percentiles"
```

---

### Task 8: Rank history pure logic

**Files:**
- Create: `lib/rankHistory.ts`
- Test: `tests/rankHistory.test.ts`

**Interfaces:**
- Produces:

```ts
export interface RankPoint { tier: string; division: string; leaguePoints: number; recordedAt: Date }
export function rankValue(point: Pick<RankPoint, 'tier' | 'division' | 'leaguePoints'>): number;
// Monotonic composite: tierIndex*400 + divisionOffset(IV:0,III:100,II:200,I:300) + LP.
// Apex tiers (MASTER+) report division "I" → offset 300, LP dominates.
export function shouldRecordSnapshot(
  latest: RankPoint | null,
  next: Pick<RankPoint, 'tier' | 'division' | 'leaguePoints'>,
  now: Date
): boolean;
// True when: no latest; latest is a different UTC calendar day; or tier/division/LP changed.
export function dailyRankSeries(points: RankPoint[], days: number, now: Date): number[];
// Chronological rankValue per UTC day (last snapshot of each day) within the window; empty when no points.
```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/rankHistory.test.ts
import { describe, it, expect } from 'vitest';
import { rankValue, shouldRecordSnapshot, dailyRankSeries } from '../lib/rankHistory';

const d = (iso: string) => new Date(iso);

describe('rankValue', () => {
  it('orders tiers, divisions and LP monotonically', () => {
    const d4 = rankValue({ tier: 'DIAMOND', division: 'IV', leaguePoints: 0 });
    const d3 = rankValue({ tier: 'DIAMOND', division: 'III', leaguePoints: 0 });
    const e1 = rankValue({ tier: 'EMERALD', division: 'I', leaguePoints: 99 });
    expect(d3).toBeGreaterThan(d4);
    expect(d4).toBeGreaterThan(e1);
    expect(rankValue({ tier: 'DIAMOND', division: 'III', leaguePoints: 59 })).toBe(d3 + 59);
  });
});

describe('shouldRecordSnapshot', () => {
  const latest = { tier: 'DIAMOND', division: 'III', leaguePoints: 59, recordedAt: d('2026-07-10T08:00:00Z') };
  it('records when there is no prior snapshot', () => {
    expect(shouldRecordSnapshot(null, latest, d('2026-07-10T09:00:00Z'))).toBe(true);
  });
  it('skips same-day identical values', () => {
    expect(shouldRecordSnapshot(latest, latest, d('2026-07-10T22:00:00Z'))).toBe(false);
  });
  it('records same-day LP changes and new days', () => {
    expect(shouldRecordSnapshot(latest, { ...latest, leaguePoints: 75 }, d('2026-07-10T22:00:00Z'))).toBe(true);
    expect(shouldRecordSnapshot(latest, latest, d('2026-07-11T00:30:00Z'))).toBe(true);
  });
});

describe('dailyRankSeries', () => {
  it('keeps the last snapshot per UTC day, chronological', () => {
    const points = [
      { tier: 'DIAMOND', division: 'IV', leaguePoints: 80, recordedAt: d('2026-07-08T10:00:00Z') },
      { tier: 'DIAMOND', division: 'IV', leaguePoints: 95, recordedAt: d('2026-07-08T20:00:00Z') },
      { tier: 'DIAMOND', division: 'III', leaguePoints: 10, recordedAt: d('2026-07-09T18:00:00Z') },
    ];
    const series = dailyRankSeries(points, 30, d('2026-07-10T12:00:00Z'));
    expect(series).toEqual([
      rankValue({ tier: 'DIAMOND', division: 'IV', leaguePoints: 95 }),
      rankValue({ tier: 'DIAMOND', division: 'III', leaguePoints: 10 }),
    ]);
  });
  it('drops points outside the window and handles empty input', () => {
    const old = [{ tier: 'GOLD', division: 'I', leaguePoints: 1, recordedAt: d('2026-05-01T00:00:00Z') }];
    expect(dailyRankSeries(old, 30, d('2026-07-10T00:00:00Z'))).toEqual([]);
    expect(dailyRankSeries([], 30, d('2026-07-10T00:00:00Z'))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/rankHistory.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/rankHistory.ts
/*
 * Pure rank-snapshot logic. DB wrappers live in lib/rankSnapshotsDb.ts; tests
 * exercise this module only (repo convention: decision logic is injected-pure).
 */

export interface RankPoint {
  tier: string;
  division: string;
  leaguePoints: number;
  recordedAt: Date;
}

const TIER_ORDER = [
  'IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND',
  'MASTER', 'GRANDMASTER', 'CHALLENGER',
];
const DIVISION_OFFSET: Record<string, number> = { IV: 0, III: 100, II: 200, I: 300 };

export function rankValue(point: Pick<RankPoint, 'tier' | 'division' | 'leaguePoints'>): number {
  const tierIndex = Math.max(0, TIER_ORDER.indexOf(point.tier.toUpperCase()));
  const division = DIVISION_OFFSET[point.division.toUpperCase()] ?? 300;
  return tierIndex * 400 + division + point.leaguePoints;
}

const utcDay = (date: Date): string => date.toISOString().slice(0, 10);

export function shouldRecordSnapshot(
  latest: RankPoint | null,
  next: Pick<RankPoint, 'tier' | 'division' | 'leaguePoints'>,
  now: Date
): boolean {
  if (!latest) return true;
  if (utcDay(latest.recordedAt) !== utcDay(now)) return true;
  return (
    latest.tier !== next.tier ||
    latest.division !== next.division ||
    latest.leaguePoints !== next.leaguePoints
  );
}

export function dailyRankSeries(points: RankPoint[], days: number, now: Date): number[] {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  const lastPerDay = new Map<string, RankPoint>();
  for (const point of [...points].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())) {
    if (point.recordedAt.getTime() < cutoff) continue;
    lastPerDay.set(utcDay(point.recordedAt), point);
  }
  return [...lastPerDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, point]) => rankValue(point));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/rankHistory.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/rankHistory.ts tests/rankHistory.test.ts
git commit -m "feat: rank history pure logic (value, dedupe, daily series)"
```

---

### Task 9: RankSnapshot model, DB wrappers, analyzed-ids query

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `lib/rankSnapshotsDb.ts`
- Modify: `lib/analysis/analysisStore.ts`
- Migration: `npx prisma migrate dev --name add_rank_snapshots`

**Interfaces:**
- Consumes: `shouldRecordSnapshot`, `dailyRankSeries` from `lib/rankHistory`; `LeagueEntryDto`.
- Produces:

```ts
// lib/rankSnapshotsDb.ts
export async function recordRankSnapshots(puuid: string, entries: LeagueEntryDto[]): Promise<void>;
// For RANKED_SOLO_5x5 + RANKED_FLEX_SR entries: reads latest snapshot per queue,
// consults shouldRecordSnapshot, inserts when true. Catches and logs internally (fire-and-forget safe).
export async function getSoloRankSeries(puuid: string, days?: number): Promise<number[]>; // default 30
// Throws on DB failure — caller (page) try/catches.

// lib/analysis/analysisStore.ts
export async function findAnalyzedMatchIds(
  puuid: string,
  matchIds: string[],
  promptVersion: string
): Promise<Set<string>>;
```

No unit tests: thin DB wrappers, untested by repo convention (`benchmarkDb.ts` header).

- [ ] **Step 1: Add the Prisma model**

Append to `prisma/schema.prisma`:

```prisma
model RankSnapshot {
  id           String   @id @default(cuid())
  puuid        String
  queueType    String
  tier         String
  division     String
  leaguePoints Int
  recordedAt   DateTime @default(now())

  @@index([puuid, queueType, recordedAt])
  @@map("rank_snapshots")
}
```

- [ ] **Step 2: Run the migration**

Run: `npx prisma migrate dev --name add_rank_snapshots`
Expected: new folder under `prisma/migrations/`, client regenerated. (If the project turns out to use `prisma db push` instead — check `ls prisma/migrations` — use that and note it in the commit message.)

- [ ] **Step 3: Implement the wrappers**

```ts
// lib/rankSnapshotsDb.ts
import { prisma } from '@/lib/db';
import type { LeagueEntryDto } from '@/lib/riot/types';
import { dailyRankSeries, shouldRecordSnapshot } from '@/lib/rankHistory';

/*
 * Thin Prisma wrappers around lib/rankHistory.ts decisions (repo convention:
 * DB wrappers stay untested; logic lives in the pure module).
 */

const TRACKED_QUEUES = new Set(['RANKED_SOLO_5x5', 'RANKED_FLEX_SR']);

/** Fire-and-forget from the profile view's after() block: never throws. */
export async function recordRankSnapshots(puuid: string, entries: LeagueEntryDto[]): Promise<void> {
  try {
    const now = new Date();
    for (const entry of entries) {
      if (!TRACKED_QUEUES.has(entry.queueType)) continue;
      const latest = await prisma.rankSnapshot.findFirst({
        where: { puuid, queueType: entry.queueType },
        orderBy: { recordedAt: 'desc' },
      });
      const next = { tier: entry.tier, division: entry.rank, leaguePoints: entry.leaguePoints };
      const latestPoint = latest
        ? { tier: latest.tier, division: latest.division, leaguePoints: latest.leaguePoints, recordedAt: latest.recordedAt }
        : null;
      if (shouldRecordSnapshot(latestPoint, next, now)) {
        await prisma.rankSnapshot.create({
          data: { puuid, queueType: entry.queueType, ...next },
        });
      }
    }
  } catch (error) {
    console.error('rank snapshot recording failed (non-fatal) —', error);
  }
}

export async function getSoloRankSeries(puuid: string, days = 30): Promise<number[]> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await prisma.rankSnapshot.findMany({
    where: { puuid, queueType: 'RANKED_SOLO_5x5', recordedAt: { gte: cutoff } },
    orderBy: { recordedAt: 'asc' },
  });
  return dailyRankSeries(
    rows.map((r) => ({ tier: r.tier, division: r.division, leaguePoints: r.leaguePoints, recordedAt: r.recordedAt })),
    days,
    new Date()
  );
}
```

Append to `lib/analysis/analysisStore.ts`:

```ts
/** Which of `matchIds` already have a stored single-match analysis for this player. */
export async function findAnalyzedMatchIds(
  puuid: string,
  matchIds: string[],
  promptVersion: string
): Promise<Set<string>> {
  if (matchIds.length === 0) return new Set();
  const rows = await prisma.analysis.findMany({
    where: { puuid, matchId: { in: matchIds }, type: 'single', promptVersion },
    select: { matchId: true },
  });
  return new Set(rows.map((r) => r.matchId));
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add prisma lib/rankSnapshotsDb.ts lib/analysis/analysisStore.ts
git commit -m "feat: rank snapshot storage and analyzed-match lookup"
```

---

### Task 10: Panel shell, hero, coach strip

**Files:**
- Create: `components/profile/Panel.tsx`
- Create: `components/profile/ProfileHero.tsx`
- Create: `components/profile/RefreshButton.tsx`
- Create: `components/profile/CoachStrip.tsx`
- Test: `tests/components/CoachStrip.test.tsx`

**Interfaces:**
- Consumes: `CoachInsight` from `lib/analysis/coachInsights`; `profileIconUrl` from `lib/dataDragon`; `IconImg` from `components/IconImg`; `cn` from `lib/utils`.
- Produces:

```ts
export function Panel({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }): JSX.Element;
export function ProfileHero(props: {
  gameName: string; tagLine: string; level: number; profileIconId: number;
  version: string; regionLabel: string; ladderChip: string | null;
}): JSX.Element;
export function RefreshButton(): JSX.Element; // client; router.refresh()
export function CoachStrip({ insights }: { insights: CoachInsight[] }): JSX.Element | null; // null when empty
```

- [ ] **Step 1: Write the failing CoachStrip test**

Check how existing component tests render (look at any file in `tests/components/` and mirror its setup — testing-library import style, etc.). Then:

```tsx
// tests/components/CoachStrip.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CoachStrip } from '../../components/profile/CoachStrip';

describe('CoachStrip', () => {
  it('renders nothing when there are no insights', () => {
    const { container } = render(<CoachStrip insights={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one chip per insight with the AI Coach badge', () => {
    render(
      <CoachStrip
        insights={[
          { kind: 'lever', message: 'CS at 10 sits at the ~20th percentile for DIAMOND — your biggest lever', good: false },
          { kind: 'strength', message: 'Damage/min sits at the ~90th percentile for DIAMOND', good: true },
        ]}
      />
    );
    expect(screen.getByText('AI Coach')).toBeInTheDocument();
    expect(screen.getByText(/biggest lever/)).toBeInTheDocument();
    expect(screen.getByText(/~90th percentile/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/CoachStrip.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the four components**

```tsx
// components/profile/Panel.tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Summit stat panel: dark gradient surface with a gold top-rail accent. */
export function Panel({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'relative rounded-xl border border-panel-border bg-gradient-to-b from-panel to-panel-2 p-5',
        className
      )}
    >
      <span
        aria-hidden
        className="absolute left-3.5 top-0 h-0.5 w-2/5 rounded bg-gradient-to-r from-gold to-transparent"
      />
      <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      {children}
    </section>
  );
}
```

```tsx
// components/profile/RefreshButton.tsx
'use client';

import { useRouter } from 'next/navigation';

export function RefreshButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.refresh()}
      className="rounded-lg bg-gradient-to-b from-gold-light to-gold px-4 py-2 text-xs font-extrabold text-black shadow-[0_3px_12px_rgba(201,168,106,0.35)]"
    >
      ⟳ Update
    </button>
  );
}
```

```tsx
// components/profile/ProfileHero.tsx
import { profileIconUrl } from '@/lib/dataDragon';
import { IconImg } from '@/components/IconImg';
import { RefreshButton } from './RefreshButton';

export function ProfileHero({
  gameName,
  tagLine,
  level,
  profileIconId,
  version,
  regionLabel,
  ladderChip,
}: {
  gameName: string;
  tagLine: string;
  level: number;
  profileIconId: number;
  version: string;
  regionLabel: string;
  ladderChip: string | null;
}) {
  return (
    <header className="flex items-center gap-5 border-b border-gold/25 px-1 pb-6">
      <div className="relative flex-none">
        <IconImg
          src={profileIconUrl(version, profileIconId)}
          alt=""
          className="h-20 w-20 rounded-xl ring-1 ring-gold/70"
        />
        <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-gold/60 bg-panel-2 px-2.5 py-0.5 text-[10px] font-extrabold text-gold-light">
          LVL {level}
        </span>
      </div>
      <div className="min-w-0">
        <h1 className="text-3xl font-extrabold text-foreground">
          {gameName} <span className="text-lg font-semibold text-muted-foreground">#{tagLine}</span>
        </h1>
        <div className="mt-1.5 flex items-center gap-3 text-xs font-semibold text-muted-foreground">
          {ladderChip ? (
            <span className="rounded-full border border-gold/35 bg-gold/10 px-2.5 py-0.5 font-bold text-gold-light">
              {ladderChip} · {regionLabel}
            </span>
          ) : (
            <span>{regionLabel}</span>
          )}
        </div>
      </div>
      <div className="ml-auto self-start">
        <RefreshButton />
      </div>
    </header>
  );
}
```

```tsx
// components/profile/CoachStrip.tsx
import type { CoachInsight } from '@/lib/analysis/coachInsights';

/** Indigo = AI-only accent (palette rule). Renders nothing without insights. */
export function CoachStrip({ insights }: { insights: CoachInsight[] }) {
  if (insights.length === 0) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-coach/25 bg-gradient-to-r from-coach/10 to-transparent px-4 py-3">
      <span className="flex-none rounded-md bg-gradient-to-r from-coach-light to-coach px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-widest text-background">
        AI Coach
      </span>
      <ul className="flex min-w-0 gap-2 overflow-x-auto">
        {insights.map((insight) => (
          <li
            key={insight.message}
            className={`whitespace-nowrap rounded-full border border-panel-border bg-panel-2 px-3 py-1.5 text-xs font-semibold ${
              insight.good ? 'text-win' : 'text-foreground/80'
            }`}
          >
            {insight.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/CoachStrip.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/profile tests/components/CoachStrip.test.tsx
git commit -m "feat: profile panel shell, hero and coach strip"
```

---

### Task 11: Stat panels + champion pool components

**Files:**
- Create: `components/profile/RankPanel.tsx`
- Create: `components/profile/PerformancePanel.tsx`
- Create: `components/profile/SkillProfilePanel.tsx`
- Create: `components/profile/ChampionPool.tsx`

**Interfaces:**
- Consumes: `LeagueEntryDto`; `RecentPerformance`, `ChampionPoolEntry`, `bestChampionIndex` from `lib/matchStats`; `radarData`, `SkillRadar` from `components/analysis/SkillRadar`; `MetricCategory` from `lib/analysis/metrics`; `rankEmblemUrl`, `championIconUrl` from `lib/dataDragon`.
- Produces:

```ts
export function RankPanel({ solo, flex, sparkSeries }: { solo: LeagueEntryDto | null; flex: LeagueEntryDto | null; sparkSeries: number[] }): JSX.Element;
export function PerformancePanel({ perf }: { perf: RecentPerformance }): JSX.Element;
export function SkillProfilePanel({ scores }: { scores: Record<MetricCategory, number | null> | null }): JSX.Element | null; // null unless radarData(scores) works
export function ChampionPool({ pool, version }: { pool: ChampionPoolEntry[]; version: string }): JSX.Element | null; // null when pool empty
```

No component tests: display-only markup over already-tested logic (the null-branches are trivial guards).

- [ ] **Step 1: Implement RankPanel (with inline SVG sparkline)**

```tsx
// components/profile/RankPanel.tsx
import type { LeagueEntryDto } from '@/lib/riot/types';
import { rankEmblemUrl } from '@/lib/dataDragon';
import { IconImg } from '@/components/IconImg';
import { Panel } from './Panel';

const APEX = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER']);

function titleCase(tier: string): string {
  return tier.charAt(0) + tier.slice(1).toLowerCase();
}

function Sparkline({ series }: { series: number[] }) {
  if (series.length < 2) {
    return (
      <p className="mt-3 text-[10px] font-semibold text-muted-foreground">
        LP trend — collecting data, check back in a few days
      </p>
    );
  }
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = Math.max(max - min, 1);
  const barWidth = 100 / series.length;
  return (
    <svg viewBox="0 0 100 24" className="mt-3 h-8 w-full" aria-label="LP trend, last 30 days">
      {series.map((value, i) => {
        const height = 4 + ((value - min) / span) * 20;
        const isLast = i === series.length - 1;
        return (
          <rect
            key={i}
            x={i * barWidth + 0.5}
            y={24 - height}
            width={barWidth - 1}
            height={height}
            rx={0.8}
            className={isLast ? 'fill-gold' : 'fill-coach/70'}
          />
        );
      })}
    </svg>
  );
}

function entryLine(entry: LeagueEntryDto): string {
  const games = entry.wins + entry.losses;
  const winRate = games === 0 ? 0 : Math.round((entry.wins / games) * 100);
  return `${entry.wins}W ${entry.losses}L · ${winRate}%`;
}

export function RankPanel({
  solo,
  flex,
  sparkSeries,
}: {
  solo: LeagueEntryDto | null;
  flex: LeagueEntryDto | null;
  sparkSeries: number[];
}) {
  return (
    <Panel label="Ranked Solo">
      {solo ? (
        <>
          <div className="mt-3 flex items-center gap-4">
            <IconImg src={rankEmblemUrl(solo.tier)} alt={`${solo.tier} emblem`} className="h-14 w-14" />
            <div>
              <p className="text-xl font-extrabold text-foreground">
                {titleCase(solo.tier)} {APEX.has(solo.tier) ? '' : solo.rank}
              </p>
              <p className="text-xs font-bold text-muted-foreground">{solo.leaguePoints} LP</p>
            </div>
          </div>
          <p className="mt-3 flex justify-between text-xs font-bold text-muted-foreground">
            <span>{entryLine(solo)}</span>
          </p>
          <Sparkline series={sparkSeries} />
        </>
      ) : (
        <p className="mt-2 text-xl font-extrabold text-foreground">Unranked</p>
      )}
      <div className="mt-4 flex items-center justify-between border-t border-dashed border-panel-border pt-3 text-xs font-bold">
        <span className="text-muted-foreground">Ranked Flex</span>
        <span className="text-foreground">
          {flex ? `${titleCase(flex.tier)} ${APEX.has(flex.tier) ? '' : flex.rank} · ${flex.leaguePoints} LP · ${entryLine(flex)}` : 'Unranked'}
        </span>
      </div>
    </Panel>
  );
}
```

- [ ] **Step 2: Implement PerformancePanel**

```tsx
// components/profile/PerformancePanel.tsx
import type { RecentPerformance } from '@/lib/matchStats';
import { Panel } from './Panel';

export function PerformancePanel({ perf }: { perf: RecentPerformance }) {
  const donutStyle = {
    background: `conic-gradient(var(--color-win) 0 ${perf.winRatePct}%, var(--color-panel-border) ${perf.winRatePct}% 100%)`,
  };
  return (
    <Panel label={`Last ${perf.games} Games`}>
      <div className="mt-3 flex items-center gap-5">
        <div className="flex h-20 w-20 flex-none items-center justify-center rounded-full" style={donutStyle}>
          <div className="flex h-14 w-14 flex-col items-center justify-center rounded-full bg-panel-2">
            <span className="text-base font-extrabold text-win">{perf.winRatePct}%</span>
            <span className="text-[9px] font-bold text-muted-foreground">
              {perf.wins}W {perf.losses}L
            </span>
          </div>
        </div>
        <div>
          <p className="text-lg font-extrabold text-foreground">
            {perf.kdaRatio === null ? '—' : `${perf.kdaRatio} KDA`}
          </p>
          <p className="text-xs font-bold text-muted-foreground">
            {perf.avgKills} / {perf.avgDeaths} / {perf.avgAssists}
            {perf.avgKillParticipationPct !== null && ` · P/Kill ${perf.avgKillParticipationPct}%`}
          </p>
          {perf.streak && perf.streak.count >= 2 && (
            <p className={`mt-1.5 text-xs font-extrabold ${perf.streak.result === 'win' ? 'text-win' : 'text-loss'}`}>
              {perf.streak.result === 'win' ? '▲' : '▼'} {perf.streak.count} {perf.streak.result} streak
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}
```

- [ ] **Step 3: Implement SkillProfilePanel + ChampionPool**

```tsx
// components/profile/SkillProfilePanel.tsx
import type { MetricCategory } from '@/lib/analysis/metrics';
import { radarData, SkillRadar } from '@/components/analysis/SkillRadar';
import { Panel } from './Panel';

/** Hidden entirely (no layout hole) unless every radar axis has a score. */
export function SkillProfilePanel({
  scores,
}: {
  scores: Record<MetricCategory, number | null> | null;
}) {
  if (!scores || radarData(scores) === null) return null;
  return (
    <Panel label="Skill Profile">
      <div className="mt-1">
        <SkillRadar scores={scores} />
      </div>
    </Panel>
  );
}
```

```tsx
// components/profile/ChampionPool.tsx
import { bestChampionIndex, type ChampionPoolEntry } from '@/lib/matchStats';
import { championIconUrl } from '@/lib/dataDragon';
import { IconImg } from '@/components/IconImg';

export function ChampionPool({ pool, version }: { pool: ChampionPoolEntry[]; version: string }) {
  if (pool.length === 0) return null;
  const bestIdx = bestChampionIndex(pool);
  return (
    <section aria-label="Champion pool">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
        Champion Pool · Recent
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {pool.map((champ, i) => {
          const isBest = i === bestIdx && champ.games >= 3;
          return (
            <li
              key={champ.championName}
              className={`flex items-center gap-3 rounded-xl border p-3 ${
                isBest
                  ? 'border-gold/50 bg-gradient-to-b from-gold/10 to-panel-2'
                  : 'border-panel-border bg-gradient-to-b from-panel to-panel-2'
              }`}
            >
              <IconImg
                src={championIconUrl(version, champ.championName)}
                alt={champ.championName}
                className={`h-9 w-9 flex-none rounded-lg border ${isBest ? 'border-gold/60' : 'border-panel-border'}`}
              />
              <div className="min-w-0">
                <p className="truncate text-xs font-extrabold text-foreground">
                  {champ.championName}
                  {isBest && <span className="ml-1.5 text-[9px] font-extrabold tracking-widest text-gold-light">★ BEST</span>}
                </p>
                <p className="text-[10px] font-bold text-muted-foreground">
                  {champ.games}g{champ.kda !== null && ` · ${champ.kda} KDA`}
                  {champ.csPerMin !== null && ` · ${champ.csPerMin} CS/m`}
                </p>
              </div>
              <span
                className={`ml-auto text-sm font-extrabold ${
                  champ.winRatePct >= 60 ? 'text-win' : champ.winRatePct < 45 ? 'text-loss' : 'text-muted-foreground'
                }`}
              >
                {champ.winRatePct}%
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add components/profile
git commit -m "feat: rank, performance, skill and champion pool panels"
```

---

### Task 12: Match history — filters, restyled rows, analyzed state

**Files:**
- Modify: `components/MatchHistory.tsx` (becomes a client component with filter pills)
- Modify: `components/MatchSummaryRow.tsx` (Summit styling, role badge, CS, badge chip, analyzed CTA, relative time)
- Modify: `lib/matchStats.ts` (`filterByQueue`)
- Test: `tests/matchStats.test.ts` (extend with `filterByQueue`)

**Interfaces:**
- Consumes: `MatchSummary` (now has `role`, `cs`, `badge`, `queueId`, `gameCreation`).
- Produces:

```ts
// lib/matchStats.ts
export type QueueFilter = 'all' | 'solo' | 'flex' | 'aram';
export function filterByQueue(matches: MatchSummary[], filter: QueueFilter): MatchSummary[];
// solo=420, flex=440, aram=450

// components/MatchHistory.tsx
export function MatchHistory(props: {
  matches: MatchSummary[]; version: string; basePath: string; analyzedIds: string[];
}): JSX.Element;

// components/MatchSummaryRow.tsx
export function MatchSummaryRow(props: {
  summary: MatchSummary; version: string; basePath: string; analyzed: boolean;
}): JSX.Element;
```

- [ ] **Step 1: Write the failing filter test**

Append to `tests/matchStats.test.ts`:

```ts
import { filterByQueue } from '../lib/matchStats';

describe('filterByQueue', () => {
  const mk = (id: string, queueId: number) =>
    ({ ...toMatchSummary(match(id, p({})), 'me'), queueId });
  const all = [mk('a', 420), mk('b', 440), mk('c', 450), mk('d', 490)];

  it('filters by queue id and passes everything for "all"', () => {
    expect(filterByQueue(all, 'all')).toHaveLength(4);
    expect(filterByQueue(all, 'solo').map((m) => m.matchId)).toEqual(['a']);
    expect(filterByQueue(all, 'flex').map((m) => m.matchId)).toEqual(['b']);
    expect(filterByQueue(all, 'aram').map((m) => m.matchId)).toEqual(['c']);
  });
});
```

Run: `npx vitest run tests/matchStats.test.ts` — expected FAIL.

Also create the empty-state component test (fails until Step 3 rewrites MatchHistory):

```tsx
// tests/components/MatchHistoryFilter.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MatchHistory } from '../../components/MatchHistory';
import type { MatchSummary } from '../../lib/matchStats';

function summary(matchId: string, queueId: number): MatchSummary {
  return {
    matchId, championName: 'Aatrox', kills: 1, deaths: 1, assists: 1, win: true,
    items: [], summoner1Id: 4, summoner2Id: 14, durationSeconds: 1800,
    queueId, gameCreation: Date.now(), role: null, cs: null, badge: null,
  };
}

describe('MatchHistory queue filters', () => {
  it('shows the empty-state line when a filter matches nothing', () => {
    render(
      <MatchHistory
        matches={[summary('a', 420)]}
        version="14.13.1"
        basePath="/euw1/x-y"
        analyzedIds={[]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'ARAM' }));
    expect(screen.getByText(/No matches in this queue/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement `filterByQueue`**

Append to `lib/matchStats.ts`:

```ts
export type QueueFilter = 'all' | 'solo' | 'flex' | 'aram';

const QUEUE_IDS: Record<Exclude<QueueFilter, 'all'>, number> = { solo: 420, flex: 440, aram: 450 };

export function filterByQueue(matches: MatchSummary[], filter: QueueFilter): MatchSummary[] {
  if (filter === 'all') return matches;
  return matches.filter((m) => m.queueId === QUEUE_IDS[filter]);
}
```

Run: `npx vitest run tests/matchStats.test.ts` — expected PASS.

- [ ] **Step 3: Rewrite MatchHistory with filter pills**

```tsx
// components/MatchHistory.tsx
'use client';

import { useState } from 'react';
import { filterByQueue, type MatchSummary, type QueueFilter } from '@/lib/matchStats';
import { MatchSummaryRow } from './MatchSummaryRow';

const FILTERS: { key: QueueFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'solo', label: 'Solo/Duo' },
  { key: 'flex', label: 'Flex' },
  { key: 'aram', label: 'ARAM' },
];

export interface MatchHistoryProps {
  matches: MatchSummary[];
  version: string;
  /** Profile base path (e.g. `/euw1/Faker-KR1`) used to build per-match analysis links. */
  basePath: string;
  /** Match ids that already have a stored AI analysis. */
  analyzedIds: string[];
}

export function MatchHistory({ matches, version, basePath, analyzedIds }: MatchHistoryProps) {
  const [filter, setFilter] = useState<QueueFilter>('all');
  const analyzed = new Set(analyzedIds);
  const visible = filterByQueue(matches, filter);

  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-sm font-extrabold uppercase tracking-[0.18em] text-foreground">Matches</h2>
        <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-gold to-transparent" />
        <div className="flex gap-1.5">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-full border px-3 py-1 text-[11px] font-bold ${
                filter === key
                  ? 'border-gold bg-gold text-black'
                  : 'border-panel-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {matches.length === 0 && <p className="text-foreground/80">No recent matches found.</p>}
      {matches.length > 0 && visible.length === 0 && (
        <p className="text-sm text-muted-foreground">No matches in this queue among the last {matches.length}.</p>
      )}
      <ul className="flex flex-col gap-2.5">
        {visible.map((m) => (
          <MatchSummaryRow
            key={m.matchId}
            summary={m}
            version={version}
            basePath={basePath}
            analyzed={analyzed.has(m.matchId)}
          />
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Restyle MatchSummaryRow**

Replace the component (keep the existing expand/fetch logic — `handleToggle`, `detail`, `loading`, `error` state and the `MatchScoreboard` block — identical; the markup around it changes):

```tsx
// components/MatchSummaryRow.tsx  (full file)
'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { MatchSummary } from '@/lib/matchStats';
import type { MatchDto } from '@/lib/riot/types';
import { championIconUrl, itemIconUrl } from '@/lib/dataDragon';
import { MatchScoreboard } from './MatchScoreboard';

export interface MatchSummaryRowProps {
  summary: MatchSummary;
  version: string;
  /** Profile base path (e.g. `/euw1/Faker-KR1`) used to build the analysis link. */
  basePath: string;
  /** Whether a stored AI analysis already exists for this match. */
  analyzed: boolean;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function relativeTime(epochMs: number): string {
  const hours = Math.floor((Date.now() - epochMs) / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const ROLE_LABEL: Record<string, string> = {
  TOP: 'TOP', JUNGLE: 'JG', MIDDLE: 'MID', BOTTOM: 'BOT', UTILITY: 'SUP',
};

export function MatchSummaryRow({ summary, version, basePath, analyzed }: MatchSummaryRowProps) {
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
      setDetail((await response.json()) as MatchDto);
    } catch {
      setError('Could not load full match detail. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <li>
      <div className="flex items-stretch gap-2">
        <button
          onClick={handleToggle}
          className={`relative flex flex-1 items-center gap-3.5 overflow-hidden rounded-xl border bg-gradient-to-b from-panel to-panel-2 p-3 text-left before:absolute before:inset-y-0 before:left-0 before:w-[3px] ${
            summary.win ? 'border-win/25 before:bg-win' : 'border-loss/25 before:bg-loss'
          }`}
        >
          <span className="relative flex-none">
            <img
              src={championIconUrl(version, summary.championName)}
              alt={summary.championName}
              className="h-11 w-11 rounded-lg border border-panel-border"
              onError={(event) => {
                event.currentTarget.style.display = 'none';
              }}
            />
            {summary.role && (
              <span className="absolute -bottom-1.5 -right-1.5 rounded border border-panel-border bg-panel-2 px-1 text-[8px] font-extrabold text-coach-light">
                {ROLE_LABEL[summary.role] ?? summary.role}
              </span>
            )}
          </span>
          <span className="w-24 flex-none">
            <span className={`block text-[11px] font-extrabold uppercase tracking-widest ${summary.win ? 'text-win' : 'text-loss'}`}>
              {summary.win ? 'Victory' : 'Defeat'}
            </span>
            <span className="block text-[10px] font-bold text-muted-foreground" suppressHydrationWarning>
              {formatDuration(summary.durationSeconds)} · {relativeTime(summary.gameCreation)}
            </span>
          </span>
          <span className="w-24 flex-none">
            <span className="block text-sm font-extrabold text-foreground">
              {summary.kills} / <span className="text-loss">{summary.deaths}</span> / {summary.assists}
            </span>
            {summary.cs !== null && (
              <span className="block text-[10px] font-bold text-muted-foreground">
                {summary.cs} CS · {(summary.cs / (summary.durationSeconds / 60)).toFixed(1)}/m
              </span>
            )}
          </span>
          {summary.badge && (
            <span className="flex-none rounded bg-gradient-to-r from-gold-light to-gold px-2 py-0.5 text-[10px] font-extrabold text-black">
              {summary.badge}
            </span>
          )}
          <span className="ml-auto flex gap-1">
            {summary.items.map((itemId, index) => {
              const url = itemIconUrl(version, itemId);
              if (!url) return null;
              return (
                <img
                  key={index}
                  src={url}
                  alt=""
                  className="h-6 w-6 rounded border border-panel-border"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              );
            })}
          </span>
        </button>
        <Link
          href={`${basePath}/match/${summary.matchId}/analysis`}
          className={`flex items-center rounded-xl border px-3.5 text-xs font-extrabold ${
            analyzed
              ? 'border-win/40 bg-win/5 text-win'
              : 'border-gold/45 bg-gold/5 text-gold-light hover:border-gold/70'
          }`}
        >
          {analyzed ? '✓ Analyzed' : '✦ Analyze'}
        </Link>
      </div>
      {expanded && (
        <div className="mt-2">
          {loading && <p className="text-sm text-muted-foreground">Loading full match...</p>}
          {error && (
            <p role="alert" className="text-sm text-loss">
              {error}
            </p>
          )}
          {detail && <MatchScoreboard match={detail} version={version} />}
        </div>
      )}
    </li>
  );
}
```

Note: summoner-spell icons are intentionally dropped from the row (the Summit row replaces them with the role badge; the expanded scoreboard still shows full detail). Check `tests/components/` for an existing MatchSummaryRow/MatchHistory test and update its props (`analyzed={false}` / `analyzedIds={[]}`) if present.

- [ ] **Step 5: Typecheck + full test run**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean, all green (fix any existing component tests that use the old prop shapes).

- [ ] **Step 6: Commit**

```bash
git add lib/matchStats.ts components/MatchHistory.tsx components/MatchSummaryRow.tsx tests
git commit -m "feat: summit match history with queue filters and analyzed state"
```

---

### Task 13: Page assembly + old card removal

**Files:**
- Modify: `app/[region]/[riotId]/page.tsx` (full rewrite of data assembly + render)
- Delete: `components/RankCard.tsx`, `components/RecentFormCard.tsx`, `components/TopChampionsCard.tsx`
- Modify: `lib/matchStats.ts` (delete now-unused `computeTopChampions` + `ChampionStat`)

**Interfaces:**
- Consumes: everything produced in Tasks 1–12; `PROMPT_VERSION` from `lib/analysis/analyzeMatch` (the analysis page imports it the same way).

- [ ] **Step 1: Rewrite the page**

```tsx
// app/[region]/[riotId]/page.tsx
import { after } from 'next/server';
import { notFound } from 'next/navigation';
import { isPlatformRegion, type PlatformRegion } from '@/lib/riot/regions';
import { getAccountByRiotId } from '@/lib/riot/account';
import { getSummonerByPuuid } from '@/lib/riot/summoner';
import { getLeagueEntriesByPuuid } from '@/lib/riot/league';
import { getMatchIdsByPuuid, getMatchById } from '@/lib/riot/match';
import { parseRiotIdSegment } from '@/lib/riotId';
import {
  computeChampionPool,
  computeRecentPerformance,
  toMatchSummary,
} from '@/lib/matchStats';
import { RiotApiError } from '@/lib/riot/client';
import { getLatestDDragonVersion, patchFromVersion } from '@/lib/dataDragon';
import { observationsFromMatch, mergeObservations } from '@/lib/riotIdIndex';
import { upsertRiotIdRows } from '@/lib/riotIdIndexStore';
import { cohortTier, isBenchmarkableTier } from '@/lib/analysis/cohort';
import { loadBenchmarkLookup } from '@/lib/analysis/benchmarkStore';
import { prismaBenchmarkReader } from '@/lib/analysis/benchmarkDb';
import {
  deriveCoachInsights,
  profileSkillScores,
  type CoachInsight,
} from '@/lib/analysis/coachInsights';
import { formatLadderChip } from '@/lib/analysis/ladderPercentile';
import { findAnalyzedMatchIds } from '@/lib/analysis/analysisStore';
import { PROMPT_VERSION } from '@/lib/analysis/analyzeMatch';
import { recordRankSnapshots, getSoloRankSeries } from '@/lib/rankSnapshotsDb';
import type { MetricCategory } from '@/lib/analysis/metrics';
import { ProfileHero } from '@/components/profile/ProfileHero';
import { CoachStrip } from '@/components/profile/CoachStrip';
import { RankPanel } from '@/components/profile/RankPanel';
import { PerformancePanel } from '@/components/profile/PerformancePanel';
import { SkillProfilePanel } from '@/components/profile/SkillProfilePanel';
import { ChampionPool } from '@/components/profile/ChampionPool';
import { MatchHistory } from '@/components/MatchHistory';

const REGION_LABELS: Partial<Record<PlatformRegion, string>> = {
  euw1: 'Europe West', eun1: 'Europe Nordic & East', na1: 'North America', kr: 'Korea',
};

export default async function SummonerProfilePage({
  params,
}: {
  params: Promise<{ region: string; riotId: string }>;
}) {
  const { region, riotId } = await params;
  if (!isPlatformRegion(region)) notFound();
  const platform: PlatformRegion = region;

  const parsed = parseRiotIdSegment(riotId);
  if (!parsed) notFound();

  try {
    const account = await getAccountByRiotId(platform, parsed.gameName, parsed.tagLine);
    const summoner = await getSummonerByPuuid(platform, account.puuid);
    const [leagueEntries, matchIds, version] = await Promise.all([
      getLeagueEntriesByPuuid(platform, account.puuid),
      getMatchIdsByPuuid(platform, account.puuid, { count: 10 }),
      getLatestDDragonVersion(),
    ]);
    const matches = await Promise.all(matchIds.map((id) => getMatchById(platform, id)));

    // Search-index feed + rank snapshot, after the response streams. Best-effort.
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
      if (process.env.DATABASE_URL) {
        await recordRankSnapshots(account.puuid, leagueEntries); // never throws
      }
    });

    const summaries = matches.map((m) => toMatchSummary(m, account.puuid));
    const participants = matches
      .map((m) => m.info.participants.find((p) => p.puuid === account.puuid))
      .filter((p): p is NonNullable<typeof p> => Boolean(p));

    const solo = leagueEntries.find((e) => e.queueType === 'RANKED_SOLO_5x5') ?? null;
    const flex = leagueEntries.find((e) => e.queueType === 'RANKED_FLEX_SR') ?? null;
    const perf = computeRecentPerformance(participants);
    const pool = computeChampionPool(matches, account.puuid, 4);
    const ladderChip = solo ? formatLadderChip(solo.tier, solo.rank) : null;

    // DB-backed extras — each degrades independently.
    let sparkSeries: number[] = [];
    let analyzedIds: string[] = [];
    let insights: CoachInsight[] = [];
    let skillScores: Record<MetricCategory, number | null> | null = null;
    if (process.env.DATABASE_URL) {
      try {
        sparkSeries = await getSoloRankSeries(account.puuid);
      } catch (error) {
        console.error('rank sparkline unavailable (non-fatal) —', error);
      }
      try {
        analyzedIds = [...(await findAnalyzedMatchIds(account.puuid, matchIds, PROMPT_VERSION))];
      } catch (error) {
        console.error('analyzed-state unavailable (non-fatal) —', error);
      }
      try {
        if (solo && isBenchmarkableTier(solo.tier)) {
          const roleCounts = new Map<string, number>();
          for (const p of participants) {
            if (p.teamPosition) roleCounts.set(p.teamPosition, (roleCounts.get(p.teamPosition) ?? 0) + 1);
          }
          const role = [...roleCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
          if (role) {
            const rankTier = cohortTier(solo.tier);
            const lookup = await loadBenchmarkLookup(
              { patch: patchFromVersion(version), rankTier, role },
              prismaBenchmarkReader
            );
            if (lookup) {
              insights = deriveCoachInsights(participants, lookup, rankTier);
              skillScores = profileSkillScores(participants, lookup);
            }
          }
        }
      } catch (error) {
        console.error('coach insights unavailable (non-fatal) —', error);
      }
    }

    return (
      <div className="summit-bg min-h-screen">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6 md:p-8">
          <ProfileHero
            gameName={account.gameName}
            tagLine={account.tagLine}
            level={summoner.summonerLevel}
            profileIconId={summoner.profileIconId}
            version={version}
            regionLabel={REGION_LABELS[platform] ?? platform.toUpperCase()}
            ladderChip={ladderChip}
          />
          <CoachStrip insights={insights} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <RankPanel solo={solo} flex={flex} sparkSeries={sparkSeries} />
            <PerformancePanel perf={perf} />
            <SkillProfilePanel scores={skillScores} />
          </div>
          <ChampionPool pool={pool} version={version} />
          <MatchHistory
            matches={summaries}
            version={version}
            basePath={`/${region}/${riotId}`}
            analyzedIds={analyzedIds}
          />
        </div>
      </div>
    );
  } catch (error) {
    if (error instanceof RiotApiError && error.status === 404) {
      return (
        <p className="p-8 text-foreground">
          We couldn&apos;t find that summoner. Double check the name, tag, and region.
        </p>
      );
    }
    if (error instanceof RiotApiError && error.status === 429) {
      return (
        <p className="p-8 text-foreground">
          We&apos;re being rate limited by Riot right now. Please wait a moment and try again.
        </p>
      );
    }
    throw error;
  }
}
```

Note: `SkillProfilePanel` returning null leaves a 2-card grid row — acceptable per spec ("degrades independently").

- [ ] **Step 2: Delete the replaced components and dead code**

```bash
git rm components/RankCard.tsx components/RecentFormCard.tsx components/TopChampionsCard.tsx
```

In `lib/matchStats.ts`, delete `ChampionStat` and `computeTopChampions`. Then verify nothing references them:

```bash
grep -rn "computeTopChampions\|ChampionStat\|RankCard\|RecentFormCard\|TopChampionsCard" app components lib tests --include="*.ts" --include="*.tsx"
```

Expected: no hits (delete any stale test that referenced them).

- [ ] **Step 3: Typecheck + full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean, all green.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: assemble summit profile page, remove legacy cards"
```

---

### Task 14: Verification pass

**Files:** none new.

- [ ] **Step 1: Full gate**

Run: `npm run lint && npx tsc --noEmit && npx vitest run && npm run build`
Expected: all clean. Fix anything that isn't before proceeding.

- [ ] **Step 2: Drive the page end-to-end**

Use the project's dev server (needs `RIOT_API_KEY`; `DATABASE_URL` optional but needed for sparkline/coach/analyzed states):

```bash
npm run dev
```

Visit a known profile (e.g. `http://localhost:3000/euw1/<GameName>-<Tag>`), verify:
1. Hero renders icon, level badge, ladder chip (or plain region label when unranked).
2. Stat deck: rank panel with flex sub-row; performance donut matches W/L; skill radar present only when benchmarks exist for the cohort.
3. Coach strip: visible with benchmark data, absent without — no layout hole either way.
4. Champion pool: 4 tiles max, ★ BEST on a ≥3-game champion.
5. Match rows: role badge, KDA/CS, badge chip when earned, item strip, ✦ Analyze / ✓ Analyzed (view one analysis, refresh, confirm the check).
6. Queue filter pills filter rows; empty filter shows the empty-state line.
7. With `DATABASE_URL` unset: page still renders fully (no strip, no sparkline, all CTAs ✦).
8. Second refresh writes at most one RankSnapshot row per queue per day (`npx prisma studio` → rank_snapshots).

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: summit profile polish from end-to-end verification"
```
