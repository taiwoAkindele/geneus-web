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

`npm run build` is a production build and refuses to run unless both variables are set
(in `.env` or the environment). `npm run dev` needs neither.

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
before building. On the host, set `VITE_API_URL` (the server's public URL) and
`VITE_SIGNING_PUBLIC_KEY`, and add the app's origin to the server's `APP_ORIGINS`.

- **Vercel** — `vercel.json`: Vite preset, every non-asset path served `index.html`
  (deep links), `no-cache` on the service worker, page and manifest, immutable `/assets/`.
- **Cloudflare Pages** — build command `npm run build`, output `dist`. `public/_headers`
  carries the same cache rules; Pages serves `index.html` for unknown paths by itself.

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
