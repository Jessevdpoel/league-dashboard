# Arcane Neon Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the League Dashboard's "Command Center" visual identity (charcoal/gold, left nav rail) with "Arcane Neon" (indigo/cyan, top nav bar, Rajdhani font, real champion/item/spell/rank images from Riot's Data Dragon and Community Dragon CDNs), across the whole site.

**Architecture:** New Tailwind color tokens and a single Rajdhani font replace the old theme; a new `TopNav` component replaces `NavRail`; a new `lib/dataDragon.ts` module builds image URLs from data the app already has (no new Riot API calls); every existing component is restyled and threaded with a `version` string prop for image URLs.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, `lucide-react` (new dependency), Vitest + React Testing Library.

## Global Constraints

- This redesign supersedes the prior "left nav rail" layout decision from the original design spec — navigation is now a top bar. The color identity, Rajdhani typography, glow effects, and match-history vertical timeline remain deliberately distinct from op.gg (per the redesign spec's "Relationship to the prior design decision" section).
- Color tokens (exact hex values, per the approved mockups): `ink-950` `#070c1c`, `ink-900` `#0d1730`, `line-subtle` `#1c2f5c`, `line-strong` `#2a4a8c`, `cyan-400` `#38e8ff`, `indigo-500` `#3a4bd6`, `frost-100` `#eaf6ff`, `frost-300` `#cfe4ff`, `frost-500` `#9db3d9`, `win` `#3af0b0`, `loss` `#ff5f5f`.
- Single font: Rajdhani (weights 500/600/700) via `next/font/google`, mapped to Tailwind's `font-sans` utility. The old `font-display`/`charcoal-*`/`gold-*` tokens and classes must not remain anywhere in the codebase by the end of this plan.
- Data Dragon (`https://ddragon.leagueoflegends.com`) is a public, unauthenticated CDN — champion/item/summoner-spell image URLs are versioned by patch (e.g. `/cdn/14.23.1/img/...`). The current version is fetched once from `/api/versions.json` (24h cache), with `14.23.1` as the hardcoded fallback if that fetch fails.
- Community Dragon (`https://raw.communitydragon.org/latest`) is an unofficial community asset mirror, used only for the rank tier emblem image — explicitly approved by the user despite being unofficial (unlike the champion tier list, which was dropped for the same sourcing concern in the original design).
- An item slot value of `0` means empty and must not render a broken image. An unrecognized summoner spell ID must not render a broken image. Any Data Dragon/Community Dragon image that fails to load (network error, 404) must hide itself via an `onError` handler rather than show the browser's broken-image icon.
- Neither Data Dragon nor Community Dragon calls go through `lib/riot/client.ts`'s rate limiter — they are structurally separate, unauthenticated CDNs, not the rate-limited Riot Games API.
- No live Riot API key is available in this environment (carried over from the original plan) — manual end-to-end verification remains a human follow-up task.

---

### Task 1: Tailwind color tokens and base styles

**Files:**
- Modify: `tailwind.config.ts` (full rewrite)
- Modify: `app/globals.css` (full rewrite)

**Interfaces:**
- Produces: Tailwind color utilities `bg-ink-950`, `bg-ink-900`, `border-line-subtle`, `border-line-strong`, `text-cyan-400`/`from-cyan-400`, `text-indigo-500`/`to-indigo-500`, `text-frost-100`, `text-frost-300`, `text-frost-500`, `text-win`/`bg-win`, `text-loss`/`bg-loss`, and `font-sans` (now Rajdhani) — every later task's component styling uses these exact class names.

This is a pure configuration change with no testable logic — verified by a successful build, not a unit test. Old `charcoal-*`/`gold-*`/`font-display` class references still exist in not-yet-updated components after this task; those classes will simply resolve to no styling (not a build error) until later tasks replace them. This is expected and resolved by Task 7.

- [ ] **Step 1: Rewrite `tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#070c1c',
          900: '#0d1730',
        },
        line: {
          subtle: '#1c2f5c',
          strong: '#2a4a8c',
        },
        cyan: {
          400: '#38e8ff',
        },
        indigo: {
          500: '#3a4bd6',
        },
        frost: {
          100: '#eaf6ff',
          300: '#cfe4ff',
          500: '#9db3d9',
        },
        win: '#3af0b0',
        loss: '#ff5f5f',
      },
      fontFamily: {
        sans: ['var(--font-rajdhani)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 2: Rewrite `app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply bg-ink-950 text-frost-100 font-sans;
}
```

- [ ] **Step 3: Verify the build still succeeds**

Run: `npm run build`
Expected: builds successfully (existing `charcoal-*`/`gold-*`/`font-display` classes elsewhere are silently unstyled, not build errors — confirmed by this build passing with no type or compile errors).

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.ts app/globals.css
git commit -m "feat: replace charcoal/gold theme with Arcane Neon indigo/cyan tokens"
```

---

### Task 2: Data Dragon and summoner-spell lookup modules

**Files:**
- Create: `lib/riot/summonerSpells.ts`
- Create: `lib/dataDragon.ts`
- Test: `tests/riot/summonerSpells.test.ts`
- Test: `tests/dataDragon.test.ts`

**Interfaces:**
- Consumes: nothing (pure, foundational modules — independent of `lib/riot/client.ts`'s rate limiter, per Global Constraints).
- Produces:
  - `function summonerSpellKey(spellId: number): string | null`
  - `function getLatestDDragonVersion(fetchImpl?: typeof fetch): Promise<string>`
  - `function championIconUrl(version: string, championName: string): string`
  - `function itemIconUrl(version: string, itemId: number): string | null` (returns `null` for `itemId === 0`)
  - `function summonerSpellIconUrl(version: string, spellId: number): string | null` (returns `null` for an unrecognized spell ID)
  - `function rankEmblemUrl(tier: string): string`

These are what every restyled component (Tasks 5-6) and the profile page (Task 7) import to build image URLs.

- [ ] **Step 1: Write failing tests for `lib/riot/summonerSpells.ts`**

`tests/riot/summonerSpells.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { summonerSpellKey } from '../../lib/riot/summonerSpells';

describe('summonerSpellKey', () => {
  it('maps known spell ids to their Data Dragon key', () => {
    expect(summonerSpellKey(4)).toBe('SummonerFlash');
    expect(summonerSpellKey(11)).toBe('SummonerSmite');
    expect(summonerSpellKey(7)).toBe('SummonerHeal');
  });

  it('returns null for an unknown spell id', () => {
    expect(summonerSpellKey(9999)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/riot/summonerSpells.test.ts`
Expected: FAIL — `lib/riot/summonerSpells` module not found.

- [ ] **Step 3: Implement `lib/riot/summonerSpells.ts`**

```ts
const SUMMONER_SPELL_KEYS: Record<number, string> = {
  1: 'SummonerBoost',
  3: 'SummonerExhaust',
  4: 'SummonerFlash',
  6: 'SummonerHaste',
  7: 'SummonerHeal',
  11: 'SummonerSmite',
  12: 'SummonerTeleport',
  13: 'SummonerMana',
  14: 'SummonerDot',
  21: 'SummonerBarrier',
  32: 'SummonerSnowball',
};

export function summonerSpellKey(spellId: number): string | null {
  return SUMMONER_SPELL_KEYS[spellId] ?? null;
}
```

- [ ] **Step 4: Run to verify summonerSpells tests pass**

Run: `npm test -- tests/riot/summonerSpells.test.ts`
Expected: PASS — 2 tests passed.

- [ ] **Step 5: Write failing tests for `lib/dataDragon.ts`**

`tests/dataDragon.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import {
  getLatestDDragonVersion,
  championIconUrl,
  itemIconUrl,
  summonerSpellIconUrl,
  rankEmblemUrl,
} from '../lib/dataDragon';

describe('getLatestDDragonVersion', () => {
  it('returns the first entry from the versions endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ['14.23.1', '14.22.1'],
    }) as unknown as typeof fetch;
    const version = await getLatestDDragonVersion(fetchImpl);
    expect(version).toBe('14.23.1');
  });

  it('falls back to a known-good version when the fetch throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    const version = await getLatestDDragonVersion(fetchImpl);
    expect(version).toBe('14.23.1');
  });

  it('falls back to a known-good version when the response is not ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    const version = await getLatestDDragonVersion(fetchImpl);
    expect(version).toBe('14.23.1');
  });
});

describe('championIconUrl', () => {
  it('builds the champion square icon URL', () => {
    expect(championIconUrl('14.23.1', 'Ahri')).toBe(
      'https://ddragon.leagueoflegends.com/cdn/14.23.1/img/champion/Ahri.png'
    );
  });
});

describe('itemIconUrl', () => {
  it('builds the item icon URL', () => {
    expect(itemIconUrl('14.23.1', 3157)).toBe(
      'https://ddragon.leagueoflegends.com/cdn/14.23.1/img/item/3157.png'
    );
  });

  it('returns null for an empty item slot', () => {
    expect(itemIconUrl('14.23.1', 0)).toBeNull();
  });
});

describe('summonerSpellIconUrl', () => {
  it('builds the summoner spell icon URL for a known spell', () => {
    expect(summonerSpellIconUrl('14.23.1', 4)).toBe(
      'https://ddragon.leagueoflegends.com/cdn/14.23.1/img/spell/SummonerFlash.png'
    );
  });

  it('returns null for an unknown spell id', () => {
    expect(summonerSpellIconUrl('14.23.1', 9999)).toBeNull();
  });
});

describe('rankEmblemUrl', () => {
  it('builds the rank emblem URL with a lowercased tier, via Community Dragon "latest"', () => {
    expect(rankEmblemUrl('CHALLENGER')).toBe(
      'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblems/emblem-challenger.png'
    );
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm test -- tests/dataDragon.test.ts`
Expected: FAIL — `lib/dataDragon` module not found.

- [ ] **Step 7: Implement `lib/dataDragon.ts`**

```ts
import { summonerSpellKey } from './riot/summonerSpells';

const FALLBACK_VERSION = '14.23.1';
const DDRAGON_BASE = 'https://ddragon.leagueoflegends.com';
const COMMUNITY_DRAGON_BASE = 'https://raw.communitydragon.org/latest';

export async function getLatestDDragonVersion(fetchImpl: typeof fetch = fetch): Promise<string> {
  try {
    const response = await fetchImpl(`${DDRAGON_BASE}/api/versions.json`, {
      next: { revalidate: 86_400 },
    } as RequestInit);
    if (!response.ok) return FALLBACK_VERSION;
    const versions = (await response.json()) as string[];
    return versions[0] ?? FALLBACK_VERSION;
  } catch {
    return FALLBACK_VERSION;
  }
}

export function championIconUrl(version: string, championName: string): string {
  return `${DDRAGON_BASE}/cdn/${version}/img/champion/${championName}.png`;
}

export function itemIconUrl(version: string, itemId: number): string | null {
  if (itemId === 0) return null;
  return `${DDRAGON_BASE}/cdn/${version}/img/item/${itemId}.png`;
}

export function summonerSpellIconUrl(version: string, spellId: number): string | null {
  const key = summonerSpellKey(spellId);
  if (!key) return null;
  return `${DDRAGON_BASE}/cdn/${version}/img/spell/${key}.png`;
}

export function rankEmblemUrl(tier: string): string {
  return `${COMMUNITY_DRAGON_BASE}/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblems/emblem-${tier.toLowerCase()}.png`;
}
```

- [ ] **Step 8: Run to verify dataDragon tests pass**

Run: `npm test -- tests/dataDragon.test.ts`
Expected: PASS — 8 tests passed.

- [ ] **Step 9: Run the full test suite to confirm no regressions**

Run: `npm test`
Expected: all tests pass (existing 45 + 10 new = 55).

- [ ] **Step 10: Commit**

```bash
git add lib/riot/summonerSpells.ts lib/dataDragon.ts tests/riot/summonerSpells.test.ts tests/dataDragon.test.ts
git commit -m "feat: add Data Dragon and Community Dragon image URL helpers"
```

---

### Task 3: Top nav, restyled search form, and root layout

**Files:**
- Create: `components/TopNav.tsx`
- Modify: `components/SearchForm.tsx` (full rewrite)
- Modify: `app/layout.tsx` (full rewrite)
- Delete: `components/NavRail.tsx`
- Modify: `package.json` (add `lucide-react` dependency)

**Interfaces:**
- Consumes: `PLATFORM_REGIONS`, `type PlatformRegion` from `lib/riot/regions` (unchanged).
- Produces: `<SearchForm variant?: 'hero' | 'compact' />` (defaults to `'hero'`) — Task 4's homepage uses `variant="hero"`, `TopNav` uses `variant="compact"`. `<TopNav />` — rendered by `app/layout.tsx`, present on every page.

- [ ] **Step 1: Install `lucide-react`**

Run: `npm install lucide-react`
Expected: adds `lucide-react` to `package.json` dependencies and `package-lock.json`, installs without errors.

- [ ] **Step 2: Rewrite `components/SearchForm.tsx`**

The validation, encoding, and navigation logic is unchanged from the existing component (including the hyphen-escaping fix) — only styling and the new `variant` prop are added. `aria-label`s and the button's text content (`Search`) are preserved exactly so the existing test file needs no changes.

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

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parts = riotId.split('#');
    if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
      setError('Enter a Riot ID in the form GameName#Tag');
      return;
    }
    setError(null);
    const [gameName, tagLine] = parts;
    router.push(`/${region}/${encodeRiotIdPart(gameName.trim())}-${encodeRiotIdPart(tagLine.trim())}`);
  }

  const isHero = variant === 'hero';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
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
          placeholder="GameName#Tag"
          aria-label="Riot ID"
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
      {error && (
        <p role="alert" className="text-loss text-sm font-semibold">
          {error}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 3: Run the existing SearchForm tests to confirm they still pass unmodified**

Run: `npm test -- tests/components/SearchForm.test.tsx`
Expected: PASS — all 4 existing tests pass with no changes to the test file (the default `variant="hero"` preserves prior behavior, and `aria-label`s/button text are unchanged).

- [ ] **Step 4: Create `components/TopNav.tsx`**

```tsx
import Link from 'next/link';
import { SearchForm } from './SearchForm';

export function TopNav() {
  return (
    <header className="h-14 bg-ink-900 border-b border-line-subtle flex items-center px-7 gap-6">
      <Link href="/" className="font-bold text-lg tracking-wide text-frost-100 whitespace-nowrap">
        LEAGUE<span className="text-cyan-400 drop-shadow-[0_0_8px_rgba(56,232,255,0.8)]">DASH</span>
      </Link>
      <div className="flex-1" />
      <SearchForm variant="compact" />
    </header>
  );
}
```

- [ ] **Step 5: Rewrite `app/layout.tsx`**

```tsx
import './globals.css';
import type { ReactNode } from 'react';
import { Rajdhani } from 'next/font/google';
import { TopNav } from '@/components/TopNav';

const rajdhani = Rajdhani({ subsets: ['latin'], variable: '--font-rajdhani', weight: ['500', '600', '700'] });

export const metadata = {
  title: 'League Dashboard',
  description: 'Look up summoners, ranks, and match history.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={rajdhani.variable}>
      <body className="min-h-screen flex flex-col">
        <TopNav />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Delete `components/NavRail.tsx`**

Run: `rm components/NavRail.tsx` (or delete via your editor)
Expected: file removed; nothing else imports it after Step 5's `layout.tsx` rewrite.

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: all 55 tests pass (no test file referenced `NavRail` directly, so none break from its removal).

- [ ] **Step 8: Verify visually in the dev server**

Run: `npm run dev`, open `http://localhost:3000`
Expected: a top nav bar (indigo background, glowing "LEAGUEDASH" logo, compact search widget on the right) instead of the old left-hand rail. The rest of the page below it still shows old charcoal/gold styling until later tasks — expected at this point. Stop the dev server when done.

- [ ] **Step 9: Commit**

```bash
git add components/TopNav.tsx components/SearchForm.tsx app/layout.tsx package.json package-lock.json
git rm components/NavRail.tsx
git commit -m "feat: replace left nav rail with top nav bar, add lucide-react"
```

---

### Task 4: Homepage hero rewrite

**Files:**
- Modify: `app/page.tsx` (full rewrite)

**Interfaces:**
- Consumes: `<SearchForm variant="hero" />` from `components/SearchForm` (Task 3); `Shield`, `History`, `Trophy` icon components from `lucide-react` (Task 3's new dependency).
- Produces: nothing consumed by later tasks — this is a leaf page.

No test file (consistent with the original plan — this Server/leaf page was never unit tested; verified via dev server, same as Task 3).

- [ ] **Step 1: Rewrite `app/page.tsx`**

```tsx
import { Shield, History, Trophy } from 'lucide-react';
import { SearchForm } from '@/components/SearchForm';

const FEATURES = [
  { icon: Shield, label: 'Rank & Profile' },
  { icon: History, label: 'Match History' },
  { icon: Trophy, label: 'Top Champions' },
];

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center gap-5 text-center px-5 py-16 min-h-[calc(100vh-56px)]">
      <p className="text-xs font-semibold tracking-[0.2em] text-cyan-400 uppercase">Summoner Lookup</p>
      <h1 className="text-3xl md:text-4xl font-bold text-frost-100 max-w-xl leading-tight">
        Find your rank, match history &amp; top champions
      </h1>
      <div className="mt-2 w-full max-w-xl">
        <SearchForm variant="hero" />
      </div>
      <div className="flex gap-9 mt-8">
        {FEATURES.map(({ icon: Icon, label }) => (
          <div key={label} className="flex flex-col items-center gap-2 max-w-[150px]">
            <div className="w-10 h-10 rounded-full bg-ink-900 border border-line-strong flex items-center justify-center shadow-[0_0_10px_rgba(56,232,255,0.3)]">
              <Icon className="w-[18px] h-[18px] text-cyan-400" />
            </div>
            <p className="text-sm font-bold text-frost-300">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all 55 tests pass (no test covers this file).

- [ ] **Step 3: Verify visually in the dev server**

Run: `npm run dev`, open `http://localhost:3000`
Expected: full hero — "Summoner Lookup" eyebrow text, headline, glowing search bar, three feature icons (shield/clock/trophy) with labels underneath. Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: redesign homepage hero with Arcane Neon styling and feature icons"
```

---

### Task 5: Profile summary cards — restyle and champion/rank images

**Files:**
- Modify: `components/RankCard.tsx` (full rewrite)
- Modify: `components/RecentFormCard.tsx` (full rewrite)
- Modify: `components/TopChampionsCard.tsx` (full rewrite)
- Modify: `tests/components/RankCard.test.tsx` (full rewrite)
- Modify: `tests/components/TopChampionsCard.test.tsx` (full rewrite)

**Interfaces:**
- Consumes: `rankEmblemUrl`, `championIconUrl` from `lib/dataDragon` (Task 2); `LeagueEntryDto` from `lib/riot/types`; `ChampionStat` from `lib/matchStats`.
- Produces: `<RankCard entry={LeagueEntryDto | null} />` (unchanged signature — no `version` needed, since Community Dragon's rank emblem path doesn't need a patch version). `<TopChampionsCard champions={ChampionStat[]} version={string} />` (new required `version` prop). `<RecentFormCard results={boolean[]} />` (unchanged signature, styling only).

- [ ] **Step 1: Write the updated failing test for `RankCard`**

`tests/components/RankCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RankCard } from '../../components/RankCard';

describe('RankCard', () => {
  it('renders tier, rank, win rate, and a rank emblem when ranked', () => {
    render(
      <RankCard
        entry={{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', rank: 'II', leaguePoints: 42, wins: 6, losses: 4 }}
      />
    );
    expect(screen.getByText('GOLD II')).toBeInTheDocument();
    expect(screen.getByText('6W 4L (60% win rate)')).toBeInTheDocument();
    expect(screen.getByAltText('GOLD emblem')).toHaveAttribute(
      'src',
      'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblems/emblem-gold.png'
    );
  });

  it('renders Unranked with no emblem image when no entry is provided', () => {
    render(<RankCard entry={null} />);
    expect(screen.getByText('Unranked')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/components/RankCard.test.tsx`
Expected: FAIL — no `alt="GOLD emblem"` image exists in the current implementation.

- [ ] **Step 3: Rewrite `components/RankCard.tsx`**

```tsx
import type { LeagueEntryDto } from '@/lib/riot/types';
import { rankEmblemUrl } from '@/lib/dataDragon';

export interface RankCardProps {
  entry: LeagueEntryDto | null;
}

export function RankCard({ entry }: RankCardProps) {
  if (!entry) {
    return (
      <section aria-label="Ranked stats" className="rounded-lg bg-ink-900 border border-line-subtle p-5">
        <p className="text-xs uppercase tracking-wide text-cyan-400 font-semibold">Ranked Solo</p>
        <p className="text-xl font-bold text-frost-100 mt-1">Unranked</p>
      </section>
    );
  }

  const totalGames = entry.wins + entry.losses;
  const winRate = totalGames === 0 ? 0 : Math.round((entry.wins / totalGames) * 100);

  return (
    <section
      aria-label="Ranked stats"
      className="rounded-lg bg-ink-900 border border-line-subtle p-5 flex items-center gap-4"
    >
      <img
        src={rankEmblemUrl(entry.tier)}
        alt={`${entry.tier} emblem`}
        className="w-14 h-14"
        onError={(event) => {
          event.currentTarget.style.display = 'none';
        }}
      />
      <div>
        <p className="text-xs uppercase tracking-wide text-cyan-400 font-semibold">Ranked Solo</p>
        <p className="text-xl font-bold text-frost-100 mt-1">
          {entry.tier} {entry.rank}
        </p>
        <p className="text-sm text-frost-500 font-semibold">{entry.leaguePoints} LP</p>
        <p className="text-sm text-frost-500 font-semibold">
          {entry.wins}W {entry.losses}L ({winRate}% win rate)
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run to verify RankCard tests pass**

Run: `npm test -- tests/components/RankCard.test.tsx`
Expected: PASS — 2 tests passed.

- [ ] **Step 5: Rewrite `components/RecentFormCard.tsx`**

Behavior and text output are unchanged from the existing component — only class names change (charcoal/gold → ink/frost/win/loss tokens). No test changes needed.

```tsx
export interface RecentFormCardProps {
  results: boolean[];
}

export function RecentFormCard({ results }: RecentFormCardProps) {
  const wins = results.filter(Boolean).length;
  const losses = results.length - wins;
  const winRate = results.length === 0 ? 0 : Math.round((wins / results.length) * 100);

  return (
    <section aria-label="Recent form" className="rounded-lg bg-ink-900 border border-line-subtle p-5">
      <p className="text-xs uppercase tracking-wide text-cyan-400 font-semibold">Recent Form</p>
      <p className="text-xl font-bold text-frost-100 mt-1">
        {wins}W {losses}L
      </p>
      <p className="text-sm text-frost-500 font-semibold">
        {winRate}% over last {results.length} games
      </p>
      <div className="flex gap-1 mt-2">
        {results.map((win, index) => (
          <span
            key={index}
            aria-label={win ? 'Win' : 'Loss'}
            className={`h-2 w-4 rounded-full ${win ? 'bg-win' : 'bg-loss'}`}
          />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Run to verify RecentFormCard tests still pass unmodified**

Run: `npm test -- tests/components/RecentFormCard.test.tsx`
Expected: PASS — both existing tests pass with no test file changes.

- [ ] **Step 7: Write the updated failing test for `TopChampionsCard`**

`tests/components/TopChampionsCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TopChampionsCard } from '../../components/TopChampionsCard';

describe('TopChampionsCard', () => {
  it('lists each champion with an icon, games played, and win rate', () => {
    render(
      <TopChampionsCard
        version="14.23.1"
        champions={[
          { championName: 'Ahri', games: 4, wins: 3 },
          { championName: 'Lux', games: 2, wins: 0 },
        ]}
      />
    );
    expect(screen.getByText('4 games · 75%')).toBeInTheDocument();
    expect(screen.getByText('2 games · 0%')).toBeInTheDocument();
    expect(screen.getByAltText('Ahri')).toHaveAttribute(
      'src',
      'https://ddragon.leagueoflegends.com/cdn/14.23.1/img/champion/Ahri.png'
    );
  });
});
```

- [ ] **Step 8: Run to verify it fails**

Run: `npm test -- tests/components/TopChampionsCard.test.tsx`
Expected: FAIL — `version` is a required prop not yet accepted, and no champion icon `<img>` exists.

- [ ] **Step 9: Rewrite `components/TopChampionsCard.tsx`**

```tsx
import type { ChampionStat } from '@/lib/matchStats';
import { championIconUrl } from '@/lib/dataDragon';

export interface TopChampionsCardProps {
  champions: ChampionStat[];
  version: string;
}

export function TopChampionsCard({ champions, version }: TopChampionsCardProps) {
  return (
    <section aria-label="Top champions" className="rounded-lg bg-ink-900 border border-line-subtle p-5">
      <p className="text-xs uppercase tracking-wide text-cyan-400 font-semibold">Top Champions</p>
      <ul className="mt-2 flex flex-col gap-2">
        {champions.map((champion) => {
          const winRate = champion.games === 0 ? 0 : Math.round((champion.wins / champion.games) * 100);
          return (
            <li key={champion.championName} className="flex items-center gap-2 text-sm">
              <img
                src={championIconUrl(version, champion.championName)}
                alt={champion.championName}
                className="w-8 h-8 rounded-md border border-line-strong"
                onError={(event) => {
                  event.currentTarget.style.display = 'none';
                }}
              />
              <span className="text-frost-300 font-semibold flex-1">{champion.championName}</span>
              <span className="text-frost-500">
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

- [ ] **Step 10: Run to verify TopChampionsCard tests pass**

Run: `npm test -- tests/components/TopChampionsCard.test.tsx`
Expected: PASS — 1 test passed.

- [ ] **Step 11: Run the full test suite**

Run: `npm test`
Expected: all tests pass (no regressions in `RecentFormCard`, `SearchForm`, or the data-layer tests).

- [ ] **Step 12: Commit**

```bash
git add components/RankCard.tsx components/RecentFormCard.tsx components/TopChampionsCard.tsx tests/components/RankCard.test.tsx tests/components/TopChampionsCard.test.tsx
git commit -m "feat: restyle profile cards and add rank emblem / champion icon images"
```

---

### Task 6: Match history — restyle and champion/item/spell images

**Files:**
- Modify: `lib/matchStats.ts` (add `summoner1Id`/`summoner2Id` to `MatchSummary`)
- Modify: `tests/matchStats.test.ts` (update `toMatchSummary` expectations)
- Modify: `components/MatchHistory.tsx` (full rewrite)
- Modify: `components/MatchSummaryRow.tsx` (full rewrite)
- Modify: `components/MatchScoreboard.tsx` (full rewrite)
- Modify: `tests/components/MatchHistory.test.tsx` (full rewrite)
- Modify: `tests/components/MatchSummaryRow.test.tsx` (full rewrite)
- Modify: `tests/components/MatchScoreboard.test.tsx` (full rewrite)

**Interfaces:**
- Consumes: `championIconUrl`, `itemIconUrl`, `summonerSpellIconUrl` from `lib/dataDragon` (Task 2).
- Produces: `MatchSummary` now includes `summoner1Id: number` and `summoner2Id: number`. `<MatchHistory matches={MatchSummary[]} version={string} />`, `<MatchSummaryRow summary={MatchSummary} version={string} />`, `<MatchScoreboard match={MatchDto} version={string} />` — all now require `version`, consumed by Task 7's profile page.

- [ ] **Step 1: Write the updated failing test for `toMatchSummary`**

In `tests/matchStats.test.ts`, replace the `toMatchSummary` describe block's first test with:

```ts
  it('extracts the searched player as a MatchSummary', () => {
    const match = fakeMatch(
      fakeParticipant({
        puuid: 'me',
        championName: 'Ahri',
        kills: 5,
        deaths: 2,
        assists: 8,
        win: true,
        summoner1Id: 4,
        summoner2Id: 7,
      })
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
      summoner1Id: 4,
      summoner2Id: 7,
      durationSeconds: 1500,
      queueId: 420,
      gameCreation: 1000,
    });
  });
```

(Leave the second `toMatchSummary` test — "throws when the puuid is not a participant" — and the whole `computeTopChampions` describe block unchanged.)

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/matchStats.test.ts`
Expected: FAIL — the actual `summary` object is missing `summoner1Id`/`summoner2Id` keys.

- [ ] **Step 3: Add `summoner1Id`/`summoner2Id` to `lib/matchStats.ts`**

In `lib/matchStats.ts`, update the `MatchSummary` interface and `toMatchSummary` function:

```ts
export interface MatchSummary {
  matchId: string;
  championName: string;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
  items: number[];
  summoner1Id: number;
  summoner2Id: number;
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
    summoner1Id: participant.summoner1Id,
    summoner2Id: participant.summoner2Id,
    durationSeconds: match.info.gameDuration,
    queueId: match.info.queueId,
    gameCreation: match.info.gameCreation,
  };
}
```

(`computeTopChampions` above it in the same file is unchanged — leave it as-is.)

- [ ] **Step 4: Run to verify matchStats tests pass**

Run: `npm test -- tests/matchStats.test.ts`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Write the updated failing test for `MatchScoreboard`**

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
  it('splits participants into Blue Team and Red Team tables with champion icons', () => {
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
    render(<MatchScoreboard match={match} version="14.23.1" />);
    expect(screen.getByText('Blue Team')).toBeInTheDocument();
    expect(screen.getByText('Red Team')).toBeInTheDocument();
    expect(screen.getByText('BluePlayer#NA1')).toBeInTheDocument();
    expect(screen.getByText('RedPlayer#NA1')).toBeInTheDocument();
    expect(screen.getAllByAltText('Ahri')).toHaveLength(2);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm test -- tests/components/MatchScoreboard.test.tsx`
Expected: FAIL — `version` is a required prop not yet accepted, and no champion icon `<img>` exists.

- [ ] **Step 7: Rewrite `components/MatchScoreboard.tsx`**

```tsx
import type { MatchDto, ParticipantDto } from '@/lib/riot/types';
import { championIconUrl } from '@/lib/dataDragon';

export interface MatchScoreboardProps {
  match: MatchDto;
  version: string;
}

function TeamTable({ team, label, version }: { team: ParticipantDto[]; label: string; version: string }) {
  return (
    <table className="w-full text-sm">
      <caption className="text-left text-cyan-400 mb-1 font-semibold">{label}</caption>
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
            <td className="text-frost-300">
              {participant.riotIdGameName}#{participant.riotIdTagline}
            </td>
            <td>
              <div className="flex items-center gap-2">
                <img
                  src={championIconUrl(version, participant.championName)}
                  alt={participant.championName}
                  className="w-6 h-6 rounded border border-line-strong"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
                <span className="text-frost-300">{participant.championName}</span>
              </div>
            </td>
            <td className="text-frost-300">
              {participant.kills}/{participant.deaths}/{participant.assists}
            </td>
            <td className="text-frost-300">{participant.totalDamageDealtToChampions}</td>
            <td className="text-frost-300">{participant.visionScore}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MatchScoreboard({ match, version }: MatchScoreboardProps) {
  const blueTeam = match.info.participants.filter((p) => p.teamId === 100);
  const redTeam = match.info.participants.filter((p) => p.teamId === 200);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-ink-950 border border-line-subtle p-4 rounded-lg">
      <TeamTable team={blueTeam} label="Blue Team" version={version} />
      <TeamTable team={redTeam} label="Red Team" version={version} />
    </div>
  );
}
```

- [ ] **Step 8: Run to verify MatchScoreboard tests pass**

Run: `npm test -- tests/components/MatchScoreboard.test.tsx`
Expected: PASS — 1 test passed.

- [ ] **Step 9: Write the updated failing test for `MatchSummaryRow`**

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
  summoner1Id: 4,
  summoner2Id: 7,
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
  it('shows the champion icon, KDA, and formatted duration', () => {
    render(<MatchSummaryRow summary={summary} version="14.23.1" />);
    expect(screen.getByAltText('Ahri')).toHaveAttribute(
      'src',
      'https://ddragon.leagueoflegends.com/cdn/14.23.1/img/champion/Ahri.png'
    );
    expect(screen.getByText(/5\/2\/8/)).toBeInTheDocument();
    expect(screen.getByText(/25:30/)).toBeInTheDocument();
    expect(screen.getByText(/Victory/)).toBeInTheDocument();
  });

  it('fetches and shows the full scoreboard when expanded', async () => {
    render(<MatchSummaryRow summary={summary} version="14.23.1" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/matches/NA1_1'));
    await waitFor(() => expect(screen.getByText('Blue Team')).toBeInTheDocument());
  });
});
```

- [ ] **Step 10: Run to verify it fails**

Run: `npm test -- tests/components/MatchSummaryRow.test.tsx`
Expected: FAIL — `version` is a required prop not yet accepted by `MatchSummaryRow`, so the champion icon `<img>` the first test looks for doesn't exist yet.

- [ ] **Step 11: Rewrite `components/MatchSummaryRow.tsx`**

```tsx
'use client';

import { useState } from 'react';
import type { MatchSummary } from '@/lib/matchStats';
import type { MatchDto } from '@/lib/riot/types';
import { championIconUrl, itemIconUrl, summonerSpellIconUrl } from '@/lib/dataDragon';
import { MatchScoreboard } from './MatchScoreboard';

export interface MatchSummaryRowProps {
  summary: MatchSummary;
  version: string;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}:${remaining.toString().padStart(2, '0')}`;
}

export function MatchSummaryRow({ summary, version }: MatchSummaryRowProps) {
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
    <li className="relative pl-6 border-l-2 border-line-strong">
      <button
        onClick={handleToggle}
        className={`w-full text-left rounded-lg p-3 flex items-center gap-3 border ${
          summary.win ? 'bg-win/10 border-win/30' : 'bg-loss/10 border-loss/25'
        }`}
      >
        <img
          src={championIconUrl(version, summary.championName)}
          alt={summary.championName}
          className="w-11 h-11 rounded-md border border-line-strong"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
        <div className="flex flex-col gap-0.5">
          {[summary.summoner1Id, summary.summoner2Id].map((spellId, index) => {
            const url = summonerSpellIconUrl(version, spellId);
            if (!url) return null;
            return <img key={index} src={url} alt="" className="w-[18px] h-[18px] rounded" />;
          })}
        </div>
        <span className="text-sm text-frost-300 font-semibold">
          {summary.kills}/{summary.deaths}/{summary.assists}
        </span>
        <span className="text-sm text-frost-500">{formatDuration(summary.durationSeconds)}</span>
        <span className={`text-sm font-bold ${summary.win ? 'text-win' : 'text-loss'}`}>
          {summary.win ? 'Victory' : 'Defeat'}
        </span>
        <span className="flex-1" />
        <div className="flex gap-1">
          {summary.items.map((itemId, index) => {
            const url = itemIconUrl(version, itemId);
            if (!url) return null;
            return (
              <img
                key={index}
                src={url}
                alt=""
                className="w-[26px] h-[26px] rounded border border-line-strong"
              />
            );
          })}
        </div>
      </button>
      {expanded && (
        <div className="mt-2">
          {loading && <p className="text-frost-500 text-sm">Loading full match...</p>}
          {error && (
            <p role="alert" className="text-loss text-sm">
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

- [ ] **Step 12: Run to verify MatchSummaryRow tests pass**

Run: `npm test -- tests/components/MatchSummaryRow.test.tsx`
Expected: PASS — 2 tests passed.

- [ ] **Step 13: Write the updated failing test for `MatchHistory`**

`tests/components/MatchHistory.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MatchHistory } from '../../components/MatchHistory';
import type { MatchSummary } from '../../lib/matchStats';

describe('MatchHistory', () => {
  it('renders one row per match', () => {
    const matches: MatchSummary[] = [
      {
        matchId: 'NA1_1',
        championName: 'Ahri',
        kills: 5,
        deaths: 2,
        assists: 8,
        win: true,
        items: [],
        summoner1Id: 4,
        summoner2Id: 7,
        durationSeconds: 1500,
        queueId: 420,
        gameCreation: 0,
      },
      {
        matchId: 'NA1_2',
        championName: 'Lux',
        kills: 2,
        deaths: 4,
        assists: 3,
        win: false,
        items: [],
        summoner1Id: 4,
        summoner2Id: 11,
        durationSeconds: 1800,
        queueId: 420,
        gameCreation: 0,
      },
    ];
    render(<MatchHistory matches={matches} version="14.23.1" />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('shows an empty state with no matches', () => {
    render(<MatchHistory matches={[]} version="14.23.1" />);
    expect(screen.getByText('No recent matches found.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 14: Run to verify it fails**

Run: `npm test -- tests/components/MatchHistory.test.tsx`
Expected: FAIL — `version` is a required prop not yet accepted by `MatchHistory`.

- [ ] **Step 15: Rewrite `components/MatchHistory.tsx`**

```tsx
import type { MatchSummary } from '@/lib/matchStats';
import { MatchSummaryRow } from './MatchSummaryRow';

export interface MatchHistoryProps {
  matches: MatchSummary[];
  version: string;
}

export function MatchHistory({ matches, version }: MatchHistoryProps) {
  if (matches.length === 0) {
    return <p className="text-frost-300">No recent matches found.</p>;
  }
  return (
    <ul className="flex flex-col gap-4">
      {matches.map((match) => (
        <MatchSummaryRow key={match.matchId} summary={match} version={version} />
      ))}
    </ul>
  );
}
```

- [ ] **Step 16: Run to verify MatchHistory tests pass**

Run: `npm test -- tests/components/MatchHistory.test.tsx`
Expected: PASS — 2 tests passed.

- [ ] **Step 17: Run the full test suite**

Run: `npm test`
Expected: all tests pass, no regressions.

- [ ] **Step 18: Commit**

```bash
git add lib/matchStats.ts tests/matchStats.test.ts components/MatchHistory.tsx components/MatchSummaryRow.tsx components/MatchScoreboard.tsx tests/components/MatchHistory.test.tsx tests/components/MatchSummaryRow.test.tsx tests/components/MatchScoreboard.test.tsx
git commit -m "feat: restyle match history and add champion/item/summoner-spell images"
```

---

### Task 7: Profile page integration, cleanup, and final verification

**Files:**
- Modify: `app/[region]/[riotId]/page.tsx` (full rewrite)
- Modify: `app/[region]/[riotId]/error.tsx` (full rewrite)

**Interfaces:**
- Consumes: `getLatestDDragonVersion` from `lib/dataDragon` (Task 2); `RankCard` (unchanged signature, Task 5); `RecentFormCard` (unchanged signature, Task 5); `TopChampionsCard` (now requires `version`, Task 5); `MatchHistory` (now requires `version`, Task 6). All other imports (`isPlatformRegion`, `getAccountByRiotId`, etc.) are unchanged from the existing page.
- Produces: nothing new — this is the final integration point.

This task has no new unit-testable logic (consistent with the original plan's equivalent integration task) — verified by the full test suite plus a build and lint pass, plus a final grep sweep confirming no old-theme references remain.

- [ ] **Step 1: Rewrite `app/[region]/[riotId]/page.tsx`**

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
import { getLatestDDragonVersion } from '@/lib/dataDragon';
import { RankCard } from '@/components/RankCard';
import { RecentFormCard } from '@/components/RecentFormCard';
import { TopChampionsCard } from '@/components/TopChampionsCard';
import { MatchHistory } from '@/components/MatchHistory';

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
      getLeagueEntriesBySummonerId(platform, summoner.id),
      getMatchIdsByPuuid(platform, account.puuid, 10),
      getLatestDDragonVersion(),
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
      <div className="flex flex-col gap-6 p-8 max-w-5xl mx-auto">
        <header>
          <h1 className="text-3xl font-bold text-frost-100">
            {account.gameName}#{account.tagLine}
          </h1>
          <p className="text-frost-500 font-semibold">Level {summoner.summonerLevel}</p>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <RankCard entry={soloQueueEntry} />
          <RecentFormCard results={recentResults} />
          <TopChampionsCard champions={topChampions} version={version} />
        </div>
        <section>
          <h2 className="text-xl font-bold text-frost-100 mb-3">Match History</h2>
          <MatchHistory matches={summaries} version={version} />
        </section>
      </div>
    );
  } catch (error) {
    if (error instanceof RiotApiError && error.status === 404) {
      return (
        <p className="text-frost-100 p-8">
          We couldn&apos;t find that summoner. Double check the name, tag, and region.
        </p>
      );
    }
    if (error instanceof RiotApiError && error.status === 429) {
      return (
        <p className="text-frost-100 p-8">
          We&apos;re being rate limited by Riot right now. Please wait a moment and try again.
        </p>
      );
    }
    throw error;
  }
}
```

- [ ] **Step 2: Rewrite `app/[region]/[riotId]/error.tsx`**

```tsx
'use client';

export default function ProfileError({ error: _error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="text-frost-100 p-8">
      <p>Something went wrong loading this profile.</p>
      <button
        onClick={reset}
        className="mt-2 rounded-lg bg-gradient-to-br from-cyan-400 to-indigo-500 text-ink-950 font-bold px-3 py-2"
      >
        Try again
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Run the full automated test suite**

Run: `npm test`
Expected: all tests from Tasks 1-6 pass (this task adds no new test files, consistent with the original plan's equivalent integration task).

- [ ] **Step 4: Run the linter**

Run: `npm run lint`
Expected: no errors. Fix any that appear (e.g. unused imports) and re-run until clean.

- [ ] **Step 5: Run a production build**

Run: `npm run build`
Expected: builds successfully with no type errors.

- [ ] **Step 6: Confirm no old-theme references remain**

Run: `grep -rn "charcoal-\|gold-\|font-display\|NavRail" app components lib` (from the repository root, using your shell's grep or an equivalent search)
Expected: no matches. If any are found, update that file to the new token names before proceeding — this is not optional cleanup, it's confirming Tasks 1-6 fully replaced the old theme per this plan's Global Constraints.

- [ ] **Step 7: Manually verify against the live Riot API (same outstanding item as the original plan)**

Prerequisite: `.env.local` contains a valid `RIOT_API_KEY`.

Run: `npm run dev`, open `http://localhost:3000`

1. Search a real Riot ID.
   Expected: profile page shows the rank card with a real rank emblem image, recent form, top champions with real champion icons, and match history rows with champion/spell/item icons — all in the indigo/cyan Arcane Neon styling.
2. Expand a match.
   Expected: full scoreboard shows champion icons per participant.
3. Search a nonexistent Riot ID.
   Expected: the "couldn't find that summoner" message, styled consistently with the rest of the page.

- [ ] **Step 8: Commit**

```bash
git add "app/[region]/[riotId]/page.tsx" "app/[region]/[riotId]/error.tsx"
git commit -m "feat: wire Data Dragon version and Arcane Neon styling into the profile page"
```
