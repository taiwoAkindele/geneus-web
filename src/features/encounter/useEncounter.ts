import { useCallback, useEffect, useMemo, useState } from 'react';
import { CLOSING_STEPS, type Encounter, type EncounterEntry } from '@shared';
import { useLiveQuery } from '@/data';
import { amendEntry, encountersForPatient, entriesForEncounter, saveStep } from '@/data/repos/encounters';
import { listStaff } from '@/data/repos/staff';
import { useAuthorizationContext } from '@/session';
import { EMPTY_ENCOUNTER_DATA, projectEncounter } from './encounterRecord';
import { isClosingStep } from './steps';
import { stepProblems, toStepValues } from './stepValues';
import type { EncounterData, StepKey } from './types';

/** Plain-text summary rows for a step — used by both the Review sheet and the locked view. */
export const summarize = (data: EncounterData, key: StepKey): { label: string; value: string }[] => {
  switch (key) {
    case 'vitals':
      return [
        { label: 'Temperature', value: data.vitals.temp ? `${data.vitals.temp} °C` : '—' },
        { label: 'Blood pressure', value: data.vitals.bp ? `${data.vitals.bp} mmHg` : '—' },
        { label: 'Pulse', value: data.vitals.pulse ? `${data.vitals.pulse} bpm` : '—' },
        { label: 'Weight', value: data.vitals.weight ? `${data.vitals.weight} kg` : '—' },
        { label: 'SpO₂', value: data.vitals.spo2 ? `${data.vitals.spo2} %` : '—' },
      ];
    case 'complaint':
      return [
        { label: 'Complaints', value: data.complaint.text.trim() || '—' },
        { label: 'Clinical note', value: data.complaint.note || '—' },
      ];
    case 'lab_order':
      return [{ label: 'Investigations', value: data.lab_order.tests.join(', ') || 'None' }];
    case 'lab_results':
      return data.lab_order.tests.map((t) => ({ label: t, value: data.lab_results[t] || '—' }));
    case 'diagnosis': {
      const plan: string[] = [];
      if (data.diagnosis.injection) plan.push('Give injection');
      if (data.diagnosis.rx.length) plan.push('Prescribe medication');
      if (data.diagnosis.admit) plan.push('Admit patient');
      else plan.push('Send home');
      return [
        { label: 'Diagnosis', value: data.diagnosis.dx || '—' },
        { label: 'Prescription', value: data.diagnosis.rx.map((m) => `${m.name} — ${m.dose}`).join('; ') || 'None' },
        { label: 'Plan', value: plan.join(' · ') },
      ];
    }
    case 'injection':
      return [
        { label: 'Drug', value: data.injection.drug || '—' },
        { label: 'Dose', value: data.injection.dose || '—' },
        { label: 'Route', value: data.injection.route || '—' },
        { label: 'Site', value: data.injection.site || '—' },
        { label: 'Note', value: data.injection.note || '—' },
      ];
    case 'admission':
      return [
        { label: 'Ward', value: data.admission.ward || '—' },
        { label: 'Bed', value: data.admission.bed || '—' },
        { label: 'Admitting diagnosis', value: data.diagnosis.dx || '—' },
        { label: 'Admitting note', value: data.admission.note || '—' },
      ];
    case 'dispense': {
      const { rx } = data.diagnosis;
      const { done, reasons } = data.dispense;
      return [
        { label: 'Dispensed', value: rx.filter((_, i) => done[i]).map((m) => m.name).join(', ') || 'None' },
        {
          label: 'Not dispensed',
          value: rx.map((m, i) => (done[i] ? '' : `${m.name}${reasons[i] ? ` (${reasons[i]})` : ''}`)).filter(Boolean).join(', ') || '—',
        },
      ];
    }
    case 'follow_up':
      return [
        {
          label: 'Follow-up',
          value: data.follow_up.when
            ? new Date(`${data.follow_up.when}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
            : 'None — sent home',
        },
        { label: 'Reason', value: data.follow_up.reason || '—' },
      ];
  }
};

/** A follow-up review is booked for the morning of the chosen day. */
const REVIEW_HOUR = 9;

type Loaded = { encounter: Encounter | undefined; entries: EncounterEntry[]; staffNames: Map<string, string> };

/**
 * One patient's encounter, live. Opens the encounter named, else the patient's
 * open one, else a new one that exists only once its first step is saved.
 * Forms hold what is being typed; a save writes a locked entry and the section
 * is read back from it from then on.
 */
export const useEncounter = (patientId: string, encounterId?: string) => {
  const context = useAuthorizationContext();
  // Once known (named, found open, or created by the first save) the screen stays on this encounter.
  const [currentId, setCurrentId] = useState(encounterId);
  const [draft, setDraft] = useState<EncounterData>(EMPTY_ENCOUNTER_DATA);
  const [skippedNow, setSkippedNow] = useState<StepKey[]>([]);

  const load = useCallback(async (): Promise<Loaded> => {
    const [encounters, staff] = await Promise.all([encountersForPatient(patientId), listStaff()]);
    const staffNames = new Map(staff.map((member) => [member.staffId, member.fullName]));
    let encounter = currentId ? encounters.find((candidate) => candidate.id === currentId) : undefined;
    if (!currentId) {
      for (const candidate of [...encounters].sort((a, b) => b.openedOn.localeCompare(a.openedOn))) {
        const entries = await entriesForEncounter(candidate.id);
        if (!entries.some((entry) => (CLOSING_STEPS as readonly string[]).includes(entry.step))) {
          encounter = candidate;
          break;
        }
      }
    }
    return { encounter, entries: encounter ? await entriesForEncounter(encounter.id) : [], staffNames };
  }, [patientId, currentId]);

  const live = useLiveQuery(load);
  const foundId = live.data?.encounter?.id;
  useEffect(() => {
    if (!currentId && foundId) setCurrentId(foundId);
  }, [currentId, foundId]);

  const enc = useMemo(
    () =>
      projectEncounter({
        patientId,
        encounter: live.data?.encounter,
        entries: live.data?.entries ?? [],
        draft,
        skippedNow,
        staffNames: live.data?.staffNames ?? new Map(),
      }),
    [patientId, live.data, draft, skippedNow],
  );

  const setField = useCallback(<K extends StepKey, F extends keyof EncounterData[K]>(step: K, field: F, value: EncounterData[K][F]) => {
    setDraft((d) => ({ ...d, [step]: { ...d[step], [field]: value } }));
  }, []);

  const toggleIn = useCallback((step: 'lab_order', field: 'tests', value: string) => {
    setDraft((d) => {
      const arr = [...((d[step] as Record<string, string[]>)[field] || [])];
      const i = arr.indexOf(value);
      if (i < 0) arr.push(value);
      else arr.splice(i, 1);
      return { ...d, [step]: { ...d[step], [field]: arr } };
    });
  }, []);

  const setResult = useCallback((test: string, value: string) => {
    setDraft((d) => ({ ...d, lab_results: { ...d.lab_results, [test]: value } }));
  }, []);

  const addRx = useCallback(() => {
    setDraft((d) => ({ ...d, diagnosis: { ...d.diagnosis, rx: [...d.diagnosis.rx, { name: '', dose: '' }] } }));
  }, []);

  const setRx = useCallback((idx: number, field: 'name' | 'dose', value: string) => {
    setDraft((d) => ({
      ...d,
      diagnosis: { ...d.diagnosis, rx: d.diagnosis.rx.map((line, i) => (i === idx ? { ...line, [field]: value } : line)) },
    }));
  }, []);

  const removeRx = useCallback((idx: number) => {
    setDraft((d) => ({ ...d, diagnosis: { ...d.diagnosis, rx: d.diagnosis.rx.filter((_, i) => i !== idx) } }));
  }, []);

  const toggleDispense = useCallback((idx: number) => {
    setDraft((d) => ({ ...d, dispense: { ...d.dispense, done: { ...d.dispense.done, [idx]: !d.dispense.done[idx] } } }));
  }, []);

  const setDispenseReason = useCallback((idx: number, reason: string) => {
    setDraft((d) => ({ ...d, dispense: { ...d.dispense, reasons: { ...d.dispense.reasons, [idx]: reason } } }));
  }, []);

  /** Moves past a section without writing anything for it (PRD §9.8.2). Closing steps cannot be skipped. */
  const skip = useCallback((key: StepKey) => {
    if (!isClosingStep(key)) setSkippedNow((keys) => [...keys, key]);
  }, []);

  /** What must be fixed before the section may be reviewed; empty when it can be saved. */
  const problems = useCallback((key: StepKey) => stepProblems(key, enc.data), [enc.data]);

  /** Saves the section, locked to the signed-in staff member. */
  const lockStep = useCallback(
    async (key: StepKey) => {
      const followUpOn = key === 'follow_up' ? enc.data.follow_up.when : '';
      const entry = await saveStep(
        {
          encounterId: enc.id,
          patientId,
          step: key,
          values: toStepValues(key, enc.data),
          followUp: followUpOn
            ? {
                reason: enc.data.follow_up.reason.trim() || 'Follow-up review',
                scheduledFor: new Date(`${followUpOn}T${String(REVIEW_HOUR).padStart(2, '0')}:00:00`).toISOString(),
              }
            : undefined,
        },
        context,
      );
      setCurrentId(entry.encounterId);
    },
    [context, enc.data, enc.id, patientId],
  );

  const amendStep = useCallback(
    async (key: StepKey, note: string) => {
      const entry = enc.entries[key];
      if (!entry) throw new Error(`${key} has not been saved, so there is nothing to amend`);
      await amendEntry(entry, note, context);
    },
    [context, enc.entries],
  );

  const actions = useMemo(
    () => ({ setField, toggleIn, setResult, addRx, setRx, removeRx, toggleDispense, setDispenseReason, skip, problems, lockStep, amendStep }),
    [setField, toggleIn, setResult, addRx, setRx, removeRx, toggleDispense, setDispenseReason, skip, problems, lockStep, amendStep],
  );

  return { enc, loading: live.loading, error: live.error, reload: live.reload, ...actions };
};

export type EncounterController = ReturnType<typeof useEncounter>;
