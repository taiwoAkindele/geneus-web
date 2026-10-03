import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Button } from '@/ui';
import { SyncPill } from '@/app/SyncPill';
import { toPatientDetails, useSavePatient, type RegistrationValues } from '@/features/registration';
import { currentAge, findLikelyMatches, usePatients, type MatchReason } from '@/features/search';

export type DuplicateNavState = { values: RegistrationValues; matchIds: string[] } | null;

const REASON_LABEL: Record<MatchReason, string> = {
  name: '✓ Name matches',
  phone: '✓ Phone matches',
  age: '✓ Age matches',
  sex: '✓ Sex matches',
  address: '✓ Address matches',
};

const initialsOf = (fullName: string): string =>
  fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

const formatDay = (iso: string): string => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/**
 * 4.5 Duplicate check — one tap: "Is this the same person?" (PRD §10). Shown
 * as a bottom sheet over the (blurred) registration form when the form found a
 * likely match. Nothing is written until the person at the desk answers.
 */
export const DuplicateCheckScreen = () => {
  const navigate = useNavigate();
  const savePatient = useSavePatient();
  const state = useLocation().state as DuplicateNavState;
  const patients = usePatients();
  const [index, setIndex] = useState(0);
  const [comparing, setComparing] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!state) return <Navigate to="/patients/new" replace />;

  const candidates = (patients.data ?? []).filter((patient) => state.matchIds.includes(patient.patientId));
  const matches = findLikelyMatches(toPatientDetails(state.values), candidates);
  const match = matches[Math.min(index, matches.length - 1)];

  const registerAsNew = async () => {
    setSaving(true);
    await savePatient(state.values);
    setSaving(false);
  };

  const typedAge = state.values.age || (state.values.dateOfBirth ? `born ${state.values.dateOfBirth}` : '—');
  const comparison = match
    ? [
        { label: 'Name', typed: state.values.fullName, registered: match.patient.fullName },
        { label: 'Sex', typed: state.values.sex, registered: match.patient.sex === 'female' ? 'F' : 'M' },
        { label: 'Age', typed: typedAge, registered: String(currentAge(match.patient) ?? '—') },
        { label: 'Phone', typed: state.values.phone || '—', registered: match.patient.phone ?? '—' },
        { label: 'Address', typed: state.values.address, registered: match.patient.address },
      ]
    : [];

  return (
    <div className="relative flex min-h-screen flex-col bg-surface">
      <div className="flex justify-end px-5 pt-4">
        <SyncPill />
      </div>

      {/* Blurred form behind the sheet */}
      <div className="pointer-events-none flex-1 px-5 py-4 opacity-50 blur-[2px]" aria-hidden>
        <div className="mb-4 h-5 w-3/5 rounded bg-surface-high" />
        <div className="mb-3.5 h-[52px] rounded-field bg-surface-high" />
        <div className="mb-3.5 h-[52px] rounded-field bg-surface-high" />
        <div className="h-[52px] rounded-field bg-surface-high" />
      </div>

      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md rounded-t-[26px] bg-white px-5 pb-7 pt-6 shadow-sheet md:max-w-lg sm:inset-0 sm:h-fit sm:max-h-[92vh] sm:overflow-auto sm:rounded-[26px] sm:m-auto">
        <div className="mx-auto mb-5 h-1.5 w-10 rounded-full bg-outline-hair sm:hidden" />
        <div className="flex items-center gap-2.5">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-amber-bg font-extrabold text-amber-text">
            !
          </span>
          <h1 className="text-[19px] font-extrabold tracking-[-0.02em]">Is this the same person?</h1>
        </div>
        <p className="mb-4 mt-1.5 text-sm leading-relaxed text-ink-muted">
          We found someone already registered here who looks like a close match.
        </p>

        {patients.loading ? (
          <div className="h-[132px] animate-pulse rounded-card bg-surface-muted" aria-label="Loading the match" />
        ) : match ? (
          <div className="rounded-card bg-surface-muted p-4">
            <div className="flex items-center gap-3">
              <Avatar tone="green" size="lg">{initialsOf(match.patient.fullName)}</Avatar>
              <div className="flex-1">
                <div className="text-[17px] font-bold">{match.patient.fullName}</div>
                <div className="text-[13px] text-ink-muted">
                  {[match.patient.sex === 'female' ? 'F' : 'M', currentAge(match.patient), match.patient.phone]
                    .filter((part) => part !== undefined && part !== '')
                    .join(' · ')}
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {match.reasons.map((reason) => (
                <span key={reason} className="rounded-full bg-brand-tint px-2.5 py-1 text-xs font-bold text-brand">
                  {REASON_LABEL[reason]}
                </span>
              ))}
            </div>
            <div className="mt-3 font-mono text-xs text-brand">
              {match.patient.patientId} · reg. {formatDay(match.patient.createdOn)}
            </div>

            {comparing ? (
              <table className="mt-3 w-full text-left text-[13px]">
                <thead>
                  <tr className="text-ink-muted">
                    <th className="py-1 font-semibold" />
                    <th className="py-1 font-semibold">Being registered</th>
                    <th className="py-1 font-semibold">Already registered</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((row) => (
                    <tr key={row.label} className="border-t border-outline-soft">
                      <th className="py-1.5 pr-2 font-semibold text-ink-soft">{row.label}</th>
                      <td className="py-1.5 pr-2">{row.typed}</td>
                      <td className="py-1.5">{row.registered}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            {matches.length > 1 ? (
              <button
                type="button"
                className="mt-3 text-[13px] font-bold text-brand"
                onClick={() => setIndex((index + 1) % matches.length)}
              >
                Another possible match ({Math.min(index, matches.length - 1) + 1} of {matches.length}) →
              </button>
            ) : null}
          </div>
        ) : (
          <div className="rounded-card border border-dashed border-outline p-4 text-center text-[13px] text-ink-muted">
            The possible match is no longer on this device.
          </div>
        )}

        <div className="mt-4">
          <Button
            variant="primary"
            disabled={!match || saving}
            onClick={() => match && navigate('/patients/profile', { state: { patientId: match.patient.patientId }, replace: true })}
          >
            Yes — open this record
          </Button>
        </div>
        <div className="pt-1">
          <Button variant="outlined" disabled={saving} loading={saving} onClick={registerAsNew}>
            No — register as a new person
          </Button>
        </div>
        {/* Not every match is clear-cut; don't force a guess between the two. */}
        {match && !comparing ? (
          <div className="pt-1">
            <Button variant="ghost" onClick={() => setComparing(true)}>
              Not sure — compare details
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
};
