import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Button, ChoiceChip, Icon, Tag, useToast } from '@/ui';
import {
  EncounterCard,
  readDeviceStation,
  rememberDeviceStation,
  useEncounterList,
  useStationQueues,
  type EncounterNavState,
  type EncounterSummary,
  type QueuedPatient,
  type StationView,
} from '@/features/encounter';
import { useAppointments } from '@/features/appointments';
import { usePatients } from '@/features/search';

const STATION_LABEL: Record<StationView, string> = {
  all: 'All encounters',
  lab: 'Lab',
  results: 'Results ready',
  pharmacy: 'Pharmacy',
};

const STATION_EMPTY: Record<Exclude<StationView, 'all'>, string> = {
  lab: 'No tests waiting for the lab.',
  results: 'No results waiting for the doctor.',
  pharmacy: 'No prescriptions waiting at the pharmacy.',
};

const initialsOf = (fullName: string): string =>
  fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

const timeOf = (iso: string): string => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

const Empty = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-card border border-dashed border-outline p-4 text-center text-[13px] text-ink-muted sm:col-span-2 lg:col-span-3">
    {children}
  </div>
);

/** Encounters hub — resume an in-progress encounter or start a new one (PRD §9.8). */
export const EncountersScreen = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { appointments } = useAppointments();
  const encounters = useEncounterList();
  const patients = usePatients();
  const patientOf = (patientId: string) => patients.data?.find((patient) => patient.patientId === patientId);
  const queues = useStationQueues();
  const [station, setStation] = useState<StationView>(readDeviceStation());

  const chooseStation = (view: StationView) => {
    setStation(view);
    rememberDeviceStation(view);
  };

  const openQueued = (queued: QueuedPatient) =>
    navigate('/encounters/record', {
      state: { patientId: queued.patientId, encounterId: queued.encounterId } satisfies EncounterNavState,
    });

  const open = (card: EncounterSummary) =>
    navigate('/encounters/record', { state: { patientId: card.patientId, encounterId: card.id } satisfies EncounterNavState });

  // A patient with a booked appointment arrives → continue their open encounter, or start one.
  const startFromAppointment = (patientId: string) =>
    navigate('/encounters/record', { state: { patientId } satisfies EncounterNavState });

  // PRD §9.8.2 — encounters for unidentified patients need a provisional patient record, which is not built yet.
  const createUnknown = () =>
    toast('Register the patient first (an estimated age is enough) — encounters for unidentified patients are coming', {
      tone: 'info',
    });

  const openList = encounters.data?.open ?? [];
  const closedList = encounters.data?.closed ?? [];

  return (
    <div className="min-h-screen bg-surface">
      <div className="w-full px-5 py-4 md:px-8">
        {/* Header — title and actions share a line, wrapping on narrow phones. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Back"
              onClick={() => navigate('/home')}
              className="-ml-2 flex h-10 w-10 min-h-0 flex-none items-center justify-center text-ink-soft"
            >
              <Icon name="back" className="h-6 w-6" />
            </button>
            <div>
              <div className="font-mono text-[12px] uppercase tracking-[0.16em] text-brand-strong">Encounters</div>
              <h1 className="text-[24px] font-extrabold tracking-[-0.02em] md:text-[28px]">Encounters</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Button variant="outlined" fullWidth={false} className="px-4" onClick={() => navigate('/appointments')}>
              Today's appointments
            </Button>
            <Button variant="primary" fullWidth={false} className="px-4" onClick={createUnknown}>
              ＋ Create unknown encounter
            </Button>
          </div>
        </div>

        {/* Station queues (PRD §9.8.1) — the lab, the doctor and the pharmacy each see who is waiting for them. */}
        <div className="mt-4 flex flex-wrap gap-2">
          {(Object.keys(STATION_LABEL) as StationView[]).map((view) => {
            const waiting = view === 'all' ? undefined : queues.data?.[view].length;
            return (
              <ChoiceChip key={view} selected={station === view} onClick={() => chooseStation(view)}>
                {STATION_LABEL[view]}
                {waiting ? ` · ${waiting}` : ''}
              </ChoiceChip>
            );
          })}
        </div>

        {station !== 'all' ? (
          <>
            <div className="mt-5 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">Waiting · oldest first</span>
              <span className="font-mono text-xs text-ink-muted">{queues.data?.[station].length ?? 0} waiting</span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 pb-24 sm:grid-cols-2 lg:grid-cols-3">
              {queues.loading ? <Empty>Loading…</Empty> : null}
              {queues.error ? (
                <Empty>
                  The queue could not be read from this device.{' '}
                  <button type="button" className="font-bold text-brand" onClick={queues.reload}>
                    Try again
                  </button>
                </Empty>
              ) : null}
              {queues.data && queues.data[station].length === 0 ? <Empty>{STATION_EMPTY[station]}</Empty> : null}
              {(queues.data?.[station] ?? []).map((queued) => {
                const patient = patientOf(queued.patientId);
                return (
                  <button
                    key={queued.encounterId}
                    type="button"
                    onClick={() => openQueued(queued)}
                    className="w-full rounded-card border border-outline-soft bg-white p-4 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar tone="green">{patient ? initialsOf(patient.fullName) : '??'}</Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-base font-bold">{patient?.fullName ?? queued.patientId}</div>
                        <div className="text-[13px] text-ink-muted">Waiting since {timeOf(queued.waitingSince)}</div>
                      </div>
                    </div>
                    <div className="mt-3 rounded-[11px] bg-brand-tint px-3.5 py-2.5 text-[14px] font-semibold text-brand">{queued.detail}</div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
        <>
        {/* Pending & upcoming — patients booked from a profile land here. */}
        <div className="mt-5 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">Pending &amp; upcoming</span>
          <span className="font-mono text-xs text-ink-muted">{appointments.length} booked</span>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {appointments.length === 0 ? <Empty>No appointments booked.</Empty> : null}
          {appointments.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => startFromAppointment(a.patient.id)}
              className="w-full rounded-card border border-outline-soft bg-white p-4 text-left"
            >
              <div className="flex items-center gap-3">
                <Avatar tone="green">{a.patient.initials}</Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-bold">{a.patient.name}</div>
                  <div className="text-[13px] text-ink-muted">{a.reason}</div>
                </div>
                <Tag tone={a.status === 'pending' ? 'amber' : 'slate'}>
                  {a.status === 'pending' ? 'Pending' : 'Upcoming'}
                </Tag>
              </div>
              <div className="mt-3 text-[13px] text-ink-muted">{a.when} · {a.day}</div>
            </button>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">In progress</span>
          <span className="font-mono text-xs text-ink-muted">{openList.length} open</span>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {encounters.loading ? <Empty>Loading encounters…</Empty> : null}
          {encounters.error ? (
            <Empty>
              Encounters could not be read from this device.{' '}
              <button type="button" className="font-bold text-brand" onClick={encounters.reload}>
                Try again
              </button>
            </Empty>
          ) : null}
          {encounters.data && openList.length === 0 ? <Empty>No encounters in progress.</Empty> : null}
          {openList.map((c) => (
            <EncounterCard key={c.id} card={c} patient={patientOf(c.patientId)} onOpen={() => open(c)} />
          ))}
        </div>

        <div className="mt-6 text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">Recently closed</div>
        <div className="mt-3 grid grid-cols-1 gap-3 pb-24 sm:grid-cols-2 lg:grid-cols-3">
          {encounters.data && closedList.length === 0 ? <Empty>No encounters closed yet.</Empty> : null}
          {closedList.map((c) => (
            <EncounterCard key={c.id} card={c} patient={patientOf(c.patientId)} onOpen={() => open(c)} />
          ))}
        </div>
        </>
        )}
      </div>
    </div>
  );
};
