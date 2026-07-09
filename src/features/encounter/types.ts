/**
 * The Patient Encounter (PRD §9.8). One encounter is one record split into
 * ordered, individually-lockable sections. These types mirror what a document in
 * the shared contract will eventually hold; for now the flow runs on local state.
 */
export type StepKey =
  | 'vitals'
  | 'complaint'
  | 'laborder'
  | 'labresults'
  | 'diagnosis'
  | 'injection'
  | 'dispense'
  | 'admission'
  | 'followup';

export type RxLine = { name: string; dose: string };

export type EncounterData = {
  vitals: { temp: string; bp: string; pulse: string; weight: string; spo2: string };
  complaint: { complaints: string[]; note: string };
  laborder: { tests: string[] };
  labresults: Record<string, string>;
  // `injection` / `admit` are the doctor's disposition — they decide which tail
  // sections the encounter grows (see stepsFor). `rx` presence adds the pharmacy step.
  diagnosis: { dx: string; rx: RxLine[]; injection: boolean; admit: boolean };
  injection: { drug: string; dose: string; route: string; site: string; note: string };
  dispense: { done: Record<number, boolean> };
  admission: { ward: string; bed: string; note: string };
  followup: { when: string; reason: string };
};

/** Who saved a step, and when — applied by the system, never typed (PRD §9.8.5). */
export type Signature = { actor: string; role: string; time: string; date: string };

/** An appended correction; the original is never changed (PRD §9.8.3). */
export type Amendment = { by: string; role: string; time: string; date: string; note: string };

export type AuditRow = { time: string; date: string; actor: string; role: string; action: string };

export type EncounterState = {
  id: string;
  patientId: string;
  patientName: string;
  openedDate: string;
  /** Index of the section currently being recorded. */
  stage: number;
  closed: boolean;
  /** Closed as an inpatient episode (admission) rather than with a follow-up. */
  admitted?: boolean;
  data: EncounterData;
  sig: Partial<Record<StepKey, Signature>>;
  amend: Partial<Record<StepKey, Amendment[]>>;
  audit: AuditRow[];
};

/** The signed-in staff member a save is attributed to (from the shift session). */
export type Actor = { name: string; role: string };
