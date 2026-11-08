# Continuing inpatient care QA — 5 November 2026

## PowerSync schema validation regression

PowerSync's own validator reproduced the startup warning on `incoming_transfers`:
its patient index referenced a `patientId` column absent from the shared contract.
Incoming transfers are provider receipts; payments hold patient allocations. The
invalid index was removed without changing receipt or patient records. A regression
now runs the installed SDK validator against every table/index and the full schema.
Typechecking and all **382 frontend tests** pass; validated copies match 641
source/test files. No local database reset is required.

The SDK's "last port client provider for credentials" message is informational.
A checkpoint waiting on local data is a separate sync state: uploads must complete
and the matching checkpoint must arrive before replacing local changes. Connector
tests confirm failed requests remain queued and successful acknowledgements complete
their transaction. A continuing checkpoint warning needs the actual queue count
and upload/download error from Sync & review; the schema fix alone does not prove
that a deployed device's uploads have drained.

## Workflow-version storage regression

The reported `encounter_entry.workflowVersion` contract warning was reproduced
with a real SQLite TEXT column: binding numeric `1` returns text such as `"1.0"`.
The schema introspector previously classified Zod numeric literals as text. It now
detects numeric/boolean literal kinds through their optional/default wrappers, so
existing row decoding restores the numeric value without rewriting signed care.
Absent legacy workflow versions stay absent; unsupported version `2` remains
invalid. Numeric literal schema versions on documents/templates use the same fix.

Typechecking and all **381 frontend tests** pass, including regression tests for
text-stored versions, strict rejection of unsupported versions and a real SQLite
round trip proving the stored entry remains unchanged. No database reset or data
migration is required. Validated source copies match 640 source/test files.

Implemented locally on `feat/inpatient-care`; uncommitted and not deployed.
See the [implementation, validation and rollout report](../../docs/INPATIENT-CARE-IMPLEMENTATION-2026-11-05.md).

The complete frontend suite passes 378 tests; server/shared pass 520 tests against
disposable PostgreSQL databases. Both typechecks and the PWA build pass against
the canonical shared source. Initial JavaScript is 189.3 KB gzipped (300 KB budget).
The explicit PowerSync test passes real two-identity delivery, idempotent retry,
legacy/facility isolation and a synthetic backup/restore.

Run `node qa/ward-care-demo.mjs` to open a standalone synthetic demonstration at
`http://127.0.0.1:5197/qa/ward-care-demo.html`. It uses application screens, canonical
shared source when available, its own Vite cache and no environment files. The
dedicated Chrome smoke scenario `ward-care-demo-smoke.json` passes automatic
admission setup, nursing signing, result publication against a completed ward
review, reset and 320px read-only access. Live-service requests are blocked. See
[the demonstration walkthrough](../../docs/HOSPITAL-DEMO-WALKTHROUGH.md).

Browser scenarios:

- `ward-care-workflow.json`: 16 assertions; signed nursing/review decisions,
  investigations, exact-line prescriptions, actual administrations/corrections,
  signed discharge, pending work, readiness, departure and 320px read-only access.
- `ward-care-recovery.json`: 7 assertions; nurse authorship, private draft save,
  navigation/recovery, single signing and 390px editable form.
- `admissions-commands.json`: 28 assertions; admission, bed reservation, arrival,
  transfer, readiness/departure, historical chart/consultation printing, permission
  refusal and 320px allocation.
- `visit-registers-workflow.json`: 9 assertions; identified source rows, counts,
  amendment history, monthly reporting and 320px register view.

All four scenarios finish without uncaught browser exceptions. They use the real
components with synthetic in-memory records; repository tests separately exercise
real SQLite and PostgreSQL. Outputs are under the isolated validation copy's
`qa/artifacts/` directory. No environment files, real patients or application
database migrations were used.

After the owner promotes the shared contract, run normal typechecks/tests/builds.
For live local sync acceptance, with the project's disposable Docker PostgreSQL
service available, run `node --test tests/wardCare.powersync.integration.ts` from
`geneus-server` with the local test `POSTGRES_URL` configured outside chat. The test
owns only `geneus_test_*` databases and its temporary PowerSync container. Hospital
phones, printer output, disconnected browser restart and agreed forms still need
pilot acceptance before live clinical use.
