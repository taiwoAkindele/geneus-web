import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Patient } from '@shared';
import { AppBar, Avatar, Button, Tag } from '@/ui';
import { SyncPill } from '@/app/SyncPill';
import { useAuthorizationContext, useSession } from '@/session';
import { PatientCard } from './PatientCard';
import { PatientIdentityPanel } from './PatientIdentityPanel';
import { APPOINTMENT_GROUP_LABELS, BookAppointmentSheet, useAppointments, type AppointmentPatient, type BookedAppointment } from '@/features/appointments';
import { EncounterCard, usePatientEncounters, type EncounterNavState } from '@/features/encounter';
import { fromPatient, useBeginRegistration, type RegistrationNavState } from '@/features/registration';
import { currentAge, usePatient } from '@/features/search';

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
export const PatientProfile = ({ patientId, embedded = false }: { patientId?: string; embedded?: boolean }) => {
  const navigate = useNavigate();
  const context = useAuthorizationContext();
  const { facility } = useSession();
  const beginEdit = useBeginRegistration();
  const canRecord = context.permissions.includes('encounter:record');
  const patient = usePatient(patientId);
  const encounters = usePatientEncounters(patientId ?? '');
  const { forPatient, loading: appointmentsLoading, error: appointmentsError, reload: reloadAppointments } = useAppointments();
  const [booking, setBooking] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);

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
  const appointments = forPatient(record.patientId).filter((appointment) => appointment.group !== 'completed');

  // The patient has arrived for their appointment — continue their open encounter, or start one.
  const startEncounter = () => navigate('/encounters/record', { state: { patientId: record.patientId } satisfies EncounterNavState });
  const startAppointment = (appointment: BookedAppointment) => canRecord ? navigate('/encounters/record', { state: { patientId: appointment.patient.id, encounterId: appointment.encounterId, appointmentId: appointment.id } }) : navigate('/appointments');
  const openEncounter = (encounterId: string) =>
    navigate('/encounters/record', { state: { patientId: history.find((card) => card.id === encounterId)?.patientId ?? record.patientId, encounterId } satisfies EncounterNavState });
  const history = encounters.data ?? [];
  const canBill = context.permissions.some((p) => ['payment:receive', 'payment:waive', 'fee_item:manage'].includes(p));

  const edit = () => {
    beginEdit(record.patientId, fromPatient(record));
    navigate('/patients/new', {
      state: { patientId: record.patientId } satisfies RegistrationNavState,
    });
  };

  return (
    <div className={embedded ? 'bg-surface' : 'min-h-screen bg-surface'}>
      {!embedded ? <AppBar title="Patient profile" onBack={() => navigate('/patients/search')} right={<SyncPill />} /> : null}
      <div className={embedded ? 'w-full p-3' : 'w-full px-5 py-2 md:px-8'}>
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
            <Button variant="secondary" fullWidth={false} onClick={() => setCardOpen(true)}>Print / reprint patient card</Button>
            {canBill ? <Button variant="secondary" fullWidth={false} onClick={() => navigate(`/billing?patient=${encodeURIComponent(record.patientId)}`)}>Patient billing account</Button> : null}
            {context.permissions.includes('appointment:create') ? <Button
              variant="secondary"
              fullWidth={false}
              className="bg-brand-accent-soft px-5 text-brand"
              onClick={() => setBooking(true)}
            >
              ＋ Book appointment
            </Button> : null}
            {context.permissions.includes('patient:update') ? <Button variant="ghost" fullWidth={false} className="bg-white/15 px-5 text-white" onClick={edit}>
              Edit patient details
            </Button> : null}
            {context.permissions.includes('handoff:create') ? <Button
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
            </Button> : null}
          </div>
        </div>

        <p className="mt-3 text-xs text-ink-muted">Identity information: {record.identityEvidence === 'document_seen' ? 'Document checked by staff' : 'Reported by patient / representative'}{record.dobEstimated || !record.dateOfBirth ? ' · Age / birth date estimated' : ''}. {record.nin && context.permissions.includes('patient:update') ? `NIN: •••••••${record.nin.slice(-4)}.` : ''}</p>
        <PatientIdentityPanel patientId={record.patientId} />

        {/* appointments — this patient's upcoming / pending bookings */}
        <div className="mb-3 mt-6 flex items-center justify-between">
          <span className="text-[15px] font-extrabold tracking-[-0.01em]">Appointments</span>
          <span className="font-mono text-xs text-ink-muted">{appointmentsLoading || appointmentsError ? '—' : appointments.length} booked</span>
        </div>
        {appointmentsLoading ? <p role="status" className="text-sm text-ink-muted">Reading appointments…</p> : appointmentsError ? <div role="alert" className="rounded-card bg-white p-4 text-sm text-danger">Appointments could not be read.<Button variant="ghost" onClick={reloadAppointments}>Try again</Button></div> : appointments.length > 0 ? (
          <div className="space-y-3">
            {appointments.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => startAppointment(a)}
                className="w-full rounded-card border border-outline-soft bg-white p-4 text-left"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-[15px] font-bold text-ink">{a.reason}</div>
                    <div className="text-[13px] text-ink-muted">{a.when} · {a.day}</div>
                  </div>
                  <Tag tone={a.group === 'overdue' ? 'amber' : 'slate'}>
                    {APPOINTMENT_GROUP_LABELS[a.group]}
                  </Tag>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-card border border-dashed border-outline p-4 text-center text-[13px] text-ink-muted">
            No active appointments on record.
          </div>
        )}

        {/* encounters — every one on record, newest first */}
        <div className="mb-3 mt-6 flex items-center justify-between">
          <span className="text-[15px] font-extrabold tracking-[-0.01em]">Encounters</span>
          <span className="font-mono text-xs text-ink-muted">{history.length} on record</span>
        </div>
        <div className="space-y-3 pb-6">
          {encounters.error ? <div role="alert" className="rounded-card bg-white p-4 text-sm text-danger">Encounter history could not be read. <Button variant="ghost" onClick={encounters.reload}>Try again</Button></div> : null}
          {encounters.error ? null : history.length === 0 ? (
            <div className="rounded-card border border-dashed border-outline p-4 text-center text-[13px] text-ink-muted">
              {encounters.loading ? 'Loading encounters…' : 'No encounters on record yet.'}
            </div>
          ) : (
            history.map((card) => (
              <div key={card.id}>{card.patientId !== record.patientId ? <p className="mb-1 text-xs text-ink-muted">Recorded under linked ID {card.patientId}</p> : null}<EncounterCard card={card} patient={record} onOpen={() => openEncounter(card.id)} /></div>
            ))
          )}
          {canRecord && !encounters.loading && !encounters.error && history.every((card) => card.status !== 'Open') ? (
            <Button variant="outlined" onClick={startEncounter}>
              ＋ Start an encounter
            </Button>
          ) : null}
        </div>
      </div>

      {booking ? <BookAppointmentSheet patient={reference} onClose={() => setBooking(false)} /> : null}
      {cardOpen ? <PatientCard patient={record} facilityName={facility.name} onClose={() => setCardOpen(false)} /> : null}
    </div>
  );
};
