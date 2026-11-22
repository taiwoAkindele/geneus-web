import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  activeAdmission,
  INPATIENT_STATUS,
  effectiveEncounterEntries,
  orderLine,
  wardSessionComplete,
  wardPrescriptionLines,
  type PrescriptionLine,
  type WardCareEvent,
  type WardRecords,
  type EncounterEntry,
} from '@shared';
import { useLiveQuery } from '@/data';
import { useAuthorizationContext, useSession } from '@/session';
import { usePatient } from '@/modules/front-desk/search';
import { ActionMenu, Button, SelectField, Sheet, TextAreaField, useToast } from '@/ui';
import {
  loadWardCare,
  activeWardOrders,
  currentDischargeSummary,
  saveWardEvent,
  type WardSession,
} from '@/data/repos/wardCare';
import { amendEntry } from '@/data/repos/encounters';
import { userMessage } from '@/lib/api/userMessage';
import { useInpatient } from './useInpatient';
import { WardActionSheet, actionForStep, type WardAction } from './WardActionSheet';
import { WardMedicationSheet } from './WardMedicationSheet';
import { WardDischargeSheet } from './WardDischargeSheet';
import {
  fromStepValues,
  EMPTY_ENCOUNTER_DATA,
  STEP_DEFS,
  summarize,
  EntryEditorSheet,
} from '@/modules/clinical/encounter';
import { wardCareSupported } from '@/data/wardCareSupport';
import { listStaff } from '@/data/repos/staff';
import { pendingWorkforceIds } from '@/data/repos/workforce';
import { listWardDrafts } from '@/data/repos/drafts';
import { patientIdentityIds } from '@/data/repos/patientIdentity';
import { AdmissionMedicationSheet } from './AdmissionMedicationSheet';

const MEDICATION_ACTION_WORDS: Record<string, string> = {
  start: 'started',
  change: 'changed',
  stop: 'stopped',
};

/** A complaint entry with no complaints is a ward progress note. */
const wardEntryTitle = (entry: EncounterEntry): string => {
  if (entry.step === 'amendment') {
    return 'Correction';
  }

  const complaints = entry.values.complaints as string[] | undefined;

  if (entry.step === 'complaint' && !complaints?.length) {
    return 'Progress note';
  }

  return STEP_DEFS[entry.step].title;
};

const time = (iso: string) => {
  const at = new Date(iso);
  const today = new Date();

  return at.toDateString() === today.toDateString()
    ? at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : at.toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
};

/** What an unfinished draft is, in plain words. */
const DRAFT_NAME: Record<WardAction, string> = {
  note: 'progress note',
  observations: 'set of observations',
  diagnosis: 'diagnosis update',
  tests: 'test order',
  medicine: 'medicine order',
  injection: 'injection order',
};

/** "↑ 0.4" against the previous reading, or nothing when there is none to compare. */
const change = (now: string, before: string | undefined) => {
  const a = Number.parseFloat(now);
  const b = before === undefined ? NaN : Number.parseFloat(before);

  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) {
    return '';
  }

  return `${a > b ? '↑' : '↓'} ${+Math.abs(a - b).toFixed(1)}`;
};

/**
 * Ward care: one screen for doctors and nurses. The stay at a glance (diagnosis, latest observations, current
 * treatment, results), then the actions this person may take, each signed on its own, then the stay history.
 * Actions follow permissions; nothing is shown greyed out. Records and server checks are unchanged.
 */
export const WardCareWorkspace = ({ patientId }: { patientId: string }) => {
  const context = useAuthorizationContext();
  const { facility } = useSession();
  const inpatient = useInpatient();
  const patient = usePatient(patientId);
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const identities = useLiveQuery(useCallback(() => patientIdentityIds(patientId), [patientId]));

  const stays = (inpatient.data?.heads ?? [])
    .filter((e) => (identities.data ?? [patientId]).includes(e.patientId))
    .sort(
      (a, b) =>
        Number(activeAdmission(b)) - Number(activeAdmission(a)) ||
        b.createdOn.localeCompare(a.createdOn),
    );

  const admissionId = params.get('admission') ?? stays[0]?.admissionId ?? '';
  const admission = stays.find((e) => e.admissionId === admissionId);
  const recordPatientId = admission?.patientId ?? patientId;

  const query = useLiveQuery(
    useCallback(async () => {
      if (!admissionId) {
        return undefined;
      }

      const [records, staff, pending, drafts] = await Promise.all([
        loadWardCare(admissionId, context),
        listStaff(),
        pendingWorkforceIds(),
        listWardDrafts({ staffId: context.userId!, patientId: recordPatientId }, admissionId),
      ]);

      return { records, staff, pending, drafts };
    }, [admissionId, recordPatientId, context.userId, context.permissions.join('|')]),
  );

  const [action, setAction] = useState<{
    session: WardSession;
    action: WardAction;
    changeOrder?: WardCareEvent;
  }>();

  const [medication, setMedication] = useState<{
    session: WardSession;
    order: WardCareEvent;
    action: 'administration' | 'continue' | 'stop';
    previous?: WardCareEvent;
  }>();

  const [discharge, setDischarge] = useState<WardSession>();
  const [summary, setSummary] = useState<WardCareEvent>();
  const [correction, setCorrection] = useState<EncounterEntry>();
  const [structuredCorrection, setStructuredCorrection] = useState<EncounterEntry>();

  const [admissionMedicine, setAdmissionMedicine] = useState<{
    session: WardSession;
    sourceEntryId: string;
    line: PrescriptionLine;
  }>();

  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const printContent = useRef<HTMLDivElement>(null);
  const correcting = useRef(false);
  useEffect(() => {
    const refresh = () => query.reload();
    window.addEventListener('geneus:wardCareSupport', refresh);

    return () => window.removeEventListener('geneus:wardCareSupport', refresh);
  }, [query.reload]);

  if (inpatient.loading || patient.loading || identities.loading) {
    return <p role="status">Reading inpatient care…</p>;
  }

  if (inpatient.error || patient.error) {
    return (
      <div role="alert">
        <p>Inpatient care could not be read.</p>
        <Button
          onClick={() => {
            inpatient.reload();
            patient.reload();
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  if (!stays.length) {
    return (
      <p className="rounded-field border border-outline p-4">
        No inpatient stay is recorded for this patient.
      </p>
    );
  }

  if (!admission || !patient.data) {
    return <p role="alert">This admission is not available for this patient.</p>;
  }

  const data = query.data?.records;
  const pending = query.data?.pending ?? new Set<string>();
  const has = (p: string) => context.permissions.includes(p as never);
  const active = activeAdmission(admission);

  const writable =
    !query.loading &&
    !query.error &&
    active &&
    has('encounter:record') &&
    wardCareSupported(context);

  const session = (purpose: WardSession['purpose']): WardSession => ({
    id: `encounter:${crypto.randomUUID()}`,
    admissionId,
    patientId: recordPatientId,
    purpose,
  });

  // A clinician who diagnoses writes notes as a doctor activity; everyone else as a nursing activity.
  const notePurpose: WardSession['purpose'] = has('clinical:diagnose') ? 'review' : 'nursing';

  const start = (kind: WardAction, changeOrder?: WardCareEvent) =>
    setAction({
      session: session(
        kind === 'observations' || (kind === 'note' && notePurpose === 'nursing')
          ? 'nursing'
          : 'review',
      ),
      action: kind,
      changeOrder,
    });

  const nameOf = (id: string) => query.data?.staff.find((s) => s.staffId === id)?.fullName ?? id;

  const saved = () => {
    query.reload();
    inpatient.reload();
  };

  const entries = data ? effectiveEncounterEntries(data.entries) : [];

  const newestFirst = (a: EncounterEntry, b: EncounterEntry) =>
    (b.performedOn ?? b.createdOn).localeCompare(a.performedOn ?? a.createdOn);

  const orders = data ? activeWardOrders(data) : [];
  const summaries = data ? currentDischargeSummary(data) : [];

  const timeline = data
    ? [
        ...data.entries.map((entry) => ({
          id: entry.id,
          time: entry.performedOn ?? entry.createdOn,
          entry,
          event: undefined as WardCareEvent | undefined,
        })),
        ...data.events
          .filter((e) => e.values.kind !== 'complete')
          .map((event) => ({
            id: event.id,
            time: event.occurredOn,
            entry: undefined as EncounterEntry | undefined,
            event,
          })),
      ].sort((a, b) => b.time.localeCompare(a.time) || b.id.localeCompare(a.id))
    : [];

  // The stay at a glance.
  const admittedOn =
    inpatient.data?.events.find((v) => v.id === admission.admissionId)?.createdOn ??
    admission.createdOn;

  const day = Math.max(1, Math.floor((Date.now() - Date.parse(admittedOn)) / 86_400_000) + 1);
  const latestDiagnosis = entries.filter((e) => e.step === 'diagnosis').sort(newestFirst)[0];

  const diagnosisText = latestDiagnosis
    ? summarize(
        fromStepValues('diagnosis', latestDiagnosis.values, structuredClone(EMPTY_ENCOUNTER_DATA)),
        'diagnosis',
      )[0]?.value
    : undefined;

  const vitals = entries.filter((e) => e.step === 'vitals').sort(newestFirst);

  const readVitals = (e?: EncounterEntry) =>
    e
      ? fromStepValues('vitals', e.values, structuredClone(EMPTY_ENCOUNTER_DATA)).vitals
      : undefined;

  const now = readVitals(vitals[0]);
  const before = readVitals(vitals[1]);

  const lastGiven = (order: WardCareEvent) => {
    const orderId = order.values.kind === 'medication' ? order.values.orderId : order.id;

    const chain = new Set(
      data?.events
        .filter((e) => e.values.kind === 'medication' && e.values.orderId === orderId)
        .map((e) => e.id),
    );

    return data?.events
      .filter(
        (e) =>
          e.values.kind === 'administration' &&
          chain.has(e.values.orderEventId) &&
          e.values.outcome === 'given',
      )
      .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn))[0];
  };

  const labOrders = data
    ? data.encounters.filter((e) =>
        entries.some((v) => v.encounterId === e.id && v.step === 'lab_order'),
      )
    : [];

  const openActivities =
    writable && data
      ? data.encounters.filter(
          (e) =>
            e.inpatientContext &&
            e.inpatientContext.purpose === 'review' &&
            e.createdBy === context.userId &&
            !wardSessionComplete(e.id, data.events) &&
            data.entries.some((v) => v.encounterId === e.id),
        )
      : [];

  const toReview =
    data && writable && has('clinical:prescribe')
      ? entries
          .filter(
            (e) =>
              e.encounterId === admission.encounterId &&
              ['prescription', 'diagnosis'].includes(e.step) &&
              !data.entries.some((a) => a.amends === e.id && a.values.correctedValues),
          )
          .flatMap((entry) =>
            wardPrescriptionLines(entry)
              .filter(
                (line) =>
                  !data.events.some(
                    (e) =>
                      e.values.kind === 'medication' &&
                      e.values.sourceEntryId === entry.id &&
                      e.values.lineId === line.lineId,
                  ),
              )
              .map((line) => ({ entry, line })),
          )
      : [];

  const ACTIONS: {
    key: WardAction | 'discharge';
    label: string;
    hint: string;
    allowed: boolean;
  }[] = [
    {
      key: 'note',
      label: 'Add progress note',
      hint: 'How the patient is now',
      allowed: Boolean(writable),
    },
    {
      key: 'observations',
      label: 'Record observations',
      hint: 'Temperature, pulse, BP…',
      allowed: Boolean(writable),
    },
    {
      key: 'medicine',
      label: 'Add medicine',
      hint: 'Start a new medicine',
      allowed: Boolean(writable) && has('clinical:prescribe'),
    },
    {
      key: 'injection',
      label: 'Order injection',
      hint: 'Given separately by nursing',
      allowed: Boolean(writable) && has('clinical:prescribe'),
    },
    {
      key: 'tests',
      label: 'Order tests',
      hint: 'Find a test and add it',
      allowed: Boolean(writable) && has('clinical:diagnose'),
    },
    {
      key: 'diagnosis',
      label: 'Update diagnosis',
      hint: 'Only if it has changed',
      allowed: Boolean(writable) && has('clinical:diagnose'),
    },
    {
      key: 'discharge',
      label: summaries.length ? 'Revise discharge summary' : 'Prepare discharge',
      hint: 'Summary and take-home medicines',
      allowed: Boolean(writable) && has('clinical:prescribe'),
    },
  ];

  const print = () => {
    const popup = window.open('', '_blank', 'width=800,height=900');

    if (!popup || !printContent.current) {
      const m = 'The print window was blocked. Allow pop-ups and try again.';
      setError(m);
      toast(m, { tone: 'error' });

      return;
    }

    const style = popup.document.createElement('style');
    style.textContent =
      'body{font:14px Arial,sans-serif;padding:24px;color:#111}dt{font-weight:bold;margin-top:16px}dd{margin:4px 0;white-space:pre-wrap}h1{font-size:22px}';

    popup.document.head.append(style);
    popup.document.body.append(printContent.current.cloneNode(true));
    popup.focus();
    popup.print();
  };

  const correct = async () => {
    if (!correction || correcting.current) {
      return;
    }

    correcting.current = true;
    setSaving(true);

    try {
      await amendEntry(correction, note, context);
      setCorrection(undefined);
      setNote('');
      toast('Correction note signed');
      saved();
    } catch (cause) {
      const m = userMessage(cause, 'The correction could not be saved. Try again.');
      setError(m);
      toast(m, { tone: 'error' });
    } finally {
      correcting.current = false;
      setSaving(false);
    }
  };

  const closeActivity = async (id: string) => {
    try {
      await saveWardEvent(
        { id, admissionId, patientId: recordPatientId, purpose: 'review' },
        { kind: 'complete' },
        context,
      );

      toast('Earlier activity closed');
      saved();
    } catch (cause) {
      const m = userMessage(cause, 'The activity could not be closed. Try again.');
      setError(m);
      toast(m, { tone: 'error' });
    }
  };

  const vitalTiles = now
    ? ([
        ['Temp', now.temp, '°', before?.temp],
        ['Pulse', now.pulse, '', before?.pulse],
        ['BP', now.bp, '', undefined],
        ['RR', now.respiratoryRate ?? '', '', before?.respiratoryRate],
        ['SpO₂', now.spo2, '%', before?.spo2],
      ] as const)
    : [];

  const renderQueryState = () => {
    if (query.loading) {
      return <p role="status">Reading the stay…</p>;
    }

    if (query.error) {
      return (
        <div role="alert">
          <p>The stay could not be read.</p>
          <Button onClick={query.reload}>Try again</Button>
        </div>
      );
    }

    return null;
  };

  return (
    <section className="space-y-5" aria-label="Ward care">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold">Ward care</h2>
          <p className="text-sm text-ink-soft">
            {[
              inpatient.data?.locations.find((l) => l.id === admission.wardId)?.name,
              inpatient.data?.locations.find((l) => l.id === admission.bedId)?.name,
            ]
              .filter(Boolean)
              .join(' · ') || 'Awaiting a bed'}
            {active ? ` · Day ${day} of stay` : ` · ${INPATIENT_STATUS[admission.action]}`} ·{' '}
            {inpatient.data?.units.find((u) => u.id === admission.receivingUnitId)?.name}
          </p>
        </div>
        {stays.length > 1 ? (
          <div className="w-64">
            <SelectField
              label="Stay"
              value={admissionId}
              onChange={(e) => {
                setAction(undefined);
                setMedication(undefined);
                setDischarge(undefined);
                setParams((p) => {
                  const next = new URLSearchParams(p);
                  next.set('admission', e.target.value);

                  return next;
                });
              }}
              options={stays.map((e) => ({
                value: e.admissionId,
                label: `${new Date(inpatient.data!.events.find((v) => v.id === e.admissionId)!.createdOn).toLocaleDateString('en-GB')} · ${INPATIENT_STATUS[e.action]}`,
              }))}
            />
          </div>
        ) : null}
      </header>
      {pending.has(admission.id) ? (
        <p className="text-sm text-amber-text">
          Admission changes are waiting for the server to confirm them.
        </p>
      ) : null}
      {!wardCareSupported(context) ? (
        <p className="rounded-field border border-amber-border bg-amber-bg p-3 text-sm text-amber-text">
          Connect once so this device can record ward care.
        </p>
      ) : null}
      {renderQueryState()}
      {error ? (
        <p
          role="alert"
          className="rounded-field border border-danger bg-danger-bg p-3 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      {data ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <section className="space-y-2" aria-label="Diagnosis">
            <h3 className="text-xs font-bold uppercase tracking-wide text-ink-muted">Diagnosis</h3>
            <div className="rounded-card border border-outline-soft bg-white p-3">
              <p className="font-bold">
                {diagnosisText || 'No diagnosis recorded during this stay yet'}
              </p>
              {latestDiagnosis ? (
                <p className="text-xs text-ink-muted">
                  {time(latestDiagnosis.performedOn ?? latestDiagnosis.createdOn)} ·{' '}
                  {nameOf(latestDiagnosis.createdBy)}
                </p>
              ) : null}
            </div>
          </section>
          <section className="space-y-2" aria-label="Latest observations">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-ink-muted">
                Latest observations
              </h3>
              {vitals[0] ? (
                <span className="text-xs text-ink-muted">
                  {time(vitals[0].performedOn ?? vitals[0].createdOn)} ·{' '}
                  {nameOf(vitals[0].createdBy)}
                </span>
              ) : null}
            </div>
            {now ? (
              <div className="grid grid-cols-5 overflow-hidden rounded-card border border-outline-soft bg-white">
                {vitalTiles.map(([label, value, unit, prior]) => (
                  <div
                    key={label}
                    className="min-w-0 border-l border-outline-soft p-2 first:border-l-0"
                  >
                    <p className="text-[11px] font-bold uppercase text-ink-muted">{label}</p>
                    <p className="text-lg font-bold tabular-nums">
                      {value ? `${value}${unit}` : '—'}
                    </p>
                    <p className="text-[11px] text-ink-muted">
                      {value ? change(value, prior) : ''}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-card border border-dashed border-outline p-3 text-sm text-ink-muted">
                No observations recorded yet.
              </p>
            )}
          </section>
        </div>
      ) : null}

      {data ? (
        <section className="space-y-2" aria-label="Current treatment">
          <h3 className="text-xs font-bold uppercase tracking-wide text-ink-muted">
            Current treatment
          </h3>
          {!orders.length && !toReview.length ? (
            <p className="rounded-card border border-dashed border-outline p-3 text-sm text-ink-muted">
              No medicines are ordered on the ward yet.
            </p>
          ) : null}
          {orders.length ? (
            <ul className="divide-y divide-outline-soft rounded-card border border-outline-soft bg-white">
              {orders.map((order) => {
                const line = orderLine(order, data.entries);
                const given = lastGiven(order);

                return (
                  <li
                    key={order.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-3"
                  >
                    <div className="min-w-0">
                      <p className="font-bold">
                        {line?.drug} · {line?.dose}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {[line?.route, line?.frequency, line?.duration].filter(Boolean).join(' · ')}
                        {given ? ` · last given ${time(given.occurredOn)}` : ' · not given yet'}
                        {pending.has(order.id) ? ' · waiting for server confirmation' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {writable && has('clinical:administer') ? (
                        <Button
                          variant="outlined"
                          fullWidth={false}
                          className="!px-3 !py-2 text-sm"
                          onClick={() =>
                            setMedication({
                              session: session('nursing'),
                              order,
                              action: 'administration',
                            })
                          }
                        >
                          Given
                        </Button>
                      ) : null}
                      {writable && has('clinical:prescribe') ? (
                        <span className="rounded-field border-[1.5px] border-outline">
                          <ActionMenu
                            compact
                            label={`Change ${line?.drug ?? 'medicine'}`}
                            title={line?.drug}
                            actions={[
                              {
                                label: 'Change dose or frequency',
                                onSelect: () => start('medicine', order),
                              },
                              {
                                label: 'Continue as is',
                                onSelect: () =>
                                  setMedication({
                                    session: session('review'),
                                    order,
                                    action: 'continue',
                                  }),
                              },
                              {
                                label: 'Stop',
                                onSelect: () =>
                                  setMedication({
                                    session: session('review'),
                                    order,
                                    action: 'stop',
                                  }),
                              },
                            ]}
                          />
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {toReview.length ? (
            <div className="space-y-2 rounded-card border border-amber-border bg-amber-bg p-3 text-sm text-amber-text">
              <p className="font-bold">Medicines from the admission to review for ward use</p>
              {toReview.map(({ entry, line }) => (
                <div
                  key={line.lineId}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <span>
                    {line.drug} · {line.dose}
                  </span>
                  <Button
                    variant="outlined"
                    fullWidth={false}
                    className="!px-3 !py-1.5 text-sm"
                    onClick={() =>
                      setAdmissionMedicine({
                        session: session('review'),
                        sourceEntryId: entry.id,
                        line,
                      })
                    }
                  >
                    Review
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {labOrders.length ? (
        <section className="space-y-2" aria-label="Tests and results">
          <h3 className="text-xs font-bold uppercase tracking-wide text-ink-muted">
            Tests and results
          </h3>
          <ul className="divide-y divide-outline-soft rounded-card border border-outline-soft bg-white">
            {labOrders.map((encounter) => {
              const care = entries.filter((e) => e.encounterId === encounter.id);
              const ordered = care.find((e) => e.step === 'lab_order')!;

              const results = care
                .filter((e) => e.step === 'lab_results')
                .flatMap((e) => e.values.results as { test: string; result: string }[]);

              return (
                <li
                  key={encounter.id}
                  className="flex flex-wrap items-start justify-between gap-3 p-3"
                >
                  <div className="min-w-0 text-sm">
                    <p className="font-bold">{(ordered.values.tests as string[]).join(', ')}</p>
                    <p className="text-xs text-ink-muted">
                      Ordered {time(ordered.createdOn)} · {nameOf(ordered.createdBy)}
                    </p>
                    {results.map((r, i) => (
                      <p key={i}>
                        {r.test}: <strong>{r.result}</strong>
                      </p>
                    ))}
                    {!results.length ? (
                      <p className="text-xs text-ink-muted">Waiting for the laboratory</p>
                    ) : null}
                  </div>
                  {results.length ? (
                    <Link
                      className="inline-flex min-h-[40px] items-center rounded-field border-[1.5px] border-outline px-3 text-sm font-bold text-brand"
                      to={`/encounters/record?${new URLSearchParams({ patient: patientId, visit: encounter.id, task: 'result_review' })}`}
                    >
                      Review results
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {data && (writable || (!active && has('encounter:record') && wardCareSupported(context))) ? (
        <section className="space-y-2" aria-label="Actions">
          <h3 className="text-xs font-bold uppercase tracking-wide text-ink-muted">Actions</h3>
          {active ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {ACTIONS.filter((a) => a.allowed).map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={() =>
                    a.key === 'discharge' ? setDischarge(session('discharge')) : start(a.key)
                  }
                  className="flex min-h-[64px] flex-col items-start justify-center rounded-card border-[1.5px] border-outline bg-white px-3 py-2 text-left hover:border-brand"
                >
                  <span className="font-bold text-brand">{a.label}</span>
                  <span className="text-xs text-ink-muted">{a.hint}</span>
                </button>
              ))}
              <Link
                to={'/admissions?' + new URLSearchParams({ tab: 'inpatients', patient: patientId })}
                className="flex min-h-[64px] flex-col items-start justify-center rounded-card border-[1.5px] border-outline bg-white px-3 py-2 hover:border-brand"
              >
                <span className="font-bold text-brand">Bed, transfer &amp; departure</span>
                <span className="text-xs text-ink-muted">Move bed or record leaving</span>
              </Link>
            </div>
          ) : (
            <Button
              variant="outlined"
              fullWidth={false}
              onClick={() => setAction({ session: session('nursing'), action: 'note' })}
            >
              Report late care for independent review
            </Button>
          )}
          {writable &&
            query.data?.drafts.map((draft) => (
              <div
                key={draft.session.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-field border border-outline-soft bg-surface p-3 text-sm"
              >
                <span>
                  You have an unfinished {DRAFT_NAME[actionForStep(draft.step) ?? 'note']}.
                </span>
                <Button
                  variant="outlined"
                  fullWidth={false}
                  className="!px-3 !py-1.5 text-sm"
                  onClick={() => {
                    const target = draft.changeOrderId
                      ? data.events.find((e) => e.id === draft.changeOrderId)
                      : undefined;

                    if (draft.changeOrderId && !target) {
                      const m = 'The original medicine order is unavailable. Sync, then try again.';
                      setError(m);
                      toast(m, { tone: 'error' });

                      return;
                    }

                    setAction({
                      session: draft.session,
                      action: actionForStep(draft.step) ?? 'note',
                      changeOrder: target,
                    });
                  }}
                >
                  Continue
                </Button>
              </div>
            ))}
          {openActivities.map((e) => (
            <div
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-field border border-outline-soft bg-surface p-3 text-sm"
            >
              <span>An earlier review you started at {time(e.openedOn)} is still open.</span>
              <Button
                variant="outlined"
                fullWidth={false}
                className="!px-3 !py-1.5 text-sm"
                onClick={() => void closeActivity(e.id)}
              >
                Close it
              </Button>
            </div>
          ))}
        </section>
      ) : null}

      {data?.events.some((e) => e.values.kind === 'discharge') ? (
        <section className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-ink-muted">
            Discharge summaries
          </h3>
          <div className="flex flex-wrap gap-2">
            {data.events
              .filter((e) => e.values.kind === 'discharge')
              .map((e) => (
                <Button
                  key={e.id}
                  variant="outlined"
                  fullWidth={false}
                  onClick={() => setSummary(e)}
                >
                  {summaries.some((s) => s.id === e.id) ? 'Current' : 'Earlier'} summary ·{' '}
                  {time(e.createdOn)}
                </Button>
              ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-2" aria-label="Stay history">
        <h3 className="text-xs font-bold uppercase tracking-wide text-ink-muted">Stay history</h3>
        {!timeline.length && !query.loading ? (
          <p className="text-sm text-ink-muted">Nothing has been signed for this stay yet.</p>
        ) : null}
        <ol className="divide-y divide-outline-soft rounded-card border border-outline-soft bg-white">
          {timeline.map(({ id, time: at, entry, event }) => (
            <li key={id} className="grid min-w-0 gap-1 p-3 sm:grid-cols-[120px_1fr]">
              <p className="text-xs text-ink-muted">
                {time(at)}
                <br />
                {nameOf((entry ?? event)!.createdBy)}
                {pending.has(id) ? (
                  <>
                    <br />
                    Waiting for server
                  </>
                ) : null}
              </p>
              <div className="min-w-0">
                {entry ? (
                  <>
                    <h4 className="font-bold">
                      {wardEntryTitle(entry)}
                      {entry.lateReason ? (
                        <span className="ml-2 rounded-full bg-amber-bg px-2 py-0.5 text-xs font-bold text-amber-text">
                          Late entry
                        </span>
                      ) : null}
                    </h4>
                    {entry.step === 'amendment' ? (
                      <p className="whitespace-pre-wrap text-sm">{String(entry.values.note)}</p>
                    ) : (
                      <dl className="space-y-1">
                        {summarize(
                          fromStepValues(
                            entry.step,
                            entry.values,
                            structuredClone(EMPTY_ENCOUNTER_DATA),
                          ),
                          entry.step,
                        ).map((row, i) => (
                          <div key={i}>
                            <dt className="text-xs text-ink-muted">{row.label}</dt>
                            <dd className="whitespace-pre-wrap break-words text-sm">{row.value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {has('encounter:record') ? (
                      <div className="flex flex-wrap gap-3">
                        {['vitals', 'complaint', 'diagnosis', 'lab_results'].includes(
                          entry.step,
                        ) ? (
                          <Button
                            variant="ghost"
                            fullWidth={false}
                            className="!px-0 !py-1 text-sm"
                            onClick={() => setStructuredCorrection(entry)}
                          >
                            Correct values
                          </Button>
                        ) : null}
                        {entry.step !== 'amendment' ? (
                          <Button
                            variant="ghost"
                            fullWidth={false}
                            className="!px-0 !py-1 text-sm"
                            onClick={() => {
                              setNote('');
                              setCorrection(entry);
                            }}
                          >
                            Add correction note
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : null}
                {!entry && event ? (
                  <WardEventBody
                    event={event}
                    records={data!}
                    onCorrect={
                      writable &&
                      has('clinical:administer') &&
                      event.values.kind === 'administration'
                        ? () => {
                            const v = event.values;

                            if (v.kind !== 'administration') {
                              return;
                            }

                            const order = data!.events.find((e) => e.id === v.orderEventId);

                            if (order) {
                              setMedication({
                                session: session('nursing'),
                                order,
                                action: 'administration',
                                previous: event,
                              });
                            }
                          }
                        : undefined
                    }
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </section>
      <p className="text-xs text-ink-muted">
        Entries show here as soon as they're saved, even before the server confirms them. Anything
        the server refuses is kept in{' '}
        <Link className="underline" to="/sync">
          Sync &amp; review
        </Link>
        . Signed entries are corrected, never changed.
      </p>

      {action && data ? (
        <WardActionSheet
          key={action.session.id}
          session={action.session}
          action={action.action}
          changeOrder={action.changeOrder}
          records={data}
          onClose={() => setAction(undefined)}
          onSaved={saved}
        />
      ) : null}
      {medication && data ? (
        <WardMedicationSheet
          key={medication.session.id}
          {...medication}
          records={data}
          onClose={() => setMedication(undefined)}
          onSaved={saved}
        />
      ) : null}
      {admissionMedicine ? (
        <AdmissionMedicationSheet
          {...admissionMedicine}
          onClose={() => setAdmissionMedicine(undefined)}
          onSaved={saved}
        />
      ) : null}
      {discharge && data ? (
        <WardDischargeSheet
          key={discharge.id}
          session={discharge}
          records={data}
          patient={patient.data}
          previous={summaries.length === 1 ? summaries[0] : undefined}
          onClose={() => setDischarge(undefined)}
          onSaved={saved}
        />
      ) : null}
      {correction ? (
        <Sheet
          title="Add correction note"
          onClose={() => setCorrection(undefined)}
          closeDisabled={saving}
          hasUnsavedChanges={Boolean(note)}
        >
          <TextAreaField
            label="What needs correcting, and why"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <p className="my-3 text-sm">
            The original entry stays as it is. Your signed note appears beside it.
          </p>
          <Button disabled={saving || note.trim().length < 3} onClick={() => void correct()}>
            Sign correction note
          </Button>
        </Sheet>
      ) : null}
      {structuredCorrection && data && structuredCorrection.step !== 'amendment' ? (
        <EntryEditorSheet
          patientId={recordPatientId}
          encounterId={structuredCorrection.encounterId}
          step={structuredCorrection.step}
          entries={data.entries.filter((e) => e.encounterId === structuredCorrection.encounterId)}
          target={structuredCorrection}
          onClose={() => {
            setStructuredCorrection(undefined);
            saved();
          }}
        />
      ) : null}
      {summary?.values.kind === 'discharge' ? (
        <Sheet title="Signed discharge summary" onClose={() => setSummary(undefined)}>
          <div ref={printContent}>
            <h1 className="text-xl font-bold">{facility.name} · Discharge summary</h1>
            <p className="my-2 font-bold">
              {summary.values.patientName} · {summary.values.patientIdentifier}
            </p>
            <p className="text-sm">
              Admitted {new Date(summary.values.admittedOn).toLocaleString('en-GB')}
            </p>
            <dl className="space-y-3">
              {(
                [
                  ['admissionReason', 'Reason for admission'],
                  ['diagnoses', 'Discharge diagnoses'],
                  ['course', 'Care during stay'],
                  ['findings', 'Relevant findings'],
                  ['pending', 'Outstanding work'],
                  ['instructions', 'Instructions'],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <dt className="font-bold">{label}</dt>
                  <dd className="whitespace-pre-wrap">
                    {summary.values.kind === 'discharge'
                      ? summary.values[key] || 'Not recorded'
                      : ''}
                  </dd>
                </div>
              ))}
              <dt className="font-bold">Take-home medicines</dt>
              <dd className="whitespace-pre-wrap">
                {summary.values.takeHome
                  .map((r) =>
                    [r.drug, r.dose, r.frequency, r.duration, r.route].filter(Boolean).join(' · '),
                  )
                  .join('\n') || 'None required — explicitly reviewed'}
              </dd>
              <dt className="font-bold">Follow-up</dt>
              <dd>{summary.values.followUpOn ?? 'No date recorded'}</dd>
            </dl>
            <p className="mt-4 text-sm">
              Signed by {nameOf(summary.createdBy)} ·{' '}
              {new Date(summary.createdOn).toLocaleString('en-GB')} · Record {summary.id}
            </p>
            <p className="text-xs">
              Printed from this signed revision. Later results and revised summaries remain in the
              chart.
            </p>
          </div>
          <Button className="mt-4" onClick={print}>
            Print this signed revision
          </Button>
        </Sheet>
      ) : null}
    </section>
  );
};

const WardEventBody = ({
  event,
  records,
  onCorrect,
}: {
  event: WardCareEvent;
  records: WardRecords;
  onCorrect?: () => void;
}) => {
  const v = event.values;

  if (v.kind === 'complete') {
    return (
      <p className="text-sm font-bold">Care activity completed{v.note ? ' · ' + v.note : ''}</p>
    );
  }

  if (v.kind === 'medication') {
    const line = orderLine(event, records.entries);

    return (
      <>
        <h4 className="font-bold">Medicine {MEDICATION_ACTION_WORDS[v.action] ?? 'continued'}</h4>
        <p className="text-sm">
          {line?.drug} · {line?.dose} · {line?.frequency} {line?.route}
        </p>
        {v.note ? <p className="text-sm">{v.note}</p> : null}
      </>
    );
  }

  if (v.kind === 'administration') {
    const order = records.events.find((e) => e.id === v.orderEventId);
    const line = order && orderLine(order, records.entries);

    return (
      <>
        <h4 className="font-bold">
          {line?.drug} · {v.outcome === 'given' ? 'Given' : 'Not given'}
          {v.previousId ? ' · Corrected record' : ''}
        </h4>
        <p className="text-sm">
          {v.dose} · {v.route} {v.reason ? ' · ' + v.reason : ''}
        </p>
        {onCorrect ? (
          <Button
            variant="ghost"
            fullWidth={false}
            className="!px-0 !py-1 text-sm"
            onClick={onCorrect}
          >
            Correct this record
          </Button>
        ) : null}
      </>
    );
  }

  return (
    <p className="font-bold">Discharge summary signed{v.previousId ? ' · Revised version' : ''}</p>
  );
};
