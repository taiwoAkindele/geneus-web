# Clinical Documents verification

31 October 2026 · `feat/clinical-documents`

## Result

Implemented locally across canonical shared contracts, server and web. Not deployed. Consumer shared submodule contents and pointers are unchanged; ordinary builds require shared-contract promotion by the repository owner.

| Check | Result |
|---|---|
| Canonical shared suite | 166 tests passed |
| Server-owned suite (`tests/*.test.ts`) | 297 tests passed; disposable real PostgreSQL databases |
| Frontend regression suite | 338 tests across 45 files |
| Targeted file/reconciliation checks | 25 passed after the final failed-save cleanup change |
| Browser acceptance | 24 assertions; no uncaught exceptions |
| TypeScript | Web and server passed against canonical shared source |
| Production integration build | Passed in QA mode; actual application entry and service worker generated |
| Bundle budget | Initial JavaScript remains below 300 KiB gzip; measured build details are in workspace `.qa/documents/` |
| Patch checks | `git diff --check` passed in all three repositories |

Counts keep shared and server-owned suites separate rather than counting the server's checked-out shared tests twice. No package, lockfile, build configuration or dependency was changed. Canonical bindings and logs use workspace `.qa/provisional-registration/`, `.qa/admissions/` and `.qa/documents/`.

## Behaviors exercised

Real SQLite checks cover offline encrypted staging and immutable metadata, source-version preservation after replacement, signed originals, active inpatient restrictions, concurrent-window revision refusal, rejected-version projection, facility/device/enrollment scoping, ciphertext and checksum failures, cache pressure, transient transfer retry and permanent-refusal retention. Failed local inserts release only their newly staged unused file; an already queued original is preserved.

Real PostgreSQL checks cover exact file bytes, idempotency, immutable file IDs, facility isolation, clinical/read-only authorization, MIME-prefix/checksum/size refusal, metadata dependencies, library versions/archive, inpatient-only attachment, signed-copy evidence, competing successors, capability negotiation/CORS and exclusion of blobs from sync publication. The standard mutation ledger, audit and reconciliation remain the metadata path.

The saved browser workflow uses actual application screens/providers with synthetic records. It uploads valid generated PDFs and PNG images through file inputs into real encrypted browser IndexedDB. It exercises library upload/replace/archive, native PDF and image preview, patient-chart attachment, returned signed-copy review including guardian evidence, version history, global patient/visit/ward/bed rows, signed filtering, past/outpatient review-only behavior, clinical/read-only route boundaries, 320 px layouts, retained refused-file preview and encrypted cache survival after reload.

The first visual check found that an iframe sandbox blocked Chrome's native PDF viewer. The final preview uses the native viewer successfully; its toolbar and document text were visually inspected. Download/open-to-print controls are provided; no physical printer or target Android PDF implementation was tested.

## Reproduction and evidence

From `geneus-web`, with installed dependencies and local Chrome:

```powershell
$env:GENEUS_QA_CANONICAL_CONTRACT='1'
$env:OVERALL_AUDIT_OUTPUT='qa/artifacts/clinical-documents'
node qa/overall-audit-browser.mjs qa/documents-workflow.json
```

The [saved workflow](documents-workflow.json) writes screenshots, screen metadata and results under `qa/artifacts/clinical-documents/`. Relevant captures include `library-uploaded`, `library-pdf-preview`, `visit-review-populated`, `signature-review-form`, `visit-original-and-signed-history`, `phone-upload-form`, `phone-visit-review`, `image-preview` and `document-refusal-recovery`.

## Release boundaries

This verifies repositories, server acceptance and synthetic browser behavior separately. A deployed two-device PowerSync round trip, real-phone offline restart, backup restore and production activation remain release checks. Offline file review covers locally cached files; a file never downloaded to this device still requires connectivity. Native PDF support varies by browser; download remains available.

This delivery records review of uploaded signed evidence, rather than electronic patient signatures or legally complete consent. Patient-portal sending and structured operative/recovery documentation remain later scope. Release order and storage/access details are in [Clinical Documents](../../docs/CLINICAL-DOCUMENTS.md): promote shared contract, deploy server/migration **0022**, deploy streams, release PWA.
