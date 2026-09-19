# Roamly

A nature-inspired travel companion launching in **India, with Kerala as the beta region**. This phase 1 build covers personal preferences, Kerala destination discovery, maps, trip planning, vehicle and fuel calculations, and trip expenses.

The initial catalogue and example journeys focus on Kerala, with Indian rupee defaults. The interface is currently in English. This is a regional product beta, not a complete live travel service for every Indian state.

## Run locally

Use Node.js 24 LTS and npm.

```sh
npm install
npm run dev
```

Open [localhost:5173](http://localhost:5173). Vite serves the React app and forwards `/api` requests to the Express server on port 3001. Start in the example guest experience or create a local account.

```sh
npm test          # Backend and travel-calculation tests
npm run build    # Type-check and create dist/
npm start        # Serve the built app and API on port 3001
```

Run the build before `npm start`. `npm run preview` previews only the frontend bundle; use `npm start` for the complete application.

## Architecture

- `src/`: React and TypeScript views, a curated Kerala destination catalogue, and deterministic planning and calculation logic.
- `src/components/DestinationMap.tsx`: Leaflet map with OpenStreetMap tiles, keyboard-accessible destination markers, visible attribution, and a tile-loading fallback. No device location is requested.
- `server/`: Express API backed by SQLite at `.data/roamly.sqlite`, local account/session handling, user-owned application records, and replaceable external-provider boundaries. Tests use isolated databases.
- `server/providers.js`: a provider contract that reports unavailable integrations explicitly. Keep future provider credentials on the server.

The architecture remains extensible beyond Kerala and India: profiles and trips keep explicit country and currency fields, maps use global coordinates, and service adapters can be replaced. Additional regions, translated interfaces, reliable local information, and currency conversion require further implementation and validation rather than a change to the launch scope.

Each guest receives separate example records. Creating an account retains that guest's records. Passwords use scrypt; opaque sessions are stored as hashes and sent in HttpOnly, SameSite cookies. Data is scoped to the current account. Development password resets write to `.data/mail-outbox`; no email is sent, and production reset delivery remains unavailable.

The server listens on `127.0.0.1:3001` by default. `PORT` changes the port; `APP_ORIGIN` configures the trusted origin; `NODE_ENV=production` enables secure cookies and disables development reset delivery. Use HTTPS for a deployed production origin. The local application is designed for development and product evaluation; deployment requires production infrastructure and operational review.

## Data you can trust

The interface distinguishes **example**, **estimated**, and **user-provided** information. Starter records demonstrate the experience; they are not the user's verified travel or vehicle history. Crowd levels are illustrative beta examples with no live or historical crowd feed. Itinerary costs and fuel range are planning estimates. Fuel calculations depend on entered distance, mileage, fuel level, and price, not vehicle telemetry.

The Kerala destination catalogue is curated. The planner produces a deterministic starter itinerary; it does not call an AI model or verify venue availability. OpenStreetMap supplies the base map, not live traffic, navigation, or route distances. Internet access is needed for map tiles.

Weather, traffic, currency exchange, opening hours, availability, and other live providers are **not connected**. Currency selection controls display and record denomination; it must not be treated as a live exchange-rate service. Unavailable data is not replaced with fictional live results.

## Next phases

AI conversation, live travel intelligence, maintenance notifications, social matching, messaging, verification, moderation, and emergency services remain future work. The AI and social areas communicate that status.

A hosted beta still needs a database migration and backup strategy, email recovery, HTTPS, provider integrations, monitoring, localization and user testing. A public social release additionally needs reporting, blocking, verification, moderation, and explicit location-sharing consent.

See [the Kerala beta plan](docs/KERALA_BETA.md) for the proposed pilot cohort, validation questions and release preparation.
