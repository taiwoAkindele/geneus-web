# Clinical browser acceptance

Run `node qa/clinical-browser.mjs` from `geneus-web` with dependencies installed and Google Chrome available. Set `CHROME_PATH` to use another Chromium executable.

The script starts Vite on loopback port 5194 and headless Chrome with debugging port 9334 and a newly created temporary profile. It exercises the clinical workspace against synthetic in-memory records, captures phone/desktop screenshots and writes `artifacts/results.json`. Generated artifacts are ignored by Git. It closes its own server/browser and removes only its temporary profile.

The fixture uses the actual session provider, components, shared validation and repositories. A development-only alias supplies its synthetic facility context. It is not an application route and does not enrol a device, call production, store real patients or bypass authorization in the application. PostgreSQL and real SQLite behavior are covered by their separate tests.
