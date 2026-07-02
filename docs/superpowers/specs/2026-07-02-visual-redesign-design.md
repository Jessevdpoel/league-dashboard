# League Dashboard — "Arcane Neon" Visual Redesign (Design)

Date: 2026-07-02

## Summary

A whole-site visual redesign replacing the current "Command Center" identity (charcoal/gold, left nav rail, Cinzel/Inter, no images) with "Arcane Neon" (deep indigo/navy-black, cyan glow accents, top nav bar, Rajdhani typeface, line icons, and real champion/item/summoner-spell images sourced from Riot's Data Dragon CDN). Explored and approved via the visual-companion mockup tool; see the mockup session at `.superpowers/brainstorm/152-1782987567/content/` for the approved screens (`homepage-combined-v2.html`, `profile-page-redesign.html`, `profile-page-images.html`).

## Relationship to the prior design decision

The [2026-07-01 op.gg clone design](2026-07-01-opgg-clone-design.md) explicitly required a layout "deliberately distinct from op.gg" — specifically a left-hand nav rail instead of a top bar. This redesign **supersedes that one structural choice**: navigation moves to a top bar, which is structurally closer to op.gg's own layout. This was a deliberate, explicit decision by the user after being asked to confirm it (not an oversight).

What remains distinct from op.gg, by design:
- Color identity: deep indigo/near-black background with glowing cyan accents, vs. op.gg's navy/blue corporate palette.
- Typography: Rajdhani (angular, gaming-HUD feel) for all UI text, vs. op.gg's plain sans-serif.
- Visual treatment: glow/shadow effects on interactive elements (search bar, buttons, feature icons), a rounded pill-style search input, and the match history vertical timeline (kept from the original design) — none of which op.gg uses.
- Match history stays a vertical timeline (left border rail + connected cards), not op.gg's flat horizontal rows — this part of the original "distinct from op.gg" decision is unchanged.

## Scope

### In scope
- **Top nav bar** (`components/NavRail.tsx` → renamed/replaced by a top nav component): logo, nav links (Search / How it works / About), and a compact search widget (region selector + Riot ID input) — full-width hero version on the homepage, compact version in the nav bar on the profile page.
- **New color system**: indigo/near-black backgrounds (`#070c1c`, `#0d1730`), cyan accent (`#38e8ff`) with glow (box-shadow) treatment, replacing the charcoal/gold Tailwind tokens.
- **New typeface**: Rajdhani (via `next/font/google`), weights 500/600/700, replacing Cinzel (display) and Inter (body) for all UI text — headings, nav, labels, body copy, and data-dense areas (scoreboard, match rows) all use Rajdhani, per the approved mockups.
- **New icon set**: simple line icons (shield, clock, star, and others as needed) for the homepage feature row and elsewhere. Implemented with `lucide-react` (a lightweight, tree-shakeable icon library) rather than hand-rolled inline SVGs, for consistency and maintainability.
- **Real game images**, sourced from Riot's **Data Dragon CDN** (`https://ddragon.leagueoflegends.com`, public, unauthenticated, no API key or rate limit — separate from the rate-limited Riot API used elsewhere in this app):
  - **Champion square icons** — in the Top Champions card and each match history row/scoreboard entry. Built directly from the existing `championName` field already present on `ParticipantDto` (Task 4/5 data layer) — no new Riot API calls needed.
  - **Item icons** — the 7 item slots (`item0`–`item6`) already present on `ParticipantDto`. A `0` value means an empty slot and must be skipped (not rendered as a broken image).
  - **Summoner spell icons** — `summoner1Id`/`summoner2Id` on `ParticipantDto` are numeric spell IDs; Data Dragon spell images are keyed by string name (e.g. `SummonerFlash`). Requires a small static ID→key lookup table (the set of active summoner spells is small and changes rarely).
  - **Current patch version** — Data Dragon image URLs are versioned by patch (e.g. `/cdn/14.23.1/img/...`). Fetched once from `https://ddragon.leagueoflegends.com/api/versions.json` (first entry = latest) and cached for 24h, since patches ship roughly every two weeks.
- **Rank tier emblem image** on the Rank card, sourced from **Community Dragon** (`raw.communitydragon.org`) — an unofficial, community-maintained mirror of Riot's game assets, not Riot's own CDN. **Explicitly approved despite being unofficial** (unlike the champion tier list, which was dropped for the same sourcing concern) — the user weighed this as acceptable given Community Dragon's wide adoption and stability among fan sites.

### Explicitly out of scope
- The "analyze your play, get tips, improve your rank" feature raised during this conversation — genuinely separate scope (would need its own metrics/baseline/comparison design), deferred to its own future brainstorming session per the user's explicit sequencing decision.
- Champion name → Data Dragon image key edge cases (e.g. `Wukong` → ddragon id `MonkeyKing`, a handful of champions with historical id/name mismatches): in practice, the match-v5 API's `championName` field already returns Data Dragon-compatible ids for the overwhelming majority of champions. Building a full exception-mapping table is deferred — noted as a known, narrow limitation rather than solved here (YAGNI; revisit only if specific champions are observed to render broken images).

## Visual reference (from approved mockups)

- **Background**: `#070c1c` (page), `#0d1730` (nav bar, cards, search widget) — both derived from the same indigo-black family.
- **Accent**: `#38e8ff` (cyan) for active states, glow effects, links, and gradient buttons (`linear-gradient(135deg, #38e8ff, #3a4bd6)`).
- **Borders**: `#1c2f5c` (subtle, nav/card dividers), `#2a4a8c` (interactive element borders — search widget, cards).
- **Text**: `#eaf6ff`/`#e6f7ff` (primary), `#cfe4ff` (secondary/labels), `#9db3d9` (muted/nav links).
- **Win/loss accent**: `#3af0b0` (victory, green-cyan), `#ff5f5f` (defeat, red) — used in recent-form dots and match row backgrounds/text.
- **Font**: Rajdhani, weights 500 (body)/600 (labels, nav)/700 (headings, logo).
- **Glow treatment**: `box-shadow: 0 0 <size>px rgba(56,232,255,<opacity>)` applied to the search bar, feature icon circles, and interactive borders — the signature "Arcane Neon" visual signature.

## Data layer additions

A new module, `lib/dataDragon.ts`, is needed:
- `getLatestDDragonVersion(): Promise<string>` — fetches and caches (24h) the current patch version.
- `championIconUrl(version: string, championName: string): string`
- `itemIconUrl(version: string, itemId: number): string` (caller skips rendering when `itemId === 0`)
- `summonerSpellIconUrl(version: string, spellId: number): string` (uses the static ID→key lookup table)
- `rankEmblemUrl(tier: string): string` — Community Dragon URL, lowercased tier name.

This module makes no calls through the rate-limited `RiotClient` (Data Dragon and Community Dragon are unauthenticated public CDNs, structurally separate from the Riot Games API proper) — it uses direct `fetch` with its own caching, kept in its own module so this distinction is explicit and doesn't get accidentally routed through `lib/riot/client.ts`'s rate limiter.

## Affected existing components

Every component touching visual styling needs updating to the new theme; components with real-image needs get additional prop/rendering changes:

| Component | Styling update | Image update |
|---|---|---|
| `app/layout.tsx` | New font (Rajdhani), new top-level structure (top nav instead of flex-row nav rail) | — |
| `components/NavRail.tsx` | Replaced by a new top nav component (name TBD in plan, e.g. `TopNav.tsx`) | — |
| `components/SearchForm.tsx` | Restyle to match mockups (pill input, glow, gradient button); two visual modes (hero on homepage, compact in nav bar elsewhere) | — |
| `app/page.tsx` (homepage) | Full hero rewrite per `homepage-combined-v2.html` mockup | Feature icons via `lucide-react` |
| `components/RankCard.tsx` | Restyle | Add rank emblem image |
| `components/RecentFormCard.tsx` | Restyle (dot colors already close to mockup) | — |
| `components/TopChampionsCard.tsx` | Restyle | Add champion icon per row |
| `components/MatchHistory.tsx` | Restyle (timeline rail color) | — |
| `components/MatchSummaryRow.tsx` | Restyle | Add champion icon + summoner spell icons |
| `components/MatchScoreboard.tsx` | Restyle (table colors) | Add champion icon per participant row (item icons already covered by `MatchSummaryRow`'s summary view — full scoreboard can reuse the same icon helpers) |
| `tailwind.config.ts` | New color tokens (indigo/cyan family) replacing charcoal/gold | — |
| `app/globals.css` | Updated base background/text colors | — |

`app/[region]/[riotId]/error.tsx` needs no visual changes beyond inheriting the new global styles (it has no hardcoded charcoal/gold classes beyond `text-gold-100`, which needs updating to the new text color token).

## Error handling / edge cases

- Item slot `0` (empty) — skip rendering, no broken image icon.
- Data Dragon or Community Dragon image fails to load (404, network) — the browser's natural broken-image icon is not acceptable visually; add a simple `onError` fallback (hide the image / show a neutral placeholder box) so a single missing asset doesn't look broken.
- `getLatestDDragonVersion()` failing (Data Dragon CDN down) — fall back to a hardcoded last-known-good version string so the rest of the page still renders (images may be one patch stale in the rare case this triggers, which is an acceptable degradation).

## Testing

- Unit tests for `lib/dataDragon.ts`'s pure URL-building functions (`championIconUrl`, `itemIconUrl`, `summonerSpellIconUrl`, `rankEmblemUrl`) — deterministic string outputs, no network calls in tests (mock `fetch` for `getLatestDDragonVersion`).
- Component tests updated where they assert on now-changed class names/colors (existing tests that check rendered text/values, not colors, should be unaffected).
- No new e2e tests, consistent with the original design's testing approach.

## Open items for implementation planning

- Exact top nav component name and file structure.
- Whether `SearchForm`'s two visual modes (hero vs. compact) are one component with a `variant` prop, or two components sharing logic — implementation detail, not a design decision.
