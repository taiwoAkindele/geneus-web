import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppBar, Button, ChoiceChip, DataTable } from '@/ui';
import { SyncPill } from '@/app/SyncPill';
import { EncounterCard, readDeviceStation, rememberDeviceStation, useEncounterList, useStationQueues, type EncounterSummary, type QueuedPatient, type StationView } from '@/features/encounter';
import { AppointmentWorklist, useAppointments, type BookedAppointment } from '@/features/appointments';
import { usePatients } from '@/features/search';
import { useAuthorizationContext } from '@/session';

const STATION_LABEL: Record<StationView, string> = { all: 'All encounters', lab: 'Lab', results: 'Results ready', pharmacy: 'Pharmacy' };
export const EncountersScreen = () => {
  const navigate = useNavigate();
  const context = useAuthorizationContext();
  const appointments = useAppointments();
  const encounters = useEncounterList();
  const patients = usePatients();
  const queues = useStationQueues();
  const [station, setStation] = useState<StationView>(readDeviceStation());
  const patientOf = (id: string) => patients.data?.find((patient) => patient.patientId === id);
  const chooseStation = (view: StationView) => { setStation(view); rememberDeviceStation(view); };
  const open = (card: EncounterSummary) => navigate('/encounters/record', { state: { patientId: card.patientId, encounterId: card.id } });
  const openQueued = (queued: QueuedPatient) => navigate('/encounters/record', { state: { patientId: queued.patientId, encounterId: queued.encounterId } });
  const canRecord = context.permissions.includes('encounter:record');
  const openAppointment = (appointment: BookedAppointment) => canRecord
    ? navigate('/encounters/record', { state: { patientId: appointment.patient.id, appointmentId: appointment.id, encounterId: appointment.encounterId } })
    : navigate('/patients/profile', { state: { patientId: appointment.patient.id } });
  const booked = appointments.appointments.filter((appointment) => appointment.group === 'today' || appointment.group === 'overdue');
  const cards = (list: EncounterSummary[], title: string) => list.length === 0 ? <p className="rounded-card border border-dashed border-outline p-4 text-sm text-ink-muted">No {title.toLowerCase()}.</p> : (
    <>
      <div className="space-y-2 lg:hidden">{list.map((card) => <EncounterCard key={card.id} card={card} patient={patientOf(card.patientId)} onOpen={() => open(card)} />)}</div>
      <div className="hidden lg:block"><DataTable caption={title} rows={list} rowKey={(row) => row.id} columns={[
        { key: 'patient', label: 'Patient', sortValue: (row) => patientOf(row.patientId)?.fullName ?? row.patientId, render: (row) => <button type="button" className="min-h-0 py-1 text-left font-bold text-brand hover:underline" onClick={() => open(row)}>{patientOf(row.patientId)?.fullName ?? row.patientId}<span className="mt-1 block font-mono text-[11px] font-normal text-ink-muted">{row.patientId}</span></button> },
        { key: 'opened', label: 'Opened', sortValue: (row) => row.openedOn, render: (row) => new Date(row.openedOn).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) },
        { key: 'last', label: 'Latest recorded step', render: (row) => row.title },
        { key: 'status', label: 'Status', render: (row) => row.status },
        { key: 'action', label: 'Action', render: (row) => <Button variant="ghost" fullWidth={false} className="px-2 py-2" onClick={() => open(row)}>Open record</Button> },
      ]} /></div>
    </>
  );
  return (
    <div className="min-h-screen bg-surface">
      <AppBar title="Encounters" onBack={() => navigate('/home')} right={<SyncPill />} />
      <div className="w-full space-y-5 px-5 py-3 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-[24px] font-extrabold">Encounters</h1><Button variant="outlined" fullWidth={false} onClick={() => navigate('/appointments')}>Appointments</Button></div>
        <div className="flex flex-wrap gap-2">{(Object.keys(STATION_LABEL) as StationView[]).map((view) => <ChoiceChip key={view} selected={view === station} onClick={() => chooseStation(view)}>{STATION_LABEL[view]}{view !== 'all' && queues.data ? ` · ${queues.data[view].length}` : ''}</ChoiceChip>)}</div>
        {station === 'all' ? (
          <>
            <section className="space-y-3"><h2 className="text-[16px] font-bold">Today &amp; overdue appointments</h2>
              {appointments.loading ? <p role="status">Reading appointments…</p> : appointments.error ? <div role="alert">Appointments could not be read. <Button variant="ghost" onClick={appointments.reload}>Try again</Button></div> : booked.length ? <AppointmentWorklist appointments={booked} onOpen={openAppointment} actionLabel={canRecord ? 'Open encounter' : 'View patient'} /> : <p className="rounded-card border border-dashed border-outline p-4 text-sm text-ink-muted">No appointments waiting today.</p>}
            </section>
            {encounters.loading || patients.loading ? <div role="status" className="h-24 animate-pulse rounded-card bg-surface-muted" aria-label="Loading encounters" /> : encounters.error || patients.error ? <div role="alert">Encounters could not be read. <Button variant="ghost" onClick={() => { encounters.reload(); patients.reload(); }}>Try again</Button></div> : <>
              <section className="space-y-3"><h2 className="text-[16px] font-bold">Open encounters · {encounters.data?.open.length ?? 0}</h2>{cards(encounters.data?.open ?? [], 'Open encounters')}</section>
              <section className="space-y-3"><h2 className="text-[16px] font-bold">Recently closed</h2>{cards(encounters.data?.closed ?? [], 'Recently closed encounters')}</section>
            </>}
          </>
        ) : (
          <section className="space-y-3"><h2 className="text-[16px] font-bold">{STATION_LABEL[station]} · oldest waiting first</h2>
            {queues.loading ? <p role="status">Reading queue…</p> : queues.error ? <div role="alert">This queue could not be read.<Button variant="ghost" onClick={queues.reload}>Try again</Button></div> : queues.data?.[station].length ? <>
              <div className="space-y-2 lg:hidden">{queues.data[station].map((queued) => <button key={queued.encounterId} type="button" onClick={() => openQueued(queued)} className="w-full rounded-card border border-outline-soft bg-white p-4 text-left"><div className="font-bold">{patientOf(queued.patientId)?.fullName ?? queued.patientId}</div><div className="mt-1 text-sm text-ink-muted">Waiting since {new Date(queued.waitingSince).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div><div className="mt-2 text-sm text-brand">{queued.detail}</div></button>)}</div>
              <div className="hidden lg:block"><DataTable caption={STATION_LABEL[station]} rows={queues.data[station]} rowKey={(row) => row.encounterId} columns={[
                { key: 'name', label: 'Patient', sortValue: (row) => patientOf(row.patientId)?.fullName ?? row.patientId, render: (row) => <button type="button" className="min-h-0 py-1 font-bold text-brand" onClick={() => openQueued(row)}>{patientOf(row.patientId)?.fullName ?? row.patientId}</button> },
                { key: 'wait', label: 'Waiting since', sortValue: (row) => row.waitingSince, render: (row) => new Date(row.waitingSince).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) },
                { key: 'next', label: 'Next action', render: (row) => row.detail },
                { key: 'open', label: 'Action', render: (row) => <Button variant="ghost" fullWidth={false} onClick={() => openQueued(row)}>Open record</Button> },
              ]} /></div>
            </> : <p className="rounded-card border border-dashed border-outline p-4 text-sm text-ink-muted">Nobody is waiting in this queue.</p>}
          </section>
        )}
      </div>
    </div>
  );
};
