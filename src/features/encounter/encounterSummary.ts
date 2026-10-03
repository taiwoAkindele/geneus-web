import { ENCOUNTER_STEP_VALUES, type Encounter, type EncounterEntry } from '@shared';
import { encounterLabel, stamp } from './encounterRecord';
import { STEP_DEFS } from './steps';

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
};

const firstOf = (entries: readonly EncounterEntry[], step: EncounterEntry['step']) =>
  entries.find((entry) => entry.step === step);

/** Status, headline and key findings, read from the saved entries alone. */
export const summariseEncounter = (encounter: Encounter, entries: readonly EncounterEntry[]): EncounterSummary => {
  const steps = [...entries].filter((entry) => entry.step !== 'amendment').sort((a, b) => a.createdOn.localeCompare(b.createdOn));
  const status: EncounterStatus = firstOf(steps, 'admission') ? 'Admitted' : firstOf(steps, 'follow_up') ? 'Closed' : 'Open';

  const chips: string[] = [];
  const vitals = firstOf(steps, 'vitals');
  if (vitals) {
    const v = ENCOUNTER_STEP_VALUES.vitals.parse(vitals.values);
    if (v.temperatureC !== undefined) chips.push(`${v.temperatureC}°C`);
    if (v.systolicMmHg !== undefined && v.diastolicMmHg !== undefined) chips.push(`${v.systolicMmHg}/${v.diastolicMmHg}`);
  }
  const order = firstOf(steps, 'lab_order');
  if (order) {
    const tests = ENCOUNTER_STEP_VALUES.lab_order.parse(order.values).tests.length;
    chips.push(`${tests} test${tests === 1 ? '' : 's'}`);
  }
  const followUp = firstOf(steps, 'follow_up');
  if (followUp && ENCOUNTER_STEP_VALUES.follow_up.parse(followUp.values).followUpOn) chips.push('Follow-up');

  const diagnosis = firstOf(steps, 'diagnosis');
  const last = steps[steps.length - 1];
  const title = diagnosis
    ? ENCOUNTER_STEP_VALUES.diagnosis.parse(diagnosis.values).diagnosis
    : last && last.step !== 'amendment'
      ? `${STEP_DEFS[last.step].short} saved`
      : 'Opened';

  const opened = stamp(encounter.openedOn);
  return {
    id: encounter.id,
    label: encounterLabel(encounter.id),
    patientId: encounter.patientId,
    status,
    title,
    openedOn: encounter.openedOn,
    when: status === 'Open' ? `Started ${opened.time}` : opened.date,
    chips,
  };
};
