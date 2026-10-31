# Admissions and ward foundation — verification

31 October 2026 · `feat/admissions-wards`

## Result

The admission/ward foundation is implemented locally and verified against the canonical shared contract. It is not deployed. The existing web/server shared submodule checkouts were not edited or advanced; ordinary builds require shared-contract promotion first.

| Check | Result |
|---|---|
| Shared contract suite | 157 tests passed. |
| Complete server suite | 436 tests passed, including disposable real PostgreSQL databases. |
| Complete frontend regression suite | 327 tests passed across 44 files. |
| Final generated-stream checks | 3 tests passed after adding legacy audit/rejection filtering. |
| Browser acceptance | 27 assertions passed, no uncaught browser exceptions. |
| TypeScript | Web and server checks passed against the canonical contract. |
| Production integration bundle | Passed using QA build mode; service worker generated. Initial JavaScript 161.9 KB gzipped against the 300 KB budget. |
| Patch hygiene | `git diff --check` passed in all three repositories. |

Node-based validation uses the existing installed dependencies. Temporary canonical bindings and logs are under the workspace `.qa/admissions/` and `.qa/provisional-registration/`; no package, lockfile or consumer build configuration was changed. Tests do not promote submodule pointers or deploy a release.

## What was exercised

Real SQLite checks cover visit-linked confirmation, reservation, arrival, discharge readiness, departure and cleaning; a competing local-window update is refused under the insertion lock. Rejected reservations and descendant arrivals are excluded from effective operational state. Capability and write-permission checks run before persistence. Clinical-list projection prefers an active admission and preserves discharged history.

Real PostgreSQL checks cover concurrent reservations for one bed, competing successors, role attribution, denied access, signed-request/visit links, linked-patient double admission, immutable rows, transfer/cleaning and safe location retirement. An explicit admission duty grant also passes the migrated staff-permission constraint. Migration 0021 preserves legacy identities and financial links.

The actual browser screens were exercised from request through confirmation, reservation, physical arrival, transfer, discharge readiness, departure and bed cleaning. The patient chart, inpatient/outpatient list, active-inpatient date filtering, pending-server label, stay activity, discharged history, printed status and denied direct-route access were checked. At 320 px, admission and allocation actions complete without page overflow; the ward list uses stacked identity/location/actions rather than a sideways table.

The browser fixture uses synthetic in-memory records; SQLite persistence and PostgreSQL acceptance are verified separately. This does not prove a deployed PowerSync round trip, a real-phone offline restart or production hospital readiness. Existing consultation records are preserved; this release does not claim nursing assessment, medicine administration, document attachment, consent capture or operative/recovery functionality.

## Reproduce and release

- Browser actions: [admissions-commands.json](admissions-commands.json).
- Browser runner: `GENEUS_QA_CANONICAL_CONTRACT=1` with `node qa/overall-audit-browser.mjs qa/admissions-commands.json`; use a synthetic local preview only.
- Machine-readable results and accepted captures are generated under `qa/artifacts/admissions-wards/`.
- Scope, operator flow and required shared/server/stream/PWA release order: [INPATIENT-FOUNDATION.md](../../docs/INPATIENT-FOUNDATION.md).

The repository owner must promote the shared contract and consumer pointers before ordinary builds. Deploy migration 0021 and the server, then the regenerated streams, before releasing the PWA. A real hospital still needs configuration and live multi-device/offline acceptance before activation.

## Inspected screens

![Receiving signed requests](artifacts/admissions-wards/01-admission-requests.png)

![Clinical inpatient list](artifacts/admissions-wards/06-inpatient-list.png)

![Discharged stay retains the source clinical record](artifacts/admissions-wards/10b-discharged-chart.png)

![Phone bed-allocation form](artifacts/admissions-wards/12-phone-reservation.png)

![Phone inpatient worklist](artifacts/admissions-wards/13-phone-inpatients.png)
