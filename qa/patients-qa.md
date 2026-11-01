# Patients directory and medical-history access verification

1 November 2026 · `feat/patients-directory-access`

## Result

Implemented locally across canonical shared contracts, server and web. Not deployed. Consumer shared submodule contents and pointers are unchanged; ordinary builds require shared-contract promotion by the repository owner.

| Check | Result |
|---|---|
| Canonical shared suite | 167 tests passed |
| Server-owned suite (`tests/*.test.ts`) | 298 tests passed; disposable real PostgreSQL databases |
| Frontend regression suite | 341 tests across 46 files |
| Targeted directory/read-boundary checks | 50 passed (`patientDirectory`, real SQLite) |
| Browser acceptance | 18 assertions; no uncaught exceptions |
| TypeScript | Web and server passed against canonical shared source |
| Production integration build | Passed in QA mode; actual application entry and service worker generated |
| Bundle budget | Initial JavaScript remains below 300 KiB gzip; measured build details are in workspace `.qa/patients/` |
| Patch checks | `git diff --check` passed in all three repositories |

Counts keep shared and server-owned suites separate rather than counting the server's checked-out shared tests twice. No package, lockfile, build configuration or dependency was changed. Logs use workspace `.qa/patients/`.

## Behaviors exercised

**One Patients screen.** Consultation & nursing and Find patient are merged into **Patients** (`/patients/search`), keeping All | Inpatients | Outpatients. All includes registered patients with no visit. Search covers name, phone, Patient ID and old folder number. Patient and **Last visit date** are separate columns; one row per patient shows the active admission or latest visit. The former consultation list (`/encounters`) redirects to Patients. Laboratory and Pharmacy keep their own work queues.

**Details before history.** A patient opens a details view first: personal details, admission status, ward, bed and attending/responsible staff. Front Desk keeps booking and demographic editing, and sees no diagnoses, allergies or notes; the Reason / diagnosis column is hidden.

**Explicit medical-history permission.** New `patient_chart:read` (**View patient medical history**, policy v12). Clinical roles, facility administrators, laboratory and pharmacy hold it by default; records officers and cashiers do not, but an administrator may grant it as an additional permission. It is a read grant: read-only staff keep it, and it never permits writing care. With it, a **View medical history** button appears in details and opens the existing chart. Without it, direct chart and clinical-visit links show "Medical history access required". Revoking the grant closes an already open chart. Clinical documents now use the same permission.

Real SQLite checks cover the directory projection (patients without visits, last-visit selection while an older inpatient stay remains active, folder/phone search) and the read boundary. Real PostgreSQL checks cover granting, refusing and revoking `patient_chart:read` through staff updates, and migration **0023**, which extends the staff additional-permission constraint.

The saved browser workflow uses actual application screens/providers with synthetic records for Front Desk (records officer) and Clinical (doctor) users, including 320 px phone layouts of the directory and details.

## Reproduction and evidence

From `geneus-web`, with installed dependencies and local Chrome:

```powershell
$env:GENEUS_QA_CANONICAL_CONTRACT='1'
$env:OVERALL_AUDIT_OUTPUT='qa/artifacts/patients-directory'
node qa/overall-audit-browser.mjs qa/patients-workflow.json
```

The [saved workflow](patients-workflow.json) writes screenshots, screen metadata and results under `qa/artifacts/patients-directory/`. Captures are `front-desk-patients`, `front-desk-patient-details`, `front-desk-chart-denied`, `clinical-patients`, `clinical-patient-details`, `authorised-medical-history`, `phone-patients` and `phone-patient-details`.

## Release boundaries

This verifies repositories, server acceptance and synthetic browser behavior separately. A deployed two-device PowerSync round trip, real-phone offline restart and production activation remain release checks. Release order: promote shared contract (policy v12), deploy server/migration **0023**, release PWA.

The billing action "Find patient bill" is intentionally unchanged; it selects a bill, not the patient directory.
