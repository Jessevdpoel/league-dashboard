# League Dashboard

A summoner search, rank, and match history dashboard built on the real Riot Games API — an op.gg *functionality* clone with a distinct visual layout (see `docs/superpowers/specs/2026-07-01-opgg-clone-design.md`).

## Features

- Summoner search by Riot ID (`GameName#Tag`) across NA, EUW, EUNE, KR, JP, and BR1.
- Rank, recent form, and top-champions summary cards.
- Match history rendered as a vertical timeline, expandable per match into a full 10-player scoreboard.

## Setup

1. `npm install`
2. Get a personal Riot developer API key from https://developer.riotgames.com/ (requires a Riot account; the key expires every 24 hours and must be renewed manually during development).
3. Copy `.env.local.example` to `.env.local` and paste your key in as `RIOT_API_KEY`.
4. `npm run dev` and open http://localhost:3000.

## Testing

`npm test` runs the unit and component test suite (Vitest + React Testing Library). No real Riot API calls are made in tests — all Riot responses are mocked. `npm run build` runs a full production type-check and build.

## Out of scope (see design spec for why)

- Champion tier list (win/pick/ban rates) — no honest free data source exists.
- User accounts, saved summoners, persisted search history.
- Live game / spectate.
