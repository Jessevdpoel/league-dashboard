# Mobalytics-Style UI Stack (Theme + Charts) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the site with the shadcnthemer theme (`3daa669f-6563-4650-b941-ec78f79a8e64`) on shadcn/ui + Tailwind v4, and add the Mobalytics-signature visualizations (score gauge, skill radar, gold-diff timeline strip, rank badge/LP progress) to the analysis and profile pages.

**Architecture:** Tailwind 3.4 → 4 migration first (theme tokens are oklch CSS variables; current shadcn CLI is v4-native). shadcn/ui provides base primitives and the Chart wrapper (Recharts) — this replaces `@tremor/react`, which peer-depends on React 18 and cannot be installed on this React 19 repo. All chart components are client components fed by pure, unit-tested data functions in `lib/analysis/`. Benchmarks are empty today (see `07-remaining-work.md` F1/F2), so category scores are `null` in prod: gauge and radar render only when scores exist and fall back to the existing null-safe ScoreBars otherwise. When F1 lands, the hero lights up with no further UI work.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind CSS v4, shadcn/ui (latest CLI), Recharts (installed by `shadcn add chart`), custom SVG gauge (no new dep), Vitest + React Testing Library.

## Dropped from the original stack recommendation (and why)

| Recommended | Verdict | Replacement |
|---|---|---|
| Tremor | ❌ `@tremor/react@3.18.7` peers on `react@^18`; repo is React 19 | shadcn/ui Chart components (same Recharts underneath, themed by the same CSS vars) |
| Trophy Gamification UI Kit | ❌ unverifiable npm availability; needed components are trivial | shadcn `Badge` + `Progress` + existing Riot rank emblems |
| react-circular-progressbar | ❌ YAGNI — one dep for one 50-line SVG | Custom `ScoreGauge` SVG component (full code in Task 5) |
| Recharts (direct, for radar) | ✅ kept | via shadcn `chart` component |
| shadcn/ui | ✅ kept | — |
| shadcnthemer theme 3daa669f | ✅ kept — full token set captured in Task 2 | — |

## Agent & model assignments (per 06-model-assignments.md §C: cheapest model that reliably does the job)

Orchestrator runs on the session default (Fable/Opus-class) and dispatches one fresh subagent per task via the Agent tool with an explicit `model` parameter.

| Task | Subagent | Model | Why this tier |
|---|---|---|---|
| 1. Tailwind v4 migration | general-purpose | **Sonnet** | Mechanical but breakage-prone (build pipeline). If the build fails, escalate to `ecc:react-build-resolver` (Sonnet) |
| 2. shadcn init + theme tokens | general-purpose | **Haiku** | Exact commands and full file contents are in the plan — pure apply-and-verify |
| 3. Semantic-token sweep | general-purpose | **Haiku** | Deterministic find/replace from the mapping table below |
| 4. `computeOverallScore` (TDD) | general-purpose | **Sonnet** | Small logic + tests; correctness matters (role weighting) |
| 5. `ScoreGauge` SVG component | general-purpose | **Sonnet** | Visual-quality-sensitive custom SVG |
| 6. `SkillRadar` component | general-purpose | **Sonnet** | Recharts config + null-fallback logic |
| 7. `extractGoldDiffSeries` (TDD) | general-purpose | **Sonnet** | Timeline-frame logic, fixture-driven tests |
| 8. `TimelineStrip` component | general-purpose | **Sonnet** | Recharts area chart + death markers |
| 9. AnalysisView hero integration | general-purpose | **Sonnet** | Touches server/client boundary + page data flow |
| 10. RankCard upgrade | general-purpose | **Haiku** | Full component code is in the plan |
| Per-task review (after 5, 6, 8, 9) | `ecc:react-reviewer` | **Sonnet** | Hook correctness, RSC boundaries, a11y |
| Per-task review (after 1, 4, 7) | `ecc:typescript-reviewer` | **Sonnet** | Type safety on lib code |
| 11. Final pre-merge review + visual QA | `ecc:code-reviewer` | **Opus** | One expensive pass beats many cheap bugs (06 §C); orchestrator does Playwright screenshot QA itself |

Do **not** run Tasks 2/3/10 on Sonnet or Opus — they are chore-tier. Do **not** run Task 11 on anything below Opus.

## Global Constraints

- Riot "not endorsed" disclaimer footer must remain rendered on every page (Riot policy — `00-OVERVIEW.md` §Hard constraints).
- Ad slots must keep fixed heights — zero layout shift, no ads inside skeletons (`AdSlot` already does this; do not restructure it).
- Every number shown to the user traces to a computed metric — chart components render data passed in; they never compute stats.
- Keep the Rajdhani font (`var(--font-rajdhani)`); the theme swap is colors/radius only.
- Status colors `win #3af0b0`, `loss #ff5f5f`, `amber #ffc04d` are kept verbatim as custom tokens.
- Score band thresholds everywhere: `>= 65` win-green, `>= 40` amber, else loss-red (matches existing `scoreColor`).
- Dark-only site: the theme's **dark** token set goes on `:root`; the light set is not shipped.
- All Recharts-using components must start with `'use client'`. Pure-SVG components stay server-renderable.
- After every task: `npm run typecheck && npm test` must pass before commit.

## File structure

```
postcss.config.js                          modify  (Task 1)
tailwind.config.ts                         delete  (Task 1)
app/globals.css                            rewrite (Task 1, then Task 2)
components.json                            create  (Task 2, shadcn CLI)
lib/utils.ts                               create  (Task 2, shadcn CLI — cn())
components/ui/*                            create  (Task 2, shadcn CLI: card, badge, progress, tabs, table, separator, chart)
lib/analysis/overallScore.ts               create  (Task 4)
tests/analysis/overallScore.test.ts        create  (Task 4)
components/analysis/ScoreGauge.tsx         create  (Task 5)
tests/components/ScoreGauge.test.tsx       create  (Task 5)
components/analysis/SkillRadar.tsx         create  (Task 6)
tests/components/SkillRadar.test.tsx       create  (Task 6)
lib/analysis/timelineFacts.ts              modify  (Task 7 — add extractGoldDiffSeries)
tests/analysis/goldDiffSeries.test.ts      create  (Task 7)
components/analysis/TimelineStrip.tsx      create  (Task 8)
tests/components/TimelineStrip.test.tsx    create  (Task 8)
lib/analysis/factSheet.ts                  modify  (Task 9 — export findLaneOpponentPuuid)
components/analysis/AnalysisView.tsx       modify  (Task 9)
app/[region]/[riotId]/match/[matchId]/analysis/page.tsx  modify (Task 9)
components/RankCard.tsx                    rewrite (Task 10)
all other components/ + app/ files         sweep   (Task 3)
```

---

### Task 1: Tailwind v4 migration

**Agent/model:** general-purpose / **Sonnet**. On build failure after 2 attempts, dispatch `ecc:react-build-resolver` (Sonnet).

**Files:**
- Modify: `postcss.config.js`
- Rewrite: `app/globals.css`
- Delete: `tailwind.config.ts`
- Modify: `package.json` (deps)

**Interfaces:**
- Consumes: existing custom color tokens from `tailwind.config.ts`
- Produces: identical utility classes (`bg-ink-950`, `text-frost-100`, `border-line-subtle`, `text-cyan-400`, `bg-win`, `text-loss`, `bg-amber`, `font-sans`) working under Tailwind v4 — Tasks 2–3 depend on the v4 `@theme` mechanism.

- [ ] **Step 1: Swap packages**

```powershell
npm uninstall autoprefixer
npm install tailwindcss@^4 @tailwindcss/postcss
```

- [ ] **Step 2: Replace postcss.config.js content**

```js
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

- [ ] **Step 3: Rewrite `app/globals.css`** — port every token from `tailwind.config.ts` verbatim into `@theme`:

```css
@import 'tailwindcss';

@theme {
  --color-ink-950: #070c1c;
  --color-ink-900: #0d1730;
  --color-line-subtle: #1c2f5c;
  --color-line-strong: #2a4a8c;
  --color-cyan-400: #38e8ff;
  --color-indigo-500: #3a4bd6;
  --color-frost-100: #eaf6ff;
  --color-frost-300: #cfe4ff;
  --color-frost-500: #9db3d9;
  --color-win: #3af0b0;
  --color-loss: #ff5f5f;
  --color-amber: #ffc04d;
  --font-sans: var(--font-rajdhani), sans-serif;
}

body {
  @apply bg-ink-950 text-frost-100 font-sans;
}
```

- [ ] **Step 4: Delete `tailwind.config.ts`** (v4 auto-detects content; all config now lives in CSS)

```powershell
Remove-Item tailwind.config.ts
```

- [ ] **Step 5: Verify**

Run: `npm run build; npm run typecheck; npm test`
Expected: build succeeds, all existing tests pass.
Then `npm run dev`, load `/` and a profile page — visually identical to before (same dark navy, same fonts, win/loss colors correct).

- [ ] **Step 6: Commit**

```powershell
git add -A
git commit -m "chore: migrate Tailwind 3.4 to v4 (CSS-first config)"
```

---

### Task 2: shadcn/ui init + shadcnthemer theme tokens

**Agent/model:** general-purpose / **Haiku** (all file contents below are complete — apply and verify).

**Files:**
- Create: `components.json`, `lib/utils.ts`, `components/ui/{card,badge,progress,tabs,table,separator,chart}.tsx` (all via CLI)
- Rewrite: `app/globals.css`

**Interfaces:**
- Consumes: Tailwind v4 setup from Task 1.
- Produces: semantic utilities `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `text-accent-foreground`, `text-primary`, `border-border` (Tasks 3, 5–10 use these); `<ChartContainer>` + `ChartConfig` from `@/components/ui/chart` (Tasks 6, 8); `cn()` from `@/lib/utils`; chart color vars `--chart-1`…`--chart-5`.

- [ ] **Step 1: Init shadcn** (the `@/*` path alias already exists in tsconfig)

```powershell
npx shadcn@latest init --yes --base-color neutral
npx shadcn@latest add card badge progress tabs table separator chart --yes
```

Note: `add chart` installs `recharts` as a dependency — that is expected and is our only new chart dep.

- [ ] **Step 2: Rewrite `app/globals.css`** with the captured theme (dark set on `:root` — site is dark-only) merged with the Task 1 status tokens:

```css
@import 'tailwindcss';
@import 'tw-animate-css';

:root {
  /* shadcnthemer 3daa669f-6563-4650-b941-ec78f79a8e64 — dark mode tokens */
  --background: oklch(0.201 0.002 17.289);
  --foreground: oklch(0.9328 0.0025 228.7857);
  --card: oklch(0.2097 0.008 274.5332);
  --card-foreground: oklch(0.8853 0 0);
  --popover: oklch(0 0 0);
  --popover-foreground: oklch(0.9328 0.0025 228.7857);
  --primary: oklch(0.53 0.189 19.155);
  --primary-foreground: oklch(1 0 0);
  --secondary: oklch(0.9622 0.0035 219.5331);
  --secondary-foreground: oklch(0.1884 0.0128 248.5103);
  --muted: oklch(0.209 0 0);
  --muted-foreground: oklch(0.5637 0.0078 247.9662);
  --accent: oklch(0.1928 0.0331 242.5459);
  --accent-foreground: oklch(0.6692 0.1607 245.011);
  --destructive: oklch(0.6188 0.2376 25.7658);
  --border: oklch(0.2674 0.0047 248.0045);
  --input: oklch(0.302 0.0288 244.8244);
  --ring: oklch(0.6818 0.1584 243.354);
  --chart-1: oklch(0.6723 0.1606 244.9955);
  --chart-2: oklch(0.6907 0.1554 160.3454);
  --chart-3: oklch(0.8214 0.16 82.5337);
  --chart-4: oklch(0.7064 0.1822 151.7125);
  --chart-5: oklch(0.5919 0.2186 10.5826);
  --radius: 0.625rem;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);

  /* Legacy Arcane Neon tokens — removed at the end of Task 3's sweep */
  --color-ink-950: #070c1c;
  --color-ink-900: #0d1730;
  --color-line-subtle: #1c2f5c;
  --color-line-strong: #2a4a8c;
  --color-cyan-400: #38e8ff;
  --color-indigo-500: #3a4bd6;
  --color-frost-100: #eaf6ff;
  --color-frost-300: #cfe4ff;
  --color-frost-500: #9db3d9;

  /* Status colors — permanent */
  --color-win: #3af0b0;
  --color-loss: #ff5f5f;
  --color-amber: #ffc04d;

  --font-sans: var(--font-rajdhani), sans-serif;
}

body {
  @apply bg-background text-foreground font-sans;
}
```

If the CLI's `init` wrote a different `globals.css`, this content **replaces** it entirely. If `tw-animate-css` was not installed by the CLI, run `npm install tw-animate-css`.

- [ ] **Step 3: Verify**

Run: `npm run build; npm run typecheck; npm test`
Expected: all pass. `npm run dev` → background is now near-black warm dark (`oklch(0.201 0.002 17.289)`), existing components still legible (they still use legacy tokens until Task 3).

- [ ] **Step 4: Commit**

```powershell
git add -A
git commit -m "feat: shadcn/ui base + shadcnthemer 3daa669f dark theme tokens"
```

---

### Task 3: Semantic-token sweep (all components and pages)

**Agent/model:** general-purpose / **Haiku**. Reviewed by `ecc:react-reviewer` (Sonnet) after commit.

**Files:**
- Modify: every file under `components/` and `app/` that matches the greps below (expected: `TopNav.tsx`, `SearchForm.tsx`, `SiteFooter.tsx`, `MatchHistory.tsx`, `MatchSummaryRow.tsx`, `MatchScoreboard.tsx`, `RecentFormCard.tsx`, `TopChampionsCard.tsx`, `RankCard.tsx`, `IconImg.tsx`, `analysis/AnalysisView.tsx`, `analysis/AdSlot.tsx`, `app/page.tsx`, `app/layout.tsx`, `app/[region]/[riotId]/page.tsx`, `app/[region]/[riotId]/error.tsx`, `app/[region]/[riotId]/match/[matchId]/analysis/page.tsx`, `app/admin/costs/page.tsx`)
- Modify: `app/globals.css` (remove legacy tokens at the end)

**Interfaces:**
- Consumes: semantic tokens from Task 2.
- Produces: a codebase with zero `ink-|frost-|line-|cyan-400|indigo-500` class usages; Tasks 5–10 build on semantic tokens only.

- [ ] **Step 1: Apply this exact mapping in every matched file** (class-string replacements; keep prefix variants like `hover:`, `md:` intact):

| Old class fragment | New class fragment |
|---|---|
| `bg-ink-950` | `bg-background` |
| `bg-ink-900` | `bg-card` |
| `border-line-subtle` | `border-border` |
| `border-line-strong` | `border-border` |
| `text-frost-100` | `text-foreground` |
| `text-frost-300` | `text-foreground/80` |
| `text-frost-500` | `text-muted-foreground` |
| `text-cyan-400` | `text-accent-foreground` |
| `border-cyan-400` | `border-accent-foreground` |
| `bg-cyan-400` | `bg-accent-foreground` |
| `ring-cyan-400` | `ring-ring` |
| `text-indigo-500` / `bg-indigo-500` / `border-indigo-500` | `text-primary` / `bg-primary` / `border-primary` |

Rationale (do not deviate): the theme's `accent-foreground` is blue (hue 245), closest to the old cyan — it keeps the site's cool accent for labels/links. The red-leaning `primary` is reserved for shadcn interactive components and strong CTAs. `win`/`loss`/`amber` classes are untouched.

- [ ] **Step 2: Find every usage** (run before and after):

```powershell
# Before: list files to touch. After: expect zero matches.
npx rg -l "ink-9|frost-(1|3|5)00|line-(subtle|strong)|cyan-400|indigo-500" app components
```

(Use the Grep tool or `rg` directly if available on PATH.)

- [ ] **Step 3: Remove the legacy token block** from `app/globals.css` (the block commented "Legacy Arcane Neon tokens"), keeping win/loss/amber and font-sans.

- [ ] **Step 4: Verify**

Run: `npm run build; npm run typecheck; npm test`
Expected: all pass, zero matches from Step 2. `npm run dev` → home, profile, and analysis pages fully re-themed, no unstyled/invisible text.

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "refactor: migrate all components to semantic theme tokens"
```

---

### Task 4: `computeOverallScore` (TDD)

**Agent/model:** general-purpose / **Sonnet**. Reviewed by `ecc:typescript-reviewer` (Sonnet).

**Files:**
- Create: `lib/analysis/overallScore.ts`
- Test: `tests/analysis/overallScore.test.ts`

**Interfaces:**
- Consumes: `MetricCategory` from `@/lib/analysis/metrics` (`'laning' | 'vision' | 'fighting' | 'survivability'`), `weightsForRole(role: string | undefined): Record<MetricCategory, number>` from `@/lib/analysis/roleWeights`, `FactSheet['scores']` shape `Record<MetricCategory, number | null>`.
- Produces: `computeOverallScore(scores: Record<MetricCategory, number | null>, role: string | undefined): number | null` — used by Task 9. Returns `null` when every category score is `null`.

- [ ] **Step 1: Write the failing tests** — `tests/analysis/overallScore.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeOverallScore } from '@/lib/analysis/overallScore';

describe('computeOverallScore', () => {
  it('returns null when all category scores are null', () => {
    expect(
      computeOverallScore(
        { laning: null, vision: null, fighting: null, survivability: null },
        'MIDDLE'
      )
    ).toBeNull();
  });

  it('returns the score itself when all categories are equal', () => {
    expect(
      computeOverallScore(
        { laning: 70, vision: 70, fighting: 70, survivability: 70 },
        'BOTTOM'
      )
    ).toBe(70);
  });

  it('weights categories by role (vision dominates for UTILITY)', () => {
    // UTILITY weights: laning 0.6, vision 1.4, fighting 0.9, survivability 1.0
    const utility = computeOverallScore(
      { laning: 100, vision: 0, fighting: 50, survivability: 50 },
      'UTILITY'
    );
    const mid = computeOverallScore(
      { laning: 100, vision: 0, fighting: 50, survivability: 50 },
      'MIDDLE'
    );
    // Vision is weighted heavier for UTILITY, so its 0 drags the score lower.
    expect(utility).toBeLessThan(mid!);
  });

  it('skips null categories and averages the rest', () => {
    expect(
      computeOverallScore(
        { laning: 80, vision: null, fighting: null, survivability: null },
        undefined
      )
    ).toBe(80);
  });

  it('rounds to an integer', () => {
    const result = computeOverallScore(
      { laning: 33, vision: 34, fighting: 33, survivability: null },
      undefined
    );
    expect(Number.isInteger(result)).toBe(true);
  });

  it('falls back to equal weights for unknown roles', () => {
    expect(
      computeOverallScore(
        { laning: 40, vision: 60, fighting: 40, survivability: 60 },
        'UNKNOWN'
      )
    ).toBe(50);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/analysis/overallScore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `lib/analysis/overallScore.ts`:

```ts
import type { MetricCategory } from './metrics';
import { weightsForRole } from './roleWeights';

/**
 * Role-weighted overall performance score (0–100) — the number the ScoreGauge
 * shows. Weighted mean of the non-null category scores using the same role
 * weights the coaching focus uses. Null when no category has a score yet
 * (no benchmark data — see 07-remaining-work.md F1).
 */
export function computeOverallScore(
  scores: Record<MetricCategory, number | null>,
  role: string | undefined
): number | null {
  const weights = weightsForRole(role);
  let weightedSum = 0;
  let weightTotal = 0;
  for (const category of Object.keys(scores) as MetricCategory[]) {
    const score = scores[category];
    if (score === null) continue;
    weightedSum += score * weights[category];
    weightTotal += weights[category];
  }
  if (weightTotal === 0) return null;
  return Math.round(weightedSum / weightTotal);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/analysis/overallScore.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```powershell
git add lib/analysis/overallScore.ts tests/analysis/overallScore.test.ts
git commit -m "feat: role-weighted overall performance score"
```

---

### Task 5: `ScoreGauge` component (custom SVG)

**Agent/model:** general-purpose / **Sonnet**. Reviewed by `ecc:react-reviewer` (Sonnet).

**Files:**
- Create: `components/analysis/ScoreGauge.tsx`
- Test: `tests/components/ScoreGauge.test.tsx`

**Interfaces:**
- Consumes: nothing from other tasks (pure presentational; no hooks — stays server-renderable, no `'use client'`).
- Produces: `<ScoreGauge score={number | null} label?: string />` — used by Task 9.

- [ ] **Step 1: Write the failing tests** — `tests/components/ScoreGauge.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScoreGauge } from '@/components/analysis/ScoreGauge';

describe('ScoreGauge', () => {
  it('renders the score value and label', () => {
    render(<ScoreGauge score={72} label="Match score" />);
    expect(screen.getByText('72')).toBeInTheDocument();
    expect(screen.getByText('Match score')).toBeInTheDocument();
  });

  it('is announced as a meter with the score value', () => {
    render(<ScoreGauge score={72} />);
    const meter = screen.getByRole('meter');
    expect(meter).toHaveAttribute('aria-valuenow', '72');
    expect(meter).toHaveAttribute('aria-valuemin', '0');
    expect(meter).toHaveAttribute('aria-valuemax', '100');
  });

  it('renders an em dash and no meter when score is null', () => {
    render(<ScoreGauge score={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByRole('meter')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/components/ScoreGauge.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `components/analysis/ScoreGauge.tsx`:

```tsx
/**
 * Mobalytics-style circular performance gauge. Pure SVG, no client JS.
 * 240° arc opening at the bottom; color follows the shared score bands
 * (>=65 win, >=40 amber, else loss).
 */
const SIZE = 140;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const SWEEP_DEG = 240;
const ARC_LEN = (SWEEP_DEG / 360) * 2 * Math.PI * RADIUS;

function bandClass(score: number): string {
  if (score >= 65) return 'stroke-win';
  if (score >= 40) return 'stroke-amber';
  return 'stroke-loss';
}

export interface ScoreGaugeProps {
  score: number | null;
  label?: string;
}

export function ScoreGauge({ score, label = 'Overall score' }: ScoreGaugeProps) {
  // Arc starts at 150° (lower-left) and sweeps clockwise 240° to 30° (lower-right).
  const track = (
    <circle
      cx={SIZE / 2}
      cy={SIZE / 2}
      r={RADIUS}
      fill="none"
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeDasharray={`${ARC_LEN} ${2 * Math.PI * RADIUS}`}
      transform={`rotate(150 ${SIZE / 2} ${SIZE / 2})`}
      className="stroke-muted"
    />
  );

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative"
        style={{ width: SIZE, height: SIZE }}
        {...(score !== null
          ? { role: 'meter', 'aria-valuenow': score, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': label }
          : {})}
      >
        <svg width={SIZE} height={SIZE} aria-hidden="true">
          {track}
          {score !== null && (
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${(score / 100) * ARC_LEN} ${2 * Math.PI * RADIUS}`}
              transform={`rotate(150 ${SIZE / 2} ${SIZE / 2})`}
              className={bandClass(score)}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold text-foreground">{score ?? '—'}</span>
          {score !== null && <span className="text-[11px] text-muted-foreground">/ 100</span>}
        </div>
      </div>
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/components/ScoreGauge.test.tsx`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```powershell
git add components/analysis/ScoreGauge.tsx tests/components/ScoreGauge.test.tsx
git commit -m "feat: circular score gauge component"
```

---

### Task 6: `SkillRadar` component

**Agent/model:** general-purpose / **Sonnet**. Reviewed by `ecc:react-reviewer` (Sonnet).

**Files:**
- Create: `components/analysis/SkillRadar.tsx`
- Test: `tests/components/SkillRadar.test.tsx`

**Interfaces:**
- Consumes: `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `type ChartConfig` from `@/components/ui/chart` (Task 2); `MetricCategory` from `@/lib/analysis/metrics`.
- Produces: `<SkillRadar scores={Record<MetricCategory, number | null>} />` and exported pure helper `radarData(scores): Array<{ skill: string; score: number }> | null` (null when any category score is null — a partial radar shape misleads). Used by Task 9.

- [ ] **Step 1: Write the failing tests** — `tests/components/SkillRadar.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SkillRadar, radarData } from '@/components/analysis/SkillRadar';

describe('radarData', () => {
  it('maps all four categories in fixed order with labels', () => {
    expect(
      radarData({ laning: 61, vision: 44, fighting: 80, survivability: 55 })
    ).toEqual([
      { skill: 'Laning', score: 61 },
      { skill: 'Vision', score: 44 },
      { skill: 'Fighting', score: 80 },
      { skill: 'Survivability', score: 55 },
    ]);
  });

  it('returns null when any category is null (partial radar misleads)', () => {
    expect(
      radarData({ laning: 61, vision: null, fighting: 80, survivability: 55 })
    ).toBeNull();
  });
});

describe('SkillRadar', () => {
  it('renders the needs-more-data note when scores are incomplete', () => {
    render(
      <SkillRadar scores={{ laning: null, vision: null, fighting: null, survivability: null }} />
    );
    expect(screen.getByText(/needs benchmark data/i)).toBeInTheDocument();
  });
});
```

(jsdom cannot meaningfully render Recharts' ResponsiveContainer — test the data mapper and the fallback branch; the chart itself is verified visually in Task 11.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/components/SkillRadar.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `components/analysis/SkillRadar.tsx`:

```tsx
'use client';

import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { MetricCategory } from '@/lib/analysis/metrics';

const CATEGORY_LABELS: ReadonlyArray<[MetricCategory, string]> = [
  ['laning', 'Laning'],
  ['vision', 'Vision'],
  ['fighting', 'Fighting'],
  ['survivability', 'Survivability'],
];

/** Null when any category lacks a score — a partial radar shape misleads. */
export function radarData(
  scores: Record<MetricCategory, number | null>
): Array<{ skill: string; score: number }> | null {
  const data: Array<{ skill: string; score: number }> = [];
  for (const [category, label] of CATEGORY_LABELS) {
    const score = scores[category];
    if (score === null) return null;
    data.push({ skill: label, score });
  }
  return data;
}

const chartConfig = {
  score: { label: 'Score', color: 'var(--chart-1)' },
} satisfies ChartConfig;

export function SkillRadar({ scores }: { scores: Record<MetricCategory, number | null> }) {
  const data = radarData(scores);
  if (data === null) {
    return (
      <div className="flex h-full min-h-[180px] items-center justify-center rounded-lg border border-border bg-card p-4">
        <p className="text-center text-xs text-muted-foreground">
          Skill radar needs benchmark data.
          <br />
          Category bars below show what we have so far.
        </p>
      </div>
    );
  }
  return (
    <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[220px] w-full">
      <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <PolarGrid stroke="var(--border)" />
        <PolarAngleAxis dataKey="skill" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
        <Radar
          dataKey="score"
          fill="var(--color-score)"
          fillOpacity={0.35}
          stroke="var(--color-score)"
          strokeWidth={2}
          dot={{ r: 3, fillOpacity: 1 }}
        />
      </RadarChart>
    </ChartContainer>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/components/SkillRadar.test.tsx`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```powershell
git add components/analysis/SkillRadar.tsx tests/components/SkillRadar.test.tsx
git commit -m "feat: skill radar chart for category scores"
```

---

### Task 7: `extractGoldDiffSeries` (TDD)

**Agent/model:** general-purpose / **Sonnet**. Reviewed by `ecc:typescript-reviewer` (Sonnet).

**Files:**
- Modify: `lib/analysis/timelineFacts.ts` (new exports at the end; do not change existing functions)
- Test: `tests/analysis/goldDiffSeries.test.ts`

**Interfaces:**
- Consumes: `MatchTimelineDto`, `TimelineFrameDto` from `@/lib/riot/types` (frames have `timestamp` ms and `participantFrames[id].totalGold`); existing private helpers `participantIdForPuuid`, `goldOf` in the same file (reuse them).
- Produces: `export interface GoldDiffPoint { minute: number; gold: number }` and `export function extractGoldDiffSeries(timeline: MatchTimelineDto, puuid: string, opponentPuuid: string | undefined): GoldDiffPoint[]` — one point per timeline frame (frames are ~1/minute), empty array when opponent is missing/unresolvable. Used by Tasks 8–9.

- [ ] **Step 1: Write the failing tests** — `tests/analysis/goldDiffSeries.test.ts`. First check `tests/` for an existing timeline fixture builder and reuse it; otherwise use this inline builder:

```ts
import { describe, expect, it } from 'vitest';
import { extractGoldDiffSeries } from '@/lib/analysis/timelineFacts';
import type { MatchTimelineDto } from '@/lib/riot/types';

function timelineWith(frames: Array<Record<string, { totalGold: number }>>): MatchTimelineDto {
  return {
    metadata: { matchId: 'TEST_1', dataVersion: '2', participants: ['p1', 'p2'] },
    info: {
      frameInterval: 60000,
      participants: [
        { participantId: 1, puuid: 'p1' },
        { participantId: 2, puuid: 'p2' },
      ],
      frames: frames.map((participantFrames, i) => ({
        timestamp: i * 60000,
        participantFrames,
        events: [],
      })),
    },
  } as unknown as MatchTimelineDto;
}

describe('extractGoldDiffSeries', () => {
  it('emits one point per frame with player-minus-opponent gold', () => {
    const timeline = timelineWith([
      { '1': { totalGold: 500 }, '2': { totalGold: 500 } },
      { '1': { totalGold: 900 }, '2': { totalGold: 700 } },
      { '1': { totalGold: 1200 }, '2': { totalGold: 1500 } },
    ]);
    expect(extractGoldDiffSeries(timeline, 'p1', 'p2')).toEqual([
      { minute: 0, gold: 0 },
      { minute: 1, gold: 200 },
      { minute: 2, gold: -300 },
    ]);
  });

  it('returns [] when there is no opponent', () => {
    const timeline = timelineWith([{ '1': { totalGold: 500 }, '2': { totalGold: 500 } }]);
    expect(extractGoldDiffSeries(timeline, 'p1', undefined)).toEqual([]);
  });

  it('returns [] when the opponent puuid is not in the timeline', () => {
    const timeline = timelineWith([{ '1': { totalGold: 500 }, '2': { totalGold: 500 } }]);
    expect(extractGoldDiffSeries(timeline, 'p1', 'ghost')).toEqual([]);
  });
});
```

Note for the implementer: if the real `MatchTimelineDto` type makes the `as unknown as` cast unnecessary, drop the cast.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/analysis/goldDiffSeries.test.ts`
Expected: FAIL — `extractGoldDiffSeries` is not exported.

- [ ] **Step 3: Implement** — append to `lib/analysis/timelineFacts.ts`:

```ts
export interface GoldDiffPoint {
  /** Whole minutes from game start (frames arrive ~1/min). */
  minute: number;
  /** Player minus lane opponent total gold (positive = player ahead). */
  gold: number;
}

/**
 * Per-frame gold diff vs the lane opponent, for the timeline strip chart.
 * Not part of the LLM fact sheet — UI data only. Empty when no opponent.
 */
export function extractGoldDiffSeries(
  timeline: MatchTimelineDto,
  puuid: string,
  opponentPuuid: string | undefined
): GoldDiffPoint[] {
  if (opponentPuuid === undefined) return [];
  const participantId = participantIdForPuuid(timeline, puuid);
  const opponentId = participantIdForPuuid(timeline, opponentPuuid);
  if (participantId === null || opponentId === null) return [];
  return timeline.info.frames.map((frame) => ({
    minute: Math.round(frame.timestamp / 60_000),
    gold: goldOf(frame, participantId) - goldOf(frame, opponentId),
  }));
}
```

- [ ] **Step 4: Run all tests** (existing timelineFacts tests must stay green)

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```powershell
git add lib/analysis/timelineFacts.ts tests/analysis/goldDiffSeries.test.ts
git commit -m "feat: per-minute gold diff series extraction for timeline strip"
```

---

### Task 8: `TimelineStrip` component

**Agent/model:** general-purpose / **Sonnet**. Reviewed by `ecc:react-reviewer` (Sonnet).

**Files:**
- Create: `components/analysis/TimelineStrip.tsx`
- Test: `tests/components/TimelineStrip.test.tsx`

**Interfaces:**
- Consumes: `GoldDiffPoint`, `DeathFact` from `@/lib/analysis/timelineFacts` (Task 7 / existing: `DeathFact = { minute: number; wasSoloDeath: boolean; ... }`); `ChartContainer` etc. from `@/components/ui/chart`.
- Produces: `<TimelineStrip series={GoldDiffPoint[]} deaths={DeathFact[]} />` — renders nothing (returns `null`) when `series.length < 2`. Used by Task 9.

- [ ] **Step 1: Write the failing tests** — `tests/components/TimelineStrip.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { TimelineStrip } from '@/components/analysis/TimelineStrip';

describe('TimelineStrip', () => {
  it('renders nothing without a usable series', () => {
    const { container } = render(<TimelineStrip series={[]} deaths={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the section heading when a series exists', () => {
    const series = [
      { minute: 0, gold: 0 },
      { minute: 1, gold: 150 },
      { minute: 2, gold: -80 },
    ];
    const { getByText } = render(<TimelineStrip series={series} deaths={[]} />);
    expect(getByText(/gold lead vs lane opponent/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/components/TimelineStrip.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `components/analysis/TimelineStrip.tsx`:

```tsx
'use client';

import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { DeathFact, GoldDiffPoint } from '@/lib/analysis/timelineFacts';

const chartConfig = {
  gold: { label: 'Gold lead', color: 'var(--chart-1)' },
} satisfies ChartConfig;

export interface TimelineStripProps {
  series: GoldDiffPoint[];
  deaths: DeathFact[];
}

/** Gold-diff area chart with death markers (04-frontend.md §layout item 5). */
export function TimelineStrip({ series, deaths }: TimelineStripProps) {
  if (series.length < 2) return null;

  const byMinute = new Map(series.map((p) => [p.minute, p.gold]));
  const deathMarkers = deaths
    .map((d) => {
      const minute = Math.round(d.minute);
      const gold = byMinute.get(minute);
      return gold === undefined ? null : { minute, gold, solo: d.wasSoloDeath };
    })
    .filter((d): d is { minute: number; gold: number; solo: boolean } => d !== null);

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Gold lead vs lane opponent · <span className="text-loss">●</span> deaths
      </h2>
      <ChartContainer config={chartConfig} className="h-[140px] w-full">
        <AreaChart data={series} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="minute"
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
            tickFormatter={(m: number) => `${m}m`}
            interval="preserveStartEnd"
          />
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <ChartTooltip
            content={<ChartTooltipContent labelFormatter={(_, p) => `Minute ${p[0]?.payload.minute}`} />}
          />
          <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
          <Area
            dataKey="gold"
            type="monotone"
            fill="var(--color-gold)"
            fillOpacity={0.2}
            stroke="var(--color-gold)"
            strokeWidth={2}
          />
          {deathMarkers.map((d, i) => (
            <ReferenceDot
              key={i}
              x={d.minute}
              y={d.gold}
              r={d.solo ? 5 : 4}
              fill="var(--color-loss, #ff5f5f)"
              stroke="var(--background)"
              strokeWidth={1.5}
            />
          ))}
        </AreaChart>
      </ChartContainer>
    </section>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/components/TimelineStrip.test.tsx`
Expected: 2 passed. (If jsdom logs Recharts zero-size warnings, that is noise, not failure.)

- [ ] **Step 5: Commit**

```powershell
git add components/analysis/TimelineStrip.tsx tests/components/TimelineStrip.test.tsx
git commit -m "feat: gold-diff timeline strip with death markers"
```

---

### Task 9: Analysis hero integration (gauge + radar + timeline strip)

**Agent/model:** general-purpose / **Sonnet**. Reviewed by `ecc:react-reviewer` (Sonnet).

**Files:**
- Modify: `lib/analysis/factSheet.ts` (export lane-opponent lookup)
- Modify: `components/analysis/AnalysisView.tsx`
- Modify: `app/[region]/[riotId]/match/[matchId]/analysis/page.tsx`

**Interfaces:**
- Consumes: `computeOverallScore` (Task 4), `ScoreGauge` (Task 5), `SkillRadar` (Task 6), `extractGoldDiffSeries` + `GoldDiffPoint` (Task 7), `TimelineStrip` (Task 8), existing private `findOpponent`/`participantFor` in `factSheet.ts`.
- Produces: `AnalysisViewProps` gains `goldDiffSeries: GoldDiffPoint[]` and `deaths: DeathFact[]`; `factSheet.ts` gains `export function findLaneOpponentPuuid(match: MatchDto, puuid: string): string | undefined`.

- [ ] **Step 1: Export the opponent lookup** in `lib/analysis/factSheet.ts` — add below the private `findOpponent`:

```ts
/** Lane opponent's PUUID for UI-side timeline extraction (not fact-sheet data). */
export function findLaneOpponentPuuid(match: MatchDto, puuid: string): string | undefined {
  return findOpponent(match, participantFor(match, puuid))?.puuid;
}
```

- [ ] **Step 2: Update `AnalysisView.tsx`** — add the hero block and timeline strip. Changes only (rest of the file stays):

Add imports:

```tsx
import { computeOverallScore } from '@/lib/analysis/overallScore';
import type { DeathFact, GoldDiffPoint } from '@/lib/analysis/timelineFacts';
import { ScoreGauge } from './ScoreGauge';
import { SkillRadar } from './SkillRadar';
import { TimelineStrip } from './TimelineStrip';
```

Add to `AnalysisViewProps`:

```tsx
  /** Per-minute gold diff vs lane opponent; empty when no opponent. */
  goldDiffSeries: GoldDiffPoint[];
  /** Death facts for timeline markers (from extractTimelineFacts on the page). */
  deaths: DeathFact[];
```

Update the signature:

```tsx
export function AnalysisView({ output, factSheet, degraded, kda, version, basePath, goldDiffSeries, deaths }: AnalysisViewProps) {
```

Replace the lone `<ScoreBars scores={factSheet.scores} />` line (currently right after the header) with:

```tsx
      {/* 2. Hero: overall gauge + skill radar (both fall back until benchmarks exist) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[auto_1fr]">
        <div className="flex items-center justify-center rounded-lg border border-border bg-card p-4">
          <ScoreGauge
            score={computeOverallScore(factSheet.scores, context.role)}
            label="Match score"
          />
        </div>
        <SkillRadar scores={factSheet.scores} />
      </div>

      {/* Category detail bars (also the no-benchmark fallback) */}
      <ScoreBars scores={factSheet.scores} />

      {/* 5. Timeline strip — renders nothing without an opponent series */}
      <TimelineStrip series={goldDiffSeries} deaths={deaths} />
```

- [ ] **Step 3: Update the page** — in `app/[region]/[riotId]/match/[matchId]/analysis/page.tsx`, change/add imports:

```tsx
import { buildSingleMatchFactSheet, findLaneOpponentPuuid } from '@/lib/analysis/factSheet';
import { extractGoldDiffSeries, extractTimelineFacts } from '@/lib/analysis/timelineFacts';
```

After `const factSheet = ...`, add:

```tsx
    const goldDiffSeries = extractGoldDiffSeries(
      timeline,
      account.puuid,
      findLaneOpponentPuuid(match, account.puuid)
    );
    const timelineFacts = extractTimelineFacts(timeline, account.puuid);
```

and pass both to the view:

```tsx
          <AnalysisView
            output={output}
            factSheet={factSheet}
            degraded={degraded}
            kda={{ kills: participant.kills, deaths: participant.deaths, assists: participant.assists }}
            version={version}
            basePath={basePath}
            goldDiffSeries={goldDiffSeries}
            deaths={timelineFacts.deaths}
          />
```

(`extractTimelineFacts` is pure and cheap; calling it a second time without options is simpler than threading the internals of `buildSingleMatchFactSheet` out — do not refactor the fact-sheet builder for this.)

- [ ] **Step 4: Verify**

Run: `npm run typecheck; npm test; npm run build`
Expected: all pass. Then `npm run dev`, open a real match analysis page:
- Gauge shows "—" and radar shows the needs-benchmark note (expected — benchmarks are empty until F1).
- Timeline strip renders a gold-diff area with red death dots (or is absent for matches with no lane opponent).
- No hydration errors in the console.

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "feat: analysis hero with score gauge, skill radar, and timeline strip"
```

---

### Task 10: RankCard upgrade (tier badge + LP progress)

**Agent/model:** general-purpose / **Haiku** (full code below).

**Files:**
- Rewrite: `components/RankCard.tsx`

**Interfaces:**
- Consumes: `Badge` from `@/components/ui/badge`, `Progress` from `@/components/ui/progress` (Task 2); existing `LeagueEntryDto` (`tier`, `rank`, `leaguePoints`, `wins`, `losses`), `rankEmblemUrl`, `IconImg`. Props unchanged: `{ entry: LeagueEntryDto | null }`.
- Produces: same `RankCard` export — no caller changes.

- [ ] **Step 1: Rewrite `components/RankCard.tsx`:**

```tsx
import type { LeagueEntryDto } from '@/lib/riot/types';
import { rankEmblemUrl } from '@/lib/dataDragon';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { IconImg } from './IconImg';

/** Tier accent colors follow official rank palettes, not the theme. */
const TIER_CLASS: Record<string, string> = {
  IRON: 'border-zinc-500/50 text-zinc-400',
  BRONZE: 'border-orange-700/50 text-orange-400',
  SILVER: 'border-slate-400/50 text-slate-300',
  GOLD: 'border-yellow-500/50 text-yellow-400',
  PLATINUM: 'border-teal-400/50 text-teal-300',
  EMERALD: 'border-emerald-400/50 text-emerald-300',
  DIAMOND: 'border-sky-400/50 text-sky-300',
  MASTER: 'border-purple-400/50 text-purple-300',
  GRANDMASTER: 'border-red-400/50 text-red-300',
  CHALLENGER: 'border-amber-300/50 text-amber-200',
};

export interface RankCardProps {
  entry: LeagueEntryDto | null;
}

export function RankCard({ entry }: RankCardProps) {
  if (!entry) {
    return (
      <section aria-label="Ranked stats" className="rounded-lg border border-border bg-card p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-foreground">Ranked Solo</p>
        <p className="mt-1 text-xl font-bold text-foreground">Unranked</p>
      </section>
    );
  }

  const totalGames = entry.wins + entry.losses;
  const winRate = totalGames === 0 ? 0 : Math.round((entry.wins / totalGames) * 100);
  const apexTier = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(entry.tier);
  // Below Master, promotion sits at 100 LP; apex tiers have no LP cap.
  const lpProgress = apexTier ? null : Math.min(entry.leaguePoints, 100);

  return (
    <section
      aria-label="Ranked stats"
      className="flex items-center gap-4 rounded-lg border border-border bg-card p-5"
    >
      <IconImg src={rankEmblemUrl(entry.tier)} alt={`${entry.tier} emblem`} className="h-14 w-14" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-foreground">Ranked Solo</p>
          <Badge variant="outline" className={TIER_CLASS[entry.tier] ?? 'text-foreground'}>
            {entry.tier} {apexTier ? '' : entry.rank}
          </Badge>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-muted-foreground">{entry.leaguePoints} LP</p>
          <p className="text-sm font-semibold text-muted-foreground">
            {entry.wins}W {entry.losses}L · <span className={winRate >= 50 ? 'text-win' : 'text-loss'}>{winRate}%</span>
          </p>
        </div>
        {lpProgress !== null && (
          <Progress
            value={lpProgress}
            className="mt-2 h-1.5"
            aria-label={`${entry.leaguePoints} of 100 LP to promotion`}
          />
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck; npm test; npm run build`
Expected: all pass. `npm run dev` → profile page shows tier badge + LP progress bar; apex tiers (Master+) show no bar.

- [ ] **Step 3: Commit**

```powershell
git add components/RankCard.tsx
git commit -m "feat: rank card with tier badge and LP progress"
```

---

### Task 11: Final review + visual QA

**Agent/model:** review by `ecc:code-reviewer` on **Opus** (one pass over the whole branch diff, per 06 §C). Visual QA done by the **orchestrator itself** with the Playwright MCP tools — do not dispatch a subagent for screenshots.

- [ ] **Step 1: Full gate**

Run: `npm run lint; npm run typecheck; npm test; npm run build`
Expected: all clean.

- [ ] **Step 2: Visual QA (orchestrator, Playwright MCP)** — with `npm run dev` running, screenshot and eyeball:
1. `/` — search page on the new theme, footer disclaimer visible.
2. `/{region}/{riotId}` — profile: RankCard badge/LP bar, match history, tables legible.
3. A match analysis page — hero (gauge fallback + radar fallback note today), ScoreBars, timeline strip with death dots, ad slots keeping fixed heights, strengths/improvements cards.
4. Mobile viewport (390×844) for pages 2–3 — hero stacks to one column.

Checks: no invisible text (old token remnants), no layout shift around `AdSlot`, chart colors come from `--chart-*`, Rajdhani still the display font.

- [ ] **Step 3: Dispatch `ecc:code-reviewer` (Opus)** over `git diff main...HEAD`. Fix findings (route fixes to a Sonnet subagent; trivial ones inline).

- [ ] **Step 4: Commit any fixes, then finish the branch** via superpowers:finishing-a-development-branch.

---

## Deferred (tracked in 07-remaining-work.md — do not build in this plan)

- **Insights page + score-over-time / finding-frequency charts (T2)** — blocked on the trend fact sheet (T1) and ideally persisted facts (F2). The `ChartContainer` line/bar-list patterns from Tasks 6/8 are exactly what T2 will reuse.
- **Benchmark pipeline (F1/F2)** — until it lands, gauge + radar intentionally render their fallbacks.
- **Progressive prose streaming (P2), share button (P3)** — orthogonal to the UI stack.

## Self-review notes

- Spec coverage: theme ✅ (Task 2), shadcn base ✅ (Task 2 — tabs/table/dialog-tier primitives installed for current + T2 use), Tremor-role data viz ✅ (Tasks 6/8 on shadcn charts — Tremor itself impossible on React 19), radar ✅ (Task 6), gauge ✅ (Tasks 4–5), rank badges/LP ✅ (Task 10), agent/model table ✅ (header).
- Type consistency: `GoldDiffPoint`/`DeathFact` names match Task 7 exports; `radarData` label order fixed in both test and impl; `computeOverallScore(scores, role)` signature identical in Tasks 4 and 9.
- Known judgment call: `ChartTooltipContent` prop details vary by shadcn chart version — if the `labelFormatter` signature differs, the implementer should match the generated `components/ui/chart.tsx` types rather than the plan verbatim (behavioral intent: tooltip label shows the minute).
