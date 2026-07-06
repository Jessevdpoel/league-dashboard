# 05 — Monetization: Google Ads Strategy

**This is the chosen business model** (decision recorded in `00-OVERVIEW.md`): ads-first with a free core product; a paid Supporter tier is a Phase 3 option, never a paywall. Note the current site has zero monetization infrastructure yet — no ad slots, no CMP, no footer.

**Revenue model:** Google AdSense/Ad Manager display ads. Revenue ≈ pageviews x RPM. This feature exists to raise **pageviews per session, session duration, and return visits** — the three levers we control.

## How the analysis feature drives ad revenue

1. **More pageviews per session.** Today a user checks their profile = 1–2 pageviews. With analysis: profile → match analysis → trend page → another match = 4–6 pageviews. Every analysis is its own URL (see 04-frontend.md).
2. **Return visits.** "Focus for your next game" + trend tracking gives players a reason to come back after every session, not just when they're curious about a build. Consider an optional "re-analyze after your next ranked game" email/notification later.
3. **Longer time-on-page.** Reading coaching text = more viewable impressions (viewability affects RPM), and refresh-eligible ad slots earn more on long visits.
4. **Shareable pages.** Public share URLs of analyses bring new visitors at zero acquisition cost; each shared page carries ad slots.
5. **SEO surface area.** Publish aggregate insight pages generated from our benchmark data, e.g. "Average CS@10 for Gold mid laners — Patch 26.13" or "Most common mistakes on Ahri by rank". These are unique data-driven pages nobody else has, they rank, and they're cheap to produce (Opus batch job once per patch → static pages).

## AdSense policy compliance (non-negotiable)

- **Value-first content.** Google's policies penalize thin, mass auto-generated pages. Our analysis pages are fine — they're built from unique first-party data — but SEO pages must contain real data tables/charts, not just LLM filler. Have every SEO template reviewed against "would this be useful with ads removed?"
- **No ads on screens without content** (loading states, error states, empty quota states).
- **No accidental-click layouts:** fixed-height ad slots (zero CLS), clear separation from interactive cards, "Advertisement" labeling where required.
- **Consent:** CMP for GDPR/CCPA (required for AdSense in EU/UK), served before personalized ads.
- Gaming audiences skew ad-blocker-heavy; measure real fill rate before projecting revenue. Do not use anti-adblock walls (hurts retention); a polite dismissible note is acceptable.

## Unit economics guardrail

- Fresh LLM analysis ≈ $0.005 (Haiku, see 03-ai-analysis.md); cached views ≈ $0.
- At a conservative $1.50 RPM, one fresh analysis pays for itself in ~3–4 ad impressions; the analysis page alone shows 2–3.
- Dashboard: daily LLM spend vs estimated ad revenue from analysis-related pageviews. Alert if ratio > 30%.
- Anonymous users: 10 fresh analyses/day (quota). Optional free account: higher quota (accounts → return visits → more revenue). Do NOT paywall the core feature — traffic is the business.

## Later options (not MVP)

- Ad Manager + header bidding once traffic justifies it (higher RPM than plain AdSense)
- "Supporter" tier: ad-free + instant trend re-analysis (small revenue, big goodwill)

## Definition of done

- [ ] Ad slots implemented per 04-frontend.md with zero layout shift
- [ ] CMP live in EU/UK regions
- [ ] SEO insight-page template + generation job (per patch)
- [ ] Revenue-vs-LLM-cost dashboard
