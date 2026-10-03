import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Patient } from '@shared';
import { AppBar, Avatar, Button, Tag } from '@/ui';
import { SyncPill } from '@/app/SyncPill';
import { BookAppointmentSheet, useAppointments, type AppointmentPatient } from '@/features/appointments';
import { EncounterCard, usePatientEncounters, type EncounterNavState } from '@/features/encounter';
import { fromPatient, type RegistrationNavState } from '@/features/registration';
import { currentAge, usePatient } from '@/features/search';

export type ProfileNavState = { patientId?: string } | null;

const initialsOf = (fullName: string): string =>
  fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const capitalise = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/** What the profile header lists, skipping anything not recorded. */
const factsOf = (patient: Patient): { label: string; value: string }[] =>
  [
    { label: 'Age / Sex', value: `${currentAge(patient) ?? '—'} · ${patient.sex === 'female' ? 'F' : 'M'}` },
    { label: 'Date of birth', value: patient.dateOfBirth ? formatDate(patient.dateOfBirth) : undefined },
    { label: 'Phone', value: patient.phone },
    { label: 'Address', value: patient.address },
    { label: 'Occupation', value: patient.occupation },
    { label: 'Religion', value: patient.religion ? capitalise(patient.religion) : undefined },
    { label: 'Old folder', value: patient.legacyPaperRef },
    { label: 'Registered', value: formatDate(patient.createdOn) },
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact.value));

const Message = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-surface">
    <div className="w-full px-5 py-8 text-center text-[14px] text-ink-muted md:px-8">{children}</div>
  </div>
);

/** Patient profile — details, upcoming appointments, and every encounter on record (PRD §9.8 / §10). */
export const PatientProfileScreen = () => {
  const navigate = useNavigate();
  const { patientId } = (useLocation().state as ProfileNavState) ?? {};
  const patient = usePatient(patientId);
  const encounters = usePatientEncounters(patientId ?? '');
  const { forPatient } = useAppointments();
  const [booking, setBooking] = useState(false);

  if (!patientId) {
    return (
      <Message>
        No patient selected.{' '}
        <button type="button" className="font-bold text-brand" onClick={() => navigate('/patients/search')}>
          Find a patient
        </button>
      </Message>
    );
  }
  if (patient.loading) return <Message>Opening the patient’s record…</Message>;
  if (patient.error) {
    return (
      <Message>
        The record could not be read from this device.{' '}
        <button type="button" className="font-bold text-brand" onClick={patient.reload}>
          Try again
        </button>
      </Message>
    );
  }
  if (!patient.data) {
    return (
      <Message>
        Patient {patientId} is not on this device.{' '}
        <button type="button" className="font-bold text-brand" onClick={() => navigate('/patients/search')}>
          Find a patient
        </button>
      </Message>
    );
  }

  const record = patient.data;
  const reference: AppointmentPatient = {
    id: record.patientId,
    name: record.fullName,
    initials: initialsOf(record.fullName),
    allergy: record.allergies[0] ?? 'None recorded',
  };
  const appointments = forPatient(record.patientId);

  // The patient has arrived for their appointment — continue their open encounter, or start one.
  const startEncounter = () => navigate('/encounters/record', { state: { patientId: record.patientId } satisfies EncounterNavState });
  const openEncounter = (encounterId: string) =>
    navigate('/encounters/record', { state: { patientId: record.patientId, encounterId } satisfies EncounterNavState });
  const history = encounters.data ?? [];

  const edit = () =>
    navigate('/patients/new', {
      state: { values: fromPatient(record), patientId: record.patientId } satisfies RegistrationNavState,
    });

  return (
    <div className="min-h-screen bg-surface">
      <AppBar title="Patient profile" onBack={() => navigate('/patients/search')} right={<SyncPill />} />
      <div className="w-full px-5 py-2 md:px-8">
        {/* profile header */}
        <div className="rounded-card bg-brand p-5 text-white">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar tone="mint">{reference.initials}</Avatar>
            <div className="min-w-0 flex-1">
              <div className="text-[22px] font-extrabold tracking-[-0.02em]">{record.fullName}</div>
              <div className="font-mono text-[13px] text-brand-accent-soft">{record.patientId}</div>
            </div>
            {record.allergies.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-danger-bg px-3 py-1.5 text-[12px] font-bold text-danger-strong">
                  ⚠ Allergy: {record.allergies.join(', ')}
                </span>
              </div>
            ) : null}
          </div>

          <div className="mt-5 flex flex-wrap gap-x-8 gap-y-4">
            {factsOf(record).map((f) => (
              <div key={f.label}>
                <div className="text-[11px] uppercase tracking-[0.04em] text-brand-accent-soft">{f.label}</div>
                <div className="mt-0.5 text-[15px] font-semibold">{f.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-2.5">
            <Button
              variant="secondary"
              fullWidth={false}
              className="bg-brand-accent-soft px-5 text-brand"
              onClick={() => setBooking(true)}
            >
              ＋ Book appointment
            </Button>
            <Button variant="ghost" fullWidth={false} className="bg-white/15 px-5 text-white" onClick={edit}>
              Edit patient details
            </Button>
            <Button
              variant="ghost"
              fullWidth={false}
              className="bg-white/15 px-5 text-white"
              onClick={() =>
                navigate('/patients/send-to-unit', {
                  state: { patientId: record.patientId, encounterId: history.find((card) => card.status === 'Open')?.id },
                })
              }
            >
              Send to another unit
            </Button>
          </div>
        </div>

        {/* appointments — this patient's upcoming / pending bookings */}
        <div className="mb-3 mt-6 flex items-center justify-between">
          <span className="text-[15px] font-extrabold tracking-[-0.01em]">Appointments</span>
          <span className="font-mono text-xs text-ink-muted">{appointments.length} upcoming</span>
        </div>
        {appointments.length > 0 ? (
          <div className="space-y-3">
            {appointments.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={startEncounter}
                className="w-full rounded-card border border-outline-soft bg-white p-4 text-left"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-[15px] font-bold text-ink">{a.reason}</div>
                    <div className="text-[13px] text-ink-muted">{a.when} · {a.day}</div>
                  </div>
                  <Tag tone={a.status === 'pending' ? 'amber' : 'slate'}>
                    {a.status === 'pending' ? 'Pending today' : 'Upcoming'}
                  </Tag>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-card border border-dashed border-outline p-4 text-center text-[13px] text-ink-muted">
            No upcoming appointments — book one above.
          </div>
        )}

        {/* encounters — every one on record, newest first */}
        <div className="mb-3 mt-6 flex items-center justify-between">
          <span className="text-[15px] font-extrabold tracking-[-0.01em]">Encounters</span>
          <span className="font-mono text-xs text-ink-muted">{history.length} on record</span>
        </div>
        <div className="space-y-3 pb-24">
          {history.length === 0 ? (
            <div className="rounded-card border border-dashed border-outline p-4 text-center text-[13px] text-ink-muted">
              {encounters.loading ? 'Loading encounters…' : 'No encounters on record yet.'}
            </div>
          ) : (
            history.map((card) => (
              <EncounterCard key={card.id} card={card} patient={record} onOpen={() => openEncounter(card.id)} />
            ))
          )}
          {history.every((card) => card.status !== 'Open') ? (
            <Button variant="outlined" onClick={startEncounter}>
              ＋ Start an encounter
            </Button>
          ) : null}
        </div>
      </div>

      {booking ? <BookAppointmentSheet patient={reference} onClose={() => setBooking(false)} /> : null}
    </div>
  );
};
