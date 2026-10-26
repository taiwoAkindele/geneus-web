import { effectiveEncounterEntries, ENCOUNTER_STEP_VALUES, type ClinicalEvent, type ClinicalKind, type EncounterEntry } from '@shared';
import { Button } from '@/ui';

export type ClinicalEditor = { kind: ClinicalKind; previous?: ClinicalEvent; initial?: Record<string, unknown>; patientId?: string };
type Props = { entries: EncounterEntry[]; current: ClinicalEvent[]; canRecord: boolean; onEdit: (editor: ClinicalEditor) => void };
export const PrescriptionHistory = ({ entries, current, canRecord, onEdit }: Props) => {
  const prescriptions = effectiveEncounterEntries(entries)
    .filter((entry) => entry.step === 'diagnosis')
    .sort((a, b) => b.createdOn.localeCompare(a.createdOn));
  if (!prescriptions.length) return null;
  return <details className="rounded-card border border-outline-soft bg-white p-4">
    <summary className="cursor-pointer font-bold">Encounter diagnoses & prescriptions</summary>
    {prescriptions.map((entry) => {
      const diagnosis = ENCOUNTER_STEP_VALUES.diagnosis.parse(entry.values);
      const diagnoses = diagnosis.diagnoses?.length ? diagnosis.diagnoses : [{ label: diagnosis.diagnosis, certainty: 'unknown' as const }];
      return <div key={entry.id} className="mt-3 border-t border-outline-soft pt-3 text-sm">
        <b>{diagnosis.diagnosis}</b> · {new Date(entry.createdOn).toLocaleDateString('en-GB')}
        {diagnoses.map((problem, index) => <div key={index} className="mt-2">
          {problem.label} · {problem.certainty}
          {canRecord ? <Button variant="ghost" onClick={() => onEdit({
            kind: 'problem',
            previous: current.find((event) => event.kind === 'problem' && String(event.values.label).toLowerCase() === problem.label.toLowerCase()),
            initial: { ...problem, status: 'active' },
          })}>Add / review problem</Button> : null}
        </div>)}
        {diagnosis.prescription.map((rx, index) => <div key={index} className="mt-2">
          {rx.drug} · {rx.dose}{rx.frequency ? ` · ${rx.frequency}` : ''}{rx.duration ? ` · ${rx.duration}` : ''}
          {canRecord ? <Button variant="ghost" onClick={() => onEdit({
            kind: 'medication',
            previous: current.find((event) => event.kind === 'medication' && String(event.values.drug).toLowerCase() === rx.drug.toLowerCase()),
            initial: { ...rx, status: 'active', reconciliationNote: `Reviewed prescription from ${entry.createdOn.slice(0, 10)}` },
          })}>Reconcile medication</Button> : null}
        </div>)}
      </div>;
    })}
  </details>;
};
