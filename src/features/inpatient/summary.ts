import { INPATIENT_STATUS, activeAdmission, linkedPatientIds, type PatientIdentityEvent } from '@shared';
import type { InpatientData } from '@/data/repos/inpatient';
import type { EncounterSummary } from '@/features/encounter/encounterSummary';

export const withAdmission = (visit: EncounterSummary, data?: InpatientData): EncounterSummary => {
  const admission = data?.heads.find((event) => event.encounterId === visit.id && event.action !== 'cancel');
  if (!admission || !data) return { ...visit, careType: 'outpatient',
    ...(visit.status === 'Admitted' || visit.chips.includes('Admission requested') ? { status: 'Closed' as const, admissionStatus: 'Admission requested', nextAction: 'Awaiting ward admission confirmation' } : {}),
  };
  const active = activeAdmission(admission);
  const ward = data.locations.find((location) => location.id === admission.wardId)?.name;
  const bed = data.locations.find((location) => location.id === admission.bedId)?.name;
  return { ...visit, status: active ? 'Admitted' : 'Closed', careType: active ? 'inpatient' : 'past_inpatient',
    admissionStatus: INPATIENT_STATUS[admission.action], wardBed: [ward, bed].filter(Boolean).join(' · ') || 'Awaiting bed',
    nextAction: active ? `${INPATIENT_STATUS[admission.action]} · ${[ward, bed].filter(Boolean).join(' · ') || 'Receiving team to allocate a bed'}` : 'View discharged stay',
  };
};
/** One row per patient, preferring their active admission over a newer unrelated visit. */
export const clinicalPatientRows = (visits: readonly EncounterSummary[], identities: readonly PatientIdentityEvent[] = []): EncounterSummary[] => {
  const result = new Map<string, EncounterSummary>();
  for (const visit of [...visits].sort((a, b) => b.openedOn.localeCompare(a.openedOn))) {
    const patientKey = linkedPatientIds(visit.patientId, identities).sort()[0];
    const prior = result.get(patientKey);
    if (!prior || (visit.careType === 'inpatient' && prior.careType !== 'inpatient')) result.set(patientKey, visit);
  }
  return [...result.values()];
};
