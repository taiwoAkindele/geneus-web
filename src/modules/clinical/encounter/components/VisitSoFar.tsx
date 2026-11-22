import { useState } from 'react';
import { EMPTY_ENCOUNTER_DATA } from '../encounterRecord';
import { STEP_DEFS } from '../steps';
import { summarize } from '../useEncounter';
import type { EncounterState, StepKey } from '../types';
import { sectionState, shownValue, visitContextSteps, type SectionState } from '../visitSoFar';

const STATE_LABEL: Record<SectionState, { text: string; tone: string }> = {
  signed: { text: 'Signed', tone: 'text-brand' },
  draft: { text: 'Draft · not signed', tone: 'text-amber-text' },
  skipped: { text: 'Not recorded · passed over', tone: 'text-ink-muted' },
  not_recorded: { text: 'Not recorded yet', tone: 'text-ink-muted' },
};

/** Open beside the form on a wide screen; folded above it on a tablet so the form keeps its width. */
const startsOpen = () =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(min-width: 1280px)').matches);

/**
 * What earlier sections of this visit say, while a later one is being recorded. Read-only and
 * on the same screen, so looking never leaves the form or loses what is being typed. Not shown
 * on phones, where the form needs the whole width.
 */
export const VisitSoFar = ({
  enc,
  visitSteps,
  current,
  className = '',
}: {
  enc: EncounterState;
  visitSteps: readonly StepKey[];
  current: StepKey;
  className?: string;
}) => {
  const [open, setOpen] = useState(startsOpen);
  const keys = visitContextSteps(visitSteps, current);
  if (!keys.length) {
    return null;
  }
  const signed = keys.filter((key) => enc.sig[key]).length;
  return (
    <aside aria-label="Visit so far" className={`hidden sm:block ${className}`}>
      <details
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
        className="rounded-card border border-outline-soft bg-surface-muted p-3"
      >
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 font-bold">
          Visit so far
          <span className="text-xs font-normal text-ink-soft">
            {signed} of {keys.length} signed
          </span>
        </summary>
        <div className="mt-2 space-y-2">
          {keys.map((key) => {
            const rows = summarize(enc.data, key);
            const state = sectionState(enc, key, rows, summarize(EMPTY_ENCOUNTER_DATA, key));
            const signature = enc.sig[key];
            const label = STATE_LABEL[state];
            const recorded = state === 'signed' || state === 'draft';
            return (
              <details key={key} open={recorded} className="rounded-field bg-white p-3 text-sm">
                <summary className="cursor-pointer">
                  <span className="font-bold">{STEP_DEFS[key].short}</span>{' '}
                  <span className={`text-xs ${label.tone}`}>· {label.text}</span>
                </summary>
                {recorded ? (
                  <dl className="mt-2 space-y-2">
                    {rows.map((row) => (
                      <div key={row.label}>
                        <dt className="text-xs font-bold text-ink-soft">{row.label}</dt>
                        <dd className="whitespace-pre-wrap break-words">{shownValue(row.value)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {signature ? (
                  <p className="mt-2 text-xs text-ink-soft">
                    Signed by {signature.actor} · {signature.date} {signature.time}
                  </p>
                ) : null}
                {enc.amend[key]?.map((amendment, index) => (
                  <p
                    key={index}
                    className="mt-2 whitespace-pre-wrap border-l-2 border-brand-tint pl-2 text-xs"
                  >
                    Amendment: {amendment.note} · {amendment.by} · {amendment.date}
                  </p>
                ))}
              </details>
            );
          })}
        </div>
      </details>
    </aside>
  );
};
