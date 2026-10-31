import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Button, Sheet } from '@/ui';
import { toPatientDetails, useSavePatient, useClearRegistrationDraft, useRegistrationDraft } from '@/features/registration';
import { currentAge, findLikelyMatches, usePatients, type MatchReason } from '@/features/search';
import { recordExistingSelection } from '@/data/repos/patientIdentity';
import { useAuthorizationContext } from '@/session';
import { RegistrationRecoveryGate } from '@/features/registration/RegistrationRecoveryPrompt';

export type DuplicateNavState = { matchIds: string[] } | null;

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
const DuplicateCheck = () => {
  const navigate = useNavigate();
  const savePatient = useSavePatient();
  const clearDraft = useClearRegistrationDraft();
  const { values } = useRegistrationDraft();
  const state = useLocation().state as DuplicateNavState;
  const patients = usePatients();
  const [index, setIndex] = useState(0);
  const [comparing, setComparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const context = useAuthorizationContext();

  if (!state || !values.fullName || !values.sex) return <Navigate to="/patients/new" replace />;

  const candidates = (patients.data ?? []).filter((patient) => state.matchIds.includes(patient.patientId));
  const matches = findLikelyMatches(toPatientDetails(values), candidates);
  const match = matches[Math.min(index, matches.length - 1)];

  const registerAsNew = async () => {
    if (saving || reason.trim().length < 3) { setError('Explain why this is a different person or why review is needed'); return; }
    setSaving(true);
    await savePatient(values, undefined, { candidateIds: state.matchIds, outcome: uncertain ? 'review_requested' : 'registration_distinct', reason });
    setSaving(false);
  };

  const useExisting = async () => {
    if (!match || saving) return;
    setSaving(true); setError('');
    try { await recordExistingSelection(match.patient.patientId, context); await clearDraft(); navigate('/patients/profile', { state: { patientId: match.patient.patientId }, replace: true }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not record the identity decision'); }
    finally { setSaving(false); }
  };

  const typedAge = values.age || (values.dateOfBirth ? `born ${values.dateOfBirth}` : '—');
  const comparison = match
    ? [
        { label: 'Name', typed: values.fullName, registered: match.patient.fullName },
        { label: 'Sex', typed: values.sex, registered: match.patient.sex === 'female' ? 'F' : match.patient.sex === 'male' ? 'M' : 'Not recorded' },
        { label: 'Age', typed: typedAge, registered: String(currentAge(match.patient) ?? '—') },
        { label: 'Phone', typed: values.phone || '—', registered: match.patient.phone ?? '—' },
        { label: 'Address', typed: values.address, registered: match.patient.address ?? 'Not recorded' },
      ]
    : [];

  return (
    <Sheet title="Is this the same person?" onClose={() => navigate(-1)} closeDisabled={saving}>
        <p className="mb-4 mt-1.5 text-sm leading-relaxed text-ink-muted">
          We found someone already registered here who looks like a close match.
        </p>

        {patients.error ? <div role="alert" className="rounded-card bg-danger-bg p-4 text-sm text-danger">Possible matches could not be read. <Button variant="ghost" onClick={patients.reload}>Try again</Button></div> : patients.loading ? (
          <div className="h-[132px] animate-pulse rounded-card bg-surface-muted" aria-label="Loading the match" />
        ) : match ? (
          <div className="rounded-card bg-surface-muted p-4">
            <div className="flex items-center gap-3">
              <Avatar tone="green" size="lg">{initialsOf(match.patient.fullName)}</Avatar>
              <div className="flex-1">
                <div className="text-[17px] font-bold">{match.patient.fullName}</div>
                <div className="text-[13px] text-ink-muted">
                  {[match.patient.sex === 'female' ? 'F' : match.patient.sex === 'male' ? 'M' : 'Sex not recorded', currentAge(match.patient), match.patient.phone]
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
            onClick={() => void useExisting()}
          >
            Yes — open this record
          </Button>
        </div>
        <div className="pt-1">
          <label className="my-3 block text-sm font-semibold">Reason for a new record<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} className="mt-2 w-full rounded-field border border-outline p-3" placeholder="Explain the distinguishing details or uncertainty" /></label>
          <label className="mb-3 flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={uncertain} onChange={(event) => setUncertain(event.target.checked)} />Identity is uncertain — flag for records review</label>
          {error ? <p role="alert" className="mb-2 text-sm text-danger">{error}</p> : null}
          <Button variant="outlined" disabled={saving || patients.loading || Boolean(patients.error)} loading={saving} onClick={registerAsNew}>
            {uncertain ? 'Register and request identity review' : 'No — register as a new person'}
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
    </Sheet>
  );
};

export const DuplicateCheckScreen = () => <RegistrationRecoveryGate><DuplicateCheck /></RegistrationRecoveryGate>;
