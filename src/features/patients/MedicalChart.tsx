import type { ReactNode } from 'react';
import { currentAllergies, effectiveEncounterEntries, type ClinicalKind } from '@shared';
import type { PatientClinicalRecord } from '@/data/repos/clinical';
import type { BookedAppointment } from '@/features/appointments';
import { observationHistory } from '@/features/clinical/clinicalSummary';
import { clinicalTitle } from '@/features/clinical/ClinicalRecordCard';
import { ObservationTable } from '@/features/clinical/ObservationTable';
import { entryRows } from '@/features/encounter/visitContent';
import { STEP_DEFS } from '@/features/encounter/steps';
import { visitDate } from '@/features/encounter/VisitTable';
import { Icon, type IconName } from '@/ui';

const Section = ({ id, title, icon, action, children }: { id: string; title: string; icon: IconName; action?: ReactNode; children: ReactNode }) => <section id={`chart-${id}`} className="scroll-mt-28 border-t border-outline-soft py-3">
  <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-[17px] font-extrabold"><Icon name={icon} className="h-5 w-5 text-brand" />{title}</h3>{action}</div>{children}
</section>;
const TextAction = ({ children, onClick }: { children: ReactNode; onClick: () => void }) => <button type="button" onClick={onClick} className="min-h-[36px] text-sm font-bold text-brand hover:underline">{children}<span className="sr-only"> in patient record</span></button>;
const Empty = ({ children }: { children: ReactNode }) => <p className="text-sm leading-relaxed text-ink-soft">{children}</p>;

/** Complete readable chart, projected from the same signed records the editors maintain. */
export const MedicalChart = ({ data, appointments, appointmentsUnavailable, onClinical, onVisit, onAppointments }: { data: PatientClinicalRecord; appointments: BookedAppointment[]; appointmentsUnavailable: boolean; onClinical: (kind: ClinicalKind) => void; onVisit: (id: string) => void; onAppointments: () => void }) => {
  const effective = effectiveEncounterEntries(data.entries);
  const observations = observationHistory(data.entries);
  const latest = observations[0];
  const problems = data.current.filter((event) => event.kind === 'problem');
  const medicines = data.current.filter((event) => event.kind === 'medication');
  const allergies = currentAllergies(data.events, data.patients);
  const histories = data.current.filter((event) => event.kind === 'history');
  const plans = data.current.filter((event) => ['care_plan', 'specialty'].includes(event.kind));
  const investigations = effective.filter((entry) => ['lab_order', 'lab_results'].includes(entry.step)).reverse();
  const diagnoses = effective.filter((entry) => entry.step === 'diagnosis').reverse();
  const notes = effective.filter((entry) => entry.step === 'complaint').reverse();
  const treatment = effective.filter((entry) => ['diagnosis', 'injection', 'dispense'].includes(entry.step)).reverse();
  const nextBookings = appointments.filter((a) => a.group !== 'completed').sort((a, b) => a.at.localeCompare(b.at));
  const source = (on: string, by: string, visitId?: string, sourcePatientId?: string) => <p className="mt-1 text-xs leading-relaxed text-ink-soft">{visitDate(on)} · {data.staffNames.get(by) ?? by}{sourcePatientId && sourcePatientId !== data.patients[0]?.patientId ? ` · Linked ID ${sourcePatientId}` : ''}{visitId ? <button type="button" className="ml-2 min-h-[44px] font-bold text-brand" onClick={() => onVisit(visitId)}>View visit</button> : null}</p>;
  const clinicalAction = (kind: ClinicalKind, label: string) => <TextAction onClick={() => onClinical(kind)}>{label}</TextAction>;
  return <div>
    <nav aria-label="Medical chart sections" className="mb-4 flex flex-wrap gap-x-5 gap-y-1 border-b border-outline-soft pb-3 text-sm font-semibold text-brand">
      {[['problems', 'Problems'], ['medicines', 'Medicines'], ['allergies', 'Allergies'], ['history', 'History'], ['observations', 'Observations'], ['results', 'Results'], ['plans', 'Care plans'], ['consultations', 'Consultations'], ['treatment', 'Treatment'], ['follow-up', 'Follow-up']].map(([id, label]) => <a key={id} className="inline-flex min-h-[36px] items-center hover:underline" href={`#chart-${id}`}>{label}</a>)}
    </nav>
    <div className="grid gap-x-8 xl:grid-cols-2">
      <div>
        <Section id="problems" title="Problems & diagnoses" icon="encounter" action={clinicalAction('problem', 'Review problems')}>
          {problems.length ? <div className="divide-y divide-outline-soft">{problems.map((event) => <div key={event.id} className="py-2 text-sm"><div className="flex flex-wrap justify-between gap-2"><b>{clinicalTitle(event)}</b><span>{String(event.values.status)} · {String(event.values.certainty)}</span></div>{source(event.createdOn, event.createdBy, event.encounterId, event.patientId)}</div>)}</div> : <Empty>No ongoing problems recorded. Review the clinical history before drawing conclusions.</Empty>}
          {diagnoses.length ? <details className="mt-3 text-sm"><summary className="cursor-pointer font-bold text-brand">Visit diagnoses · {diagnoses.length}</summary>{diagnoses.map((entry) => <div key={entry.id} className="border-b border-outline-soft py-2"><b>{String(entry.values.diagnosis)}</b>{source(entry.createdOn, entry.createdBy, entry.encounterId, entry.patientId)}</div>)}</details> : null}
        </Section>
        <Section id="medicines" title="Current medicines" icon="stock" action={clinicalAction('medication', 'Review medicines')}>
          {medicines.filter((e) => e.values.status === 'active').length ? medicines.filter((e) => e.values.status === 'active').map((event) => <div key={event.id} className="border-b border-outline-soft py-2 text-sm"><b>{clinicalTitle(event)}</b><p>{[event.values.dose, event.values.frequency, event.values.route].filter(Boolean).join(' · ')}</p>{source(event.createdOn, event.createdBy, event.encounterId, event.patientId)}</div>) : <Empty>{medicines.length ? 'No active medicines are listed. Review stopped/completed entries and reconcile current use.' : 'Not yet reconciled. No active medicines have been confirmed in the current medication list.'}</Empty>}
          {medicines.some((e) => e.values.status !== 'active') ? <p className="mt-3 text-sm text-ink-soft">{medicines.filter((e) => e.values.status !== 'active').length} stopped/completed entries are available in Review medicines.</p> : null}
        </Section>
        <Section id="allergies" title={`Allergies · ${allergies.length} recorded`} icon="warning" action={clinicalAction('allergy', 'Review allergies')}>
          {allergies.length ? allergies.map((allergy, index) => <div key={`${allergy.patientId}-${allergy.allergen}-${index}`} className="border-b border-outline-soft py-2 text-sm"><b className="text-danger-strong">{allergy.allergen}</b><p>{allergy.reaction} · Severity: {allergy.severity}</p><p className="mt-1 text-ink-soft">{allergy.verification}{allergy.legacy ? ' · Legacy report · needs review' : ''}</p></div>) : <Empty>No active allergy entries recorded. Allergy status still needs clinical review.</Empty>}
        </Section>
        <Section id="history" title="Medical history" icon="registers" action={clinicalAction('history', 'Record / review history')}>
          {(['medical', 'surgical', 'family', 'social', 'examination', 'note'] as const).map((key) => <div key={key} className="border-b border-outline-soft py-2 text-sm"><b>{{ medical: 'Medical', surgical: 'Surgical', family: 'Family', social: 'Social', examination: 'Examination', note: 'Additional history' }[key]}</b>{histories.some((e) => e.values[key]) ? histories.filter((e) => e.values[key]).map((event) => <div key={event.id}><p className="whitespace-pre-wrap">{String(event.values[key])}</p>{source(event.createdOn, event.createdBy, event.encounterId, event.patientId)}</div>) : <p className="text-ink-soft">Not recorded</p>}</div>)}
        </Section>
      </div>
      <div>
        <Section id="observations" title="Latest observations" icon="encounter">
          {latest ? <><dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">{[
            ['Temperature', latest.temperatureC === undefined ? undefined : `${latest.temperatureC} °C`], ['Blood pressure', latest.systolicMmHg || latest.diastolicMmHg ? `${latest.systolicMmHg ?? '—'}/${latest.diastolicMmHg ?? '—'} mmHg` : undefined], ['Pulse', latest.pulseBpm === undefined ? undefined : `${latest.pulseBpm}/min`], ['Weight', latest.weightKg === undefined ? undefined : `${latest.weightKg} kg`], ['Height', latest.heightCm === undefined ? undefined : `${latest.heightCm} cm`], ['SpO₂', latest.spo2Percent === undefined ? undefined : `${latest.spo2Percent}%`], ['Respiratory rate', latest.respiratoryRate === undefined ? undefined : `${latest.respiratoryRate}/min`], ['BMI', latest.bmi],
          ].filter(([, value]) => value !== undefined).map(([label, value]) => <div key={label}><dt className="text-ink-soft">{label}</dt><dd className="mt-1 font-semibold">{value ?? 'Not recorded'}</dd></div>)}</dl>{source(latest.recordedOn, data.entries.find((e) => e.id === latest.id)?.createdBy ?? '', data.entries.find((e) => e.id === latest.id)?.encounterId, latest.patientId)}<div className="mt-3"><ObservationTable observations={observations} compact /></div></> : <Empty>No signed observations recorded.</Empty>}
        </Section>
        <Section id="results" title="Investigations" icon="registers">
          {investigations.length ? <details open={investigations.length <= 3}><summary className="cursor-pointer text-sm font-bold text-brand">Orders and results · {investigations.length}</summary>{investigations.map((entry) => <div key={entry.id} className="border-b border-outline-soft py-3 text-sm"><b>{entry.step === 'lab_order' ? 'Tests ordered' : 'Results recorded'}</b>{entryRows(entry).map((row) => <p key={row.label}>{row.label}: {row.value}</p>)}{source(entry.createdOn, entry.createdBy, entry.encounterId, entry.patientId)}</div>)}</details> : <Empty>No investigations recorded. Results are shown here when entered against a visit.</Empty>}
        </Section>
        <Section id="plans" title="Care plans & specialty care" icon="registers" action={clinicalAction('care_plan', 'View / review care plans')}>
          {plans.length ? plans.map((event) => <div key={event.id} className="border-b border-outline-soft py-2 text-sm"><b>{clinicalTitle(event)}</b><p className="whitespace-pre-wrap">{String(event.values.goal ?? event.values.assessment ?? '')}</p><p className="mt-1 whitespace-pre-wrap">{String(event.values.actions ?? event.values.plan ?? '')}</p><p className="mt-1">{String(event.values.status)}{event.values.reviewOn ? ` · Review date: ${event.values.reviewOn} (not itself an appointment)` : ''}</p>{event.values.outcome ? <p>Outcome: {String(event.values.outcome)}</p> : null}{source(event.createdOn, event.createdBy, event.encounterId, event.patientId)}{event.kind === 'specialty' ? clinicalAction('specialty', 'Review specialty record') : null}</div>) : <Empty>No care plans or specialty assessments recorded.</Empty>}
          {!plans.some((e) => e.kind === 'specialty') ? clinicalAction('specialty', 'Open specialty care') : null}
        </Section>
        <Section id="consultations" title="Consultation history" icon="encounter">
          {notes.length ? <details open={notes.length <= 2}><summary className="cursor-pointer text-sm font-bold text-brand">Signed notes · {notes.length}</summary>{notes.map((entry) => <div key={entry.id} className="border-b border-outline-soft py-3 text-sm">{entryRows(entry).filter((row) => row.value !== '—').map((row) => <p key={row.label} className="whitespace-pre-wrap"><b>{row.label}: </b>{row.value}</p>)}{source(entry.createdOn, entry.createdBy, entry.encounterId, entry.patientId)}</div>)}</details> : <Empty>No signed consultation notes recorded.</Empty>}
        </Section>
        <Section id="treatment" title="Prescriptions & treatment history" icon="stock">
          {treatment.length ? <details><summary className="cursor-pointer text-sm font-bold text-brand">Visit prescriptions, injections and dispensing · {treatment.length}</summary>{treatment.map((entry) => <div key={entry.id} className="border-b border-outline-soft py-3 text-sm"><b>{STEP_DEFS[entry.step as keyof typeof STEP_DEFS]?.title}</b>{source(entry.createdOn, entry.createdBy, entry.encounterId, entry.patientId)}<p>Open the signed visit to review the recorded treatment and any amendments.</p></div>)}</details> : <Empty>No signed prescriptions, injections or dispensing entries recorded.</Empty>}
        </Section>
        <Section id="follow-up" title="Follow-up" icon="clock" action={<TextAction onClick={onAppointments}>Open appointments</TextAction>}>
          {appointmentsUnavailable ? <Empty>Appointments are unavailable. Open Appointments to retry before booking another review.</Empty> : nextBookings.length ? nextBookings.map((appointment) => <div key={appointment.id} className="border-b border-outline-soft py-2 text-sm"><b>{appointment.reason}</b><p>{visitDate(appointment.at)} · {appointment.group}</p><TextAction onClick={onAppointments}>View booking</TextAction></div>) : <Empty>No active appointments recorded. A care-plan review date does not reserve an appointment.</Empty>}
        </Section>
      </div>
    </div>
  </div>;
};
