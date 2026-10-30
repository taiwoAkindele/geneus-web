import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { currentFacilityRevisions, type AnyDocument, type SyncRejection } from '@shared';
import { useAuthorizationContext } from '@/session';
import { Button, TextAreaField } from '@/ui';
import { clearPrivateWorkforce, readPrivateRejections, readWorkforceEvidence, resolvePrivateRejection } from '@/lib/api/workforce';
import type { WorkforceData } from '@/data/repos/workforce';
import { PrivateAccess } from './PrivateAccess';
import { RecordEditor } from './RecordEditor';
import { RecordList } from './Workspaces';
import { humanize } from './presentation';
import type { EditorKind } from './editorFields';
const PrivateContent = ({ staffId, data, canReview, onClose }: {
  staffId: string;
  data: WorkforceData;
  canReview: boolean;
  onClose: () => void;
}) => {
  const context = useAuthorizationContext();
  const [records, setRecords] = useState<AnyDocument[]>([]), [rejections, setRejections] = useState<SyncRejection[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [resolution, setResolution] = useState('');
  const [editing, setEditing] = useState<{
    kind: EditorKind;
    previous?: AnyDocument;
    preset?: Record<string, unknown>;
  }>();
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); try {
      await action();
    }
      catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Private records could not be read');
      }
      finally {
      setBusy(false);
    }
  };
  const load = async () => {
    const [groups, held] = await Promise.all([Promise.all(['credential', 'capability_decision', 'reviewer_delegation'].map((type) => readWorkforceEvidence(context, type, staffId))), readPrivateRejections(context)]);
    setRecords(groups.flat());
    setRejections(held.records.filter((r) => !r.resolvedOn));
  };
  useEffect(() => { void run(load); return () => { setRecords([]); setRejections([]); }; }, [context.userId, staffId]);
  const correct = (rejection: SyncRejection) => {
    const raw = rejection.refusedRecord as Record<string, unknown> | undefined;
    if (!raw || !['credential', 'capability_decision', 'reviewer_delegation'].includes(String(raw.type)))
      return;
    const key = raw.type === 'credential' ? 'credentialId' : raw.type === 'capability_decision' ? 'capabilityId' : 'delegationId';
    const head = currentFacilityRevisions(records as never).find((r) => r.type === raw.type && (r as unknown as Record<string, unknown>)[key] === raw[key]);
    setEditing({ kind: raw.type as EditorKind, previous: head, preset: raw });
  };
  return <div className="space-y-4">
    {error ? <p role="alert" className="rounded-field bg-danger-bg p-3 text-sm text-danger">{error}</p> : null}
    <div className="flex flex-wrap gap-2"><Button variant="outlined" fullWidth={false} disabled={busy} loading={busy} onClick={() => void run(load)}>Refresh accepted records</Button>{canReview && staffId !== context.userId ? <><Button fullWidth={false} onClick={() => setEditing({ kind: 'capability_decision' })}>Review clinical scope</Button><Button fullWidth={false} variant="outlined" onClick={() => setEditing({ kind: 'reviewer_delegation' })}>Delegate review authority</Button></> : null}<Button variant="ghost" fullWidth={false} onClick={onClose}>Close private access</Button></div>
    <p className="text-xs text-ink-muted">Access closes after 15 minutes or a staff change. New evidence must sync before it appears as accepted.</p>
    <RecordList records={currentFacilityRevisions(records as never)} data={data} onEdit={canReview ? (r) => setEditing({ kind: r.type as EditorKind, previous: r }) : undefined} detail={(r) => r.type === 'credential' ? `${r.issuer} · ${humanize(r.verification)}${r.identifier ? ` · Identifier: ${r.identifier}` : ''}${r.evidenceReference ? ` · Source: ${r.evidenceReference}` : ''}${r.validThrough ? ` · Valid through ${r.validThrough}` : ''}` : r.type === 'capability_decision' ? `${humanize(r.decision)} · ${r.scope.actions.map(humanize).join(', ')} · ${r.reason}` : r.type === 'reviewer_delegation' ? `${humanize(r.decision)} · ${r.reason}` : ''} />
    {rejections.length ? <section className="space-y-4 border-t border-outline-soft pt-4"><h3 className="font-bold">Private proposals needing review</h3><p className="text-sm text-ink-muted">These items are visible only through verified private access. Correcting a proposal creates a new decision under your identity and keeps the original refusal.</p>{rejections.map((r) => <article key={r.id} className="space-y-3 rounded-field border border-outline-soft p-3"><p className="font-bold">{humanize(r.entityType)}</p><p className="break-words text-sm">{r.reason}</p>{r.refusedRecord && r.refusedRecord.staffId !== staffId && typeof r.refusedRecord.staffId === 'string' ? <Link className="inline-flex min-h-11 items-center text-sm font-bold text-brand underline" to={`/admin/staff/${encodeURIComponent(r.refusedRecord.staffId)}`}>Review {data.staff.find((s) => s.staffId === r.refusedRecord?.staffId)?.fullName || 'staff'} profile</Link> : null}{r.refusedRecord && r.refusedRecord.staffId === staffId && ((r.entityType === 'credential' && context.permissions.includes('credential:manage')) || (['capability_decision', 'reviewer_delegation'].includes(r.entityType) && canReview)) ? <Button variant="outlined" fullWidth={false} onClick={() => correct(r)}>Prepare corrected proposal</Button> : null}{context.permissions.includes('sync_rejection:resolve') ? <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-bold">Close this review item</summary><TextAreaField label="Review outcome" value={resolution} onChange={(e) => setResolution(e.target.value)} help={{ purpose: 'Explain an accepted correction or why the proposal is withdrawn. Closing preserves the original body and does not approve clinical scope.' }} /><Button disabled={busy || !resolution.trim()} onClick={() => void run(async () => { await resolvePrivateRejection(context, r.id, resolution.trim()); setResolution(''); await load(); })}>Record outcome</Button></details> : null}</article>)}</section> : null}
    {editing ? <RecordEditor {...editing} data={data} privateRecords={records} preset={{ staffId, ...editing.preset }} onClose={() => setEditing(undefined)} /> : null}
  </div>;
};
export const PrivateEvidence = (props: {
  staffId: string;
  data: WorkforceData;
  canReview: boolean;
}) => {
  const context=useAuthorizationContext(),[epoch, setEpoch] = useState(0),[capturing,setCapturing]=useState(false);
  useEffect(() => () => clearPrivateWorkforce(), []);
  return <section className="space-y-4 rounded-card border border-outline-soft bg-white p-4 md:p-5"><h2 className="text-lg font-bold">Private professional evidence</h2><p className="text-sm text-ink-muted">Evidence and review decisions are separate from the facility directory. Verify your established staff contact to read them online.</p>{context.permissions.includes('credential:manage')?<Button fullWidth={false} variant="outlined" onClick={()=>setCapturing(true)}>Record evidence</Button>:null}<PrivateAccess key={epoch}><PrivateContent {...props} onClose={() => { clearPrivateWorkforce(); setEpoch((value) => value + 1); }} /></PrivateAccess>{capturing?<RecordEditor kind="credential" data={props.data} preset={{staffId:props.staffId}} onClose={()=>setCapturing(false)}/>:null}</section>;
};
