import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppBar, Avatar, Button, ChoiceChip, useToast } from '@/ui';
import { SyncPill } from '@/app/SyncPill';
import { AuthorizationError } from '@/data';
import { sendHandoff } from '@/data/repos/handoffs';
import { usePatient } from '@/features/search';
import { readDeviceUnit, rememberDeviceUnit, useUnits } from '@/features/units';
import { useAuthorizationContext, useSession } from '@/session';

/** Who is being sent, and within which encounter (so the receiving unit opens the same one). */
export type SendToUnitNavState = { patientId?: string; encounterId?: string } | null;

// Common hand-off instructions — one tap inserts the phrase, so staff rarely
// type from scratch (and never send a stale prefilled instruction).
const QUICK_INSTRUCTIONS = [
  'Give TT injection',
  'Dispense prescribed drugs',
  'Dress wound',
  'Take vitals',
];

const initialsOf = (fullName: string): string =>
  fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

const UnitChoice = ({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-[13px] p-4 text-left text-[15px] font-bold ${
      selected ? 'border-2 border-brand bg-brand-wash text-brand' : 'border-[1.5px] border-outline bg-white font-semibold text-ink-soft'
    }`}
  >
    {label}
  </button>
);

/**
 * 4.6 Send patient to another unit — an instruction travels with the patient,
 * so the receiving unit sees it the moment they walk in (PRD §9.7).
 */
export const SendToUnitScreen = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const context = useAuthorizationContext();
  const { user } = useSession();
  const { patientId, encounterId } = (useLocation().state as SendToUnitNavState) ?? {};
  const patient = usePatient(patientId);
  const units = useUnits();
  const [fromUnitId, setFromUnitId] = useState(readDeviceUnit());
  const [toUnitId, setToUnitId] = useState<string>();
  const [instruction, setInstruction] = useState('');
  const [sending, setSending] = useState(false);

  const active = (units.data ?? []).filter((unit) => unit.active);
  const from = active.find((unit) => unit.id === fromUnitId);
  const to = active.find((unit) => unit.id === toUnitId && unit.id !== from?.id);

  const addQuick = (phrase: string) =>
    setInstruction((prev) => (prev.trim() ? `${prev.trim()}. ${phrase}` : phrase));

  const chooseFrom = (unitId: string) => {
    setFromUnitId(unitId);
    rememberDeviceUnit(unitId);
  };

  const send = async () => {
    if (!patientId || !from || !to) return;
    setSending(true);
    try {
      await sendHandoff({ patientId, encounterId, fromUnitId: from.id, toUnitId: to.id, instruction }, context);
      toast(`Sent to ${to.name}`);
      navigate(-1);
    } catch (cause) {
      toast(cause instanceof AuthorizationError ? cause.message : 'Could not send the patient — please try again', { tone: 'error' });
      setSending(false);
    }
  };

  if (!patientId) {
    return (
      <div className="min-h-screen bg-surface px-5 py-8 text-center text-[14px] text-ink-muted">
        Send a patient from their profile or encounter.{' '}
        <button type="button" className="font-bold text-brand" onClick={() => navigate('/patients/search')}>
          Find a patient
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <AppBar title="Send patient to…" onBack={() => navigate(-1)} right={<SyncPill />} />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col md:max-w-lg lg:my-8 lg:min-h-0 lg:flex-none lg:overflow-hidden lg:rounded-card lg:border lg:border-outline-soft lg:bg-white lg:shadow-card">
        <div className="flex-1 px-5 py-3">
          {/* Patient */}
          <div className="mb-4 flex items-center gap-3 rounded-[13px] bg-brand-tint px-3.5 py-3">
            <Avatar tone="green" size="sm">{patient.data ? initialsOf(patient.data.fullName) : '··'}</Avatar>
            <div className="min-w-0">
              <div className="truncate text-[15px] font-bold text-brand">{patient.data?.fullName ?? 'Loading…'}</div>
              <div className="font-mono text-[11px] text-brand-strong">{patientId}</div>
            </div>
          </div>

          {units.loading ? (
            <div className="h-[120px] animate-pulse rounded-card bg-surface-muted" />
          ) : active.length < 2 ? (
            <div className="rounded-card border border-dashed border-outline p-4 text-center text-[13px] leading-relaxed text-ink-muted">
              This facility needs at least two units to send patients between them.{' '}
              {user.roleId === 'facility_admin' ? (
                <button type="button" className="font-bold text-brand" onClick={() => navigate('/admin/units')}>
                  Set up units
                </button>
              ) : (
                'Ask your facility admin to set them up.'
              )}
            </div>
          ) : (
            <>
              <div className="mb-2.5 text-[13px] font-semibold text-ink-soft">Sending from</div>
              <div className="mb-5 grid grid-cols-2 gap-2.5">
                {active.map((unit) => (
                  <UnitChoice key={unit.id} label={unit.name} selected={from?.id === unit.id} onClick={() => chooseFrom(unit.id)} />
                ))}
              </div>

              <div className="mb-2.5 text-[13px] font-semibold text-ink-soft">Which unit?</div>
              <div className="mb-5 grid grid-cols-2 gap-2.5">
                {active
                  .filter((unit) => unit.id !== from?.id)
                  .map((unit) => (
                    <UnitChoice key={unit.id} label={unit.name} selected={to?.id === unit.id} onClick={() => setToUnitId(unit.id)} />
                  ))}
              </div>

              <div className="mb-2.5 text-[13px] font-semibold text-ink-soft">Instruction for the receiving unit</div>
              <textarea
                rows={3}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="e.g. Give tetanus toxoid injection (TT1)"
                className="w-full rounded-field border-2 border-brand bg-white p-4 text-base text-ink outline-none placeholder:text-ink-muted"
              />
              <div className="mt-2.5 flex flex-wrap gap-2">
                {QUICK_INSTRUCTIONS.map((q) => (
                  <ChoiceChip key={q} selected={false} onClick={() => addQuick(q)}>
                    + {q}
                  </ChoiceChip>
                ))}
              </div>
              <p className="mt-2.5 text-[13px] leading-relaxed text-ink-muted">
                {to ? `The ${to.name} sees` : 'The receiving unit sees'} this the moment the patient walks in — no need to
                explain again.
              </p>
            </>
          )}
        </div>

        <footer className="px-5 pb-6 pt-4">
          <Button
            variant="primary"
            disabled={!from || !to || !instruction.trim() || sending}
            loading={sending}
            onClick={() => void send()}
          >
            {to ? `Send to ${to.name}` : 'Choose a unit'}
          </Button>
        </footer>
      </div>
    </div>
  );
};
