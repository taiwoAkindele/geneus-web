import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ENCOUNTER_STEP_VALUES, type EncounterEntry } from '@shared';
import { useAuthorizationContext, useSession } from '@/session';
import { AuthorizationError } from '@/data';
import { saveStep } from '@/data/repos/encounters';
import { useEncounter } from '@/features/encounter';
import { EntryEditorSheet } from '@/features/encounter/components/EntryEditorSheet';
import { RequestHeader } from '@/features/encounter/components/RequestHeader';
import { PatientChartAccess } from '@/features/patients/PatientChartAccess';
import { usePatient } from '@/features/search';
import { LabResultsForm } from '@/features/resultTemplates/LabResultsForm';
import { PublishedLabReport, effectiveLabReport } from '@/features/resultTemplates/PublishedLabReport';
import { PublishResultsSheet } from '@/features/resultTemplates/PublishResultsSheet';
import { buildLabSubmission, orderKey, pendingLabOrder, useLabSetup, type LabSubmission } from '@/features/resultTemplates/labEntry';
import type { EncounterData, LabItemDraft } from '@/features/encounter/types';
import { Button, Tag, useToast } from '@/ui';

const QUEUE = '/laboratory';
export const labRequestPath = (patientId: string, encounterId: string) => `/laboratory/request?${new URLSearchParams({ patient: patientId, visit: encounterId })}`;

export const LabRequestScreen = () => <PatientChartAccess><LabRequest /></PatientChartAccess>;

/**
 * One laboratory request, worked in the Laboratory: the patient, the tests asked
 * for and by whom, the results form for the tests still pending, and the reports
 * already published. Results are saved to the visit, so the doctor's review and
 * alerts work as before; no clinical visit steps are shown here.
 */
const LabRequest = () => {
  const [params] = useSearchParams(), patientId = params.get('patient') ?? '', encounterId = params.get('visit') ?? '';
  const navigate = useNavigate(), toast = useToast(), context = useAuthorizationContext(), { user } = useSession();
  const patient = usePatient(patientId), labSetup = useLabSetup(patientId);
  const ctl = useEncounter(patientId, encounterId, undefined, 'lab_results');
  // The first results keep a device draft through the visit's own form; later results use the pending tests only.
  const first = !ctl.enc.sig.lab_results;
  const [later, setLater] = useState<EncounterData>();
  useEffect(() => { if (!first && !later && ctl.rawEntries.length) setLater(pendingLabOrder(ctl.rawEntries)); }, [first, later, ctl.rawEntries]);
  const data = first ? ctl.enc.data : later;
  const [preview, setPreview] = useState<LabSubmission>(), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const [correcting, setCorrecting] = useState<EncounterEntry>();
  const busy = useRef(false);
  useEffect(() => { document.title = 'Laboratory request · Geneus Health'; }, []);

  if (!patientId || !encounterId) return <p className="p-6">Open a request from the Laboratory.</p>;
  if (patient.loading || (ctl.loading && !ctl.enc.id)) return <p role="status" className="p-6">Opening the request…</p>;
  if (!patient.data || ctl.error) return <div role="alert" className="space-y-3 p-6"><p>{ctl.error?.message ?? 'This patient is not on this device.'}</p><Button variant="outlined" fullWidth={false} onClick={() => navigate(QUEUE)}>Back to Laboratory</Button></div>;
  const record = patient.data, enc = ctl.enc, order = enc.data.lab_order, canRecord = context.permissions.includes('encounter:record');
  const results = ctl.rawEntries.filter((entry) => entry.step === 'lab_results');
  const resulted = new Set(results.flatMap((entry) => ENCOUNTER_STEP_VALUES.lab_results.parse(entry.values).results.map((r) => r.orderItemId ?? r.test)));
  const pending = order.tests.filter((_, index) => !resulted.has(orderKey(enc.data, index)));
  const heading = `Laboratory report · ${record.fullName} · ${record.patientId}`;

  const setResult = (key: string, value: string) => first ? ctl.setResult(key, value) : setLater((current) => current && { ...current, lab_results: { ...current.lab_results, [key]: value } });
  const setReport = (key: string, draft: LabItemDraft) => first ? ctl.setLabReport(key, draft) : setLater((current) => current && { ...current, lab_report: { ...current.lab_report, [key]: draft } });
  const previewResults = () => {
    if (!data) return;
    const submission = buildLabSubmission(data, { templates: labSetup.data?.templates ?? [], patient: labSetup.data?.patient }, new Date().toISOString());
    if (submission.problems.length) { setError(submission.problems.join(' · ')); return; }
    setError(''); setPreview(submission);
  };
  const publish = async () => {
    if (!preview || busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try {
      if (first) await ctl.lockStep('lab_results', undefined, preview);
      else await saveStep({ patientId, encounterId, step: 'lab_results', workflowVersion: 1, values: preview.values, labReport: preview.labReport }, context);
      toast('Results published on this device. The requesting clinician is alerted once it syncs');
      navigate(QUEUE);
    } catch (cause) {
      if (!(cause instanceof AuthorizationError)) console.error('Result publish failed', cause);
      setError(cause instanceof Error ? cause.message : 'Could not publish. Your entries are still here.'); setPreview(undefined);
    } finally { busy.current = false; setSaving(false); }
  };

  return <div className="min-h-screen space-y-6 bg-white px-4 pb-8 pt-4 md:px-8">
    <RequestHeader patient={record} back={{ to: QUEUE, label: 'Back to Laboratory' }}>{pending.length ? <Tag tone="amber">{pending.length === order.tests.length ? 'Awaiting results' : `${order.tests.length - pending.length} of ${order.tests.length} resulted`}</Tag> : <Tag tone="green">Resulted</Tag>}</RequestHeader>

    <section aria-labelledby="request-heading" className="space-y-3 rounded-card border border-outline-soft p-4 sm:p-5">
      <h2 id="request-heading" className="text-lg font-extrabold">Request</h2>
      <ul className="flex flex-wrap gap-2">{order.tests.map((test, index) => { const item = order.items?.[index]; return <li key={orderKey(enc.data, index)}><Tag tone={resulted.has(orderKey(enc.data, index)) ? 'green' : 'neutral'}>{test}{item?.priority === 'urgent' ? ' · Urgent' : ''}{resulted.has(orderKey(enc.data, index)) ? ' · Resulted' : ''}</Tag></li>; })}</ul>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {enc.sig.lab_order ? <div><dt className="font-bold text-ink-soft">Requested by</dt><dd>{enc.sig.lab_order.actor} · {enc.sig.lab_order.date} {enc.sig.lab_order.time}</dd></div> : null}
        {enc.data.complaint.text.trim() ? <div><dt className="font-bold text-ink-soft">Complaint</dt><dd className="whitespace-pre-wrap">{enc.data.complaint.text}</dd></div> : null}
        {order.reason?.trim() ? <div className="sm:col-span-2"><dt className="font-bold text-ink-soft">Reason for the tests</dt><dd className="whitespace-pre-wrap">{order.reason}</dd></div> : null}
      </dl>
    </section>

    {pending.length && canRecord && data ? <section aria-labelledby="results-heading" className="space-y-4">
      <h2 id="results-heading" className="text-xl font-extrabold">Enter results</h2>
      <LabResultsForm patientId={patientId} data={data} setResult={setResult} setReport={setReport} />
      {error ? <p role="alert" className="rounded-field border border-danger bg-danger-bg p-4 text-sm text-danger-strong">{error}</p> : null}
      {first ? <p className="rounded-field bg-amber-bg p-3 text-sm text-amber-text">Draft on this device · not published</p> : null}
      <Button disabled={saving} onClick={previewResults}>Preview report</Button>
    </section> : pending.length && !canRecord ? <p className="text-sm text-ink-soft">You have view access. Laboratory staff enter results.</p> : null}

    {results.length ? <section aria-labelledby="published-heading" className="space-y-4">
      <h2 id="published-heading" className="text-xl font-extrabold">Published results</h2>
      {results.map((entry) => <div key={entry.id} className="space-y-2">
        {effectiveLabReport(entry, ctl.rawEntries) ? <PublishedLabReport entry={entry} entries={ctl.rawEntries} heading={heading} />
          : <dl className="space-y-2 rounded-card border border-outline-soft p-4 text-sm">{ENCOUNTER_STEP_VALUES.lab_results.parse(entry.values).results.map((row) => <div key={row.orderItemId ?? row.test}><dt className="font-bold">{row.test}</dt><dd className="whitespace-pre-wrap">{row.result}</dd></div>)}</dl>}
        {canRecord ? <Button variant="outlined" fullWidth={false} className="px-3 text-sm" onClick={() => setCorrecting(entry)}>Correct a result</Button> : null}
      </div>)}
    </section> : null}

    {preview ? <PublishResultsSheet report={preview.labReport} patientName={record.fullName} heading={heading} enteredBy={user.name} saving={saving} onPublish={() => void publish()} onClose={() => setPreview(undefined)} /> : null}
    {correcting ? <EntryEditorSheet patientId={patientId} encounterId={encounterId} entries={ctl.rawEntries} step="lab_results" target={correcting} onClose={() => { setCorrecting(undefined); ctl.reload(); }} /> : null}
  </div>;
};
