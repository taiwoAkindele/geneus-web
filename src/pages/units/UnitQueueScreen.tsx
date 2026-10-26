import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Handoff } from '@shared';
import { Button, SectionTabs, DataTable, Sheet, Tag, useToast } from '@/ui';
import { markHandoff } from '@/data/repos/handoffs';
import { usePatients } from '@/features/search';
import { readDeviceUnit, rememberDeviceUnit, useIncomingHandoffs, useUnits } from '@/features/units';
import { useAuthorizationContext } from '@/session';

const timeOf = (at: string) => new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export const UnitQueueScreen = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const context = useAuthorizationContext();
  const units = useUnits();
  const patients = usePatients();
  const [unitId, setUnitId] = useState(readDeviceUnit());
  const incoming = useIncomingHandoffs(unitId);
  const [busyId, setBusyId] = useState<string>();
  const [completing, setCompleting] = useState<Handoff>();
  useEffect(() => { document.title = 'Unit queue · Geneus Health'; }, []);
  const busy = useRef(false);
  const active = (units.data ?? []).filter((unit) => unit.active);
  const unit = units.data?.find((candidate) => candidate.id === unitId);
  const unitName = (id: string) => units.data?.find((candidate) => candidate.id === id)?.name ?? 'another unit';
  const patientName = (id: string) => patients.data?.find((patient) => patient.patientId === id)?.fullName ?? id;
  const choose = (id: string) => { setUnitId(id); rememberDeviceUnit(id); };
  const mark = async (handoff: Handoff, status: 'received' | 'done') => {
    if (busy.current) return;
    busy.current = true; setBusyId(handoff.id);
    try { await markHandoff(handoff, status, context); toast(status === 'received' ? 'Marked as arrived' : 'Marked as done'); }
    catch (cause) { toast(cause instanceof Error ? cause.message : 'Could not update the handoff', { tone: 'error' }); }
    finally { busy.current = false; setBusyId(undefined); }
  };
  const actions = (handoff: Handoff) => <div className="flex flex-wrap gap-2">
    {context.permissions.includes('handoff:update') ? <>
      {handoff.status === 'pending' ? <Button variant="outlined" fullWidth={false} className="px-3 py-2" disabled={Boolean(busyId)} onClick={() => void mark(handoff, 'received')}>Arrived</Button> : null}
      <Button fullWidth={false} className="px-3 py-2" loading={busyId === handoff.id} disabled={Boolean(busyId)} onClick={() => setCompleting(handoff)}>Complete handoff</Button>
    </> : null}
    <Button variant="ghost" fullWidth={false} className="px-3 py-2" disabled={Boolean(busyId)} onClick={() => handoff.encounterId ? navigate('/encounters/record', { state: { patientId: handoff.patientId, encounterId: handoff.encounterId } }) : navigate('/patients/profile', { state: { patientId: handoff.patientId } })}>Open record</Button>
  </div>;
  const list = incoming.data ?? [];
  return (
    <div className="min-h-screen bg-surface">
      <div className="space-y-4 px-5 py-3 md:px-8">
        <h1 className="text-[24px] font-extrabold">Unit queue</h1>
        <p className="text-sm text-ink-muted">Instructions sent to a unit. Completing a handoff does not sign a result, dispense medication or close the visit.</p>
        {units.loading ? <p role="status">Reading units…</p> : units.error ? <div role="alert">Units could not be read.<Button variant="ghost" onClick={units.reload}>Try again</Button></div> : active.length === 0 ? <p className="rounded-card border border-dashed border-outline p-4 text-sm text-ink-muted">A facility admin can add units under Admin → Units &amp; rooms.</p> : <SectionTabs label="Receiving units" value={unitId ?? ''} onChange={choose} options={(units.data ?? []).map((candidate) => ({ value: candidate.id, label: candidate.name + (candidate.active ? '' : ' (retired)') }))} />}
        {unit ? <>
          <h2 className="text-lg font-bold">{unit.name}{unit.active ? '' : ' · retired unit'}</h2>
          <h2 className="text-[15px] font-bold">Sent here · oldest first{!incoming.loading && !incoming.error ? ` · ${list.length} waiting` : ''}</h2>
          {incoming.loading ? <div role="status" className="h-24 animate-pulse rounded-card bg-surface-muted" aria-label="Loading unit queue" /> : incoming.error ? <div role="alert">The queue could not be read.<Button variant="ghost" onClick={incoming.reload}>Try again</Button></div> : list.length === 0 ? <p className="rounded-card border border-dashed border-outline p-4 text-sm text-ink-muted">Nobody is waiting for {unit.name}.</p> : <>
            <div className="space-y-3 lg:hidden">{list.map((handoff) => <article key={handoff.id} className="space-y-3 rounded-card border border-outline-soft bg-white p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">{patientName(handoff.patientId)}</h3><p className="mt-1 text-[13px] text-ink-muted">From {unitName(handoff.fromUnitId)} · {timeOf(handoff.createdOn)}</p></div><Tag tone={handoff.status === 'pending' ? 'amber' : 'slate'}>{handoff.status === 'pending' ? 'On the way' : 'Here'}</Tag></div><p className="rounded-field bg-brand-wash p-3 text-sm font-semibold text-brand">{handoff.instruction}</p>{actions(handoff)}</article>)}</div>
            <div className="hidden lg:block"><DataTable caption={unit.name + ' queue'} rows={list} rowKey={(row) => row.id} columns={[
              { key: 'patient', label: 'Patient', sortValue: (row) => patientName(row.patientId), render: (row) => <div className="font-semibold">{patientName(row.patientId)}<div className="mt-1 font-mono text-[11px] font-normal text-ink-muted">{row.patientId}</div></div> },
              { key: 'from', label: 'Sent from', render: (row) => unitName(row.fromUnitId) },
              { key: 'when', label: 'Sent at', sortValue: (row) => row.createdOn, render: (row) => timeOf(row.createdOn) },
              { key: 'instruction', label: 'Instruction', render: (row) => row.instruction },
              { key: 'status', label: 'Status', render: (row) => row.status === 'pending' ? 'On the way' : 'Here' },
              { key: 'actions', label: 'Actions', render: actions },
            ]} /></div>
          </>}
        </> : null}
      </div>
      {completing ? <Sheet title="Complete this handoff?" onClose={() => setCompleting(undefined)} closeDisabled={Boolean(busyId)}><h3 className="font-bold">{patientName(completing.patientId)}</h3><p className="mt-3 rounded-field bg-brand-wash p-3 text-sm">{completing.instruction}</p><p className="mt-3 text-sm text-ink-muted">Confirm that this instruction has been carried out. Record any clinical result or medication separately in the visit.</p><div className="mt-5 flex flex-wrap gap-3"><Button fullWidth={false} variant="outlined" disabled={Boolean(busyId)} onClick={() => setCompleting(undefined)}>Keep in queue</Button><Button fullWidth={false} loading={Boolean(busyId)} onClick={async () => { await mark(completing, 'done'); setCompleting(undefined); }}>Confirm completed handoff</Button></div></Sheet> : null}
    </div>
  );
};
