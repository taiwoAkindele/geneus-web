# Programme register starters — 4 November 2026

The Registers library adds Antenatal, Immunisation and Family planning alongside
General outpatient and Malaria. Each can be published through Add register using
the existing register configuration permission, then configured independently.
Published field identities and historic completion entries retain their existing
versioning behavior.

The programme starters select visits by their recorded type. Each row represents
one visit, and staff record additional information from Programme details in that
visit or Complete/Edit in the register. Patient details, vitals, tests, medicines
and injections are read from the clinical record. Optional fields start blank;
method history and other affirmative/negative answers are not guessed.

These are original operational starting points. They do not implement pregnancy
episodes, dose-level source records, vaccine schedules, official programme forms,
coverage/cohort indicators, submitted-report revisions or approved reference packs.
Monthly reporting counts visits, so a visit with several vaccines counts once.

## Validation results

- Frontend typecheck and all 372 existing unit tests pass (53 files).
- The validation-mode Vite/PWA build passes with environment-file loading disabled.
  Initial JavaScript is 185.9 KB gzip against the 300 KB budget. This is a local
  compilation check, not a production configuration or deployment check.
- All 18 new programme-starter browser assertions and all 18 existing register /
  visit-programme assertions pass, with no uncaught browser exceptions.
- Desktop and 320px detail-sheet captures were inspected. Results and screenshots
  are in the ignored `qa/artifacts/programme-starters`, `visit-registers` and
  `visit-programme` directories.
- The first browser startup timed out before the application was ready; the repeat
  completed all 18 assertions. The runner retains its existing readiness timeout.
- The backend and shared-contract working trees are unchanged. PostgreSQL and
  live PowerSync validation were not rerun for this frontend-only addition.

Run from `geneus-web`, sequentially because the browser driver uses fixed ports:

```powershell
$env:OVERALL_AUDIT_OUTPUT = 'qa/artifacts/programme-starters'
node qa/overall-audit-browser.mjs qa/programme-starters-workflow.json
$env:OVERALL_AUDIT_OUTPUT = 'qa/artifacts/visit-registers'
node qa/overall-audit-browser.mjs qa/visit-registers-workflow.json
$env:OVERALL_AUDIT_OUTPUT = 'qa/artifacts/visit-programme'
node qa/overall-audit-browser.mjs qa/visit-programme-workflow.json
```

The new acceptance scenario publishes all three actual starters through the UI,
opens their source visits, signs programme details, checks register inclusion and
source facts, updates a completion while preserving earlier entries, and verifies
monthly visit counts. It also checks blank inputs, multiple injections in one row,
installation permissions, and 320px register and detail-sheet layouts. Existing
scenarios cover starting an antenatal visit, legacy visits, builder configuration,
and General outpatient/Malaria behavior.

These browser scenarios use synthetic in-memory records with the actual components,
permissions, repositories and shared validation. They do not establish real SQLite
durability, PostgreSQL acceptance, a PowerSync round trip, clinical acceptance or
target-phone performance. Existing migrations 0026/0027 and matching streams must
be present before releasing the visit/register checkpoint. No additional migration
or shared-contract promotion is introduced by these templates.
