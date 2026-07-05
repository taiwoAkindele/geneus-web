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
  run entirely against a **local PouchDB** that replicates directly with the facility's
  CouchDB. There is no custom backend in the core write path.
- **Is not:** the API server, the change-feed consumer, or the Postgres/reporting layer —
  those live in `geneus-server`. `geneus-web` calls `geneus-server` only for the handful of
  things CouchDB can't do alone: roster/auth issuance, referral routing, device
  enrollment/wipe, exports, and reading government dashboards.
- **Shared contract:** document shapes, referral payload, roster schema, enrollment record,
  and API types come from the shared package (per root plan §9) — **never redefined here.**

## 1. Non-negotiable constraints (inherited)

1. **Cheapest Android is the floor** — sub-$100, ~1–2 GB RAM, 2G/3G, shared between staff.
   Every dependency and screen is judged on the *actual worst phone*, not an emulator.
2. **Offline is the default code path** — every write hits local PouchDB first and returns
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
| Local datastore | **PouchDB (`pouchdb-browser`)** | Direct CouchDB replication; the core bet (root §2.2) |
| Routing | **React Router** | Standard; enables route-based code splitting |
| Session/UI state | **Zustand** | Tiny; avoids Redux weight on low-end devices |
| Data → UI binding | **Custom hooks over PouchDB `changes()`** | Live, reactive queries without a heavy data lib |
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
│ Data-access layer — typed repositories over   │  PouchDB + Zod + shared types
│   PouchDB; live queries via changes() feed    │
├─────────────────────────────────────────────┤
│ Sync layer — background replication, sync-     │  PouchDB replication + status store
│   state indicator, pending-change queue        │
├─────────────────────────────────────────────┤
│ PouchDB (IndexedDB) — the on-device replica    │  encrypted-at-rest (sensitive fields)
└─────────────────────────────────────────────┘
```

- **Data-access layer is the only thing that touches PouchDB.** Screens never call PouchDB
  directly — they use typed repositories (`patients`, `visits`, `registers`, `referrals`,
  `stock`) so document shape, indexing, and validation live in one place.
- **Every write is validated with the shared Zod schema before it hits PouchDB** — critical
  because a bad doc written offline may not surface for up to 7 days at sync.
- **Live UI** comes from subscribing to PouchDB's `changes()` feed, so a record edited in one
  tab/unit updates everywhere instantly, online or off.

## 4. Cheap-Android performance budget (tracked like a test)

- **Initial JS (gzipped) ≤ ~180 KB**; each lazy route chunk small. Fail CI if exceeded.
- **Route-based code splitting** — registration, visits, each register, dashboard, admin all
  lazy-loaded. A CHEW who only registers patients never downloads the dashboard code.
- **Virtualise long lists** (patient search results, register history) — never render
  thousands of rows.
- **Bounded local replica** — filtered replication pulls only active/recent facility data
  (root §2.2), so IndexedDB and query cost stay small.
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
    data/
      db.ts         # PouchDB instance, indexes, encryption wrapper
      repos/        # patients, visits, registers, referrals, stock, audit
      hooks/        # useLiveQuery, useDoc, useSyncState
    sync/           # replication setup, sync-state store, pending-change tracking
    features/
      registration/ # NASADOR form, dedup prompt, Patient ID display
      visit/        # guided visit notes, unit handoff
      registers/    # OPD, Immunisation, FP, ANC, TB, Malaria forms
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
- PouchDB instance + one repo + `useLiveQuery` hook; prove a **replication round-trip** and a
  **deliberately-created conflict** surfaced in the UI.
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
- Six guided register forms (OPD, Immunisation, FP, ANC, TB, Malaria), **derived from the
  visit** where possible (no double entry, PRD §9.4).
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
- **Schema/validation tests** — every repository rejects malformed docs via the shared Zod
  schema (guards the 7-day-late-failure risk).
- **Component tests** for the clinical forms (registration, visit, each register) — correct
  data captured, dedup prompt fires, Patient ID format holds.
- **Perf budget check in CI** — bundle-size ceiling (§4) fails the build if exceeded.
- **Manual smoke on the real target phone** each milestone — the only true test of the
  <60-min and low-end-perf goals.

## 9. Immediate next steps

1. Scaffold Vite + React + TS + Tailwind + vite-plugin-pwa; confirm installable offline shell
   on the **target phone**.
2. Stand up PouchDB + one repo + `useLiveQuery`; prove replication round-trip + surfaced
   conflict (this de-risks the whole architecture).
3. Build the component kit v0 and the sync-state indicator shell.
4. **Depends on shared contract:** finalize the CouchDB document schemas (root §3 / schema doc)
   before writing repositories — the repos are generated against those types.
