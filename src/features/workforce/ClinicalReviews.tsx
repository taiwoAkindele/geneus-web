import { useCallback, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from '@/data';
import { useAuthorizationContext } from '@/session';
import { acknowledgeClinicalReview, clearClinicalReview, listClinicalReviews, resubmitHistoricalReview, submitReviewedClinicalDraft, type ClinicalReviewBundle } from '@/data/repos/clinicalReviews';
import { listPatients } from '@/data/repos/patients';
import { Button, Sheet, Tag, TextAreaField } from '@/ui';
import type { SyncRejection } from '@shared';
import { PrivateAccess } from './PrivateAccess';
import { useWorkforce } from './useWorkforce';
import { humanize } from './presentation';
import { WorkspaceLoading } from './Workspaces';
const valuesView = (value: unknown): ReactNode => Array.isArray(value) ? <ul className="list-disc space-y-2 pl-5">{value.map((item, i) => <li key={i}>{valuesView(item)}</li>)}</ul> : value && typeof value === 'object' ? <dl className="space-y-2">{Object.entries(value).map(([key, item]) => <div key={key}><dt className="text-xs font-bold text-ink-muted">{humanize(key.replace(/([a-z])([A-Z])/g, '$1 $2'))}</dt><dd className="whitespace-pre-wrap break-words text-sm">{valuesView(item)}</dd></div>)}</dl> : String(value ?? 'Not recorded');
export const ClinicalReviews = () => {
  const context = useAuthorizationContext(), workforce = useWorkforce(), load = useCallback(async () => ({ bundles: await listClinicalReviews(context), patients: await listPatients() }), [context.userId]), query = useLiveQuery(load);
  const [reviewing, setReviewing] = useState<ClinicalReviewBundle>(), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [held, setHeld] = useState<SyncRejection>(), [reason, setReason] = useState('');
  if (query.loading || !query.data || query.error || !workforce.data)
    return <WorkspaceLoading error={query.error || workforce.error} reload={() => { query.reload(); workforce.reload(); }} />;
  const data = workforce.data;
  const act = async (kind: 'supervisor' | 'checker' | 'withdraw') => {
    if (!reviewing || busy)
      return; setBusy(true); setError(''); try {
        if (kind === 'withdraw') {
          if (reviewing.staffId !== context.userId)
            throw new Error('Only the original author can withdraw an unsigned draft');
          await clearClinicalReview(reviewing.id);
        }
        else
          await acknowledgeClinicalReview(reviewing, context, kind);
        setReviewing(undefined);
        query.reload();
      }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not complete this review');
    }
    finally {
      setBusy(false);
    }
  };
  return <div className="mx-auto max-w-5xl space-y-5 px-4 py-5 md:px-8"><h1 className="text-2xl font-extrabold">Clinical reviews & co-signatures</h1><p className="text-sm text-ink-muted">Unsigned requests on this shared device. Acknowledgement binds the exact clinical content and service. The original author returns to their form and signs it; this does not impersonate them or publish care automatically.</p>
    {query.data.bundles.length ? <div className="space-y-3">{query.data.bundles.map((bundle) => { const record = bundle.records.map((r) => r.record as import('@shared').AnyDocument).find((r) => r.id === bundle.sourceId); return <article key={bundle.id} className="rounded-card border border-outline-soft bg-white p-4"><Tag tone="amber">Unsigned · acknowledgement needed</Tag><h2 className="mt-2 font-bold">{record && 'patientId' in record ? query.data?.patients.find((p) => p.patientId === record.patientId)?.fullName || 'Patient record' : 'Clinical record'}</h2><p className="mt-1 text-sm text-ink-muted">{data.staff.find((s) => s.staffId === bundle.staffId)?.fullName || 'Original author'} · {record && 'step' in record ? humanize(String(record.step)) : record && 'kind' in record ? humanize(String(record.kind)) : 'Clinical contribution'}</p><Button fullWidth={false} variant="outlined" className="mt-3" onClick={() => { setError(''); setReviewing(bundle); }}>Review exact draft</Button></article>; })}</div> : <div className="rounded-card border border-dashed border-outline p-5 text-sm text-ink-muted">No unsigned co-signature requests on this device. Accepted care remains in the patient's chart.</div>}
    <Link className="inline-flex min-h-11 items-center font-bold text-brand underline" to="/sync">Review server-held entries in Sync & review</Link>
    <section className="space-y-3 border-t border-outline-soft pt-5"><h2 className="text-lg font-bold">Reported care held by the server</h2><p className="text-sm text-ink-muted">Independent historical review preserves the original author, performance time and exact content. It cannot invent an absent clinical grant.</p>{data.rejections.filter((r): r is SyncRejection => r.type === 'sync_rejection' && !r.resolvedOn && ['encounter_entry', 'clinical_event'].includes(r.entityType) && Boolean(r.refusedRecord?.actorContext)).map((r) => <article key={r.id} className="rounded-card border border-outline-soft bg-white p-4"><p className="font-bold">{humanize(r.entityType)} · {data.staff.find((s) => s.staffId === r.attributedTo)?.fullName || 'Original author'}</p><p className="my-2 text-sm text-ink-muted">{r.reason}</p><Button variant="outlined" fullWidth={false} onClick={() => { setHeld(r); setError(''); setReason(''); }}>Independent clinical review</Button></article>)}</section>
    {held ? <Sheet title="Review reported historical care" placement="side" onClose={() => setHeld(undefined)} closeDisabled={busy}><p className="mb-4 text-sm">Original author: {data.staff.find((s) => s.staffId === held.attributedTo)?.fullName || held.attributedTo}. Original performance: {held.occurredOn || String(held.refusedRecord?.createdOn || 'Not available')}.</p>{valuesView(held.refusedRecord?.values)}<div className="my-4"><PrivateAccess><TextAreaField label="Independent review reason" value={reason} onChange={(e) => setReason(e.target.value)} help={{ purpose: 'Explain the original authority, performance timing and why this exact reported source is suitable for resubmission.' }} />{error ? <p role="alert" className="my-3 text-sm text-danger">{error}</p> : null}<Button className="mt-4" loading={busy} disabled={busy || !reason.trim()} onClick={async () => {
      setBusy(true); try {
        await resubmitHistoricalReview(held, reason, context);
        setHeld(undefined);
        query.reload();
      }
        catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Historical review was not approved');
        }
        finally {
        setBusy(false);
      }
    }}>Authorize and resubmit exact original</Button><p className="mt-3 text-xs text-ink-muted">This first requests authorized online review, then queues the unchanged original through normal sync. The server makes the final decision.</p></PrivateAccess></div></Sheet> : null}
    {reviewing ? <Sheet title="Review unsigned clinical content" placement="side" onClose={() => setReviewing(undefined)} closeDisabled={busy}><p className="mb-3 text-sm">Original author: {data.staff.find((s) => s.staffId === reviewing.staffId)?.fullName}. A different qualified person signs the acknowledgement.</p>{reviewing.records.filter((r) => (r.record as {
      id: string;
    }).id === reviewing.sourceId).map((r) => { const record = r.record as import('@shared').EncounterEntry; return <div key={record.id}><p className="mb-3 text-sm font-bold">{data.offerings.find((o) => o.id === record.actorContext?.offeringId)?.name} · {new Date(record.createdOn).toLocaleString('en-GB')}</p>{valuesView(record.values)}</div>; })}{error ? <p role="alert" className="my-3 rounded-field bg-danger-bg p-3 text-sm text-danger">{error}</p> : null}<div className="mt-5 space-y-2">{Date.parse(reviewing.proof.expiresOn) <= Date.now() ? <p className="my-3 rounded-field bg-amber-bg p-3 text-sm">The original authority proof expired while this draft awaited review. Keep its original time and use independent historical review below.</p> : null}{reviewing.staffId === context.userId ? <><p className="text-sm text-ink-muted">Ask your qualified supervisor/checker to sign in on this device. After acknowledgement, return to the original form and save the unchanged entry.</p><Button variant="outlined" disabled={busy} onClick={() => void act('withdraw')}>Withdraw this unsigned request</Button></> : <><Button loading={busy} disabled={busy} onClick={() => void act('supervisor')}>Sign as qualified supervisor</Button><Button variant="outlined" disabled={busy} onClick={() => void act('checker')}>Sign as independent checker</Button></>}</div>{reviewing.staffId !== context.userId ? <details className="mt-5 border-t border-outline-soft pt-4"><summary className="min-h-11 cursor-pointer py-2 font-bold">Independent review of retained reported care</summary><p className="my-3 text-sm text-ink-muted">Use when original timing or authorization needs historical review. This records a separate review; it does not invent a missing original clinical grant.</p><PrivateAccess><TextAreaField label="Independent review reason" value={reason} onChange={(e) => setReason(e.target.value)} /><Button className="mt-3" disabled={busy || !reason.trim()} loading={busy} onClick={async () => {
      setBusy(true); setError(''); try {
        await submitReviewedClinicalDraft(reviewing, reason, context);
        setReviewing(undefined);
        setReason('');
        query.reload();
      }
        catch (cause) {
          setError(cause instanceof Error ? cause.message : 'The retained source could not be approved');
        }
        finally {
        setBusy(false);
      }
    }}>Approve and queue the preserved report</Button></PrivateAccess></details> : null}</Sheet> : null}
  </div>;
};
