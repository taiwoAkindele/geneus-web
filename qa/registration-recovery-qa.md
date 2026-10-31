# Registration recovery: first core journey slice

31 October 2026 · Branch: `feat/core-patient-journey`

## Delivered behavior

- Both registration steps recover unfinished work after reload through an explicit Resume or Discard choice.
- The existing encrypted device storage now scopes drafts to staff, facility and device enrollment. New registrations and individual patient edits retain separate drafts.
- Persistence status and retry are visible. Unreadable or unsupported recovery data is kept and cannot be replaced by an empty form. Facility switching waits for pending persistence and refuses unreadable recovery state.
- Successful local registration clears its own draft and opens the patient chart. Failed draft removal does not report the saved patient as an unsuccessful registration.
- Existing staff-only drafts migrate without deleting colleagues' work.

## Verification

- Frontend suite: 316 tests passed across 43 files, including ten recovery checks covering encryption, restart, scope isolation, migration, separate patient drafts, discard, write failure/retry and unreadable formats.
- TypeScript checking and production build passed.
- The isolated Chrome journey in [registration-recovery-commands.json](registration-recovery-commands.json) passed all assertions with no uncaught exceptions. It enters both form steps, reloads and resumes each step, saves exactly one synthetic patient and opens the chart, checks another worker cannot recover the draft, discards and reloads, and checks the recovery screen at 320px.
- Desktop and phone captures were inspected. The recovery actions remain visible and fit the phone width. Captures and machine-readable results are generated locally under `qa/artifacts/registration-recovery-2026-10-30/`.

Reproduce from `geneus-web` with `node qa/overall-audit-browser.mjs qa/registration-recovery-commands.json`. The harness uses an isolated Chrome profile and synthetic data; it does not access a production device.

## Remaining acceptance

The browser fixture exercises real screen and storage code against an in-memory synthetic patient repository. This does not establish live server acceptance, receiving-device sync, physical power-loss recovery, or performance on a low-end Android phone. Those release checks remain outstanding. Network disconnection was not simulated in this browser run.

Provisional emergency registration, later identification, and the remaining clinical journey are subsequent slices. The current patient contract still requires known demographics; this change does not invent values to bypass it.
