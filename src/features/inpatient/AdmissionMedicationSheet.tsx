import { useRef, useState } from 'react';
import type { PrescriptionLine } from '@shared';
import { Button, Sheet, TextAreaField } from '@/ui';
import { useAuthorizationContext } from '@/session';
import { saveWardEvent, type WardSession } from '@/data/repos/wardCare';

/** A new ward decision references the original prescription instead of copying it. */
export const AdmissionMedicationSheet = ({ session, sourceEntryId, line, onClose, onSaved }: { session: WardSession; sourceEntryId: string; line: PrescriptionLine; onClose: () => void; onSaved: () => void }) => {
  const context = useAuthorizationContext(), id = useRef(`ward_care_event:${crypto.randomUUID()}`), busy = useRef(false);
  const [note, setNote] = useState(''), [reviewing, setReviewing] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const save = async () => {
    if (busy.current) return;
    if (!note.trim()) { setError('Record your decision to use these instructions for ward care'); return; }
    if (!reviewing) { setReviewing(true); return; }
    busy.current = true; setSaving(true);
    try { await saveWardEvent(session, { kind: 'medication', orderId: id.current, action: 'start', sourceEntryId, lineId: line.lineId!, note }, context, { requestId: id.current, finish: true }); onSaved(); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The ward medication decision could not be recorded'); }
    finally { busy.current = false; setSaving(false); }
  };
  return <Sheet title="Review admission prescription for ward use" eyebrow={line.drug} onClose={onClose} closeDisabled={saving} hasUnsavedChanges={Boolean(note)}><div className="space-y-4"><p className="font-bold">{[line.drug,line.dose,line.frequency,line.duration,line.route].filter(Boolean).join(' · ')}</p><p className="text-sm">Signing records your decision to use these existing instructions during this stay. The original prescription stays unchanged. Use a doctor review if the instructions need changing.</p>{reviewing ? <p className="whitespace-pre-wrap">{note}</p> : <TextAreaField label="Ward medication decision / reason" value={note} onChange={(e) => setNote(e.target.value)} />}{error ? <p role="alert" className="text-danger">{error}</p> : null}<Button disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : reviewing ? 'Confirm & sign ward medication decision' : 'Review ward medication decision'}</Button>{reviewing ? <Button variant="outlined" disabled={saving} onClick={() => setReviewing(false)}>Keep editing</Button> : null}</div></Sheet>;
};
