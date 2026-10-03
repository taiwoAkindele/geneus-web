import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Button, Icon, Sheet, useToast } from '@/ui';
import { AuthorizationError } from '@/data';
import { useSession } from '@/session';
import {
  AmendSheet,
  encounterLabel,
  EncounterSpine,
  isClosingStep,
  ReviewSaveSheet,
  SectionCard,
  STEP_DEFS,
  StepForm,
  stepsFor,
  summarize,
  useEncounter,
  type EncounterNavState,
  type StepKey,
} from '@/features/encounter';
import { usePatient } from '@/features/search';

const initialsOf = (fullName: string): string =>
  fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

const Message = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-surface">
    <div className="w-full px-5 py-8 text-center text-[14px] text-ink-muted md:px-8">{children}</div>
  </div>
);

/**
 * 9.8 The Patient Encounter. One record, lockable sections. Any on-duty staff
 * records the active step; saving passes through a deliberate review, then
 * writes the section locked to the signed-in staff member — immutable,
 * amend-only (PRD §9.8.3–9.8.5). Opened for a patient from their profile, an
 * appointment or the encounters list.
 */
export const EncounterScreen = () => {
  const navigate = useNavigate();
  const { patientId, encounterId } = (useLocation().state as EncounterNavState) ?? {};
  if (!patientId) {
    return (
      <Message>
        Open an encounter from a patient’s profile.{' '}
        <button type="button" className="font-bold text-brand" onClick={() => navigate('/patients/search')}>
          Find a patient
        </button>
      </Message>
    );
  }
  return <EncounterRecord patientId={patientId} encounterId={encounterId} />;
};

const EncounterRecord = ({ patientId, encounterId }: { patientId: string; encounterId?: string }) => {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useSession();
  const patient = usePatient(patientId);
  const ctl = useEncounter(patientId, encounterId);
  const { enc } = ctl;

  const actor = { name: user.name, role: user.role };
  const steps = stepsFor(enc.data);
  const [reviewKey, setReviewKey] = useState<StepKey | null>(null);
  const [amendKey, setAmendKey] = useState<StepKey | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  if (patient.loading || ctl.loading) return <Message>Opening the encounter…</Message>;
  if (patient.error || ctl.error) {
    return (
      <Message>
        The encounter could not be read from this device.{' '}
        <button type="button" className="font-bold text-brand" onClick={ctl.reload}>
          Try again
        </button>
      </Message>
    );
  }
  if (!patient.data) return <Message>Patient {patientId} is not on this device.</Message>;
  const record = patient.data;

  const reviewLabelFor = (key: StepKey) =>
    key === 'follow_up' ? 'Review & close encounter' : key === 'admission' ? 'Review & admit patient' : 'Review & save';

  const openReview = (key: StepKey) => {
    const problems = ctl.problems(key);
    if (problems.length > 0) toast(problems.join(' · '), { tone: 'error' });
    else setReviewKey(key);
  };

  const failed = (cause: unknown, fallback: string) =>
    toast(cause instanceof AuthorizationError ? cause.message : fallback, { tone: 'error' });

  const confirmSave = async () => {
    if (!reviewKey) return;
    setSaving(true);
    try {
      await ctl.lockStep(reviewKey);
      if (reviewKey === 'follow_up') {
        toast(enc.data.follow_up.when ? 'Encounter closed & locked · follow-up booked' : 'Encounter closed & locked');
      } else if (reviewKey === 'admission') toast('Patient admitted · encounter locked as inpatient');
      else toast(`Saved & locked — signed by ${user.name}`);
      setReviewKey(null);
    } catch (cause) {
      failed(cause, 'Could not save this step — please try again');
    } finally {
      setSaving(false);
    }
  };

  const saveAmend = async (note: string) => {
    if (!amendKey) return;
    try {
      await ctl.amendStep(amendKey, note);
      toast('Amendment logged — the original record is unchanged');
      setAmendKey(null);
    } catch (cause) {
      failed(cause, 'Could not save the amendment — please try again');
    }
  };

  const statusLabel = enc.admitted
    ? 'Admitted · inpatient'
    : enc.closed
      ? 'Closed'
      : `In progress · ${steps[enc.activeIndex]?.short ?? '—'}`;

  return (
    <div className="min-h-screen bg-surface">
      {/* patient context bar */}
      <header className="sticky top-[var(--app-header-h,0px)] z-10 bg-brand text-white">
        <div className="px-5 py-3 md:px-8">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate(-1)} aria-label="Back" className="-ml-2 flex h-10 w-10 min-h-0 flex-none items-center justify-center">
              <Icon name="back" className="h-6 w-6" />
            </button>
            <Avatar tone="mint" size="sm">{initialsOf(record.fullName)}</Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[17px] font-extrabold tracking-[-0.02em]">{record.fullName}</div>
              <div className="truncate font-mono text-[11px] text-brand-accent-soft">{record.patientId}</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-[11px] text-brand-accent-soft">{encounterLabel(enc.id)}</div>
              <div className="text-[12px] text-brand-on-dark">{statusLabel}</div>
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {record.allergies.length > 0 ? (
              <span className="rounded-full bg-danger-bg px-2.5 py-1 text-[11px] font-bold text-danger-strong">
                ⚠ Allergy: {record.allergies.join(', ')}
              </span>
            ) : null}
            <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold">
              {enc.id ? `Opened ${enc.openedDate}` : 'Opens when the first step is saved'}
            </span>
            {enc.closed ? null : (
              <button
                type="button"
                onClick={() =>
                  navigate('/patients/send-to-unit', { state: { patientId: record.patientId, encounterId: enc.id } })
                }
                className="inline-flex min-h-0 items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[12px] font-bold"
              >
                Send to another unit
              </button>
            )}
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

      <div>
        <EncounterSpine enc={enc} />

        {enc.admitted ? (
          <div className="mx-5 mb-1 flex flex-wrap items-center gap-3 rounded-card bg-slate-bg p-4 md:mx-8">
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-slate text-white">
              <Icon name="check" className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 text-sm font-semibold text-slate-text">
              {record.fullName} admitted as an inpatient — {[enc.data.admission.ward, enc.data.admission.bed].filter(Boolean).join(' · ')}.
              Encounter locked; care continues on the ward.
            </div>
          </div>
        ) : enc.closed ? (
          <div className="mx-5 mb-1 flex flex-wrap items-center gap-3 rounded-card bg-brand-tint p-4 md:mx-8">
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-brand text-white">
              <Icon name="check" className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 text-sm font-semibold text-brand">
              Encounter closed &amp; locked. The full record is now part of {record.fullName}'s permanent history.
            </div>
            {enc.data.follow_up.when ? (
              <Button variant="outlined" fullWidth={false} className="px-4 py-2.5" onClick={() => navigate('/appointments')}>
                See booked follow-up
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-3 px-5 py-3 pb-24 md:px-8">
          {steps.map((s, i) => {
            const locked = Boolean(enc.sig[s.key]);
            const active = i === enc.activeIndex;
            const state = locked ? 'locked' : enc.skipped.includes(s.key) ? 'skipped' : active ? 'active' : 'pending';
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
                reviewLabel={reviewLabelFor(s.key)}
                onReview={() => openReview(s.key)}
                onAmend={() => setAmendKey(s.key)}
                onSkip={isClosingStep(s.key) ? undefined : () => ctl.skip(s.key)}
                saving={saving}
              >
                {active ? <StepForm stepKey={s.key} ctl={ctl} /> : null}
              </SectionCard>
            );
          })}
        </div>
      </div>

      {reviewKey ? (
        <ReviewSaveSheet
          title={STEP_DEFS[reviewKey].title}
          rows={summarize(enc.data, reviewKey)}
          actor={actor}
          confirmLabel={
            reviewKey === 'follow_up' ? 'Confirm & close encounter' : reviewKey === 'admission' ? 'Confirm & admit' : 'Confirm & lock'
          }
          onConfirm={confirmSave}
          onClose={() => setReviewKey(null)}
          saving={saving}
        />
      ) : null}

      {amendKey ? <AmendSheet onSave={saveAmend} onClose={() => setAmendKey(null)} /> : null}

      {activityOpen ? (
        <Sheet onClose={() => setActivityOpen(false)} title="Activity log" eyebrow={encounterLabel(enc.id)}>
          {enc.audit.length === 0 ? (
            <p className="text-[13px] text-ink-muted">Nothing has been saved yet.</p>
          ) : (
            <div className="space-y-0">
              {enc.audit.map((a, i) => (
                <div key={`${a.date}-${a.time}-${a.action}-${i}`} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand text-white">
                      <Icon name="check" className="h-3.5 w-3.5" />
                    </span>
                    {i < enc.audit.length - 1 ? <span className="w-0.5 flex-1 bg-outline-soft" /> : null}
                  </div>
                  <div className="pb-4">
                    <div className="text-[15px] font-bold text-ink">{a.action}</div>
                    <div className="text-[13px] text-ink-soft">{[a.actor, a.role].filter(Boolean).join(' · ')}</div>
                    <div className="font-mono text-xs text-ink-muted">{a.time} · {a.date}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">
            Every save is written here against the staff member signed in at the moment of saving. Entries can never be
            edited or deleted — a correction is added as a new amendment, also logged.
          </p>
        </Sheet>
      ) : null}
    </div>
  );
};
