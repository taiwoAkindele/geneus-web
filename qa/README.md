# Clinical browser acceptance

Run `node qa/clinical-browser.mjs` from `geneus-web` with dependencies installed and Google Chrome available. Set `CHROME_PATH` to use another Chromium executable.

The script starts Vite on loopback port 5194 and headless Chrome with debugging port 9334 and a newly created temporary profile. It exercises the clinical workspace against synthetic in-memory records, captures phone/desktop screenshots and writes `artifacts/results.json`. Generated artifacts are ignored by Git. It closes its own server/browser and removes only its temporary profile.

The fixture uses the actual session provider, components, shared validation and repositories. A development-only alias supplies its synthetic facility context. It is not an application route and does not enrol a device, call production, store real patients or bypass authorization in the application. PostgreSQL and real SQLite behavior are covered by their separate tests.

Run `node qa/clinical-browser.mjs --field-help` for the encounter guidance checks.
These cover touch, hover, keyboard focus, Escape dismissal, viewport placement,
descriptions on encounter inputs, blank clinical values despite example text,
and prescription dropdown/custom-value preservation. Outputs are
`artifacts/field-help-results.json` and phone/desktop screenshots. The standard
clinical run also verifies help inside a modal and that Escape dismisses help
without closing the unsaved clinical form.

Run `node qa/design-audit-browser.mjs` against the original audit baseline to reproduce the design audit evidence.
It uses actual daily-work screens and navigation with a synthetic doctor,
two patients, three visits and one problem, all in memory. It captures desktop
(1440px), phone (390px) and selected small-phone (320px) screens, records patient
selection behavior, step skipping, radio keyboard behavior and color-token contrast.
Outputs are `artifacts/design-audit-results.json` and `artifacts/audit-*.png`.
These are observations of the existing design, including known problems; they
are not a WCAG certification, real-device performance test or clinician study.

## Rebuilt patient flow

Run `node qa/patient-flow-browser.mjs` for the current connected patient-flow
acceptance checks. It uses the same isolated Chrome/Vite setup described above.
It tests patient search, clinical search and signed revisions, legacy allergies,
concurrent demographic edits, appointment booking, the saved-visit reader, print
preview, activity, targeted amendments, structured corrections, visit progression,
no-test skipping and private draft continuity, completion, sorting/pagination on 33 visits, unavailable links,
read-only permissions, and desktop/390px/320px layouts. Results are written to
`artifacts/patient-flow-results.json`; captures use `artifacts/patient-*.png`.
The desktop capture matches the 1487 × 1058 redesign reference; the one-pixel
difference in the overview reference is documented in `../design-qa.md`.

For an interactive local review, run `node qa/patient-flow-preview-server.mjs`
and open `http://127.0.0.1:5195/qa/patient-flow.html`, then select Amaka Okoro.
This uses actual application components/repositories with synthetic in-memory
records. A reload resets all edits. It does not enrol a device or contact the
production server. Stop it with Ctrl+C. Do not use real patient information.

The browser checks exercise local writes, not live server acceptance or physical
printing. The production application continues to use its existing SQLite,
authorization and PowerSync providers; this fixture is not an application route.

## Overall product design audit

Run `node qa/overall-audit-browser.mjs` in an interactive terminal for a manual
review using the actual operational components with synthetic in-memory data.
It starts loopback Vite on port 5196 and isolated Chrome/CDP on port 9336. Enter
one JSON command per line, for example:

```json
{"role":"doctor","width":1440,"path":"/home","name":"review-home-desktop"}
{"role":"doctor","width":390,"combined":true,"path":"/home","name":"review-combined-home"}
{"path":"/sync","evaluate":"window.overallAuditAddRejection()","name":"review-rejection"}
{"finish":true}
```

Roles include `doctor`, `facility_admin`, `cashier` and `records_officer`.
Changing role/width or setting `reload:true` resets the fixture; include
`combined:true` again on each full reload when reviewing combined duties.
Actions support `click`, `label`, `fill`, `key` and `scroll`. Inspect the current
DOM/state before selecting a control. A capture writes a PNG and JSON companion
to `../docs/design-review/overall-product-2026-10-26/`; use new names to preserve
the accepted audit evidence, and open each image before assessing it.

This is a manual audit driver, not an automatic passing test suite. The accepted
45-state walkthrough and assessment live in `../docs/OVERALL-UX-EVIDENCE-2026-10-26.md`
and `../docs/OVERALL-UX-AUDIT-2026-10-26.md`. The fixture does not contact production,
enroll a device or verify bank/server delivery. Exit with `{"finish":true}` to
close its own server/browser and clean its temporary profile.

## Connected overall redesign acceptance

Run `node qa/overall-audit-browser.mjs qa/overall-redesign-commands.json` for the
35 connected assertions spanning combined duties, read-only navigation, payment
review and receipts, register validation/signing, booking, stock, reporting,
staff, devices, provider failure and handoff completion. Outputs are ignored in
`qa/artifacts/overall-redesign/`: numbered PNG/JSON pairs and `results.json`.
Run `node qa/overall-audit-browser.mjs qa/overall-redesign-visual-commands.json`
for the final small-phone/header/empty-state captures; its result is separate
in `visual-results.json`. These are synthetic local writes, not live delivery.

For interactive review without Chrome automation, run
`node qa/overall-preview-server.mjs` and open
`http://127.0.0.1:5197/qa/overall-audit.html?role=doctor&combined=1`.
The preview uses actual screens/repositories with synthetic records; reload resets
changes. Other `role` values are `cashier`, `records_officer` and `facility_admin`.
Stop the preview with Ctrl+C. Do not enter real patient information.

Run `node qa/overall-audit-browser.mjs qa/overall-redesign-appointments-commands.json`
for the 14 appointment lifecycle assertions. It writes separate
`appointment-results.json` plus captures 33 through 46, including nested-dialog
discard protection and readonly/390px/320px views. Complete or deliberately discard
unsaved forms before a full reload; browser navigation correctly prompts otherwise.
