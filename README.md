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
