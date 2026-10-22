import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Handoff } from '@shared';
import { AppBar, Button, ChoiceChip, DataTable, Tag, useToast } from '@/ui';
import { SyncPill } from '@/app/SyncPill';
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
  const busy = useRef(false);
  const active = (units.data ?? []).filter((unit) => unit.active);
  const unit = active.find((candidate) => candidate.id === unitId);
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
      <Button fullWidth={false} className="px-3 py-2" loading={busyId === handoff.id} disabled={Boolean(busyId)} onClick={() => void mark(handoff, 'done')}>Done</Button>
    </> : null}
    <Button variant="ghost" fullWidth={false} className="px-3 py-2" disabled={Boolean(busyId)} onClick={() => handoff.encounterId ? navigate('/encounters/record', { state: { patientId: handoff.patientId, encounterId: handoff.encounterId } }) : navigate('/patients/profile', { state: { patientId: handoff.patientId } })}>Open record</Button>
  </div>;
  const list = incoming.data ?? [];
  return (
    <div className="min-h-screen bg-surface">
      <AppBar title="Unit queue" onBack={() => navigate('/home')} right={<SyncPill />} />
      <div className="space-y-4 px-5 py-3 md:px-8">
        <h1 className="text-[24px] font-extrabold">{unit?.name ?? 'Choose a unit'}</h1>
        {units.loading ? <p role="status">Reading units…</p> : units.error ? <div role="alert">Units could not be read.<Button variant="ghost" onClick={units.reload}>Try again</Button></div> : active.length === 0 ? <p className="rounded-card border border-dashed border-outline p-4 text-sm text-ink-muted">A facility admin can add units under Admin → Units &amp; rooms.</p> : <div className="flex flex-wrap gap-2">{active.map((candidate) => <ChoiceChip key={candidate.id} selected={candidate.id === unitId} onClick={() => choose(candidate.id)}>{candidate.name}</ChoiceChip>)}</div>}
        {unit ? <>
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
    </div>
  );
};
