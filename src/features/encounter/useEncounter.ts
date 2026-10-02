import { useCallback, useMemo, useState } from 'react';
import { AUDIT_LABEL, STEP_DEFS, stepsFor } from './steps';
import type { Actor, AuditRow, EncounterData, EncounterState, StepKey } from './types';

const stamp = () => {
  const d = new Date();
  return {
    time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
  };
};

/** Plausible values so the flow is quick to walk (and closed encounters read well). */
const DEFAULT_DATA: EncounterData = {
  vitals: { temp: '38.9', bp: '118/76', pulse: '98', weight: '63', spo2: '98' },
  complaint: { complaints: ['Fever', 'Headache'], note: 'Fever and headache for 3 days, worse at night. Poor appetite.' },
  laborder: { tests: ['Malaria RDT', 'FBC'] },
  labresults: { 'Malaria RDT': 'Positive (P. falciparum)', FBC: 'WBC 11.2 · Hb 11.4 · Plt 180' },
  diagnosis: {
    dx: 'Malaria (confirmed by RDT)',
    rx: [
      { name: 'Artemether-Lumefantrine', dose: '1 tab · twice daily · 3 days' },
      { name: 'Paracetamol 500mg', dose: '1 tab · as needed · 5 days' },
    ],
    injection: false,
    admit: false,
  },
  injection: { drug: 'Artemether 80mg', dose: '80 mg', route: 'IM', site: 'Left gluteus', note: '' },
  dispense: { done: {} },
  admission: { ward: 'General ward', bed: 'Bed 4', note: 'Admit for IV fluids and observation — malaria with persistent vomiting.' },
  followup: { when: '1 week · 16 Jul 2026', reason: 'Malaria recovery review' },
};

const HISTORIC_TIMES = ['09:14', '09:31', '09:36', '10:05', '10:22', '10:38', '10:46', '10:52', '10:58'];

/** How to open an encounter: a fresh in-progress one, or an existing/closed one to view. */
export type EncounterInit = { encId?: string; date?: string; closed?: boolean; signedBy?: Actor; data?: EncounterData };

const seed = (patientId: string, patientName: string, init?: EncounterInit): EncounterState => {
  const data = init?.data ?? DEFAULT_DATA;
  const id = init?.encId ?? 'OOE-ENC-000318';

  // A closed encounter opens read-only: every section already locked & signed.
  if (init?.closed) {
    const date = init.date ?? stamp().date;
    const by = init.signedBy ?? { name: 'Dr. Tunde Bello', role: 'Medical officer' };
    const steps = stepsFor(data);
    const sig: EncounterState['sig'] = {};
    const audit: AuditRow[] = [{ time: HISTORIC_TIMES[0], date, actor: by.name, role: by.role, action: 'Encounter opened' }];
    steps.forEach((s, i) => {
      const time = HISTORIC_TIMES[i] ?? '—';
      sig[s.key] = { actor: by.name, role: by.role, time, date };
      audit.push({ time, date, actor: by.name, role: by.role, action: AUDIT_LABEL[s.key] });
    });
    const admitted = steps.some((s) => s.key === 'admission');
    return { id, patientId, patientName, openedDate: date, stage: steps.length, closed: true, admitted, data, sig, amend: {}, audit };
  }

  const at = stamp();
  return { id, patientId, patientName, openedDate: at.date, stage: 0, closed: false, sig: {}, amend: {}, data, audit: [{ ...at, actor: '—', role: '—', action: 'Encounter opened' }] };
};

/** Plain-text summary rows for a step — used by both the Review sheet and the locked view. */
export const summarize = (data: EncounterData, key: StepKey): { label: string; value: string }[] => {
  switch (key) {
    case 'vitals':
      return [
        { label: 'Temperature', value: `${data.vitals.temp || '—'} °C` },
        { label: 'Blood pressure', value: `${data.vitals.bp || '—'} mmHg` },
        { label: 'Pulse', value: `${data.vitals.pulse || '—'} bpm` },
        { label: 'Weight', value: `${data.vitals.weight || '—'} kg` },
        { label: 'SpO₂', value: `${data.vitals.spo2 || '—'} %` },
      ];
    case 'complaint':
      return [
        { label: 'Complaints', value: data.complaint.complaints.join(', ') || '—' },
        { label: 'Clinical note', value: data.complaint.note || '—' },
      ];
    case 'laborder':
      return [{ label: 'Investigations', value: data.laborder.tests.join(', ') || 'None' }];
    case 'labresults':
      return data.laborder.tests.map((t) => ({ label: t, value: data.labresults[t] || '—' }));
    case 'diagnosis': {
      const plan: string[] = [];
      if (data.diagnosis.injection) plan.push('Give injection');
      if (data.diagnosis.rx.length) plan.push('Prescribe medication');
      if (data.diagnosis.admit) plan.push('Admit patient');
      else plan.push('Send home + follow-up');
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
      const { done } = data.dispense;
      return [
        { label: 'Dispensed', value: rx.filter((_, i) => done[i]).map((m) => m.name).join(', ') || 'None ticked' },
        { label: 'Not dispensed', value: rx.filter((_, i) => !done[i]).map((m) => m.name).join(', ') || '—' },
      ];
    }
    case 'followup':
      return [
        { label: 'Follow-up', value: data.followup.when || '—' },
        { label: 'Reason', value: data.followup.reason || '—' },
      ];
    default:
      return [];
  }
};

export const useEncounter = (patientId: string, patientName: string, init?: EncounterInit) => {
  const [enc, setEnc] = useState<EncounterState>(() => seed(patientId, patientName, init));

  const setField = useCallback(<K extends StepKey, F extends keyof EncounterData[K]>(step: K, field: F, value: EncounterData[K][F]) => {
    setEnc((e) => ({ ...e, data: { ...e.data, [step]: { ...e.data[step], [field]: value } } }));
  }, []);

  const toggleIn = useCallback((step: 'complaint' | 'laborder', field: 'complaints' | 'tests', value: string) => {
    setEnc((e) => {
      const arr = [...((e.data[step] as Record<string, string[]>)[field] || [])];
      const i = arr.indexOf(value);
      if (i < 0) arr.push(value);
      else arr.splice(i, 1);
      return { ...e, data: { ...e.data, [step]: { ...e.data[step], [field]: arr } } };
    });
  }, []);

  const setResult = useCallback((test: string, value: string) => {
    setEnc((e) => ({ ...e, data: { ...e.data, labresults: { ...e.data.labresults, [test]: value } } }));
  }, []);

  const addRx = useCallback(() => {
    setEnc((e) => ({
      ...e,
      data: { ...e.data, diagnosis: { ...e.data.diagnosis, rx: [...e.data.diagnosis.rx, { name: 'New medication', dose: 'dose · frequency · duration' }] } },
    }));
  }, []);

  const removeRx = useCallback((idx: number) => {
    setEnc((e) => ({ ...e, data: { ...e.data, diagnosis: { ...e.data.diagnosis, rx: e.data.diagnosis.rx.filter((_, i) => i !== idx) } } }));
  }, []);

  const toggleDispense = useCallback((idx: number) => {
    setEnc((e) => ({ ...e, data: { ...e.data, dispense: { done: { ...e.data.dispense.done, [idx]: !e.data.dispense.done[idx] } } } }));
  }, []);

  /**
   * Lock a step to the actor, stamp it, log it, and advance. Follow-up closes the
   * encounter; admission closes it AND marks the patient an inpatient (no follow-up).
   */
  const lockStep = useCallback((key: StepKey, actor: Actor) => {
    const at = stamp();
    setEnc((e) => {
      const idx = stepsFor(e.data).findIndex((s) => s.key === key);
      const closed = key === 'followup' || key === 'admission';
      return {
        ...e,
        stage: idx + 1,
        closed,
        admitted: key === 'admission' ? true : e.admitted,
        sig: { ...e.sig, [key]: { actor: actor.name, role: actor.role, ...at } },
        audit: [...e.audit, { ...at, actor: actor.name, role: actor.role, action: AUDIT_LABEL[key] }],
      };
    });
  }, []);

  const amendStep = useCallback((key: StepKey, actor: Actor, note: string) => {
    const at = stamp();
    setEnc((e) => ({
      ...e,
      amend: { ...e.amend, [key]: [...(e.amend[key] || []), { by: actor.name, role: actor.role, note, ...at }] },
      audit: [...e.audit, { ...at, actor: actor.name, role: actor.role, action: `Amendment added to ${STEP_DEFS[key].title}` }],
    }));
  }, []);

  const actions = useMemo(
    () => ({ setField, toggleIn, setResult, addRx, removeRx, toggleDispense, lockStep, amendStep }),
    [setField, toggleIn, setResult, addRx, removeRx, toggleDispense, lockStep, amendStep],
  );

  return { enc, ...actions };
};

export type EncounterController = ReturnType<typeof useEncounter>;
