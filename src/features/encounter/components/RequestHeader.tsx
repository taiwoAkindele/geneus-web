import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { patientAge, patientSexLabel, type Patient } from '@shared';
import { AllergyAlert } from '@/features/clinical';

/**
 * The patient a Laboratory or Pharmacy request is for: who they are, the sex and
 * age that decide a result's normal range, and their allergies. Then the way back.
 */
export const RequestHeader = ({ patient, back, children }: { patient: Patient; back: { to: string; label: string }; children?: ReactNode }) => {
  const age = patientAge(patient);
  return <header className="space-y-3 border-b border-outline-soft pb-4">
    <Link to={back.to} className="inline-flex min-h-[44px] items-center font-bold text-brand">{back.label}</Link>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold">{patient.fullName}</h1>
        <p className="mt-1 text-sm text-ink-soft"><span className="break-all font-mono">{patient.patientId}</span> · {patientSexLabel(patient.sex)} · {age === undefined ? 'Age not recorded' : `${age} years`}</p>
      </div>
      {children}
    </div>
    <AllergyAlert patientId={patient.patientId} />
  </header>;
};
