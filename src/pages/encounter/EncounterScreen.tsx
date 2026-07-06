import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Button, Icon, Sheet, useToast } from '@/ui';
import { useSession } from '@/session';
import {
  AmendSheet,
  EncounterSpine,
  ReviewSaveSheet,
  SectionCard,
  STEPS,
  StepForm,
  summarize,
  useEncounter,
  type StepKey,
} from '@/features/encounter';

// Mock patient in context. Registration already exists elsewhere; this flow
// picks up once a patient record exists (PRD §9.8.1).
const PATIENT = { id: 'OOE-PHC-000047-K2', name: 'Amaka Okoro', initials: 'AO', allergy: 'Penicillin' };

/**
 * 9.8 The Patient Encounter. One record, seven lockable sections. Any on-duty
 * staff records the active step; saving passes through a deliberate review, then
 * locks the section to the signed-in staff member — immutable, amend-only.
 */
export const EncounterScreen = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useSession();
  const ctl = useEncounter(PATIENT.id, PATIENT.name);
  const { enc } = ctl;

  const actor = { name: user.name, role: user.role };
  const [reviewKey, setReviewKey] = useState<StepKey | null>(null);
  const [amendKey, setAmendKey] = useState<StepKey | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);

  const confirmSave = () => {
    if (!reviewKey) return;
    const isClose = reviewKey === 'followup';
    ctl.lockStep(reviewKey, actor);
    toast(isClose ? `Encounter closed & locked · follow-up booked` : `Saved & locked — signed by ${user.name}`);
    setReviewKey(null);
  };

  const saveAmend = (note: string) => {
    if (!amendKey) return;
    ctl.amendStep(amendKey, actor, note);
    toast('Amendment logged — the original record is unchanged');
    setAmendKey(null);
  };

  const statusLabel = enc.closed ? 'Closed' : `In progress · ${STEPS[enc.stage]?.short ?? '—'}`;

  return (
    <div className="min-h-screen bg-surface">
      {/* patient context bar */}
      <header className="sticky top-[var(--app-header-h,0px)] z-10 bg-brand text-white">
        <div className="mx-auto max-w-2xl px-5 py-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate('/patients/profile')} aria-label="Back to patient profile" className="-ml-2 flex h-10 w-10 min-h-0 flex-none items-center justify-center">
              <Icon name="back" className="h-6 w-6" />
            </button>
            <Avatar tone="mint" size="sm">{PATIENT.initials}</Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[17px] font-extrabold tracking-[-0.02em]">{PATIENT.name}</div>
              <div className="truncate font-mono text-[11px] text-brand-accent-soft">{PATIENT.id}</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-[11px] text-brand-accent-soft">{enc.id}</div>
              <div className="text-[12px] text-brand-on-dark">{statusLabel}</div>
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-danger-bg px-2.5 py-1 text-[11px] font-bold text-danger-strong">⚠ Allergy: {PATIENT.allergy}</span>
            <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold">Opened {enc.openedDate}</span>
            <button
              type="button"
              onClick={() => setActivityOpen(true)}
              className="ml-auto inline-flex min-h-0 items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[12px] font-bold"
            >
              <Icon name="clock" className="h-4 w-4" /> Activity log · {enc.audit.length}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl">
        <EncounterSpine enc={enc} />

        {enc.closed ? (
          <div className="mx-5 mb-1 flex flex-wrap items-center gap-3 rounded-card bg-brand-tint p-4">
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-brand text-white">
              <Icon name="check" className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 text-sm font-semibold text-brand">
              Encounter closed &amp; locked. The full record is now part of {PATIENT.name}'s permanent history.
            </div>
            <Button variant="outlined" fullWidth={false} className="px-4 py-2.5" onClick={() => navigate('/appointments')}>
              See booked follow-up
            </Button>
          </div>
        ) : null}

        <div className="space-y-3 px-5 py-3 pb-24">
          {STEPS.map((s, i) => {
            const locked = Boolean(enc.sig[s.key]);
            const active = i === enc.stage && !enc.closed && !locked;
            const state = locked ? 'locked' : active ? 'active' : 'pending';
            return (
              <SectionCard
                key={s.key}
                index={i}
                title={s.title}
                hint={s.hint}
                state={state}
                summary={summarize(enc.data, s.key)}
                signature={enc.sig[s.key]}
                amendments={enc.amend[s.key]}
                reviewLabel={s.key === 'followup' ? 'Review & close encounter' : 'Review & save'}
                onReview={() => setReviewKey(s.key)}
                onAmend={() => setAmendKey(s.key)}
              >
                {active ? <StepForm stepKey={s.key} ctl={ctl} /> : null}
              </SectionCard>
            );
          })}
        </div>
      </div>

      {reviewKey ? (
        <ReviewSaveSheet
          title={STEPS.find((s) => s.key === reviewKey)?.title ?? ''}
          rows={summarize(enc.data, reviewKey)}
          actor={actor}
          confirmLabel={reviewKey === 'followup' ? 'Confirm & close encounter' : 'Confirm & lock'}
          onConfirm={confirmSave}
          onClose={() => setReviewKey(null)}
        />
      ) : null}

      {amendKey ? <AmendSheet onSave={saveAmend} onClose={() => setAmendKey(null)} /> : null}

      {activityOpen ? (
        <Sheet onClose={() => setActivityOpen(false)} title="Activity log" eyebrow={enc.id}>
          <div className="space-y-0">
            {enc.audit.map((a, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand text-white">
                    <Icon name="check" className="h-3.5 w-3.5" />
                  </span>
                  {i < enc.audit.length - 1 ? <span className="w-0.5 flex-1 bg-outline-soft" /> : null}
                </div>
                <div className="pb-4">
                  <div className="text-[15px] font-bold text-ink">{a.action}</div>
                  <div className="text-[13px] text-ink-soft">{a.actor} · {a.role}</div>
                  <div className="font-mono text-xs text-ink-muted">{a.time} · {a.date}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">
            Every save is written here against the staff member signed in at the moment of saving. Entries can never be
            edited or deleted — a correction is added as a new amendment, also logged.
          </p>
        </Sheet>
      ) : null}
    </div>
  );
};
