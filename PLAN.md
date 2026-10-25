# Geneus Health — Frontend Plan (`geneus-web`)

> The PWA. This is the make-or-break repo: it holds the offline replica, the entire
> clinical UX, and the shift-based session. Derived from and subordinate to the root
> [../PLAN.md](../PLAN.md) and the source of truth [../PRODUCT.md](../PRODUCT.md).
> If anything here conflicts with those, they win.

**Version:** 1.0 (Draft) · **Owner:** Solo founder-builder

### Outpatient longitudinal extension (25 October 2026)

The patient profile and encounter workspace now include versioned clinical records:
problems, structured history, medications, allergies, care-plan reviews and initial
specialty assessments. The local `clinical_events` table follows the shared contract
and existing repository/PowerSync write boundary. Encounter screens support repeat
observations, progress notes, multiple diagnoses, separate prescription fields and
structured corrections. Legacy allergies remain visible until reviewed; combined
alerts also feed the appointment worklist. Browser acceptance uses synthetic local
records under `qa/`, never a production device or application route.

Release requires migration 0013, the regenerated sync configuration and matching
shared-contract promotion. See [implementation and remaining depth](../docs/EMR-OUTPATIENT-IMPLEMENTATION.md).

---

## 0. What this repo is (and is not)

- **Is:** the installable Progressive Web App — a *full offline replica app*, not a thin
  client. Core clinical flows (register, visit, registers, search, handoff, shift login)
  run entirely against a **local SQLite database** (PowerSync's client) that PowerSync
  keeps in sync with the facility's slice of PostgreSQL. Local writes are authorised and
  validated on the device before they are stored; PowerSync uploads them to
  `geneus-server`, which authorises them again before PostgreSQL.
- **Is not:** the API server or the PostgreSQL/reporting layer — those live in
  `geneus-server`. `geneus-web` calls `geneus-server` directly only for what must happen
  online: facility registration, device enrollment/revocation, the sync token, and the
  upload of queued writes (both made by the PowerSync connector, not by screens).
- **Shared contract:** document shapes, referral payload, roster schema, enrollment record,
  and API types come from the shared package (per root plan §9) — **never redefined here.**

## 1. Non-negotiable constraints (inherited)

1. **Cheapest Android is the floor** — sub-$100, ~1–2 GB RAM, 2G/3G, shared between staff.
   Every dependency and screen is judged on the *actual worst phone*, not an emulator.
2. **Offline is the default code path** — every write hits local SQLite first and returns
   instantly; the UI never waits on the network; there is no "offline mode" toggle.
3. **Usable in <60 min with no manual** (PRD §8) — a release gate, re-tested each milestone.
4. **Solo builder** — favour few, boring, well-understood dependencies over cleverness;
   lean on tests as the substitute for a second pair of eyes.

## 2. Stack (decided — keep it small)

| Concern | Choice | Why (for cheap Android + solo) |
| --- | --- | --- |
| Language | **TypeScript** | Shared contract types; catch schema drift at compile time |
| UI framework | **React 18** | Ubiquitous, hireable later, huge ecosystem |
| Build/dev | **Vite** | Fast dev loop; easy code-splitting; small output |
| PWA/service worker | **vite-plugin-pwa (Workbox)** | Offline app shell + precache with little config |
| Local datastore + sync | **PowerSync (`@powersync/web`) over SQLite (wa-sqlite WASM)** | Facility-scoped Sync Streams from PostgreSQL; upload queue, retries and reconnects handled by the SDK |
| Local authorization | **`src/auth/authorization.ts`** over the shared permission matrix | Refuses a write before SQLite; the server re-decides on upload |
| Routing | **React Router** | Standard; enables route-based code splitting |
| Session/UI state | **Zustand** | Tiny; avoids Redux weight on low-end devices |
| Data → UI binding | **Custom hooks over PowerSync's change events** | Live, reactive queries without a heavy data lib |
| Forms | **React Hook Form** | Lightweight, uncontrolled inputs = fewer re-renders |
| Validation | **Zod** (from shared package) | One schema validates forms *and* documents pre-write |
| Styling | **Tailwind CSS** (purged) | Tiny shipped CSS; fast to build a consistent large-touch kit |
| i18n | **react-i18next**, lazy-loaded locales | English + one local language at launch; more later |
| Icons | **Inline SVG only** | No icon fonts; no extra network/parse cost |

> **Rule of thumb:** before adding any dependency, check its gzipped size and whether it
> parses acceptably on the target phone. Prefer writing 30 lines over importing 300 KB.

## 3. Application architecture (layers)

```
┌─────────────────────────────────────────────┐
│ UI layer — screens, large-touch component kit │  React + Tailwind
├─────────────────────────────────────────────┤
│ Session/auth layer — offline shift login,     │  Zustand + local roster
│   roster reminders, manual sign-out, enrollment   │
├─────────────────────────────────────────────┤
│ Authorization — AuthorizationContext from the  │  shared permission matrix + offline policy
│   session; assertAllowed before every write    │
├─────────────────────────────────────────────┤
│ Data-access layer — typed repositories over   │  SQLite + Zod + shared types
│   SQLite; live queries via change events      │
├─────────────────────────────────────────────┤
│ Sync — PowerSync client: facility-scoped       │  connector → /sync/token, /sync/upload
│   download, upload queue, retries, status      │
├─────────────────────────────────────────────┤
│ SQLite (wa-sqlite in a worker, IndexedDB VFS)  │  the on-device replica
└─────────────────────────────────────────────┘
```

- **The data-access layer is the only thing that touches SQLite.** Screens never run SQL —
  they use typed repositories (`src/data/repos/*`) so record shape, mapping and validation
  live in one place. `src/data/db.ts` is the single write path.
- **Every write is authorised, then validated, then stored:** `insertRecord`/`updateRecord`
  call `assertAllowed(context, permission)` first (a refusal throws and nothing is written —
  so PowerSync has nothing to upload), then `parseDocument`. The server repeats both checks
  on upload from its own facts; the local check exists so offline behaviour is deterministic.
- **Live UI** comes from PowerSync's change events (`onChangeWithCallback`), so a record
  edited in one tab/unit — or arriving by sync — updates everywhere, online or off.
- **Wire mapping** (`src/data/rows.ts`, `contractShape.ts`): SQLite holds booleans as 1/0 and
  lists/objects as JSON text; the schema and both mapping directions are derived from the
  contract's Zod shapes, never hand-copied.
- **The database opens lazily.** An unenrolled device holds no credential and never loads
  the PowerSync client; `DataProvider` opens SQLite and connects only once a credential exists.

## 4. Cheap-Android performance budget (tracked like a test)

- **Initial JS (gzipped) ≤ 300 KB** (raised from 180 KB for the PowerSync migration; measured
  96.6 KB after it — the PowerSync client, ~65 KB gz across its chunks, loads only once the
  device is enrolled). Measure with `vite build` + gzip of the entry and its
  `modulepreload`s; fail CI if exceeded.
- **The SQLite WASM is a one-time runtime asset, not initial JS, and is not hidden from the
  budget:** the IndexedDB VFS build is 2.2 MB raw / 765 KB gzipped, fetched once per device
  and cached. On a 2G link that is a first-install cost of a minute or two, never repeated.
  If field measurement shows it bites, `OPFSCoopSyncVFS` uses the synchronous build (1.0 MB /
  500 KB gz) — a measured decision, not a default.
- **Route-based code splitting** — registration, visits, each register, dashboard, admin all
  lazy-loaded. A CHEW who only registers patients never downloads the dashboard code.
- **Virtualise long lists** (patient search results, register history) — never render
  thousands of rows.
- **Bounded local replica** — the Sync Streams deliver one facility's data; bounding it further
  to active/recent records (root §2.2) is a stream-definition change on the server.
- **Few re-renders** — uncontrolled forms, memoised list rows, avoid global re-render storms.
- **Test on the real phone continuously**, not just Lighthouse — the M0 device (root §8) is
  the perf oracle.

## 5. Repository structure (first pass)

```
geneus-web/
  src/
    app/            # app shell, routing, providers, service-worker registration
    ui/             # large-touch component kit (Button, Field, Card, Banner, Sheet…)
    session/        # offline PIN login, roster eval, manual sign-out, enrollment
    auth/           # AuthorizationContext, assertAllowed — the rule before every write
    data/
      database.ts   # the PowerSync database, opened lazily once a credential exists
      schema.ts     # SQLite schema derived from the contract (tables.ts names the tables)
      db.ts         # the single write path: authorise → validate → SQLite; live change events
      rows.ts       # SQLite ↔ contract value mapping (contractShape.ts reads the Zod kinds)
      connector.ts  # PowerSync connector: /sync/token and /sync/upload as the device
      sync.ts       # start sync, first-sync wait, de-enrollment (clear + restart)
      deviceCredential.ts  # the device credential and last server contact
      repos/        # patients, staff/roster, registers, appointments, facility
      hooks/        # useLiveQuery, useSyncStatus
    features/
      registration/ # NASADOR form, dedup prompt, Patient ID display
      visit/        # guided visit notes, unit handoff
      registers/    # data-driven register builder, logbook & entry forms (PRD §9.4)
      search/       # patient search + duplicate check
      referral/     # outbound referral, incoming panel, lifecycle, printable note
      dashboard/    # "This Month at a Glance", commodity request
      stock/        # basic stock tracker
      admin/        # roster upload, unit setup, device enrollment (facility admin)
    i18n/           # locale bundles (lazy)
    lib/            # small utilities (id generation, clock, print)
  tests/
    offline/        # the standing offline + conflict suite (root §4.1)
  public/           # manifest, icons
```

## 6. Feature build order (mirrors root milestones M0–M3)

Frontend work is sequenced to the root roadmap. Each item ships only when it works
**offline on the target phone**.

### FE-M0 — Foundations
- Vite + React + TS + Tailwind skeleton; installable PWA shell that **loads fully offline**.
- SQLite + PowerSync + one repo + `useLiveQuery` hook; prove a **sync round-trip** and a
  **deliberately-created conflict** surfaced as a `sync_rejection` in the UI.
- Encryption-at-rest wrapper for sensitive fields (key management resolved with the auth
  design — see §7 open item).
- The large-touch component kit v0 (Button, Field, Banner, Card) + the **sync-state
  indicator** shell.

### FE-M1 — Single-facility core (the milestone that matters)
- **Offline staff login** — scheduled or 24-hour access, overnight/full-day rosters,
  informational reminders and manual sign-out; staff inactivity expiry and
  enrollment-gated offline replica (root §4.3/§4.3c).
- **Registration** — NASADOR form, offline dedup prompt ("Is this the same person?"),
  Patient ID generation `FACILITYCODE-SEQ-XX` (root §4.2), legacy paper-ref field.
- **Search** — fast local search with duplicate check.
- **Guided visit notes** + **unit handoff** (instruction travels with patient, PRD §9.7).
- **Basic stock tracker.**
- **Records-officer reconcile queue** UI for conflicts (root §4.1).
- **Gate:** a real CHEW goes register→treat in <60 min, no manual; full paper-free offline
  day; clean next-morning sync.

### FE-M2 — Registers + facility dashboard
- **Data-driven register builder** (PRD §9.4): a facility configures each register at
  runtime — typed fields, live preview, publish — and staff record append-only entries in
  the resulting logbook. The six statutory programme registers (OPD, Immunisation, FP, ANC,
  TB, Malaria) ship as **seeded definitions**, not hard-coded forms.
  - **No migration on register creation.** A register is a `register_definition` document;
    an entry is a `register_entry` with `values` keyed by field id (shared contract §9).
    Field ids are stable; a published edit writes a **new version** (old entries stay pinned
    to the version they used); per-field rules are enforced by definition-driven
    `validateRegisterEntry` before write, not a static schema per register.
  - **Reporting** (in `geneus-server`) stores entry `values` as **JSONB** so new registers
    and fields need no downstream Postgres migration either.
- **Facility vs Outreach/Mobile** tag on entries (PRD §9.5).
- Maternal & child health tracking (ANC visits, immunisation schedule + reminders).
- **"This Month at a Glance"** + commodity-request view + printable monthly summary (PRD §9.6).

### FE-M3 — Referral & incoming panel
- Outbound referral form (Tier-1 payload) + **printable referral note** (always prints,
  PRD §11.1).
- Persistent **Incoming Referrals** panel with honest status (`Alert Sent` /
  `Alert Pending — Will Send Once Connected`).
- Referral **lifecycle** UI (Sent→Seen→Arrived→Closed) + "Not Yet Arrived" flag-back.
- Hospital-side history lookup screens (as the hospital layer comes online).

> Government dashboards (Phase 3) are mostly a `geneus-server` + Postgres concern; `geneus-web`
> only renders read-only dashboard views later.

## 7. Cross-cutting frontend concerns

- **Offline-first UX patterns:** optimistic writes, never a blocking spinner on save, the
  persistent sync-state indicator ("Up to date" / "3 changes waiting" / "Offline — last
  synced 2 days ago"), pending-change badges, arrival notifications (root §4.3b).
- **Accessibility & low-literacy (PRD §13):** large tap targets, high contrast (sunlight +
  dim rooms), local-language labels, optional voice-guided help, forgiving error UX. Built in
  from FE-M0, not retrofitted.
- **Print:** referral note and monthly summary must print cleanly from a cheap browser —
  design print stylesheets early.
- **Session security:** encrypted sensitive fields at rest; sign-out wipes on-screen state;
  un-enrolled devices keep **nothing** durable and wipe session data at logout (root §4.3c).
- **Encryption at rest (decided, October 2026)** — the whole SQLite replica is encrypted
  (ChaCha20, PowerSync's `encryptionKey`) with a random key; that key, the device credential
  and the 6-digit PIN records are stored AES-GCM-encrypted under a non-extractable WebCrypto
  **device key** kept in IndexedDB (`src/lib/secureStorage.ts`). The key is device-bound, not
  shift-bound, because background sync must run with nobody signed in (root §4.3a); a PIN
  gates the screen, not the data, so cracking one opens nothing. De-enrollment destroys the
  device key. Not covered: a rooted phone whose browser profile is copied whole (the key is
  not hardware-backed on Android), and code running inside the app.

## 8. Testing strategy (solo builder's safety net)

- **The offline + conflict suite is the flagship** (root §4.1): simulate multi-device edits,
  7 days offline, reconnect → assert zero lost writes and every conflict visibly queued. Runs
  before every release.
- **Authorization and write-boundary tests (Vitest, `npm test`)** — a denied write reaches
  no SQLite statement; the connector sends the contract's shapes and completes only what the
  server acknowledged; the row mapping round-trips PowerSync's wire types.
- **Schema/validation tests** — every repository rejects malformed records via the shared Zod
  schema (guards the 7-day-late-failure risk).
- **Component tests** for the clinical forms (registration, visit, each register) — correct
  data captured, dedup prompt fires, Patient ID format holds.
- **Perf budget check in CI** — bundle-size ceiling (§4) fails the build if exceeded.
- **Manual smoke on the real target phone** each milestone — the only true test of the
  <60-min and low-end-perf goals.

## Billing progress (PRD §9.13, October 2026)

- The shared billing contract is consumed by both apps; the server migration and upload
  rules are implemented. PostgreSQL billing tests still need the Docker-backed test stack.
- **Frontend foundation implemented:** local fee/charge/payment tables and lookup indexes,
  cashier role labels and staff invitation, fee schedule at `/admin/fees`, automatic
  exemption editor, and typed billing repositories. Writes use the same authorization
  and contract-validation boundary as clinical records. Prices and receipts use exact
  minor units; amounts respect the database integer limit. Balances stay per currency,
  and accepted overpayments remain visible as credit. Reversals add history.
- **Next:** booking raises fees with its appointment; nursing saves vitals to open the
  linked encounter, with an attributed "See now — collect later" reason when needed.
  Then cashier queue/payment UI, receipts, daily cash and outstanding-balance reports.
  Payment confirmation is derived from charges and payments; it is never an appointment
  status edit. Free facilities have nothing to pay. Insurance follows billing.
- Real SQLite tests cover persistence, permissions, exemptions, part payments, waivers,
  reversals, overpayments and allocation checks. Field proof on the target phone remains
  required before launch.

## Frontend UX audit implementation (October 2026)

The approved UX audit permits changes to phone navigation and workflow behaviour that
supersede the earlier frozen-mobile rule for these specific fixes. Clinical forms keep
their section-card design; structured desktop worklists use tables.

- Registration keeps an in-memory draft across both steps and browser Back. It clears
  after saving, choosing an existing duplicate, or changing signed-in staff. Sex is an
  explicit choice. Form values are never copied into browser history. A cold reload
  does not restore an unfinished registration.
- The phone dock stays visible throughout signed-in work, with profile/sign-out,
  role-appropriate navigation, and a persistent shift warning. Shift extensions report
  success or refusal; staff without that permission are directed to a supervisor.
- Appointment groups use local calendar dates, not the stored pending/scheduled flag.
  Today, Overdue, Upcoming and Completed remain derived views. New encounters can retain
  the booking's existing appointmentId; a saved closing step completes that linked view.
- Home counts and notifications use the local database and PowerSync. Prototype stock,
  referral and monthly-report routes show a clear unavailable message, never sample
  operational data. The cashier workspace explains that booking/payment integration is
  still pending.
- Desktop patients use a sortable table and adjacent record preview. Appointments,
  encounters, unit queues, staff and fees use tables; register entries retain a desktop
  table and gain expandable phone summaries. Table pages render at most 25 rows.
- Actions follow the shared permission names. Clinical steps are view-only for staff
  without encounter:record. Native modal dialogs contain focus, support Escape, restore
  focus and prevent background interaction. Fee exemptions have editable optional
  presets and currency choices have readable names.
- Live queries refresh when their inputs change and ignore obsolete async results;
  choosing a different patient or unit must never show a previous selection's response.

Validation: 171 tests pass across 22 files; TypeScript, production build, diff checks,
and the 300 KB initial-JavaScript budget pass (109.7 KB gzipped). Sixteen isolated
Chrome walkthrough checks pass on phone and desktop layouts using synthetic records,
including real PIN handover, stale history, duplicate checks and 65-patient pagination.
Target-phone usability and full offline/reconnect field testing remain outstanding.

## 9. Immediate next steps

1. ~~Add vite-plugin-pwa so the shell — and the SQLite WASM — are precached~~ (done
   October 2026: the shell, every chunk and the encrypted SQLite WASM precache on first
   visit, ~1.3 MB gz; updates take over on the next cold start). Still to do: confirm the
   install and a fully offline cold start on the **target phone**.
2. Run the real flow on that phone against the compose stack: register a facility, work a
   day offline, reconnect; watch the Sync Center and the reconcile queue (this is the field
   proof of the migration; the connector and the stack are proven by tests, the browser
   wiring is not yet).
3. Configure each hospital's Paystack account and department payment points, then
   prove bank-transfer reconciliation with provider test notifications before live use.
   Stock, referrals and monthly reporting remain separate future work.
4. Measure the encrypted replica on the target phone (§7): first sync, a register list, sign-in
   time with 100,000-round PBKDF2.

## Staff editing and combined duties (October 2026)

- Staff → Edit staff updates the name, primary role, additional roles, extra action
  permissions and read-only/read-write access. The same form adds new staff.
- Effective access is the union of assigned-role permissions and additional grants.
  Read-only suppresses every mutation. Primary role remains the clinical attribution;
  old clinical entries, staff IDs, PINs and roster records are preserved.
- Name changes require staff:manage; role/access changes require staff:permission.
  Creating staff requires both. Every required permission is checked before writing.
- Navigation and sign-in labels reflect combined duties. An additional administrator
  role gets the same idle-limited admin login as a primary administrator.
- PIN approval requires sufficient access for the target account; a name-management
  delegate cannot take over an administrator. The last working administrator cannot
  be demoted, made read-only or deactivated. The server enforces the final decision.
- Requires the matching geneus-shared contract (policy v5) and server migration 0009.
  Deploy the server and regenerated sync streams before the new frontend. Existing
  single-role staff remain valid; optional access arrays need no schema-version bump.

Validation for combined staff access: 178 frontend tests and 270 server/shared
tests pass, including real SQLite persistence and PostgreSQL authorization,
migration and concurrency checks. Seven isolated Chrome checks pass across phone
and desktop layouts, with no browser exceptions. Both typechecks, the production
frontend build, diff checks and the bundle budget pass (110.3 KB initial JS gzipped).
The validated copies match the authoritative source files; consumer submodules
remain pinned until the owner commits the contract and promotes both pointers.

## Flexible staff sign-in and manual sign-out (October 2026)

The user's updated policy supersedes roster-end logout in the earlier design.
Optional staff.loginAccess selects scheduled fresh sign-in or ongoing 24-hour
sign-in without a roster. Existing staff default to scheduled access. This field
requires staff:permission to edit, not merely permission to edit names or shifts.

A successful staff session survives shift end, midnight and reload. Manual sign-out
or deactivation clears the saved identity; reactivation never revives it.
All staff sessions expire after 30 minutes of inactivity. PIN and offline freshness checks remain.
The roster is reselected as time changes and searches actual windows across
midnight. The editor supports next-day and full 24-hour duty, preserving record IDs.
Reassigning a window replaces a previous extension with the newly chosen end.

Reminders, profile/home labels, sign-in and Sync & device describe the same policy.
Around-the-clock access never appears as administrator access for ordinary staff.

## Hospital billing workspace (October 2026)

Billing now has department summaries, fee-category ledgers, patient accounts, cash
collection and receipts. Manage fees lives at /billing/fees; /admin/fees redirects.
Departments such as Pharmacy, Oncology, Dental and GS are configurable, independent
of fee categories. Fee and charge ownership is explicit; historical prices persist.
Registration and booking write applicable charges atomically with their record.
The first booking includes registration charges in its payment confirmation.
Unpaid appointments can proceed with an attributed See now - collect later reason.

Discounts and waivers are append-only reductions requiring payment:waive. Reports
separate money received from free care; one payment can cover several fee categories.
Daily handover uses payment dates, while fee ledgers filter by charge dates.

Each hospital connects its own Paystack account. Receiving accounts or named virtual
terminals are linked to departments, not patients. Paystack webhooks are authenticated
against exact raw bytes and transactions are verified server-side. Unlinked-account
receipts are retained for reconciliation. Transfers can be allocated only to synced
bills in the receiving department, patient and currency; row locks and request IDs
prevent double allocation and duplicate retries. Test receipts remain visible but
cannot settle real patient bills. Cash remains offline-capable.

Paystack connection keys are encrypted with a deployment-supplied 32-byte hex
BILLING_ENCRYPTION_KEY and kept outside the sync publication. Do not put keys in
VITE variables. An administrator connects Paystack and configures the backend webhook
URL under Billing -> Departments & accounts. Existing department accounts can be
linked; a named department Virtual Terminal can also be created through the API.
Provider feature activation and real bank-account validation remain deployment steps.

Release order: commit geneus-shared and promote both consumer submodule pointers;
deploy migration 0011 and generated sync streams; deploy the matching frontend.
Git promotion and production configuration remain with the owner.

All staff accounts, including 24-hour access, now expire after 30 minutes without
activity. Shift end still does not end an active session. Sleep, reload and the first
input after expiry cannot revive an expired session; sync is independent of sign-out.

Validation for hospital billing: The 194-test frontend suite and the final 28 SQLite regressions pass (195 tests total),
as do all 291 server/shared tests.
Eight isolated Chrome checks pass across desktop and phone layouts with no exceptions.
Both typechecks and the production build pass; initial JavaScript is 114.7 KB gzipped
against the 300 KB budget. The build used temporary public validation settings.
Paystack responses were mocked; live provider activation, credentials, webhook delivery
and target-phone field proof remain deployment checks. All 297 source/test files match
the isolated validated copies. Consumer submodules stay pinned until owner promotion.


## Patient registration and identity - first delivery (25 October 2026)

Steps 1-3 of docs/PATIENT-IDENTITY-PLAN.md are implemented. Patient demographics
support estimated birth/age, observation dates, optional NIN and staff-reported
identity evidence. Explicit null patches clear optional patient values through
SQLite, PowerSync upload and PostgreSQL; unrelated edits preserve age anchors.

The patient workspace adds old-folder/NIN lookup, local QR cards, supported-browser
card-photo scanning and an identity review queue. Offline decisions are review
requests or registration observations. Only online records-officer/admin confirmation
can link records, mark distinct identities or remove mistaken links. Preview hashes,
facility locks, rechecked permissions and idempotent requests protect final decisions.
Exact patient-ID collisions remain in Sync reconciliation and block linking.

Aliases aggregate patient history/appointments and expose the original billing
accounts. First-visit charges are recognised across linked IDs. No original clinical
or financial records are rewritten or deleted by identity resolution.

Deploy additive migration 0012 and the generated sync configuration with the matching
shared contract and frontend. Policy version is 8. Git promotion is owner-controlled.
Patient consent/documents, cross-facility identity and portal access remain later work.
Camera decoding and printer/low-memory-phone field acceptance still require supported
hardware. Source/test validation uses isolated copies with authoritative shared source.


Validation: 205 frontend tests and 302 server/shared tests pass. Both typechecks
and the production build pass. Seven identity browser workflows and four session
regressions pass with real Chrome mouse input and no browser exceptions. Initial
JavaScript is 119.3 KB gzipped against the 300 KB budget. All 324 source/test files
match the isolated validated copies. The browser fixture contains synthetic data;
no production database was migrated and no live identity provider was called.

Session regression found during acceptance: lastActivity updated immediately on
pointer input, but active-session checks compared it with a display clock refreshed
every 30 seconds. Database refreshes then mistook fresh activity for clock rollback
and cleared login. SessionProvider now uses Date.now() for session validity while
retaining the coarse display tick. Link confirmation and review requests retain
login; genuine 30-minute inactivity still expires and reload cannot revive it.
