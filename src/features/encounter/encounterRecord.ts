import type { Encounter, EncounterEntry, Role } from '@shared';
import { AUDIT_LABEL, STEP_DEFS, isClosingStep, stepsFor } from './steps';
import { fromStepValues } from './stepValues';
import type { Amendment, AuditRow, EncounterData, EncounterState, Signature, StepKey } from './types';

/** What a new encounter's forms start with: nothing. A default would be saved as a finding. */
export const EMPTY_ENCOUNTER_DATA: EncounterData = {
  vitals: { temp: '', bp: '', pulse: '', weight: '', spo2: '' },
  complaint: { text: '', note: '' },
  lab_order: { tests: [] },
  lab_results: {},
  diagnosis: { dx: '', rx: [], injection: false, admit: false },
  injection: { drug: '', dose: '', route: '', site: '', note: '' },
  dispense: { done: {}, reasons: {} },
  admission: { ward: '', bed: '', note: '' },
  follow_up: { when: '', reason: '' },
};

export const ROLE_LABEL: Record<Role, string> = {
  chew: 'CHEW',
  nurse: 'Nurse',
  doctor: 'Doctor',
  records_officer: 'Records Officer',
  facility_admin: 'Facility Admin',
  supervisor: 'Supervisor',
};

/** A short, readable handle for an encounter; its id is a uuid no one reads aloud. */
export const encounterLabel = (encounterId: string | undefined): string =>
  encounterId ? `ENC-${(encounterId.split(':')[1] ?? encounterId).slice(0, 6).toUpperCase()}` : 'New encounter';

export const stamp = (iso: string) => {
  const at = new Date(iso);
  return {
    time: at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    date: at.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
  };
};

type Projection = {
  patientId: string;
  encounter: Encounter | undefined;
  entries: readonly EncounterEntry[];
  /** What is being typed into the sections not yet saved. */
  draft: EncounterData;
  /** Sections the person chose to skip in this sitting. */
  skippedNow: readonly StepKey[];
  staffNames: ReadonlyMap<string, string>;
};

/**
 * The encounter as the screen shows it: every saved section read back from its
 * entry, the rest from the draft; who signed what; amendments beside what they
 * correct; and which section is being recorded. A section passed over before a
 * later save, or skipped now, is skipped — nothing was written for it.
 */
export const projectEncounter = ({ patientId, encounter, entries, draft, skippedNow, staffNames }: Projection): EncounterState => {
  const byTime = [...entries].sort((a, b) => a.createdOn.localeCompare(b.createdOn));
  const nameOf = (staffId: string) => staffNames.get(staffId) ?? staffId;

  const saved: Partial<Record<StepKey, EncounterEntry>> = {};
  for (const entry of byTime) {
    if (entry.step !== 'amendment' && !saved[entry.step]) saved[entry.step] = entry;
  }

  let data = draft;
  for (const [key, entry] of Object.entries(saved) as [StepKey, EncounterEntry][]) {
    data = fromStepValues(key, entry.values, data);
  }

  const sig: Partial<Record<StepKey, Signature>> = {};
  for (const [key, entry] of Object.entries(saved) as [StepKey, EncounterEntry][]) {
    sig[key] = { actor: nameOf(entry.createdBy), role: ROLE_LABEL[entry.actorRole], ...stamp(entry.createdOn) };
  }

  const stepOfEntry = new Map(byTime.map((entry) => [entry.id, entry.step]));
  const amend: Partial<Record<StepKey, Amendment[]>> = {};
  const audit: AuditRow[] = encounter
    ? [{ ...stamp(encounter.createdOn), actor: nameOf(encounter.createdBy), role: '', action: 'Encounter opened' }]
    : [];
  for (const entry of byTime) {
    const who = { actor: nameOf(entry.createdBy), role: ROLE_LABEL[entry.actorRole], ...stamp(entry.createdOn) };
    if (entry.step === 'amendment') {
      const target = stepOfEntry.get(entry.amends ?? '');
      const note = typeof entry.values.note === 'string' ? entry.values.note : '';
      if (target && target !== 'amendment') {
        amend[target] = [...(amend[target] ?? []), { by: who.actor, role: who.role, time: who.time, date: who.date, note }];
        audit.push({ ...who, action: `Amendment added to ${STEP_DEFS[target].title}` });
      }
    } else if (saved[entry.step] === entry) {
      audit.push({ ...who, action: AUDIT_LABEL[entry.step] });
    } else {
      audit.push({ ...who, action: `${STEP_DEFS[entry.step].title} recorded again` });
    }
  }

  const steps = stepsFor(data);
  const closed = steps.some((step) => isClosingStep(step.key) && saved[step.key]);
  const lastSaved = steps.reduce((last, step, index) => (saved[step.key] ? index : last), -1);
  const activeIndex = closed
    ? -1
    : steps.findIndex((step, index) => index > lastSaved && !skippedNow.includes(step.key));
  const skipped = steps
    .filter((step, index) => !saved[step.key] && (index < lastSaved || (index < activeIndex && skippedNow.includes(step.key))))
    .map((step) => step.key);

  return {
    id: encounter?.id,
    patientId,
    openedDate: stamp(encounter?.openedOn ?? new Date().toISOString()).date,
    activeIndex,
    skipped,
    closed,
    admitted: Boolean(saved.admission),
    data,
    entries: saved,
    sig,
    amend,
    audit,
  };
};
