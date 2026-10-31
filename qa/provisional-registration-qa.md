# Provisional registration and later identification

31 October 2026 · `feat/core-patient-journey`

## Reviewable behavior

The existing registration screen has an explicit emergency option. It creates a distinct temporary label and stable patient ID without requiring invented name, sex, address or age answers. A reason is required; known details may be recorded. The chart marks the identity as provisional, displays missing demographics accurately, and permits authorised clinical work immediately.

Identify patient asks for the person's name, ordinary registration details and an explanation of how identity became known. It retains the patient ID, original registration circumstances and earlier care. Author, time and the exact demographic snapshot reviewed are retained. Local SQLite and the server stop identification if another worker changed any identity detail, including one left untouched in the submitted form. Completed identification history cannot be overwritten.

Unreviewed possible matches stop completion and open the existing patient-identity comparison workflow with the two records selected. Confirmed same-person or different-person decisions allow identification to proceed; pending proposals do not waive review. Authorised records staff retain the existing online preview/confirmation path; other authorised reviewers can flag a comparison locally. Temporary labels are excluded from automated demographic matching. Matching never merges care silently.

## Validation boundary

Checks use the uncommitted canonical `geneus-shared` source through temporary validation bindings under `.qa/provisional-registration`. The web/server shared submodules have not been edited or advanced. **Ordinary builds and activation require shared-contract promotion first.** This is not a deployment.

- The shared contract suite passed 148 tests.
- The server suite passed 279 tests against disposable real PostgreSQL databases, including migration 0020, patient upload/identification, immutable history, concurrent demographic edits, legacy migration and existing identity linking.
- The complete frontend regression suite passed 322 tests across 43 files.
- Final targeted checks passed all 62 identity/matching/real-SQLite tests, including adding and clearing known provisional details without completing identification, and respecting completed identity reviews.
- Web and server TypeScript checks and the production integration build passed against the canonical contract, rather than the still-pinned shared submodules. Initial JavaScript is 159.4 KB gzipped against the 300 KB budget.
- All 14 provisional browser assertions passed with no uncaught exceptions, including signed care retained after identification, disconnected operation and the 320px identification form.
- All 14 original registration-recovery browser assertions also passed against schema 5, covering both ordinary registration steps, reload, encryption, staff isolation and discard. Results are under `qa/artifacts/registration-recovery-schema5-2026-10-31/`.
- [Browser commands](provisional-registration-commands.json) exercise real screens with synthetic data: emergency registration, a signed observation, later identification with retained care, possible-match review and 320px forms. The browser network is disabled during registration, care and identification after its application modules load.

The development preview does not have the production service worker. Its two lazy write/care modules are explicitly loaded before disconnecting, modelling an already-cached app. This does not prove a physical device can cold-start offline. The synthetic browser repository is in memory; PostgreSQL acceptance and SQLite persistence are covered separately.

Machine-readable browser results and inspected captures are generated under `qa/artifacts/provisional-registration-2026-10-31/`. Full suite output and temporary canonical bindings are under the workspace `.qa/provisional-registration/`. Synthetic screenshots show a temporary identity and later attribution; no production records are used.

## Promotion and release order

1. Review and commit only this feature's canonical shared changes, preserving the separate pre-existing `SCHEMA.md` edit. Update both consumers' local shared-submodule checkouts to that commit. Repository rules reserve commits for explicit user approval; no commit, pull or push has been performed by this task.
2. Recheck ordinary web/server typechecks and builds with those pointers. The regular test commands then use the same contract without temporary bindings.
3. Deploy the server with migration 0020, then the regenerated PowerSync configuration, before releasing the schema-5 PWA. Do not point new streams at an unmigrated database. Existing schema-4 facility records/writers remain supported; unknown future schemas are refused.
4. Validate live upload/download on a receiving device, actual offline restart/power interruption, low-end Android behavior and the intended printer. Those release checks remain outstanding.

The signed `patient_registration` claim is issued to schema-5 clients. Provisional patients and referrals lacking sex are filtered away from older clients that assume complete demographics. Identified legacy records keep their original IDs and ordinary validation rules. Existing identity linking preserves both original records and their clinical references.
