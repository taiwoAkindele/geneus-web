# Latest: modular workspace QA — 30 October 2026

final result: passed

Selected target: sketch 1 from the modular workspace proposal. The current review,
comparison evidence, fixes and validation are recorded in
[modular workspace design QA](qa/artifacts/modular-workspace-2026-10-30/design-qa.md).
The earlier patient-flow QA below is preserved as historical evidence.

---

# Patient flow implementation QA — 26 October 2026

final result: passed

All 22 connected patient-flow checks pass against the running review preview,
with no browser exceptions. The first-signature/draft-continuity case and the
updated 33-visit pagination assertions pass. No actionable P0/P1/P2 findings
remain within the implementation scope and accepted constraints below.

## Comparison target and evidence

The selected target is the six connected patient-chart screens and behavior in
[`PATIENT-CHART-DESIGN-FLOWS.md`](../docs/PATIENT-CHART-DESIGN-FLOWS.md).
This is an implementation in the existing application, using its offline design
system and data contracts. It is not a replacement application or raster mock.

The reference and corresponding browser render were opened together in the same
comparison input for each state. Desktop capture uses **1487 × 1058 CSS pixels**,
device scale factor **1**, giving 1487 × 1058 PNGs. Five references have exactly
those pixel dimensions. Overview is 1486 × 1059; that one-pixel edge difference
does not affect comparison of content regions. Earlier iterations used
1440 × 1024; final comparisons use the reference dimensions. No device frame or
browser chrome is included. Additional phone captures use 390 × 844 and 320 × 844,
also at scale factor 1.

| State | Source visual truth | Implementation screenshot |
| --- | --- | --- |
| Overview / medical chart | [Reference](../docs/design-review/patient-chart-2026-10-26/01-medical-chart.png) | [Rendered chart](qa/artifacts/patient-overview-1487.png) |
| Clinical problem editor open | [Reference](../docs/design-review/patient-chart-2026-10-26/02-clinical-record-review.png) | [Rendered editor](qa/artifacts/patient-clinical-editor-1487.png) |
| Scheduled booking editor open | [Reference](../docs/design-review/patient-chart-2026-10-26/03-appointment-booking.png) | [Rendered booking](qa/artifacts/patient-booking-1487.png) |
| Personal editor, additional details expanded | [Reference](../docs/design-review/patient-chart-2026-10-26/04-personal-details.png) | [Rendered details](qa/artifacts/patient-details-1487.png) |
| Completed visit, Summary selected | [Reference](../docs/design-review/patient-chart-2026-10-26/05-view-saved-visit.png) | [Rendered reader](qa/artifacts/patient-saved-visit-1487.png) |
| Historical visit overflow menu open | [Reference](../docs/design-review/patient-chart-2026-10-26/06-visit-actions.png) | [Rendered menu](qa/artifacts/patient-menu-1487.png) |

The full-size controls, labels, field text and menu items are legible in these
comparisons, so separate cropped images were unnecessary. Phone captures were
also inspected for clipped controls and hierarchy. Dynamic content differs:
the fixture has two patient visits, one upcoming booking and no recorded care
plan; reference-only example findings/bookings are not fabricated in the app.
Native date/time formatting follows the browser locale.

## Findings and comparison history

1. **P1, chart density and hierarchy — corrected.** Initial generous header,
   section spacing and blank measurement slots delayed the clinical content.
   Reduced header/section spacing, kept measured values together, and disclosed
   observation history. The current chart has the two-column clinical hierarchy,
   persistent patient context, current-visit banner and direct category/source
   navigation. Full longitudinal histories can scroll; the app does not truncate
   them to the mock's sample contents. Evidence: final overview capture above.
2. **P1, saved-visit composition — corrected.** The initial serial entry reader
   could put follow-up before the consultation. Entries now use clinical section
   order; Summary has a main column and investigation/treatment/follow-up/activity
   aside. Signed sections have pale headers, visible author/time and distinct
   amendment actions. Vitals use four desktop columns. Evidence: saved-visit
   capture above, compared again after the card/grid correction.
3. **P2, problem editor density — corrected.** Optional coding/resolution fields
   pushed the principal review action below the primary desktop form. They now
   sit in a disclosure, opened for relevant existing/resolved data. Status and
   certainty have readable select labels. Added working clinical-record search
   with a distinct no-matches state. Evidence: clinical-editor capture above.
4. **P2, booking time clipping — corrected.** A fixed 128px time field clipped
   the native AM/PM control. Date/time now share equal desktop columns and stack
   on phones. Both final booking captures show the complete time control.
5. **P2, phone recording hierarchy — corrected.** Large secondary controls filled
   the first viewport. Chart/history links are compact and repeat observations
   and progress notes live in Additional entries. Current task and initial form
   fields now appear sooner. Evidence: `patient-record-visit-390.png` and
   `patient-record-visit-320.png` in `qa/artifacts`.
6. **P1, lost skip navigation — corrected.** Skips previously existed only in
   component memory. They now live in the staff/patient/visit device draft,
   preserve unfinished input, survive reopening and transfer to the new visit ID
   after its first signature. They remain unsigned navigation choices. Browser
   acceptance covers existing and newly created visits.

## Required fidelity surfaces

| Surface | Assessment |
| --- | --- |
| Fonts and typography | Reuses self-hosted Hanken Grotesk and JetBrains Mono, available offline. Bold patient/section hierarchy and restrained secondary text follow the references. Existing 16px form text and large touch controls take precedence over denser illustrative inputs. Long IDs and clinical text wrap; tab labels remain readable through horizontal scrolling. |
| Spacing and layout | Retains the app shell and patient header; five sections, two-column chart/reader, one visit table, right-side editors and anchored overflow menus follow the selected flow. Additional histories, source attribution and optional fields can increase height. Phone views stack content; menus are viewport-clamped outside table overflow. |
| Colors and tokens | Uses existing dark green brand, white surfaces, pale green section headers and red/amber clinical warnings. Darkened muted text to improve readability. Selected tabs have underline and text treatment; status is conveyed with words as well as color. No blanket WCAG certification is claimed. |
| Assets and image quality | These are data/form screens with no photographic or illustration assets. Existing branding and installed Lucide icons are reused. No screenshot is used as a page background; no custom illustrative assets or image-generated text substitute for working UI. |
| Copy and content | Uses patient-facing task names, actual source content, explicit missing-data states, local-save wording and separate booking/visit concepts. No invented normal findings, current medicines, appointments or entry-specific Synced badges. Original entries, versions and explanatory/structured amendments remain distinguishable. |

## Accepted implementation constraints

- Existing roster/access/sync shell and permitted modules remain available.
- Side editors use native modal dialogs with a backdrop, focus containment,
  Escape handling, restoration and explicit dirty-editor discard choices.
- Existing 52px input targets and 16px input text produce taller forms than the
  static mock. Expanded optional demographics scroll inside the editor; the
  normal compact state keeps the save action readily reachable.
- The activity action opens a separate panel rather than an extra section tab.
- Sync errors are surfaced honestly. Overall device state is not evidence that
  an individual entry was accepted by the server.
- Local skip state is private to its author/device. It is not a cross-device
  signed skip event. No shared or server contract changes were introduced.

## Validation and limits

The preview is served on loopback port 5195 with real application components,
providers, shared validation and authorized repositories, using synthetic
in-memory records. Browser acceptance runs against that running preview using
isolated local Chrome/CDP. The in-app browser connector was unavailable; no
Playwright dependency was added. The preview remains running for review.

Automated checks cover search, all five chart destinations, clinical review/sign
and versions, legacy allergy review, demographic concurrency conflicts, booking,
reader/activity/print preview, targeted amendments, structured corrections,
overflow keyboard dismissal/focus, one facility table and queue filters, visit
progression/closure, skipped-task draft continuity, 33-visit pagination/sorting,
invalid links, three viewport widths and read-only staff. Browser exception
results are recorded in `qa/artifacts/patient-flow-results.json`. All 22 checks
pass with an empty browser-exception list.

223 tests across 26 files pass, including the SQLite suite and two added encounter
summary regressions. Typecheck, production build and bundle-size check pass;
initial JavaScript is 121.1 KiB gzipped against the 300 KiB budget. The existing
13 clinical browser scenarios and six field-help checks pass without browser
exceptions. Physical printing, real low-memory Android behavior, full assistive
technology assessment and live API/server acceptance remain untested here.

## Implementation checklist

- [x] Implement the connected patient workspace and actual save/read actions.
- [x] Preserve authorization, linked-record provenance and immutable originals.
- [x] Compare each selected design state with its browser-rendered counterpart.
- [x] Correct the visual and navigation findings above and recapture.
- [x] Confirm the final expanded browser acceptance run: 22 checks passed.

## Follow-up polish

P3: Consider hiding the estimated-birth-date checkbox while no birth date is
provided. Current helper text correctly explains that age alone is treated as an
estimate; this is a presentation refinement, not a missing estimation rule.
