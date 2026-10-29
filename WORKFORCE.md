# Facility services and staff assignments

Implements the web part of the approved [PHC and hospital plan](../docs/FACILITY-SERVICES-AND-STAFF-ASSIGNMENTS-PLAN-2026-10-29.md), using shared commit `7194024f32efb67efac46f547987b38f02f9641c`, schema 4, policy 10 and facility contract 1.

## Where to start

- **Home** combines permitted duties with personal assignments, handover offers and coverage links.
- **Facility setup** has Overview, Services, Departments & units, Locations and Financial links. A PHC can use one team; hospitals can nest units under departments.
- A **service** connects a care activity, responsible team, actual locations, intake policy and equipment readiness. Details connect configuration, staff, coverage and history.
- **Staff & roster** uses Staff, Coverage and Sign-in windows tabs. A person's name opens their professional profile; account access remains separate.
- **Staff profile** separates profession, private evidence, clinical approval, assignments, schedules and history. Additional duties reuse the existing identity.
- **Coverage** plans dated sessions, exclusive/shared/on-call commitments and resources. Overnight sessions retain both dates. Finite weekly series resume without duplicating occurrences. Planned coverage, intake and attendance remain distinct.
- **Appointments** optionally proposes a service, session, practitioner, end time and places. The server reservation fingerprint establishes acceptance. Resource changes preserve attendance, date and fees.
- **Unit queue** separates instructions from responsibility. A named handover retains the outgoing owner until recipient acceptance. Offline claims remain proposals.
- **Clinical reviews & co-signatures** retains exact unsigned requests on the originating device. A distinct qualified person acknowledges actual content; the original author returns to sign. Changed clinical content requires new acknowledgement.

## Write and privacy boundaries

Operational and clinical writes use encrypted SQLite, PowerSync and `/sync/upload`. Configuration uses revision preconditions; versioned decisions and causal events use exact predecessors. The connector negotiates versions, reports drained outboxes and obtains device-scoped receipts before clearing protected mutations. Duplicate responses alone never establish acceptance.

Software access, professional qualification, clinical review scope and assignments are separate. Reviewing another person?s private evidence also requires the appropriate evidence-reader permission. Signing verifies server-signed authority and the actual service/action. Selecting a supervisor or role does not create authority. Fresh trusted server contact is read during existing sessions; high-risk checks remain.

Restricted evidence is read online after a one-time code to an independently established contact. Tokens and fetched evidence stay in memory, expire after 15 minutes and clear on staff changes. Private editor recovery is encrypted, local-only and staff/device scoped. Private refused proposals have a verified review queue; correction preserves the original refusal. Verified reconcilers can record administrative outcomes without general evidence replication.

Delayed review preserves source author, clinical content and performance time. Private review authorizes exact-content resubmission; unchanged care still enters through normal sync. It cannot invent an absent original grant. This includes a retained unsigned report whose original authority expires before its first upload.

## Deployment and activation

Deploy the matching server, migration **0017**, generated sync configuration and web together. New server support includes device-scoped receipts, retained-draft review and private rejection outcomes. Migration 0017 permits pre-upload review and protects professional-profile staff identity.

Absent policy and preparation mode preserve existing clinical behavior, including a previously saved service choice. Setup does not activate enforcement. Authorized governance must establish reviewers and contacts, verify evidence, approve scope, upgrade devices, drain outboxes, resolve proposals and inspect readiness before explicit cutover. The UI provides readiness checking; activation uses the authorized operator workflow.

No live policy is activated by these changes. Facility governance, email delivery, accepted reviewer setup and device rollout remain deployment work.

## Verification and boundaries

Run `npm test`, `npm run typecheck`, `npm run build` and `npm run size`. New tests use real SQLite and Ed25519 signatures for scope tampering, stale edits, retained drafts, read-only access, co-signatures, content binding, resumable occurrences, service isolation, preparation mode and timezone/DST boundaries. Supporting endpoints are tested against PostgreSQL.

`node qa/workforce-browser.mjs` uses isolated Chrome, synthetic records and the actual encrypted PowerSync database. Captures/results are in `qa/artifacts/workforce-*`. Fixture seed acknowledgements are synthetic; this harness does not prove a live web-to-PowerSync-to-server roundtrip. Earlier backend replication verification is documented separately.

Physical low-memory Android measurements, assistive-technology review and a facility pilot remain field acceptance. This foundation does not implement bed occupancy/ADT, laboratory fulfilment, pharmacy dispensing or automatic programme-register cases.

## Delivery verification (29 October 2026)

All 264 frontend tests and 404 server/shared tests pass. Both typechecks, production build and the initial-JavaScript budget pass; the measured entry is approximately 144.6 KB gzip against 300 KB. Eight connected Chrome workflows pass without uncaught exceptions, including encrypted recovery after reload and 320px layouts. Captures: qa/artifacts/workforce-facility-desktop.png, workforce-service-desktop.png and workforce-staff-mobile.png; results: qa/artifacts/workforce-results.json. This is synthetic acceptance evidence, not a claim of physical-device or facility-pilot acceptance.
