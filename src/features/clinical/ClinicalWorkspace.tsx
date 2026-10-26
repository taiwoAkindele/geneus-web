import { useCallback, useState } from 'react';
import { ClinicalKind, currentAllergies, unreviewedLegacyAllergies } from '@shared';
import { useLiveQuery } from '@/data';
import { patientClinicalRecord } from '@/data/repos/clinical';
import { useAuthorizationContext } from '@/session';
import { Button } from '@/ui';
import { ClinicalRecordSheet } from './ClinicalRecordSheet';
import { ClinicalRecordCard, clinicalTitle } from './ClinicalRecordCard';
import { ObservationTable } from './ObservationTable';
import { PrescriptionHistory, type ClinicalEditor } from './PrescriptionHistory';
import { CLINICAL_LABELS } from './clinicalForms';
import { observationHistory } from './clinicalSummary';

export const ClinicalWorkspace = ({ patientId, encounterId }: { patientId: string; encounterId?: string }) => {
  const context = useAuthorizationContext();
  const canRecord = context.permissions.includes('encounter:record');
  const live = useLiveQuery(useCallback(() => patientClinicalRecord(patientId), [patientId]));
  const [editor, setEditor] = useState<ClinicalEditor>();
  if (live.loading) return <p role="status" className="p-4 text-sm">Reading clinical summary…</p>;
  if (live.error) return <div role="alert" className="p-4 text-sm text-danger">
    Clinical records could not be read.<Button variant="ghost" onClick={live.reload}>Try again</Button>
  </div>;
  if (!live.data) return null;

  const { current, events, entries, staffNames, patients } = live.data;
  const hasConflicts = new Set(current.map((event) => event.recordId)).size < current.length;
  const problems = current.filter((event) => event.kind === 'problem');
  const medications = current.filter((event) => event.kind === 'medication' && event.values.status === 'active');
  const allergies = currentAllergies(events, patients);
  const legacyAllergies = unreviewedLegacyAllergies(events, patients);
  const plans = current.filter((event) => ['care_plan', 'specialty'].includes(event.kind) && event.values.status === 'active');

  return <section className="my-5 space-y-4" aria-label="Longitudinal clinical record">
    <h2 className="text-lg font-extrabold">Clinical summary</h2>
    {hasConflicts ? <p role="alert" className="rounded-card bg-amber-bg p-3 text-sm text-amber-text">
      Competing clinical versions are awaiting reconciliation. Review all versions and the Sync Center before making treatment decisions.
    </p> : null}
    <div className="rounded-card border border-outline-soft bg-white p-4 text-sm">
      <p><b>Active problems:</b> {problems.filter((event) => event.values.status === 'active').map(clinicalTitle).join(', ') || 'None recorded'}</p>
      <p className="mt-2"><b>Current medications:</b> {medications.map((event) => [event.values.drug, event.values.dose, event.values.frequency].join(' · ')).join('; ') || 'None reconciled'}</p>
      <p className={allergies.length ? 'mt-2 font-bold text-danger' : 'mt-2'}>
        <b>Structured allergies:</b> {allergies.map((allergy) => allergy.allergen + ' (' + [allergy.reaction, allergy.severity, allergy.verification].join('; ') + ')').join('; ') || 'None recorded — allergy status still needs clinical review'}
      </p>
      {plans.map((plan) => <div key={plan.id} className="mt-2">
        <b>{clinicalTitle(plan)}:</b> {String(plan.values.goal ?? plan.values.plan)}
        {plan.values.reviewOn ? ' · Review ' + plan.values.reviewOn : ''}
        {canRecord ? <Button variant="ghost" fullWidth={false} onClick={() => setEditor({ kind: plan.kind, previous: plan })}>Record review / outcome</Button> : null}
      </div>)}
    </div>
    {ClinicalKind.options.map((kind) => {
      const records = current.filter((event) => event.kind === kind);
      const addLabel = { problem: 'problem', history: 'history / examination', medication: 'medication', allergy: 'allergy', care_plan: 'care plan', specialty: 'specialty assessment' }[kind];
      return <details key={kind} open={kind === 'problem'} className="rounded-card border border-outline-soft bg-white p-4">
        <summary className="cursor-pointer font-bold">{CLINICAL_LABELS[kind]} · {records.length}</summary>
        <div className="mt-3 space-y-3">
          {kind === 'allergy' ? legacyAllergies.map((allergy) => <div key={`${allergy.patientId}-${allergy.allergen}`} className="rounded-field border border-amber-border p-3 text-sm">
            <b>{allergy.allergen}</b> · Legacy allergy entry; reaction and severity need review.
            {canRecord ? <Button variant="ghost" onClick={() => setEditor({ kind: 'allergy', patientId: allergy.patientId, initial: { allergen: allergy.allergen } })}>Review legacy allergy</Button> : null}
          </div>) : null}
          {records.map((event) => <ClinicalRecordCard
            key={event.id} event={event} patientId={patientId} staffNames={staffNames} problems={problems}
            versions={events.filter((version) => version.recordId === event.recordId)}
            canRecord={canRecord} onEdit={() => setEditor({ kind, previous: event })}
          />)}
          {!records.length ? <p className="text-sm text-ink-muted">No {CLINICAL_LABELS[kind].toLowerCase()} recorded.</p> : null}
          {canRecord ? <Button variant="outlined" onClick={() => setEditor({ kind })}>Add {addLabel}</Button> : null}
        </div>
      </details>;
    })}
    <PrescriptionHistory entries={entries} current={current} canRecord={canRecord} onEdit={setEditor} />
    <ObservationTable observations={observationHistory(entries)} />
    {editor ? <ClinicalRecordSheet
      key={editor.kind + '-' + (editor.previous?.id ?? 'new')} problems={problems} {...editor} patientId={editor.patientId ?? patientId}
      encounterId={(editor.previous?.patientId ?? editor.patientId ?? patientId) !== patientId ? undefined : encounterId}
      onClose={() => setEditor(undefined)}
    /> : null}
  </section>;
};
