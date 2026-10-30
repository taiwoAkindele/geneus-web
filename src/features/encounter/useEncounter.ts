import { registerWorkspaceFlusher } from '@/data/facilityWorkspaces';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { closesEncounter, type Encounter, type EncounterEntry } from '@shared';
import { useLiveQuery, useDeviceContext } from '@/data';
import { zonedInstant } from '@/lib/workforceTime';
import { discardDraft, discardDrafts, readDrafts, writeDraft, type DraftOwner } from '@/data/repos/drafts';
import { amendEntry, encountersForPatient, entriesForEncounter, saveStep } from '@/data/repos/encounters';
import { listStaff } from '@/data/repos/staff';
import { useAuthorizationContext } from '@/session';
import { EMPTY_ENCOUNTER_DATA, projectEncounter } from './encounterRecord';
import { isClosingStep, STEP_DEFS, stepsFor } from './steps';
import { stepProblems, toStepValues } from './stepValues';
import type { EncounterData, RxLine, StepKey } from './types';

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
        ...(data.vitals.height ? [{ label: 'Height', value: `${data.vitals.height} cm` }] : []),
        ...(data.vitals.respiratoryRate ? [{ label: 'Respiratory rate', value: `${data.vitals.respiratoryRate} /min` }] : []),
      ];
    case 'complaint':
      return [
        { label: 'Complaints', value: data.complaint.text.trim() || '—' },
        { label: 'Clinical note', value: data.complaint.note || '—' },
        ...(['historyOfPresentIllness', 'examination', 'assessment', 'plan'] as const).flatMap((key) => data.complaint[key] ? [{ label: { historyOfPresentIllness: 'History of presenting illness', examination: 'Examination', assessment: 'Assessment', plan: 'Clinical plan / advice' }[key], value: data.complaint[key]! }] : []),
      ];
    case 'result_review': return [{ label: 'Results reviewed', value: String(data.result_review.resultEntryIds.length) }, { label: 'Clinical review / action', value: data.result_review.note || 'Acknowledged' }];
    case 'investigation_review': return [{ label: 'Investigations', value: data.investigation_review.decision === 'none_required' ? 'No investigations required' : data.investigation_review.decision === 'ordered' ? 'Investigations ordered' : 'Not yet reviewed' }, { label: 'Reason', value: data.investigation_review.reason || '?' }];
    case 'prescription': return [{ label: 'Medication decision', value: data.prescription.decision === 'none_required' ? 'No medication required' : data.prescription.rx.map((r) => [r.name, r.dose, r.route, r.frequency, r.duration].filter(Boolean).join(' ? ')).join('; ') || 'Not yet reviewed' }];
    case 'injection_order': return [{ label: 'Injection order', value: data.injection_order.required ? [data.injection_order.drug, data.injection_order.dose, data.injection_order.route, data.injection_order.instructions].filter(Boolean).join(' ? ') : 'No injection ordered' }];
    case 'disposition': return [{ label: 'Disposition', value: ({ home_care: 'Discharge / Home care', observation: 'Observation', referral: 'Referral', admission: 'Admission requested', '': 'Not recorded' })[data.disposition.kind] }, { label: 'Care plan / instructions', value: data.disposition.note || '?' }, { label: 'Responsible service', value: data.disposition.responsibleService || '?' }, { label: 'Reassessment', value: data.disposition.reassessOn || '?' }, { label: 'Destination', value: data.disposition.toFacilityId || '?' }, { label: 'Follow-up', value: data.disposition.followUpOn || 'None' }];
    case 'lab_order':
      return [{ label: 'Investigations', value: data.lab_order.tests.join(', ') || 'None' }];
    case 'lab_results':
      return data.lab_order.tests.map((t, index) => ({ label: t, value: data.lab_results[data.lab_order.items?.[index]?.id ?? t] || '—' }));
    case 'diagnosis': {
      const plan: string[] = [];
      if (data.diagnosis.injection) plan.push('Give injection');
      if (data.diagnosis.rx.length) plan.push('Prescribe medication');
      if (data.diagnosis.admit) plan.push('Admit patient');
      else plan.push('Send home');
      return [
        { label: 'Diagnosis', value: data.diagnosis.dx || '—' },
        ...(data.diagnosis.code || data.diagnosis.certainty ? [{ label: 'Diagnosis details', value: [data.diagnosis.codingSystem, data.diagnosis.code, data.diagnosis.certainty].filter(Boolean).join(' · ') }] : []),
        ...(data.diagnosis.diagnoses ?? []).map((diagnosis, index) => ({ label: `Additional diagnosis ${index + 1}`, value: [diagnosis.label, diagnosis.codingSystem, diagnosis.code, diagnosis.certainty].filter(Boolean).join(' · ') })),
        ...(data.workflowVersion === 1 ? [] : [
        { label: 'Prescription', value: data.diagnosis.rx.map((m) => `${m.name} — ${[m.dose, m.frequency, m.duration, m.route, m.quantity ? `Quantity ${m.quantity}` : ''].filter(Boolean).join(' · ')}`).join('; ') || 'None' },
        { label: 'Plan', value: plan.join(' · ') },
        ]),
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
      const rx = data.workflowVersion === 1 ? data.prescription.rx : data.diagnosis.rx;
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

/** How long typing must pause before the section being recorded is written to the device. */
const DRAFT_PAUSE_MS = 800;
const blankDraft = (value: unknown): boolean => value === undefined || value === null || value === '' || value === false || (Array.isArray(value) ? value.every(blankDraft) : typeof value === 'object' ? Object.values(value).every(blankDraft) : false);
const NAVIGATION_DRAFT = '_navigation';

const ownerKey = (owner: DraftOwner) => `${owner.staffId}|${owner.patientId}|${owner.encounterKey}`;

const keepDraftWarning = (cause: unknown) => console.warn('unsaved work could not be kept on this device', cause);

/**
 * Whether a stored draft still has the shape its section's form expects — a
 * draft kept by an older version of the app is dropped rather than allowed to
 * break the form.
 */
const fitsSection = (step: string, data: unknown): data is EncounterData[StepKey] => {
  if (!(step in STEP_DEFS) || typeof data !== 'object' || data === null) return false;
  if (step === 'lab_results') return true;
  return Object.keys(EMPTY_ENCOUNTER_DATA[step as StepKey]).every((field) => field in data);
};

type Loaded = { encounter: Encounter | undefined; entries: EncounterEntry[]; staffNames: Map<string, string> };

/**
 * One patient's encounter, live. Opens the encounter named, else the patient's
 * open one, else a new one that exists only once its first step is saved.
 * Forms hold what is being typed; a save writes a locked entry and the section
 * is read back from it from then on.
 */
export const useEncounter = (patientId: string, encounterId?: string, appointmentId?: string, recordingStep?: StepKey) => {
  const context = useAuthorizationContext();
  const { facility } = useDeviceContext();
  // Once known (named, found open, or created by the first save) the screen stays on this encounter.
  const [currentId, setCurrentId] = useState(encounterId);
  const [draft, setDraft] = useState<EncounterData>(EMPTY_ENCOUNTER_DATA);
  const [skippedNow, setSkippedNow] = useState<StepKey[]>([]);
  // Unsaved work (PRD §9.8.4) is kept per person: whoever is typing, for this patient and encounter.
  const owner = useMemo<DraftOwner>(
    () => ({ staffId: context.userId, patientId, encounterKey: currentId ?? appointmentId ?? 'new' }),
    [context.userId, patientId, currentId, appointmentId],
  );
  const [restoredFor, setRestoredFor] = useState<string>();
  const [draftRestoredAt, setDraftRestoredAt] = useState<string>();
  const pendingDraft = useRef<(() => Promise<unknown>) | undefined>(undefined);

  const load = useCallback(async (): Promise<Loaded> => {
    const [encounters, staff] = await Promise.all([encountersForPatient(patientId), listStaff()]);
    const staffNames = new Map(staff.map((member) => [member.staffId, member.fullName]));
    let encounter = currentId ? encounters.find((candidate) => candidate.id === currentId) : undefined;
    if (!currentId && appointmentId) encounter = encounters.find((candidate) => candidate.appointmentId === appointmentId);
    if (!currentId && !appointmentId) {
      for (const candidate of [...encounters].sort((a, b) => b.openedOn.localeCompare(a.openedOn))) {
        const entries = await entriesForEncounter(candidate.id);
        if (!entries.some(closesEncounter)) {
          encounter = candidate;
          break;
        }
      }
    }
    if (currentId && !encounter) throw new Error('This visit is not available for this patient on this device. Return to the patient record or sync before continuing.');
    return { encounter, entries: encounter ? await entriesForEncounter(encounter.id) : [], staffNames };
  }, [patientId, currentId, appointmentId]);

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

  const savedSteps = Object.keys(enc.entries).sort().join(',');
  // Drafts are read once the encounter is known — named, found open, or confirmed new.
  const settled = !live.loading && live.data !== undefined && (currentId ? live.data.encounter?.id === currentId : !foundId);

  useEffect(() => {
    if (!settled || restoredFor === ownerKey(owner)) return;
    let cancelled = false;
    const saved = new Set(savedSteps.split(','));
    readDrafts(owner).then(
      (drafts) => {
        if (cancelled) return;
        const navigation = drafts.find((stored) => stored.step === NAVIGATION_DRAFT)?.data;
        const skipped = typeof navigation === 'object' && navigation !== null && 'skipped' in navigation ? navigation.skipped : undefined;
        setSkippedNow(Array.isArray(skipped) ? skipped.filter((key): key is StepKey => typeof key === 'string' && Object.keys(STEP_DEFS).includes(key) && !isClosingStep(key as StepKey) && !saved.has(key)) : []);
        const unsaved = drafts.filter((stored) => !saved.has(stored.step) && fitsSection(stored.step, stored.data));
        if (unsaved.length > 0) {
          setDraft((current) => unsaved.reduce((data, stored) => ({ ...data, [stored.step]: stored.data }), current));
          setDraftRestoredAt(unsaved.reduce((latest, stored) => (stored.updatedOn > latest ? stored.updatedOn : latest), ''));
        }
        setRestoredFor(ownerKey(owner));
      },
      (cause: unknown) => {
        keepDraftWarning(cause);
        if (!cancelled) setRestoredFor(ownerKey(owner));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [settled, owner, restoredFor, savedSteps]);

  // A skip is private navigation state, not a signed clinical finding or a synced record.
  useEffect(() => {
    if (restoredFor !== ownerKey(owner) || enc.closed) return;
    (skippedNow.length ? writeDraft(owner, NAVIGATION_DRAFT, { skipped: skippedNow }) : discardDraft(owner, NAVIGATION_DRAFT)).catch(keepDraftWarning);
  }, [skippedNow, restoredFor, owner, enc.closed]);

  const activeKey = recordingStep && !enc.sig[recordingStep] ? recordingStep : stepsFor(enc.data)[enc.activeIndex]?.key;

  // Keep the section being recorded on the device after each pause in typing.
  useEffect(() => {
    if (!activeKey || restoredFor !== ownerKey(owner)) return;
    const section = draft[activeKey];
    const untouched = JSON.stringify(section) === JSON.stringify(EMPTY_ENCOUNTER_DATA[activeKey]);
    const keep = () => {
      pendingDraft.current = undefined;
      return untouched ? discardDraft(owner, activeKey) : writeDraft(owner, activeKey, section);
    };
    pendingDraft.current = keep;
    const timer = window.setTimeout(() => void keep().catch(keepDraftWarning), DRAFT_PAUSE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, activeKey, owner, restoredFor]);

  useEffect(() => registerWorkspaceFlusher(() => pendingDraft.current?.()), []);

  // Leaving the screen keeps whatever was typed since the last pause.
  useEffect(() => () => { void pendingDraft.current?.().catch(keepDraftWarning); }, []);

  const setField = useCallback(<K extends StepKey, F extends keyof EncounterData[K]>(step: K, field: F, value: EncounterData[K][F]) => {
    setDraft((d) => ({ ...d, [step]: { ...d[step], [field]: value } }));
  }, []);

  const toggleIn = useCallback((step: 'lab_order', field: 'tests', value: string) => {
    setDraft((d) => {
      const arr = [...d[step][field]];
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
    setDraft((d) => ({ ...d, prescription: { ...d.prescription, rx: [...d.prescription.rx, { name: '', dose: '' }] } }));
  }, []);

  const setRx = useCallback((idx: number, field: keyof RxLine, value: string) => {
    setDraft((d) => ({
      ...d,
      prescription: { ...d.prescription, rx: d.prescription.rx.map((line, i) => (i === idx ? { ...line, [field]: value } : line)) },
    }));
  }, []);

  const removeRx = useCallback((idx: number) => {
    setDraft((d) => ({ ...d, prescription: { ...d.prescription, rx: d.prescription.rx.filter((_, i) => i !== idx) } }));
  }, []);

  const toggleDispense = useCallback((idx: number) => {
    setDraft((d) => ({ ...d, dispense: { ...d.dispense, done: { ...d.dispense.done, [idx]: !d.dispense.done[idx] } } }));
  }, []);

  const setDispenseReason = useCallback((idx: number, reason: string) => {
    setDraft((d) => ({ ...d, dispense: { ...d.dispense, reasons: { ...d.dispense.reasons, [idx]: reason } } }));
  }, []);

  /** Keep the navigation choice with this staff member's device draft. No clinical entry is created. */
  const skip = useCallback(
    (key: StepKey) => {
      if (isClosingStep(key)) return;
      pendingDraft.current?.();
      setSkippedNow((keys) => keys.includes(key) ? keys : [...keys, key]);
    },
    [],
  );

  /** What must be fixed before the section may be reviewed; empty when it can be saved. */
  const problems = useCallback((key: StepKey) => stepProblems(key, enc.data), [enc.data]);

  /** Saves the section, locked to the signed-in staff member. */
  const lockStep = useCallback(
    async (key: StepKey, collectLaterReason?: string) => {
      if (key === 'investigation_review' && enc.data.investigation_review.decision === 'ordered') { setSkippedNow((keys) => [...keys, key]); return; }
      if (isClosingStep(key) && !(key === 'disposition' && enc.data.disposition.kind === 'observation')) {
        const unsigned = (Object.keys(STEP_DEFS) as StepKey[]).filter((candidate) => candidate !== key && !enc.entries[candidate] && !blankDraft(draft[candidate]));
        if (unsigned.length) throw new Error('Sign or clear these draft sections before completing: ' + unsigned.map((candidate) => STEP_DEFS[candidate].short).join(', '));
      }
      const followUpOn = key === 'follow_up' ? enc.data.follow_up.when : key === 'disposition' ? enc.data.disposition.followUpOn : '';
      const entry = await saveStep(
        {
          encounterId: enc.id,
          appointmentId,
          patientId,
          step: key,
          values: key === 'diagnosis' && enc.data.workflowVersion === 1 ? { ...toStepValues(key, enc.data), prescription: [] } : toStepValues(key, enc.data),
          collectLaterReason,
          investigationReason: enc.data.investigation_review.reason,
          workflowVersion: enc.data.workflowVersion,
          followUp: followUpOn
            ? {
                reason: enc.data.follow_up.reason.trim() || 'Follow-up review',
                scheduledFor: zonedInstant(`${followUpOn}T${String(REVIEW_HOUR).padStart(2, '0')}:00`, facility?.timeZone ?? 'Africa/Lagos'),
              }
            : undefined,
        },
        context,
      );
      // Saved: the draft has become the record. Once the encounter closes, nothing typed for it can be saved.
      pendingDraft.current = undefined;
      discardDraft(owner, key).catch(keepDraftWarning);
      if (closesEncounter(entry)) {
        discardDrafts({ ...owner, encounterKey: entry.encounterId }).catch(keepDraftWarning);
        discardDrafts({ ...owner, encounterKey: 'new' }).catch(keepDraftWarning);
      } else if (owner.encounterKey !== entry.encounterId && skippedNow.length) {
        // The first signature gives a new visit its ID; carry its private navigation draft forward.
        await writeDraft({ ...owner, encounterKey: entry.encounterId }, NAVIGATION_DRAFT, { skipped: skippedNow.filter((skipped) => skipped !== key) }).catch(keepDraftWarning);
        discardDraft(owner, NAVIGATION_DRAFT).catch(keepDraftWarning);
      }
      setSkippedNow((keys) => closesEncounter(entry) ? [] : keys.filter((skipped) => skipped !== key));
      setCurrentId(entry.encounterId);
      live.reload();
    },
    [context, facility?.timeZone, enc.data, enc.entries, enc.id, draft, owner, patientId, appointmentId, live.reload, skippedNow],
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

  return { enc, rawEntries: live.data?.entries ?? [], draftRestoredAt, loading: live.loading, error: live.error, reload: live.reload, flushDraft: () => pendingDraft.current?.(), ...actions };
};

export type EncounterController = ReturnType<typeof useEncounter>;
