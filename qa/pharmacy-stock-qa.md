# Pharmacy, stock and billing validation — 8 November 2026

Implemented on `feat/pharmacy-stock-billing` in web, server and canonical shared.
The consumer shared submodules remain at their original inpatient-care revision.
Validation uses isolated copies under `.qa/inpatient-care`, populated from the
actual consumer sources and canonical shared contract. No dependencies changed,
no commits or remote operations were performed, and no application database was
migrated. PostgreSQL checks use disposable `geneus_test_*` databases.

## Automated checks

- Frontend: **392 tests passed** across 57 files, including ten pharmacy repository
  checks against real SQLite.
- Server/shared: **533 tests passed**, including scratch PostgreSQL migrations,
  pharmacy uploads, competing updates, rollback and discharge fulfilment.
- Both TypeScript checks pass against canonical shared contracts.
- A real local PowerSync round trip passed between two enrolled devices: the
  supply, its charge and movement arrived, retry created no duplicates, legacy
  clients excluded quantified entries, and an outside facility received none.
  A `pg_dump`/`pg_restore` drill restored every synthetic source table with matching
  row counts.

Contract and persistence checks cover partial supplies/top-ups, exact source and
line identity, rejected stale predecessors, excessive quantities, explicit units,
outside supplies, one-time later pricing without another stock movement, returns
and credit limits, price exemptions, paid-account credit without invented payments,
read-only/capability refusals, rejected-parent projections, and exact retry recovery.
Server checks use an actual `pharmacy_staff` account without manual stock/charge
permissions. A companion insertion failure rolls back the clinical entry and all
effects; forged financial companions fail. A legacy dispense cannot follow a new
quantity-tracked supply. A pharmacist can fulfil a signed discharge prescription
after departure without creating another visit.

## Browser scenarios

Run from the isolated web copy with installed headless Chrome and the synthetic
`overall-audit.html` fixture:

```powershell
$env:OVERALL_AUDIT_OUTPUT='qa/artifacts/pharmacy'
node qa/overall-audit-browser.mjs qa/pharmacy-stock-workflow.json
node qa/overall-audit-browser.mjs qa/pharmacy-recovery-workflow.json
node qa/overall-audit-browser.mjs qa/pharmacy-discharge-workflow.json
node qa/overall-audit-browser.mjs qa/pharmacy-refusal-workflow.json
```

The scenarios exercise the actual application screens and repositories with
synthetic local records. All **24 pharmacy assertions** pass. They check giving
5 then 15 of 20 tablets, one bill and
stock movement per supply, returning two tablets with capped credit/restock,
untracked/unpriced supply, the Needs a price list, later billing without a second
stock deduction, private draft restore, a blank next top-up, an excessive-quantity
message, read-only access and 320px forms. Discharge medicines enter the ordinary
Pharmacy queue and open their exact signed summary source.
Refused full supplies remain in the work list; the medicine screen explains the
refusal and blocks another supply/return until staff review what was handed over.

Screenshots and machine-readable observations are saved under the isolated web
copy's `qa/artifacts/pharmacy`. The existing ward and clinical-services scenarios
also pass **37 regression assertions** for the reused encounters and service queues,
with no uncaught browser exceptions.

The validation-mode Vite/PWA build and initial-JavaScript budget check pass.
All 656 source/test files in the validation copies match the working sources,
and the generated PowerSync configuration has been copied back to the server.

## Deployment and acceptance

The owner must promote the canonical shared changes, update both consumer
submodule pointers, apply server migration **0029**, deploy the generated sync
configuration, then release the client. The client enables the new flow only
after pharmacy capability negotiation. This working branch has not been deployed.

Hospital staff acceptance and physical target-phone testing are still required.
Stock balances are recorded estimates when devices work offline; competing line
updates require explicit reconciliation. No automatic pack conversion, batch/expiry
allocation, dose scheduling or execution of money refunds is included. Existing
manual medicine bills are warned about, not silently reconciled or deleted.

See [implementation and operational detail](../../docs/PHARMACY-STOCK-BILLING-2026-11-08.md).
