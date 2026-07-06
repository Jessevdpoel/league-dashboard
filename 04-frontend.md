# 04 — Frontend (Analysis UI)

**Goal:** An analysis experience that is genuinely useful, keeps users on the page longer, and creates natural, policy-compliant ad real estate.

## Entry points

Match the existing route shape — profiles live at `/[region]/[riotId]` (`riotId` = `name-tag` slug), not `/summoner/...`:

1. **"Analyze" button on each match row** in match history (`components/MatchSummaryRow.tsx`) → `/[region]/[riotId]/match/[matchId]/analysis`
2. **"Performance Insights" tab on the profile** → 20-game trend view `/[region]/[riotId]/insights`
3. Post-analysis CTA: "See your 20-game trends" (cross-links the two = extra pageview).

Reuse the existing design system: Arcane Neon dark theme, `frost-*` color tokens, Rajdhani font, card styles from `RankCard`/`RecentFormCard`.

Each analysis is its own URL/pageview — important for ad revenue and shareability.

## Single-match analysis page layout

1. **Header:** champion, result, KDA, headline sentence from the AI
2. **Score radar/bars:** the 6 category scores (0–100) with rank-percentile context — instant visual value before any text
3. **"What went well"** — strength cards (green accent)
4. **"What to improve"** — improvement cards sorted by priority; each card shows the *numbers* (e.g., "3 deaths before 14:00 — all 3 with no river ward") + the coaching text
5. **Timeline strip:** gold diff sparkline with death markers (data already extracted in Layer 1)
6. **"Focus for your next game"** — single highlighted takeaway
7. **Tips section** — from the pre-generated tips library

## Loading UX (LLM latency is 3–8s on first analysis)

- Render instantly: header + score bars + timeline (all from stats engine, no LLM)
- Stream/skeleton only the prose cards
- **Do not render ad units inside skeletons or shift ads on content load** — layout shift with ads risks accidental clicks and AdSense policy trouble. Reserve fixed-height slots.
- Cached analyses (the common case) render instantly.

## Ad slots on analysis pages (coordinate with 05-monetization-ads.md)

- 1 leaderboard below the header/scores block
- 1 in-content unit between "strengths" and "improvements" (clearly separated, labeled)
- 1 sidebar unit on desktop (sticky ok, within policy)
- Never: interstitials on analysis open, ads inside cards, ads adjacent to buttons.

## Trend page extras

- Finding-frequency list ("Low vision score in 14 of last 20 games")
- Win rate split per finding ("You win 71% when you have a ward advantage at 10min")
- Score-over-time chart (last 20 games)

## Definition of done

- [ ] Both pages, responsive, dark-mode consistent with site
- [ ] Stats render instantly; prose loads progressively; zero layout shift on ad slots
- [ ] Share button (creates public read-only analysis URL)
- [ ] Empty/error states: no timeline available, analysis quota reached, LLM failure → scorecard-only view
