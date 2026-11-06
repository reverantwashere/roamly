# Roamly

A nature-inspired travel companion launching in **India, with Kerala as the beta region**. This phase 1 build covers personal preferences, Kerala destination discovery, maps, trip planning, vehicle and fuel calculations, and trip expenses.

The initial catalogue and example journeys focus on Kerala, with Indian rupee defaults. The interface is currently in English. This is a regional product beta, not a complete live travel service for every Indian state.

Use the sun/moon button in the header to choose Light, Dark, or Device setting. Roamly follows the device setting on the first visit and remembers an explicit choice in this browser, including before the app loads. Theme preferences do not require an account.

## Development workflow

Use Node.js 24 and npm.

### Local machine

```sh
npm ci
npm run dev
```

Open [localhost:5173](http://localhost:5173). Vite serves the React app and proxies `/api` requests to the Express server on port 3001. Start in the example guest experience or create a local account.

Use this workflow while developing:

1. Run `npm run dev` while implementing changes.
2. Run `npm test` before opening or updating a pull request.
3. Run `npm run build` before release-related changes or when validating hosted/frontend configuration.
4. Use `npm start` only after `npm run build` to serve the built frontend and API together on port 3001.

`npm run preview` serves only the frontend bundle and does not run the API server.

### GitHub Codespaces

Roamly includes a dev container at [`.devcontainer/devcontainer.json`](.devcontainer/devcontainer.json):

- Uses the Node 24 JavaScript dev container image.
- Runs `npm ci` automatically after the Codespace is created.
- Forwards ports `5173` (frontend) and `3001` (API), with labels in the Ports panel.

After opening the Codespace terminal, start development with:

```sh
npm run dev
```

Then open the forwarded frontend port (`5173`) from the Ports panel.

## Architecture

- `src/`: React and TypeScript views, a curated Kerala destination catalogue, and deterministic planning and calculation logic.
- `src/components/DestinationMap.tsx`: Leaflet map with OpenStreetMap tiles, keyboard-accessible destination markers, visible attribution, and a tile-loading fallback. No device location is requested.
- `server/`: the local Express/SQLite development API. Tests use isolated databases.
- `src/lib/hostedApi.ts`: the hosted Supabase adapter for profiles, trips, vehicles, expenses, fuel records, saved places, and account export/deletion.
- `supabase/`: database migrations for the hosted beta, including Row Level Security policies and transactional functions for related updates.

## Hosted beta

The target hosted stack is **Supabase + Cloudflare Pages**. See [the deployment guide](docs/SUPABASE_CLOUDFLARE.md) for the database migration, authentication setup, and Pages settings. Apply every SQL file in `supabase/migrations/` in filename order, including `202609190004_authenticated_table_access.sql`; its explicit table grants let signed-in users load and save their own data while the existing RLS policies enforce ownership.
- `server/providers.js`: a provider contract that reports unavailable integrations explicitly. Keep future provider credentials on the server.

The architecture remains extensible beyond Kerala and India: profiles and trips keep explicit country and currency fields, maps use global coordinates, and service adapters can be replaced. Additional regions, translated interfaces, reliable local information, and currency conversion require further implementation and validation rather than a change to the launch scope.

The hosted site lets guests browse the catalogue and asks them to sign in before saving personal data. Supabase manages authentication, email signup codes, password recovery, and owner-only database access. Email delivery depends on the project's SMTP configuration.

The local Express demo uses separate guest example records and retains them when a local account is created. Its passwords use scrypt; opaque sessions are stored as hashes and sent in HttpOnly, SameSite cookies. Local development password resets write to `.data/mail-outbox` instead of sending email. These local accounts and records are separate from Supabase.

The server listens on `127.0.0.1:3001` by default. `PORT` changes the port; `APP_ORIGIN` configures the trusted origin; `NODE_ENV=production` enables secure cookies and disables development reset delivery. Use HTTPS for a deployed production origin. The local application is designed for development and product evaluation; deployment requires production infrastructure and operational review.

## Data you can trust

The interface distinguishes **example**, **estimated**, and **user-provided** information. Starter records demonstrate the experience; they are not the user's verified travel or vehicle history. Crowd levels are illustrative beta examples with no live or historical crowd feed. Itinerary costs and fuel range are planning estimates. Fuel calculations depend on entered distance, mileage, fuel level, and price, not vehicle telemetry.

The Kerala destination catalogue is curated. The planner produces a deterministic starter itinerary; it does not call an AI model or verify venue availability. OpenStreetMap supplies the base map, not live traffic, navigation, or route distances. Internet access is needed for map tiles.

Weather, traffic, currency exchange, opening hours, availability, and other live providers are **not connected**. Currency selection controls display and record denomination; it must not be treated as a live exchange-rate service. Unavailable data is not replaced with fictional live results.

## Next phases

AI conversation, live travel intelligence, maintenance notifications, social matching, messaging, verification, moderation, and emergency services remain future work. The AI and social areas communicate that status.

Before a hosted release, apply all database migrations and verify email delivery, backups, monitoring, and deployed user flows. Provider integrations, localization, and further user testing remain future work. A public social release additionally needs reporting, blocking, verification, moderation, and explicit location-sharing consent.

See [the Kerala beta plan](docs/KERALA_BETA.md) for the proposed pilot cohort, validation questions and release preparation.
