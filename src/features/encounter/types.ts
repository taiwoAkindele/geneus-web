import type { EncounterEntry, EncounterStep } from '@shared';

/**
 * The Patient Encounter (PRD §9.8). One encounter is one record split into
 * ordered, individually-lockable sections. A section's form holds what is
 * being typed; once saved it becomes an `encounter_entry` (SCHEMA.md §13) and
 * is shown from that entry, never from the form again.
 */
export type StepKey = Exclude<EncounterStep, 'amendment'>;

export type RxLine = { name: string; dose: string };

/** What each section's form holds while it is being recorded — strings as typed. */
export type EncounterData = {
  vitals: { temp: string; bp: string; pulse: string; weight: string; spo2: string };
  complaint: { complaints: string[]; note: string };
  lab_order: { tests: string[] };
  lab_results: Record<string, string>;
  // `injection` / `admit` are the doctor's disposition — they decide which tail
  // sections the encounter grows (see stepsFor). `rx` presence adds the pharmacy step.
  diagnosis: { dx: string; rx: RxLine[]; injection: boolean; admit: boolean };
  injection: { drug: string; dose: string; route: string; site: string; note: string };
  /** Per prescription line: handed over, or the reason it was not. */
  dispense: { done: Record<number, boolean>; reasons: Record<number, string> };
  admission: { ward: string; bed: string; note: string };
  /** `when` is the review date (YYYY-MM-DD), or blank for no follow-up. */
  follow_up: { when: string; reason: string };
};

/** Who saved a step, and when — applied by the system, never typed (PRD §9.8.5). */
export type Signature = { actor: string; role: string; time: string; date: string };

/** An appended correction; the original is never changed (PRD §9.8.3). */
export type Amendment = { by: string; role: string; time: string; date: string; note: string };

export type AuditRow = { time: string; date: string; actor: string; role: string; action: string };

export type EncounterState = {
  /** Absent until the first step is saved — saving it opens the encounter. */
  id?: string;
  patientId: string;
  openedDate: string;
  /** Index of the section being recorded; -1 once the encounter is closed. */
  activeIndex: number;
  /** Sections passed over without a save — nothing was written for them. */
  skipped: StepKey[];
  closed: boolean;
  /** Closed as an inpatient episode (admission) rather than with a follow-up. */
  admitted: boolean;
  data: EncounterData;
  /** The saved entry behind each locked section. */
  entries: Partial<Record<StepKey, EncounterEntry>>;
  sig: Partial<Record<StepKey, Signature>>;
  amend: Partial<Record<StepKey, Amendment[]>>;
  audit: AuditRow[];
};

/** Which encounter to open: the one named, else the patient's open one, else a new one. */
export type EncounterNavState = { patientId?: string; encounterId?: string } | null;

/** The signed-in staff member a save is attributed to (from the shift session). */
export type Actor = { name: string; role: string };
