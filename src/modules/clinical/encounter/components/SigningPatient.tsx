import { patientSexLabel } from '@shared';
import { currentAge, usePatient } from '@/modules/front-desk/search';

/**
 * Who a signature is for, repeated inside every signing and recording dialog.
 * A dialog covers the page header on a phone, so the patient must be named
 * where the decision is made (wrong-patient prevention).
 */
export const SigningPatient = ({ patientId, label = 'Patient' }: { patientId: string; label?: string }) => {
  const patient = usePatient(patientId).data;
  const age = patient ? currentAge(patient) : undefined;
  return <div aria-label={`${label}: ${patient?.fullName ?? patientId}`} className="mb-4 rounded-card border-2 border-ink/80 bg-white px-4 py-3">
    <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">{label}</p>
    <p className="mt-0.5 break-words text-[17px] font-extrabold leading-snug text-ink">{patient?.fullName ?? 'Patient'}</p>
    <p className="mt-0.5 text-[13px] text-ink-soft"><span className="break-all font-mono">{patientId}</span>{patient ? ` · ${age === undefined ? 'Age not recorded' : `${age} years`} · ${patientSexLabel(patient.sex)}` : ''}</p>
  </div>;
};
