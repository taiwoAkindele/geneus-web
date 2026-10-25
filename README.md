# geneus-web

The Geneus Health PWA: an offline-first replica of one facility's records on a cheap
Android phone, synced by PowerSync from PostgreSQL. Read [PLAN.md](PLAN.md) before
changing anything; the layering, the budget and the build order are decided there.

## Local development

```
npm install
npm run dev          # Vite on :5173 — expects geneus-server on :8080 and PowerSync on :8090
npm test             # Vitest: authorization, the write boundary, row mapping, the connector
npm run typecheck
npm run build        # then measure: gzip of the entry + its modulepreloads must stay <= 300 KB
```

Set `VITE_API_URL` to reach a server elsewhere; the PowerSync endpoint is not configured
here — the server hands it to the device at enrollment.

Set `VITE_SIGNING_PUBLIC_KEY` to the server's public key (the second line `npm run
key:generate` prints in geneus-server) so sign-in can check roster signatures offline.
Without it every shift counts as unsigned, which is fine in development and a gap in
production: a shift edited on the phone would not be caught.

`npm run build` is a production build and refuses to run unless both variables are set;
the committed `.env.production` sets them (see *Deployment*). `npm run dev` needs neither.

## Offline and install

The app is an installable PWA (`vite-plugin-pwa`, configured in `vite.config.ts`). The
first visit precaches the whole shell — every route chunk, the PowerSync workers, the
fonts and the encrypted SQLite WASM, about 1.3 MB gzipped — so afterwards the app opens,
signs in and works with no network. The service worker only exists in a build: test
offline behaviour with `npm run build && npm run preview`, not `npm run dev`.

A new version downloads in the background and takes over once every window of the app
has been closed, never by reloading a screen someone is using.

The install icons in `public/icons/` are rendered from `public/favicon.svg` by
`node scripts/render-icons.mjs` (uses an installed Chrome); rerun it when the SVG changes.

## Deployment

The output is a static site (`dist/`); the shared contract submodule must be checked out
before building. `VITE_API_URL` and `VITE_SIGNING_PUBLIC_KEY` for production live in the
committed `.env.production` — both are public by nature (they ship in the JavaScript), and
keeping them in the repo avoids hosts that refuse `VITE_*` variables as "sensitive". Never
add a secret to that file. A host environment variable of the same name still overrides
it. Add the app's origin to the server's `APP_ORIGINS`.

Two backends, chosen by the build's mode:

| Build | Mode | Settings | Backend |
| --- | --- | --- | --- |
| Vercel production deployment, Cloudflare Pages, local `npm run build` | `production` | `.env.production` | `https://api.geneush.com` |
| Vercel preview deployment (the `dev` branch, every other branch) | `preview` | `.env.preview` | `https://api-dev.geneush.com` |

Both files hold only public values and both modes refuse to build with either one
missing. The development backend is described in the geneus-server README,
*Development environment*. A local `npm run dev` uses whatever `.env` says.

- **Vercel** — `vercel.json`: builds with `--mode $VERCEL_ENV` (so preview deployments
  get the development backend), every non-asset path served `index.html` (deep links),
  `no-cache` on the service worker, page and manifest, immutable `/assets/`.
- **Cloudflare Pages** — build command `npm run build`, output `dist`: every branch
  builds against **production**. `public/_headers` carries the same cache rules; Pages
  serves `index.html` for unknown paths by itself.

## Billing implementation status

The admin's **Manage fees** (`/billing/fees`) works offline: add or edit prices,
configure automatic exemptions by age, sex and visit type, and retire or restore fees.
The cashier role is available when adding staff. Fee changes do not rewrite old bills.

The local schema and billing repository also support charges, payments, receipt numbers,
waivers, reversals and balances kept separate by currency. These are tested against real
SQLite. Registration and booking raise configured fees atomically. Patient billing,
cash collection, printable receipts, discounts, waivers, reports and the nursing
See now — collect later flow are available in the Billing workspace.
Insurance and claims follow billing (PRD §9.14).

## Frontend workflow and layout

The phone navigation and shift warning remain available during daily work. Home shows
actual local counts; alerts come from unresolved sync rejections. Features that still
have prototype screens are labelled unavailable in the app.

On desktop, patient search has a sortable table and a record preview beside it.
Appointments, encounters, unit queues, staff and fees use tables; clinical record forms
remain section cards. Phone register entries expand into their full field values.

Registration drafts survive Back between steps in memory and are cleared at staff
handover or completion. Form values stay out of browser history and do not survive
 a cold reload. Appointments are grouped
using the device's local calendar date; staff should configure its timezone to the
facility's. Completion is derived from the closing step of a linked encounter. Older
encounters without an appointmentId are not guessed to belong to a booking.

## How a write travels

```
screen -> repository -> assertAllowed(context, permission) -> parseDocument -> SQLite
                                                                     | (PowerSync queue)
                                    geneus-server /sync/upload  <-  connector.uploadData
                                    (authorises again, applies to PostgreSQL)
```

A refusal on the device throws an `AuthorizationError` before anything is stored; a refusal
on the server becomes a `sync_rejection` that syncs back down for the records officer.

## Device identity

Registering a facility (or spending an enrollment code) stores a **device credential**
(`localStorage` -> `geneus.device`). It answers *where* — which device, which facility —
and nothing about *who*: who is signed in is the offline shift session (`src/session`).
A device whose credential the server no longer accepts clears its local database and
returns to onboarding.

## Editing staff and assigning combined access

From **Staff → Edit staff**, an administrator can change the name, select several
roles, choose a primary role, and grant additional actions individually. Roles
combine their permissions; **Read only** overrides them all. The primary role is
stamped on new clinical contributions, while older contributions keep their
original attribution. The same controls are available when adding staff.

Name management and access assignment are separate permissions. A delegate who
can edit names cannot change roles, create privileged accounts or reset an admin's
PIN. The last administrator with write access is protected from removal or demotion.

This feature requires the updated shared contract and server migration 0009.
Update both shared submodule pointers after committing geneus-shared; deploy the
server and regenerated sync streams before deploying this frontend. Validation
copies can combine the uncommitted contract with the apps without modifying the
pinned submodule checkouts.

## 24-hour access and overnight shifts

Choose **Staff → Edit staff → Sign-in access → 24-hour access** for someone who
can sign in every day without a roster. Their roles and write permissions stay
separate. Scheduled staff still need an active window for a fresh PIN sign-in.

In **Staff → Shift**, choose **Next day** for overnight duty, or **Make a 24-hour
shift** for a full-day window. The following-day end appears in roster labels.

Shift end never signs staff out automatically. Active sessions survive the end
of a roster, midnight and reload; all sessions expire after 30 minutes without activity. Deactivation closes
access after the device receives the change, and reactivation needs a new sign-in.
All staff sessions expire after 30 minutes without activity, including 24-hour access.

This change uses shared policy v6 and server migration 0010. Commit the shared
contract and update both consumer submodules; deploy the server migration and
regenerated staff sync stream before the matching frontend.

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
