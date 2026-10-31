import { useState } from 'react';
import { INPATIENT_STATUS, inpatientBedStates, wardForBed, type EncounterEntry, type InpatientEvent, type InpatientAction } from '@shared';
import { Button, SelectField, Sheet, TextAreaField } from '@/ui';
import { useAuthorizationContext } from '@/session';
import { changeAdmission, confirmAdmission, type InpatientData } from '@/data/repos/inpatient';

export const ADMISSION_ACTION_LABELS: Record<InpatientAction, string> = {
  confirm: 'Confirm admission', reserve: 'Reserve bed', arrive: 'Confirm ward arrival', transfer: 'Confirm transfer',
  ready_for_discharge: 'Mark ready for discharge', continue_care: 'Continue ward care', discharge: 'Confirm departure', cancel: 'Cancel admission',
};
export type AdmissionTask = { action: InpatientAction; admission?: InpatientEvent; request?: EncounterEntry };
export const AdmissionActionSheet = ({ task, data, patientName, onClose, onSaved }: { task: AdmissionTask; data: InpatientData; patientName: string; onClose: () => void; onSaved: () => void }) => {
  const context = useAuthorizationContext();
  const [unit, setUnit] = useState(task.admission?.receivingUnitId ?? '');
  const [ward, setWard] = useState(task.admission?.wardId ?? '');
  const [bed, setBed] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const allocation = task.action === 'reserve' || task.action === 'transfer';
  const wards = data.locations.filter((location) => location.kind === 'ward' && location.active);
  const bedStates = inpatientBedStates(data.events, data.ready);
  const beds = data.locations.filter((location) => location.kind === 'bed' && location.active && wardForBed(location, data.locations)?.id === ward && (!bedStates.has(location.id) || (location.id === task.admission?.bedId && task.action === 'reserve')));
  const requiredNote = ['cancel', 'transfer', 'continue_care'].includes(task.action);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      if (task.action === 'confirm' && task.request) await confirmAdmission(task.request, unit, note, context);
      else if (task.action !== 'confirm' && task.admission) await changeAdmission(task.admission, task.action, context, { ...(allocation ? { wardId: ward, bedId: bed, receivingUnitId: unit } : {}), note });
      else throw new Error('Reopen this request before saving');
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The change could not be saved. Try again'); }
    finally { setSaving(false); }
  };
  return <Sheet title={ADMISSION_ACTION_LABELS[task.action]} eyebrow={patientName} placement="side" onClose={onClose} closeDisabled={saving} hasUnsavedChanges={Boolean(note || bed || unit !== (task.admission?.receivingUnitId ?? ''))}>
    <form onSubmit={save} className="space-y-5">
      <p className="break-all font-mono text-sm text-ink-soft">Patient ID: {task.admission?.patientId ?? task.request?.patientId}</p>
      {task.admission?.bedId ? <p className="font-bold">{data.locations.find((location) => location.id === task.admission?.wardId)?.name} · {data.locations.find((location) => location.id === task.admission?.bedId)?.name}</p> : null}
      <p className="text-sm text-ink-soft">{task.admission ? `Current stage: ${INPATIENT_STATUS[task.admission.action]}.` : 'The signed consultation stays unchanged. Confirmation starts an inpatient stay linked to this visit.'}</p>
      {task.action === 'confirm' || allocation ? <SelectField label="Receiving team" required value={unit} onChange={(event) => setUnit(event.target.value)} options={[{ value: '', label: 'Choose receiving team' }, ...data.units.filter((item) => item.active && (item.kind ?? 'unit') === 'unit').map((item) => ({ value: item.id, label: item.name }))]} /> : null}
      {allocation ? <><SelectField label="Ward" required value={ward} onChange={(event) => { setWard(event.target.value); setBed(''); }} options={[{ value: '', label: 'Choose ward' }, ...wards.map((item) => ({ value: item.id, label: item.name }))]} />
        <SelectField label="Bed" required value={bed} onChange={(event) => setBed(event.target.value)} options={[{ value: '', label: 'Choose an available bed' }, ...beds.map((item) => ({ value: item.id, label: item.name }))]} />
        {ward && !beds.length ? <p role="status" className="text-sm text-amber-text">No available beds in this ward. Check the bed board or choose another ward.</p> : null}</> : null}
      {task.action === 'arrive' ? <p className="rounded-field bg-brand-wash p-4">Confirm this only after the patient has physically arrived at the reserved ward and bed.</p> : null}
      {task.action === 'transfer' ? <p className="text-sm text-ink-soft">This records a completed move to the selected bed. The previous bed will await cleaning.</p> : null}
      {task.action === 'discharge' ? <p className="rounded-field bg-amber-bg p-4 text-amber-text">Confirm actual departure after the responsible team has completed discharge arrangements. The bed will await cleaning.</p> : null}
      <TextAreaField label={requiredNote ? 'Reason / handover note' : 'Handover note (optional)'} required={requiredNote} value={note} onChange={(event) => setNote(event.target.value)} maxLength={4000} />
      <p className="text-sm text-ink-soft">Saved on this device first. Bed allocation remains pending until the server checks other devices.</p>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" disabled={saving}>{saving ? 'Saving…' : ADMISSION_ACTION_LABELS[task.action]}</Button>
      <Button variant="outlined" disabled={saving} onClick={onClose}>Cancel</Button>
    </form>
  </Sheet>;
};
