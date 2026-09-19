# Roamly: India launch, Kerala beta

## Product decision

Start with people planning short trips within Kerala. Keep the data model open to other states and countries, while validating one complete journey: discover a suitable place, create an itinerary, estimate fuel, record spending, and return to a saved plan.

The working brand is Roamly. The first interface is English with INR as the default currency; Malayalam is the next localization target. Currency selection changes denomination and does not perform conversion.

## Implemented local MVP

- Private guest spaces and local email/password accounts, with durable SQLite storage.
- User-selected travel style, interests, group type and transport preferences.
- Nine Kerala destinations with photos, filters, saving and OpenStreetMap locations.
- Suggested itineraries with lighter family pacing and explicit estimate labels.
- Optional vehicle-linked trip fuel planning using entered distance, efficiency and fuel price.
- Vehicle profiles, fuel journal, full-to-full efficiency, range estimates and cost calculator.
- INR expense tracking, per-person splitting and separate ledgers for other currencies.
- Account export/deletion and local development password recovery.

The app is ready for local product evaluation. It is not deployed as a public beta. Template itineraries do not call an AI model; map pins are not turn-by-turn routes.

## Validate with the first cohort

A proposed pilot is 20–30 invited users making one- to three-day trips. Include solo travellers, couples, families and friends. Begin with Kochi-origin journeys and collect observations before expanding the catalogue.

Ask each tester to complete a single trip flow and report where the app saved time, where information was unclear, and where a suggestion did not fit their preferences. Do not collect exact home addresses or background location for this evaluation.

Useful pilot measures:

- Percentage who create and reopen a saved trip without assistance.
- Time from choosing a destination to a usable plan.
- Percentage who understand which values are examples or estimates.
- Differences between entered fuel estimates and their recorded trip costs.
- Place and itinerary corrections reported by local users.
- Return use when planning a second trip.

These are proposed measurements, not analytics currently collected by the app.

## Before inviting remote users

1. Deploy with HTTPS, durable database backups, tested recovery and a real email delivery service.
2. Review Kerala destination descriptions, access rules, seasonal closures and photo provenance with local contributors. Store source and last-reviewed dates for operational place information.
3. Add Malayalam translation support and review the mobile experience with local users.
4. Select and integrate a routing and weather provider. Keep secrets server-side and expose source timestamps and failure states.
5. Replace illustrative crowd labels with a documented estimate method or an explicit unavailable state before testers rely on them for decisions.
6. Provide a feedback/support route and account/privacy information appropriate for the beta.

AI assistance, live traffic, booking availability, maintenance notifications and social matching follow after this core flow is validated. Social features also need their own reporting, blocking and moderation implementation before release.
