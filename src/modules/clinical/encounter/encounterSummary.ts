import {
  closesEncounter,
  dispositionHeads,
  effectiveEncounterEntries,
  ENCOUNTER_STEP_VALUES,
  type Encounter,
  type EncounterEntry,
} from '@shared';
import { encounterLabel, stamp, projectEncounter, EMPTY_ENCOUNTER_DATA } from './encounterRecord';
import { STEP_DEFS, stepsFor } from './steps';

export type EncounterStatus = 'Open' | 'Closed' | 'Admitted';

/** One encounter as a list card shows it. */
export type EncounterSummary = {
  id: string;
  label: string;
  patientId: string;
  status: EncounterStatus;
  /** The diagnosis once made, else the last step saved. */
  title: string;
  openedOn: string;
  when: string;
  chips: string[];
  nextAction: string;
  hasSignedEntries: boolean;
  careType?: 'inpatient' | 'outpatient' | 'past_inpatient';
  admissionStatus?: string;
  wardBed?: string;
};

const firstOf = (entries: readonly EncounterEntry[], step: EncounterEntry['step']) =>
  [...entries].reverse().find((entry) => entry.step === step);

/** Status, headline and key findings, read from the saved entries alone. */
const encounterStatus = (steps: readonly EncounterEntry[]): EncounterStatus => {
  if (firstOf(steps, 'admission')) {
    return 'Admitted';
  }

  if (steps.some(closesEncounter)) {
    return 'Closed';
  }

  return 'Open';
};

export const summariseEncounter = (
  encounter: Encounter,
  entries: readonly EncounterEntry[],
): EncounterSummary => {
  const steps = effectiveEncounterEntries(entries);
  const status = encounterStatus(steps);

  const chips: string[] = [];
  const disposition = dispositionHeads(steps)[0];

  if (disposition) {
    chips.push(
      (
        {
          home_care: 'Home care / discharged',
          observation: 'Observation',
          referral: 'Referred',
          admission: 'Admission requested',
        } as Record<string, string>
      )[String(disposition.values.kind)],
    );
  }

  const vitals = firstOf(steps, 'vitals');

  if (vitals) {
    const v = ENCOUNTER_STEP_VALUES.vitals.parse(vitals.values);

    if (v.temperatureC !== undefined) {
      chips.push(`${v.temperatureC}°C`);
    }

    if (v.systolicMmHg !== undefined && v.diastolicMmHg !== undefined) {
      chips.push(`${v.systolicMmHg}/${v.diastolicMmHg}`);
    }
  }

  const order = firstOf(steps, 'lab_order');

  if (order) {
    const tests = ENCOUNTER_STEP_VALUES.lab_order.parse(order.values).tests.length;
    chips.push(`${tests} test${tests === 1 ? '' : 's'}`);
  }

  const followUp = firstOf(steps, 'follow_up');

  if (followUp && ENCOUNTER_STEP_VALUES.follow_up.parse(followUp.values).followUpOn) {
    chips.push('Follow-up');
  }

  const diagnosis = firstOf(steps, 'diagnosis');
  const complaint = firstOf(steps, 'complaint');
  const last = steps[steps.length - 1];

  // A visit is named by its diagnosis, else its complaints, else the last thing saved.
  const titleFor = (): string => {
    if (diagnosis) {
      return ENCOUNTER_STEP_VALUES.diagnosis.parse(diagnosis.values).diagnosis;
    }

    if (complaint) {
      const complaints = ENCOUNTER_STEP_VALUES.complaint.parse(complaint.values).complaints;

      return complaints.join(', ') || 'Consultation note';
    }

    if (last && last.step !== 'amendment') {
      return `${STEP_DEFS[last.step].short} saved`;
    }

    return 'Opened';
  };

  const title = titleFor();

  const opened = stamp(encounter.openedOn);

  const projected = projectEncounter({
    patientId: encounter.patientId,
    encounter,
    entries,
    draft: EMPTY_ENCOUNTER_DATA,
    skippedNow: [],
    staffNames: new Map(),
  });

  const next = stepsFor(projected.data)[projected.activeIndex];

  const nextActionFor = (): string => {
    if (status !== 'Open') {
      return 'View signed record';
    }

    if (order && !firstOf(steps, 'lab_results') && !diagnosis) {
      return 'Awaiting results';
    }

    if (next?.key === 'complaint') {
      return 'Consultation';
    }

    return next?.short ?? 'Review visit';
  };

  return {
    id: encounter.id,
    label: encounterLabel(encounter.id),
    patientId: encounter.patientId,
    status,
    title,
    openedOn: encounter.openedOn,
    when: status === 'Open' ? `Started ${opened.time}` : opened.date,
    chips,
    hasSignedEntries: steps.length > 0,
    nextAction: nextActionFor(),
  };
};
