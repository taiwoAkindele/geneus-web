# Lab result templates verification

2 November 2026 · `feat/lab-result-templates`

## Result

Implemented locally across canonical shared contracts, server and web. Not deployed or committed. Consumer shared submodule contents and pointers are unchanged; ordinary builds require shared-contract promotion by the repository owner.

| Check | Result |
|---|---|
| Canonical shared suite | 178 tests passed, 11 of them new (`tests/resultTemplates.test.ts`) |
| Server-owned suite | 476 of 477 passed on local PostgreSQL before the final contract change; the one failure (the migration list in `workforceMigration.test.ts`) was fixed and re-run. **Not re-run after values gained `label` and `unit`: Docker was not running.** Server TypeScript passes. |
| Frontend regression suite | 368 tests across 52 files |
| Browser acceptance | `result-templates-workflow.json` 23, `lab-results-workflow.json` 12; regressions `catalogue` 15, `clinical-services` 13, `patients` 18, `documents` 24 — no uncaught exceptions |
| TypeScript | Web and server passed against canonical shared source |
| Lint | Not run: the web project has no ESLint configuration |

No package, lockfile, build configuration or dependency was changed. Migration `0024_result_templates.sql` and the regenerated `powersync/sync-config.yaml` must ship together, before the web release.

## Behaviors exercised

**Settings.** The Investigation catalogue has a **Settings** menu (staff holding `result_template:manage`, policy 13: facility administrators by default, assignable to lab staff) and a **Result template** column. Settings has Result templates, Result parts library and Answer lists, each paged from the local database. Create template offers a standard template (server-held, linked to matching catalogue tests, adult ranges only, with a warning to confirm them), a copy (starts as a draft) or a blank template.

**Editor.** Parts in order with required, edit and remove; shared parts link to the library; Used by refuses a test already on another template. A live preview shows ranges for a sample woman, man and child; the child shows "No range set". Ranges are rows by sex and age band; overlapping rows are refused. Each save is a server revision; a stale save is refused.

**Entering results.** A templated test is entered part by part with the patient's range and an optional flag; untemplated tests keep a free-text result; empty tests stay pending. **Preview report** shows the report as published; **Publish results** asks for confirmation. Values publish with their label, unit and the range that applied, beside a plain summary for older devices. The device runs the same shared check as the server. Images are staged encrypted on the device and uploaded before the entry.

**Doctor.** Result review, the visit record and corrections show the published report read-only, with Print report and file opening. A result the scientist flagged critically high or low makes the alert and visit banner read **Critical result** and is listed first.

## Not verified here

- Printing is checked only up to the Print report button; the print window was not exercised headlessly.
- Opening attached images and uploading their bytes were not exercised in the browser runs; the upload path is covered by type checks and the server's file check.

## Offline catalogue and settings (2 November 2026)

Adding tests (standard, CSV, single), adopting standard templates, and editing templates, shared parts and answer lists are saved on the device and checked by the server on sync (`geneus-server/tests/offlineCatalogue.test.ts`). The standard lists come from the facility's synced copy (`standard_test`, `standard_template`). A template can be edited again while an earlier edit is still waiting to sync. `result-templates-workflow.json` now runs with every network request failing and passes 23 of 23; `catalogue-workflow.json` checks the standard list with no connection. Web suite: 371 tests across 53 files.
