# Geneus Health Web (`geneus-web`) — Working Rules

Vite + React 18 (SPA) + TypeScript for an **offline-first** Electronic Medical /
Health Record PWA used at Nigerian Community & Primary Health Centres. Local-first
data (PouchDB on device, replicating to a per-facility CouchDB), React Hook Form +
Zod for forms, Zustand for session/UI state, Tailwind v3 for styling, React Router
for navigation.

**Sources of truth:** `../PRODUCT.md` (the product) and `PLAN.md` (this repo's
architecture & build order). The **data contract** is the shared submodule at
`src/shared` (`../geneus-shared`, see its `SCHEMA.md`) — document shapes are defined
there once and never redefined here. Read these before non-trivial work and keep
`PLAN.md` accurate when the implementation changes.

Follow the established patterns in the codebase over generic habits; when in doubt,
match the nearest existing feature module.

> **The constraint that governs every decision:** the target device is the
> **cheapest Android phone** (sub-$100, ~1–2 GB RAM, intermittent 2G/3G, shared
> between staff). Keep the bundle small, dependencies few, screens code-split, and
> long lists virtualized. Judge every dependency on that phone, not an emulator.

---

## Commands

```bash
npm run dev            # vite dev server
npm run build          # vite build (production)
npm run typecheck      # tsc --noEmit
npm run preview        # preview the production build
# lint: to be configured (eslint) — add before the codebase grows
```

Run `npm run typecheck` after changes (and lint once configured) before calling work done.

---

## Hard stops — never do these without explicit approval

- **Secrets / env files.** Never read, display, search, summarize, or modify:
  `.env`, `.env.*`, `*.pem`, `*.key`, `secrets/*`. If a config value is needed, ask
  the user to add it. `VITE_*` vars are public-by-design (shipped to the browser) —
  never put real secrets behind that prefix.
- **Dependencies.** Do not install new packages. The list is kept deliberately lean
  **for bundle size on cheap phones**. Prefer existing libraries; if a new one seems
  necessary, propose it and wait for approval. (Approved core: react, react-dom,
  react-router-dom, react-hook-form, zod, @hookform/resolvers, pouchdb-browser,
  zustand, i18next/react-i18next.)
- **Sensitive files.** Ask before modifying `package.json`, `package-lock.json`,
  `tsconfig*.json`, `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, and
  anything under the `src/shared` submodule (edit the contract in its own repo).
- **Git.** Never push to `main`. Never create commits unless explicitly asked
  (branching is fine — see Workflow). Do **not** add `Co-Authored-By` or any
  AI/assistant attribution trailer to commit messages.

---

## Offline-first — the non-negotiables

These come straight from `PLAN.md` §4 and `../PRODUCT.md` §13–14. They are not
optional polish; they are the product.

- **Offline is the default path, not a fallback.** Every write goes to local PouchDB
  first and returns instantly. The UI never shows a blocking spinner waiting on the
  network. There is no "offline mode" toggle.
- **Validate before every write.** Run the document through its shared Zod schema
  (from `@shared`) before `put`. A bad document written offline may not surface for
  up to **7 days** at sync — validation is the guard against that.
- **Never lose a write; never silently overwrite.** Conflicts go to the
  records-officer reconcile queue — never last-write-wins on clinical data.
- **Sync state is always honest.** Show "Up to date" / "N changes waiting" /
  "Offline — last synced …". Never present stale data as fresh.
- **Reads are local and live** (PouchDB `changes()` feed). Do **not** toast reads —
  toasts are for user actions/mutations only.
- **Access is shift-based** (roster-linked) and enforced client-side, independent of
  connectivity; the durable local replica requires an **enrolled** device.

---

## Code organization & conventions

- **Screens/routes are thin shells.** A screen composes an `AppBar` + feature
  components and wiring; all domain logic lives in `features/<domain>/`
  (`components/`, `hooks/`, `types.ts`, `utils/`), exposed through each feature's
  barrel `index.ts`. Compose features in screens.
- **The data-access layer is the only thing that touches PouchDB.** Typed
  repositories in `src/data/repos/*` own document shape, indexing, and validation;
  live UI comes from `changes()`-based hooks in `src/data/hooks`. **Never call
  PouchDB from a component.**
- **State:** local-first clinical data via repositories (not a server-state cache);
  session/UI/sync status via Zustand (`src/session`, `src/sync`).
- **Server calls are the exception, centralized.** The few things that hit
  `geneus-server` (auth/roster, referral routing, device enrollment, dashboards) go
  through the shared client in `src/lib/api` — normalize errors there; do not scatter
  `fetch` calls across components.
- **Shared UI primitives live in `src/ui`** — reuse before writing new markup. All
  are large-touch and high-contrast (PRD §13). Field primitives (`TextField`,
  `SelectField`, …) **forward their ref** so React Hook Form's `register()` works.
- **Forms use React Hook Form.** Validation uses **Zod schemas from the shared
  contract** via `@hookform/resolvers/zod`. Input strings are normalized to the
  document shape at the persistence boundary, not stored raw.
- Use the `@/` path alias for `src/` imports and `@shared` for the data contract.
- **Functions are arrow expressions assigned to `const`** — components and inner
  helpers alike (`export const Screen = () => { … }`, `const handleSubmit = () =>
  { … }`). Do not use `function` declarations. The only exception is a
  `forwardRef`/`memo` wrapper, which keeps a named inner function so the component
  has a devtools display name.

---

## UI states — loading, error, empty, **offline**

Every async surface must handle all of its states; never render only the happy path.

- **Buttons / actions:** disable + show a pending indicator while a write/mutation
  runs; re-enable on settle. Never allow double-submit.
- **Lists:** skeleton while loading, inline error with retry on failure, the shared
  empty-state when there are no rows. Virtualize long lists.
- **The offline dimension:** surface sync/pending status honestly on any screen whose
  data crosses a boundary (referrals, incoming alerts). Offline is a first-class
  state, not an error.

---

## Responsive layout

Mobile is the **canonical** design and never changes to accommodate a larger
screen. Make a screen responsive by **reflowing the same UI with Tailwind `md:`
(and `lg:`) utilities** — resize, rearrange, or remodel the *existing* elements
(widen the container, turn a column into a grid, bump type/spacing). Same DOM,
same components, same content at every width.

- Keep the **mobile classes as the unprefixed base** so the phone layout stays
  byte-for-byte stable; every wider-screen change is a `md:`/`lg:` variant. When
  adding a variant, don't alter the base class it builds on.
- **Do not** add, remove, or swap components/content for larger screens, and do
  not build a separate desktop structure (no `md:hidden` / `hidden md:block` twin
  layouts). If a screen genuinely needs different content on desktop, that is a
  **product decision the user makes** — ask; don't invent it.
- The design's `380×800` rounded frames are mockup bezels, not app chrome — never
  reproduce them.
- Tablet/desktop are now **explicitly designed** in `design/Responsive Views.dc.html`
  (breakpoints: ≤640 phone · 641–1024 tablet · ≥1025 desktop). The signed-in
  daily-use screens render inside `src/app/AppShell.tsx` — one nav that becomes a
  bottom bar → rail → full sidebar. Auth/onboarding screens stay outside the shell
  (they get a brand-split card treatment). Drill-downs become master–detail, and
  the programme register becomes a data table, on desktop. Implement those from the
  responsive design; mobile still stays byte-for-byte the phone design.

---

## TypeScript

- Strict typing. Avoid `any` and unnecessary assertions; prefer explicit types.
- **Document shapes come from `@shared` — never redefine them.** Derive form and view
  models from the contract and normalize at the boundary (write path validates with
  the shared Zod schema; read path maps back to a view model).

---

## Workflow — feature-based, never lumped together

Keep every change scoped to a single concern. **Do not bundle unrelated features,
fixes, or refactors into one change set, branch, or commit.**

**Before implementing:** (1) explain the approach, (2) identify affected
files/features, (3) highlight breaking changes, (4) work on a dedicated feature
branch — one branch per feature/fix.

**After implementing:** (1) summarize the changes, (2) list modified files, (3)
mention follow-up work.

---

## Standards

- Follow the **Single Responsibility Principle**: a screen renders and wires; a
  feature component owns one piece of behavior; a repository owns one document type;
  a field primitive owns one input. Split when a file grows beyond its one job.
- Create reusable components where it removes duplication. Treat ~300 lines as a
  smell prompting a split, not a hard cap.
- Comment the **why** of non-obvious logic — especially offline/sync, Patient ID,
  conflict, and shift-auth edge cases, where the reasoning isn't visible in the code.
