# League Dashboard — op.gg Functionality Clone (Design)

Date: 2026-07-01

## Summary

A React (Next.js) web app that replicates the core *functionality* of op.gg — summoner lookup, profile/rank display, and match history — without copying its visual layout. All player/match data comes from the real Riot Games API. No accounts, no database; the app is a stateless lookup tool.

## Scope

### In scope
- **Summoner search + profile**: look up a player by Riot ID (`GameName#TAG`) within a selected region; show rank, level, profile icon, top champions, win rate.
- **Match history**: list of recent matches (summary rows: champion, K/D/A, win/loss, items, duration, queue type), each expandable into a full 10-player scoreboard (items, runes, summoner spells, damage/vision stats).
- **Multi-region selector**: NA, EUW, EUNE, KR, etc. Correctly maps Riot's platform routing values (e.g. `na1`) vs regional routing values (e.g. `americas`), since Match-V5 uses regional routing while Summoner/League-V4 use platform routing.

### Explicitly out of scope
- **Champion tier list** (win/pick/ban rate rankings) — dropped. No legitimate free public API provides real aggregate match statistics at this scale (op.gg, u.gg, Mobalytics don't expose open APIs for this, and scraping would violate their ToS). Revisit only if a specific licensed data source becomes available.
- **Leaderboards / live game spectate** — not requested for this iteration.
- **User accounts, saved/favorite summoners, persisted search history** — app is stateless.
- Live-as-you-type search autocomplete — search is submit-on-enter only, to avoid firing per-keystroke calls against a rate-limited dev key.

## Data source

- **Real Riot Games API**, using a personal developer key (obtained from the Riot Developer Portal; expires every 24h during development and must be manually renewed — this is a known limitation of dev keys, not a bug).
- Endpoints used, via a thin wrapper module (`lib/riot/`):
  - **Account-V1** — resolve Riot ID (`GameName#TAG`) → PUUID.
  - **Summoner-V4** — profile (level, icon).
  - **League-V4** — ranked stats (tier, LP, win/loss).
  - **Match-V5** — recent match ID list + full match detail per match.
- The API key is read only from `process.env.RIOT_API_KEY` server-side (`.env.local`, gitignored) — it is never sent to or exposed in the browser.

## Architecture

**Stack**: Next.js (App Router) + TypeScript.

**Pattern**: Server Components fetch Riot data directly for a page's initial render (fast first paint, no client-side loading spinner for primary data). Client-triggered interactions — expanding a match's scoreboard, switching region on an already-loaded page — call Route Handlers (`app/api/...`), which proxy to Riot server-side.

**Caching & rate-limit protection**:
- Next.js `fetch` calls to Riot use `next: { revalidate: N }`: short TTL (~60s) for summoner/rank data since it changes; longer/effectively-infinite TTL for completed match detail, since a finished match's data is immutable.
- A token-bucket rate-limit wrapper sits in `lib/riot/client.ts` around all outgoing Riot calls, so bursts of user interaction (e.g. rapidly expanding several matches) can't exceed the dev key's limits (20 req/sec, 100 req/2min) and get the key throttled.

## Pages & routing

| Route | Purpose |
|---|---|
| `/` | Landing page: region selector + search bar (submit-on-enter), brief explanation of the app |
| `/[region]/[gameName]-[tagLine]` | Summoner profile: rank card, recent-form summary, top-champions card, match history list |
| `/api/matches/[matchId]` | Route handler returning full match detail JSON, used to populate a match's expanded scoreboard client-side |

Errors during search (summoner not found, invalid region) are shown inline on the profile route rather than a generic 404.

## Visual direction (deliberately distinct from op.gg)

op.gg's signature look: dark navy/blue theme, top horizontal nav bar, single centered column of horizontal match rows. This app takes a structurally different approach:

- **Navigation**: a left-hand vertical nav rail (search bar + region switcher live here, always visible) instead of a top bar.
- **Profile layout**: a card-grid dashboard — rank card, recent-form card, and top-champions card sit side-by-side at the top of the page, not stacked vertically.
- **Match history**: rendered as a vertical timeline (a connected line down the left edge with match cards branching off) instead of op.gg's flat horizontal list rows — same underlying data, different visual metaphor.
- **Color system**: warm charcoal/graphite background with a gold/amber accent, avoiding op.gg's blue/navy palette.
- **Typography**: a distinct display font for headings (rank tier, summoner name), paired with a clean sans-serif for data-dense areas (scoreboards, stat tables).

## Error handling

- **Summoner not found** (404 from Riot): friendly inline message on the profile route, suggesting the user check spelling/region — not a raw error or hard 404 page.
- **Rate-limited** (429 from Riot): surfaced as a "please wait a moment and try again" state, distinct from a hard failure.
- **Riot API unavailable** (5xx): a retry-able error boundary scoped per section (rank card, match list, etc.) so one failing widget doesn't blank the entire page.

## Testing

- **Unit tests** for the Riot client module (`lib/riot/`) and the rate-limit/cache wrapper, using mocked `fetch` responses — no real Riot API calls run in CI.
- **Component tests** for match history rendering (summary row → expanded scoreboard), using fixture match JSON committed to the repo.
- **No e2e tests initially** — would require a live Riot API key in CI. Can be added later against a mocked API layer if desired.

## Open items for implementation planning

- Exact Tailwind (or other CSS approach) setup and design tokens (color scale, font choices) — to be nailed down during implementation, following the visual direction above.
- Full list of supported regions for the selector (start with the major platform regions: NA, EUW, EUNE, KR, plus regional routing mapping for each).
