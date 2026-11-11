import { useState } from 'react';
import type { Handoff, WorkOwnershipEvent } from '@shared';
import { Button, SelectField, Sheet, TextAreaField, Tag } from '@/ui';
import { useAuthorizationContext } from '@/session';
import { eventHeads, saveOwnership, type WorkforceData } from '@/data/repos/workforce';
import { humanize, proposalState } from './presentation';
export const OwnershipPanel = ({ source, data }: {
  source: Handoff;
  data: WorkforceData;
}) => {
  const context = useAuthorizationContext(), [action, setAction] = useState<WorkOwnershipEvent['action']>(), [reason, setReason] = useState(''), [recipient, setRecipient] = useState(''), [service, setService] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const history = data.ownership.filter((e) => e.sourceId === source.id);
  const accepted = history.filter((e) => !data.pending.has(e.id) && !data.receipts.some((r) => r.id === e.id && r.outcome === 'rejected') && !data.rejections.some((r) => r.type === 'sync_rejection' && r.entityId === e.id && !r.resolvedOn));
  const heads = eventHeads(accepted), previous = heads[0], pending = history.filter((e) => data.pending.has(e.id)), unit = data.units.find((u) => [u.id, u.unitId].includes(source.toUnitId));
  const offerings = data.offerings.filter((o) => unit && [unit.id, unit.unitId].includes(o.unitId) && o.configuration === 'active');
  const chosen = service || previous?.offeringId || (offerings.length === 1 ? offerings[0].id : '');
  const mine = previous?.ownerStaffId === context.userId, isRecipient = previous?.action === 'offer_transfer' && previous.recipientStaffId === context.userId;
  const allowed: WorkOwnershipEvent['action'][] = source.status === 'done' ? [] : !previous || previous.action === 'release' ? ['claim'] : isRecipient ? ['accept_transfer', 'decline_transfer'] : mine ? ['offer_transfer', 'release'] : context.permissions.includes('work_ownership:manage') ? ['release'] : [];
  if (!offerings.length && !previous)
    return null;
  return <div className="mb-3 rounded-field border border-outline-soft p-3 text-sm"><p className="font-bold">Responsibility: {previous?.ownerStaffId ? data.staff.find((s) => s.staffId === previous.ownerStaffId)?.fullName || 'Assigned worker' : 'Accountable service team'}</p>{previous?.action === 'offer_transfer' ? <p className="mt-1 text-ink-muted">Offered to {data.staff.find((s) => s.staffId === previous.recipientStaffId)?.fullName || 'Receiving worker'} · current owner remains responsible until acceptance.</p> : null}{pending.map((e) => <p key={e.id} className="mt-1"><Tag tone="amber">{humanize(e.action)} · {proposalState(e, data)}</Tag></p>)}
    {context.permissions.includes('work_ownership:claim') || context.permissions.includes('work_ownership:manage') ? <div className="mt-2 flex flex-wrap gap-2">{allowed.map((value) => <Button key={value} variant="outlined" fullWidth={false} disabled={Boolean(pending.length) || heads.length > 1} onClick={() => { setError(''); setReason(''); setAction(value); }}>{({ claim: 'Accept work', offer_transfer: 'Hand over', accept_transfer: 'Accept handover', decline_transfer: 'Decline handover', release: 'Return to service' })[value]}</Button>)}</div> : null}
    {action ? <Sheet title={humanize(action)} onClose={() => setAction(undefined)} closeDisabled={busy} hasUnsavedChanges={Boolean(reason || recipient)} placement="side"><p className="mb-3 text-sm">{source.instruction}</p><p className="mb-3 text-xs text-ink-muted">Transfers need recipient acknowledgement. Completing care and signing results remain separate actions.</p>{!previous ? <SelectField label="Accountable service" value={chosen} onChange={(e) => setService(e.target.value)} options={[{ value: '', label: 'Choose a service' }, ...offerings.map((o) => ({ value: o.id, label: o.name }))]} /> : null}{action === 'offer_transfer' ? <SelectField label="Receiving worker" value={recipient} onChange={(e) => setRecipient(e.target.value)} options={[{ value: '', label: 'Choose recipient' }, ...data.staff.filter((s) => s.active && s.staffId !== context.userId).map((s) => ({ value: s.staffId, label: s.fullName }))]} /> : null}{action !== 'claim' ? <TextAreaField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} help={{ purpose: 'Explain what the receiving person or service needs to know.' }} /> : null}{error ? <p role="alert" className="my-3 text-sm text-danger">{error}</p> : null}<Button className="mt-4" disabled={busy || !chosen || (action === 'offer_transfer' && !recipient) || (action !== 'claim' && !reason.trim())} loading={busy} onClick={async () => {
      setBusy(true); try {
        await saveOwnership(source, chosen, action, reason, recipient || undefined, context, previous);
        setAction(undefined);
      }
        catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Could not propose this responsibility change');
        }
        finally {
        setBusy(false);
      }
    }}>Confirm responsibility proposal</Button></Sheet> : null}
  </div>;
};
