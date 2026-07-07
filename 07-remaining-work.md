# 07 — Remaining Work & Blockers

Status snapshot after Phases 0–2. Plans `00`–`06` are the design; this file tracks
what is **done**, what is **buildable now**, and what is **blocked** (and by what).

Last updated: 2026-07-07 · Branch: `feature/match-insights-phase0`

## Shipped so far

- **Phase 0** — DB schema (Prisma), Riot client, disclaimer/footer.
- **Phase 1** — deterministic stats engine (timeline facts, metrics, rules, fact sheet).
- **Phase 2 (this branch)** — AI analysis layer (`lib/analysis/analyzeMatch.ts`), single-match
  analysis page + UI, Analyze links, ad-slot infrastructure, `/admin/costs` LLM-cost dashboard.

---

## 🔴 Blocked on external accounts / decisions

| # | Item | Plan | Blocked by | Unblocks when |
|---|---|---|---|---|
| B1 | **AdSense account + publisher id** | 05 | Google approval (needs live domain + privacy/cookie policy pages, review ~days–2wks) | Site is public with policy pages and approved |
| B2 | **Live CMP** (Google "Privacy & messaging") | 05 | Requires B1 | AdSense approved; toggle CMP in dashboard |
| B3 | **Real ad unit slot ids** wired into `AdSlot` (`data-ad-slot`) | 05 | Requires B1 | Create ad units, pass `slot` + set `NEXT_PUBLIC_ADSENSE_CLIENT` |
| B4 | **Revenue side of `/admin/costs`** (AdSense reporting API) | 05 | Requires B1 + OAuth creds | Account exists; add reporting client |
| B5 | **Privacy policy / cookie policy pages** | 05 | Legal/content decision | Content approved (also a prerequisite for B1) |

> The ad infra is already a one-env-var flip: set `NEXT_PUBLIC_ADSENSE_CLIENT` and pass real
> `slot` ids to `AdSlot`. Until then, slots render labeled zero-CLS placeholders.

---

## 🟡 Foundational unlock (do this first — it gates the most)

### F1 — Benchmark data pipeline  ⭐ highest leverage
The `Benchmark` table is **empty** and nothing writes to it. Without it, `computeMetrics`
returns raw values with **no percentiles, no bands, and null category scores** — so the
analysis page's score bars currently show "—" for every category.

- **Build:** a job that samples matches per `(patch, rankTier, role, metricName)`, computes
  `p25/p50/p75/p90` + `sampleN`, and upserts `Benchmark` rows.
- **Feeds:** the score bars (04), percentile bands, rank-adaptive coaching (03), and SEO
  pages (05).
- **Depends on:** F2 (a corpus of `ParticipantFacts` to aggregate).

### F2 — Persist `ParticipantFacts`
Schema exists; nothing writes to it. The analysis page recomputes metrics from raw each time.
Persisting per-match participant metrics builds the corpus F1 aggregates and lets the trend
layer (T1) read history without re-fetching every match.

- **Build:** on match fetch/analysis, extract metrics and upsert `participant_facts`.

---

## 🟢 Buildable now (no external blockers)

### 20-game trend / insights (04 + 03)
- **T1 — Trend fact-sheet builder** (`buildTrendFactSheet`): aggregate the last ~20 games into
  finding-frequency, win-rate-per-finding, and score-over-time series. `analyzeMatch` already
  routes `type: 'trend'` → Sonnet 5; only the fact sheet + an `analyzeTrend` entry are missing.
  *Best after F2 so it reads persisted facts instead of N Riot calls.*
- **T2 — Insights page** `/[region]/[riotId]/insights`: finding-frequency list, win-rate split
  per finding, score-over-time chart. Re-enable the "See your 20-game trends" cross-link in
  `AnalysisView` (currently points back to the profile).

### Single-match page polish (04)
- **P1 — Timeline strip**: gold-diff sparkline with death markers. Data already exists in
  `timelineFacts` (`laneDiffs`, `deaths`) — purely a UI addition.
- **P2 — Progressive prose streaming**: render header + score bars instantly, stream/skeleton
  only the LLM cards (cached is the common case and already instant).
- **P3 — Share button**: public read-only analysis URL (needs a share route + token/slug).

### Abuse & cost guardrails (03/05)
- **G1 — Anonymous analysis quota** (e.g. 10 fresh analyses/day per IP/session). Needs a
  rate-limit store (DB table or Redis) keyed by IP/session. Not built.
- **G2 — Daily spend alert**: per-row cost is logged; a scheduled threshold check + alert
  channel is not. (`/admin/costs` shows totals but does not alert.)

### Offline / batch content (03/05/06 — use Batch API, 50% off)
- **O1 — Champion/role tips library** on **Opus via Batch API**, once per patch → store in DB →
  serve at runtime (analysis `tips[]` is currently always empty). Needs a tips storage table
  (no model yet) + a per-patch job.
- **O2 — SEO insight pages** from benchmark data (Sonnet via Batch API), once per patch. Needs
  F1 (benchmarks) first. Must contain real data tables/charts, not LLM filler (AdSense policy).
- **O3 — Prompt red-team / quality review** (Opus) on each `promptVersion` change. Process task.

### Eval / quality (06 §D)
- **E1 — Model re-benchmark harness**: run Haiku vs Sonnet on ~50 cached fact sheets whenever
  models update; escalate a tier only on *measured* failure, never vibes.

### Prompt-cache optimization (03)
- **C1 — Clear Haiku's 4096-token cache floor**: the single-match system prompt is currently
  under it, so `cache_control` is deliberately omitted (no dead marker). Optionally bundle
  few-shot fact-sheet→output examples to exceed 4096 and enable ~90%-off cached reads (also
  improves quality). Verify with `usage.cache_read_input_tokens > 0`.

---

## Testing gaps
- No integration test for the analysis **page** (server component) — only pure-logic unit tests.
- No test for `prismaAnalysisStore` (DB-backed) — intentionally, tests use a fake store.

## Suggested order
1. **F2 → F1** (persist facts → benchmarks) — unlocks scores, bands, trends, SEO.
2. **T1 → T2** (trend fact sheet → insights page) — biggest pageview/return-visit driver.
3. **G1/G2** (quota + spend alert) — before any real traffic.
4. **P1–P3, O1** — engagement polish + real tips.
5. **B1–B5** (AdSense) — whenever the account is ready; infra already waits.
