# Geneus Health — Frontend Plan (`geneus-web`)

> The PWA. This is the make-or-break repo: it holds the offline replica, the entire
> clinical UX, and the shift-based session. Derived from and subordinate to the root
> [../PLAN.md](../PLAN.md) and the source of truth [../PRODUCT.md](../PRODUCT.md).
> If anything here conflicts with those, they win.

**Version:** 1.0 (Draft) · **Owner:** Solo founder-builder

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
│   30/15/5 warnings, auto-logout, enrollment   │
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
    session/        # offline shift login, roster eval, warnings, auto-logout, enrollment
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
- **Offline shift login** — evaluate local roster, 30/15/5-min warnings, hard auto-logout
  that closes any open record; supervisor extend; enrollment-gated offline replica (root
  §4.3/§4.3c).
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
- **Session security:** encrypted sensitive fields at rest; auto-logout wipes on-screen state;
  un-enrolled devices keep **nothing** durable and wipe session data at logout (root §4.3c).
- **[OPEN ITEM] Encryption key management** — how the field-encryption key is derived/stored
  so it survives across shift logins on an *enrolled* device yet is unreadable without a valid
  shift. Resolve jointly with the auth design before FE-M1 hardening.

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

## 9. Immediate next steps

1. Add vite-plugin-pwa so the shell — and the SQLite WASM — are precached; confirm the
   installable offline shell on the **target phone**.
2. Run the real flow on that phone against the compose stack: register a facility, work a
   day offline, reconnect; watch the Sync Center and the reconcile queue (this is the field
   proof of the migration; the connector and the stack are proven by tests, the browser
   wiring is not yet).
3. Wire the remaining mock screens (patient search, registration, encounter) to the
   repositories as their contract shapes land.
4. Resolve the encryption-at-rest key-management item (§7) before FE-M1 hardening.
