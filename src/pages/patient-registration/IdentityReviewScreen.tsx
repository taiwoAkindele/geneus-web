import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { activeIdentityLinks, canonicalPatientId, type PatientIdentityPreview } from '@shared';
import { useLiveQuery } from '@/data';
import { listPatients } from '@/data/repos/patients';
import { listIdentityEvents, requestIdentityReview } from '@/data/repos/patientIdentity';
import { identityCandidates } from '@/features/patients/identityCandidates';
import { currentAge } from '@/features/search';
import { confirmPatientIdentity, previewPatientIdentity, type IdentityAction } from '@/lib/api/patientIdentity';
import { useAuthorizationContext } from '@/session';
import { Button, SelectField, TextField } from '@/ui';

export const IdentityReviewScreen = () => {
  const navigate = useNavigate();
  const context = useAuthorizationContext();
  const data = useLiveQuery(useCallback(async () => ({ patients: await listPatients(), events: await listIdentityEvents() }), []));
  const [first, setFirst] = useState(''), [second, setSecond] = useState('');
  const [outcome, setOutcome] = useState<IdentityAction['outcome']>('linked');
  const [reason, setReason] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false), [preview, setPreview] = useState<PatientIdentityPreview>();
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [waitingEventId, setWaitingEventId] = useState('');
  const events = data.data?.events ?? [], patients = data.data?.patients ?? [];
  const suggestions = useMemo(() => identityCandidates(patients, events), [data.data]);
  const canResolve = context.permissions.includes('patient_identity:resolve');
  useEffect(() => { if (events.some((event) => event.id === waitingEventId)) setWaitingEventId(''); }, [data.data, waitingEventId]);
  const change = (work: () => void) => { work(); setPreview(undefined); setRequestId(crypto.randomUUID()); setError(''); setMessage(''); };
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await work(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not complete the identity review'); }
    finally { setBusy(false); }
  };
  const action: IdentityAction = { patientId: first, otherPatientId: second, outcome };
  return <div className="mx-auto w-full max-w-5xl space-y-5 px-5 py-5 pb-24 md:px-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-extrabold">Patient identity review</h1><Button variant="ghost" fullWidth={false} onClick={() => navigate('/patients/search')}>Back to patients</Button></div>
    <p className="text-sm text-ink-muted">Review possible duplicates after registration and synchronisation. Similar details are suggestions; confirm with the patient and supporting evidence.</p>
    {data.loading ? <p role="status">Reading patient records…</p> : data.error ? <div role="alert">Identity reviews could not be read.<Button onClick={data.reload}>Try again</Button></div> : <>
      <section className="space-y-3 rounded-card border border-outline-soft bg-white p-4"><h2 className="font-bold">Records needing comparison</h2>
        {suggestions.length === 0 ? <p className="text-sm text-ink-muted">No possible duplicates found in the records currently on this device. You can select two records below.</p> : suggestions.map(({ patient, other, reason: why }) => <button key={[patient.id, other.id].sort().join('|')} type="button" className="block w-full rounded-field border border-outline p-3 text-left" onClick={() => change(() => { setFirst(canonicalPatientId(patient.id, events)); setSecond(canonicalPatientId(other.id, events)); setOutcome('linked'); setReason(''); })}><strong>{patient.fullName} / {other.fullName}</strong><p className="text-xs">{patient.id} / {other.id}</p><p className="text-sm text-ink-muted">{why}</p></button>)}
        {suggestions.length >= 100 ? <p className="text-xs text-ink-muted">Showing up to 100 comparisons. Review these or select specific records below.</p> : null}
      </section>
      <fieldset disabled={busy || Boolean(waitingEventId)} className="space-y-4 rounded-card border border-outline-soft bg-white p-4">
        <h2 className="font-bold">Compare patient records</h2>
        <SelectField label="Primary patient record" value={first} options={[{ value: '', label: 'Choose a record' }, ...patients.map((p) => ({ value: p.id, label: `${p.fullName} — ${p.id}` }))]} onChange={(event) => change(() => setFirst(event.target.value))} />
        <SelectField label="Other patient record / linked ID" value={second} options={[{ value: '', label: 'Choose another record' }, ...patients.filter((p) => p.id !== first).map((p) => ({ value: p.id, label: `${p.fullName} — ${p.id}` }))]} onChange={(event) => change(() => setSecond(event.target.value))} />
        <div className="grid gap-3 md:grid-cols-2">{[first, second].map((id, i) => { const p = patients.find((row) => row.id === id); return p ? <article className="rounded-field bg-surface-muted p-3 text-sm" key={i}><strong>{p.fullName}</strong><p className="break-all font-mono text-xs">{p.id}</p><p>{p.sex} · {currentAge(p)} years {p.dobEstimated || !p.dateOfBirth ? '(estimated)' : ''}</p><p>{p.phone ?? 'No phone recorded'}</p><p>{p.address}</p><p>Birth date: {p.dateOfBirth ?? 'Not recorded'}</p><p>Old folder: {p.legacyPaperRef ?? 'Not recorded'}</p><p>NIN: {p.nin ? `•••••••${p.nin.slice(-4)}` : 'Not recorded'}</p><p>Identity: {p.identityEvidence === 'document_seen' ? 'Document checked by staff' : 'Reported'}</p></article> : null; })}</div>
        <TextField label="Evidence and reason for this decision" value={reason} maxLength={1000} onChange={(event) => change(() => setReason(event.target.value))} />
        {canResolve ? <><SelectField label="Decision" value={outcome} options={[{ value: 'linked', label: 'Same person: link records' }, { value: 'distinct', label: 'Different people: keep separate' }, { value: 'unlinked', label: 'Correct a mistaken link: remove linked ID' }]} onChange={(event) => change(() => setOutcome(event.target.value as IdentityAction['outcome']))} /><p className="text-xs text-ink-muted">Final decisions require a connection and synchronised records. The primary record supplies the default demographics; original records remain available.</p><Button variant="outlined" disabled={!first || !second} onClick={() => void run(async () => setPreview(await previewPatientIdentity(action, context.userId)))}>Preview decision online</Button></> : <Button disabled={!first || !second || reason.trim().length < 3} onClick={() => void run(async () => { await requestIdentityReview(first, second, reason, context); setMessage('Review request saved on this device. It will synchronise when connected.'); data.reload(); })}>Flag for records-officer review</Button>}
        {preview ? <section className="space-y-3 rounded-field border border-outline p-3"><h3 className="font-bold">Decision preview</h3><p className="text-sm">{preview.warning}</p><p className="text-xs">Primary ID: {preview.canonicalPatientId}</p>{preview.records.map(({ patient, counts }) => <p className="text-sm" key={patient.id}>{patient.fullName} ({patient.id}): {counts.encounters} encounters, {counts.appointments} appointments, {counts.charges} charges, {counts.payments} payments</p>)}<Button disabled={reason.trim().length < 3} onClick={() => void run(async () => { const event = await confirmPatientIdentity(action, context.userId, reason.trim(), preview.revision, requestId); setWaitingEventId(event.id); setPreview(undefined); setMessage('Decision confirmed by the server. Waiting for this device to synchronise the updated identity history.'); data.reload(); })}>Confirm reviewed decision</Button></section> : null}
      </fieldset>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}{message ? <p role="status" className="text-sm text-brand">{message}</p> : null}
      <section className="space-y-2"><h2 className="font-bold">Linked patient IDs</h2>{[...activeIdentityLinks(events).values()].map((event) => <button key={event.id} type="button" className="block w-full rounded-field border border-outline bg-white p-3 text-left text-sm" onClick={() => change(() => { setFirst(canonicalPatientId(event.patientId, events)); setSecond(event.otherPatientId!); setOutcome('unlinked'); })}>{event.otherPatientId} → {event.patientId}<span className="ml-3 text-xs text-ink-muted">Review / correct</span></button>)}{activeIdentityLinks(events).size === 0 ? <p className="text-sm text-ink-muted">No confirmed links on this device.</p> : null}</section>
      <section><h2 className="font-bold">Recent identity decisions</h2>{[...events].sort((a, b) => b.createdOn.localeCompare(a.createdOn)).slice(0, 30).map((event) => <article key={event.id} className="mt-2 rounded-field border border-outline-soft bg-white p-3 text-sm"><strong>{event.outcome.replace(/_/g, ' ')}</strong><p className="break-all text-xs">{event.patientId}{event.otherPatientId ? ` / ${event.otherPatientId}` : ''}</p><p>{event.reason}</p><p className="text-xs text-ink-muted">{event.createdBy} · {new Date(event.createdOn).toLocaleString('en-GB')}{event.revision ? '' : ' · Saved locally; awaiting server acknowledgement'}</p></article>)}</section>
    </>}
  </div>;
};
