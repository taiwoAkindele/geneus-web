import { useRef, useState } from 'react';
import { orderLine, type WardCareEvent, type WardRecords } from '@shared';
import { Button, Sheet, SelectField, TextAreaField, TextField } from '@/ui';
import { useAuthorizationContext } from '@/session';
import { saveWardEvent, type WardSession } from '@/data/repos/wardCare';
import { zonedInput, zonedInstant } from '@/lib/workforceTime';
import { useDeviceContext } from '@/data';

export const WardMedicationSheet = ({ session, order, records, action = 'administration', previous, onClose, onSaved }: { session: WardSession; order: WardCareEvent; records: WardRecords; action?: 'administration' | 'continue' | 'stop'; previous?: WardCareEvent; onClose: () => void; onSaved: () => void }) => {
  const context = useAuthorizationContext(), { facility } = useDeviceContext(), zone = facility?.timeZone ?? 'Africa/Lagos';
  const line = orderLine(order, records.entries);
  const prior = previous?.values.kind === 'administration' ? previous.values : undefined;
  const [at, setAt] = useState(() => previous ? zonedInput(previous.occurredOn, zone) : '');
  const [outcome, setOutcome] = useState<'given' | 'not_given'>(prior?.outcome ?? 'given'), [dose, setDose] = useState(prior?.dose ?? line?.dose ?? ''), [route, setRoute] = useState(prior?.route ?? line?.route ?? ''), [reason, setReason] = useState('');
  const [reviewing, setReviewing] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const busy = useRef(false), requestId = useRef(`ward_care_event:${crypto.randomUUID()}`);
  const save = async () => {
    if (busy.current) return;
    if (!reviewing) { setReviewing(true); return; }
    busy.current = true; setSaving(true); setError('');
    try {
      if (order.values.kind !== 'medication') throw new Error('Select a medication order');
      if ((outcome === 'not_given' || previous || action !== 'administration') && !reason.trim()) throw new Error('Record the reason for this decision or correction');
      if (action === 'administration') await saveWardEvent(session, { kind: 'administration', orderEventId: order.id, dose, route: route || undefined, outcome, reason: reason || undefined, previousId: previous?.id }, context, { requestId: requestId.current, occurredOn: previous?.occurredOn ?? (at ? zonedInstant(at, zone) : undefined) });
      else await saveWardEvent(session, { ...order.values, action, previousId: order.id, note: reason }, context, { requestId: requestId.current });
      onSaved(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The medication record could not be saved'); }
    finally { busy.current = false; setSaving(false); }
  };
  let actualTime = Date.now();
  try { if (at) actualTime = Date.parse(zonedInstant(at, zone)); } catch { actualTime = NaN; }
  const possible = records.events.some((e) => e.values.kind === 'administration' && e.values.orderEventId === order.id && Math.abs(Date.parse(e.occurredOn) - actualTime) < 300000 && e.id !== previous?.id);
  const dirty = Boolean(reason || reviewing || at !== (previous ? zonedInput(previous.occurredOn, zone) : '') || outcome !== (prior?.outcome ?? 'given') || dose !== (prior?.dose ?? line?.dose ?? '') || route !== (prior?.route ?? line?.route ?? ''));
  return <Sheet title={previous ? 'Correct administration record' : action === 'administration' ? 'Record medication administration' : `${action === 'stop' ? 'Stop' : 'Continue'} medication order`} eyebrow={line?.drug ?? 'Medication'} onClose={onClose} closeDisabled={saving} hasUnsavedChanges={dirty}>
    <div className="space-y-4">
      <p className="font-bold">{line?.drug} · {line?.dose} {line?.frequency} {line?.route}</p>
      <p className="text-sm text-ink-soft">This records an actual administration or an explicit order decision. Supplying medicine is recorded separately.</p>
      {reviewing ? <dl className="space-y-2"><dt className="font-bold">Decision</dt><dd>{action === 'administration' ? `${outcome === 'given' ? 'Given' : 'Not given'} · ${dose} · ${route} · ${at || 'At signing'}` : action}</dd><dt className="font-bold">Reason / note</dt><dd className="whitespace-pre-wrap">{reason || 'No additional note'}</dd></dl> : <>
        {action === 'administration' ? <><SelectField label="Administration outcome" value={outcome} onChange={(e) => setOutcome(e.target.value as 'given' | 'not_given')} options={[{ value: 'given', label: 'Given' }, { value: 'not_given', label: 'Not given' }]} /><TextField label="Actual dose" value={dose} onChange={(e) => setDose(e.target.value)} /><TextField label="Actual route (if applicable)" value={route} onChange={(e) => setRoute(e.target.value)} /><TextField label={`Actual administration time (${zone}, optional)`} hint="Leave blank to record the time you sign." type="datetime-local" disabled={Boolean(previous)} value={at} onChange={(e) => setAt(e.target.value)} /></> : null}
        <TextAreaField label="Reason / note" value={reason} onChange={(e) => setReason(e.target.value)} />
      </>}
      {possible && !previous ? <p role="status" className="text-sm text-amber-text">Another administration is recorded close to this time. Review the stay history before signing.</p> : null}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <Button disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : reviewing ? 'Confirm & sign medication record' : 'Review medication record'}</Button>
      {reviewing ? <Button variant="outlined" disabled={saving} onClick={() => setReviewing(false)}>Keep editing</Button> : null}
    </div>
  </Sheet>;
};
