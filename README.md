# Vortex dashboard

The web app behind [vx.tools](https://app.vx.tools): how Solana validators
perform under Alpenglow consensus - voting, block production, block income,
earnings, stake, and how decentralized the cluster is - from the
[Vortex API](https://api.vx.tools/llms.txt). A
[testnet](https://testnet.vx.tools) build runs the same code against the
testnet API.

## What's in it

- **Validators** - every staked validator's operational status: client,
  location, checks, stake.
- **Consensus leaderboard** - Alpenglow vote participation and block
  production, per epoch.
- **Block income leaderboard** - each validator's blocks against the blocks
  other leaders made around them ("capture"), and what skipped slots cost.
- **Live consensus** - the cluster's latest slots as they happen.
- **Decentralization** - Nakamoto coefficients by validator, provider,
  provider + city, country and client, with each breakdown's history.
- **Cluster health** - how far each client's validators have upgraded.
- **Governance** - Solana governance proposals: each one's verdict under
  its rule, every validator's vote, and stakers' overrides.
- **A page per validator** - overview, voting, production, earnings, block
  income and staking tabs.
- **A page per slot** - what happened, its votes and certificates, and who
  was left out.

## Running it

Needs Node 24.

```sh
npm install
npm run dev        # http://localhost:3000, against a local API on :4000
npm run build      # production build into build/
npm run lint
```

`VITE_API_BASE_URL` points a build at another API. The public APIs only
accept requests from the vx.tools sites, so local development needs a
local API, or a proxy that adds CORS headers. The `staging` and `testnet`
modes (`npm run build:staging`, `npm run build:testnet`) are the
staging.vx.tools and testnet.vx.tools builds.

## How it's built

- React 19 + TypeScript, bundled with Vite; routing by react-router 7.
- react-bootstrap on Bootstrap 5.3 with the theme in `src/assets/scss/`
  (`theme/` and the accent palette in `_user-variables*.scss`).
- Charts with ECharts, tables with TanStack Table.
- All data comes through `src/providers/VortexDataProvider.tsx`; every API
  response is validated with Zod (`src/providers/vortex-schemas.ts`).
- A small Cloudflare Worker (`worker/`) renders share cards; everything
  else is static assets.
- Pushes to `main` deploy staging.vx.tools; `release` and `testnet` deploy
  app.vx.tools and testnet.vx.tools (`.github/workflows/deploy.yml`).

## License

[Apache 2.0](LICENSE).
