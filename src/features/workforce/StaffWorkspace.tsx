import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { currentFacilityRevisions, withReviewerAuthority, type AnyDocument } from '@shared';
import { Button, SectionTabs, Tag } from '@/ui';
import { useAuthorizationContext } from '@/session';
import { ownProof } from '@/data/repos/workforce';
import { showInterval } from '@/lib/workforceTime';
import { roleLabel } from '@/features/staff/staffAccess';
import { RecordEditor } from './RecordEditor';
import type { EditorKind } from './editorFields';
import { RecordList, WorkspaceLoading } from './Workspaces';
import { useWorkforce } from './useWorkforce';
import { humanize } from './presentation';
import { PrivateEvidence } from './PrivateEvidence';
export const StaffWorkspace = () => {
  const { staffId } = useParams(), query = useWorkforce(), context = useAuthorizationContext(), [params, setParams] = useSearchParams(), [editing, setEditing] = useState<{
    kind: EditorKind;
    previous?: AnyDocument;
  }>(), [canReview, setCanReview] = useState(false),[verifiedSnapshotId,setVerifiedSnapshotId]=useState('');
  useEffect(() => { document.title = 'Staff profile · Geneus Health'; }, []);
  useEffect(() => {
    let alive = true; if (query.data) {
      const worker = query.data.staff.find((s) => s.staffId === context.userId);
      if (worker)
        void ownProof(context, query.data).then((proof) => {
          if (alive)
            setCanReview(withReviewerAuthority(context, worker, proof, Date.now()).permissions.includes('clinical_capability:review'));
        });
    } return () => { alive = false; };
  }, [query.data, context]);
  useEffect(()=>{let alive=true;setVerifiedSnapshotId('');if(query.data&&staffId)void ownProof({...context,userId:staffId},query.data).then((proof)=>{if(alive)setVerifiedSnapshotId(proof?.snapshot.id||'');});return()=>{alive=false;};},[query.data,staffId,context.lastServerContactOn]);
  if (query.loading || !query.data || query.error)
    return <WorkspaceLoading error={query.error} reload={query.reload} />;
  const data = query.data, staff = data.staff.find((s) => s.staffId === staffId), view = params.get('view') || 'profile';
  if (!staff)
    return <div className="p-5"><p>This staff identity is not available on this device.</p><Link to="/admin/staff" className="text-brand underline">Return to Staff</Link></div>;
  const profile = data.profiles.find((p) => p.staffId === staff.staffId), proof = data.snapshots.find((p) => p.staffId === staff.staffId), assignments = currentFacilityRevisions(data.assignments).filter((a) => a.staffId === staff.staffId), zone = data.facility?.timeZone || 'Africa/Lagos';
  return <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 md:px-8"><Link to="/admin/staff" className="inline-flex min-h-11 items-center text-sm font-bold text-brand">← Staff & roster</Link><header><h1 className="text-2xl font-extrabold">{staff.fullName}</h1><p className="mt-1 text-sm text-ink-muted">{profile?.profession.label || 'Professional profile not yet recorded'} · {roleLabel(staff)}</p><div className="mt-3 flex flex-wrap gap-2"><Tag>{staff.active ? 'Active account' : 'Access removed'}</Tag><Tag>{staff.permission === 'read_only' ? 'Read only' : 'Writable account'}</Tag><Tag tone={proof?.id===verifiedSnapshotId&&proof?.grants.length && Date.parse(proof.expiresOn) > Date.now() ? 'green' : 'amber'}>{proof?.id===verifiedSnapshotId&&proof?.grants.length && Date.parse(proof.expiresOn) > Date.now() ? 'Accepted clinical scope available' : 'Clinical approval needed'}</Tag></div></header>
    <SectionTabs label="Staff profile sections" value={view} onChange={(next) => setParams({ view: next })} options={[{ value: 'profile', label: 'Profile' }, { value: 'work', label: 'Work & access' }, { value: 'schedule', label: 'Schedule' }, { value: 'history', label: 'History' }]} />
    {view === 'profile' ? <><section className="rounded-card border border-outline-soft bg-white p-5"><h2 className="font-bold">Professional profile</h2><p className="mt-2 text-sm">{profile ? `${profile.profession.label}${profile.specialties.length ? ` · ${profile.specialties.map((s) => s.label).join(', ')}` : ''}` : 'No profession or specialty has been recorded. Non-clinical staff do not need invented qualifications.'}</p><p className="my-3 text-sm text-ink-muted">A profession label describes training. Only independently accepted clinical scope permits protected activities.</p>{context.permissions.includes('practitioner:manage') ? <Button fullWidth={false} variant="outlined" onClick={() => setEditing({ kind: 'practitioner_profile', previous: profile })}>{profile ? 'Update profile' : 'Add professional profile'}</Button> : null}</section>{(staff.staffId === context.userId || context.permissions.includes('credential:read') || canReview) ? <PrivateEvidence key={`${staff.staffId}:${context.userId}`} staffId={staff.staffId} data={data} canReview={canReview} /> : null}</> : view === 'work' ? <><section className="rounded-card border border-outline-soft bg-white p-5"><h2 className="font-bold">Software access</h2><p className="my-2 text-sm">{roleLabel(staff)} · {staff.permission === 'read_only' ? 'Read only' : 'Read and write'}. These account duties do not verify clinical qualification.</p>{context.permissions.includes('staff:permission') ? <Link className="inline-flex min-h-11 items-center font-bold text-brand underline" to={`/admin/staff/access?staff=${encodeURIComponent(staff.staffId)}`}>Manage account access</Link> : null}</section><div className="flex flex-wrap justify-between gap-3"><h2 className="text-lg font-bold">Service assignments</h2>{context.permissions.includes('staff_assignment:manage') ? <Button fullWidth={false} onClick={() => setEditing({ kind: 'staff_assignment' })}>Add assignment</Button> : null}</div><RecordList records={assignments} data={data} onEdit={context.permissions.includes('staff_assignment:manage') ? (previous) => setEditing({ kind: 'staff_assignment', previous }) : undefined} detail={(r) => r.type === 'staff_assignment' ? `${data.offerings.find((o) => o.id === r.offeringId)?.name} · ${humanize(r.duty)} · ${showInterval(r.startsAt, r.endsAt, zone)}${r.temporaryCover ? ' · Temporary cover' : ''}` : ''} /><section className="rounded-card border border-outline-soft bg-white p-5"><h2 className="font-bold">Accepted clinical activities</h2>{proof?.id===verifiedSnapshotId&&proof?.grants.length ? <ul className="mt-3 space-y-3">{proof.grants.map((g) => <li key={g.decisionId} className="text-sm"><strong>{g.scope.actions.map(humanize).join(', ')}</strong><p className="text-ink-muted">{g.scope.kind === 'facility' ? 'Across approved facility services' : g.scope.offeringIds.map((id) => data.offerings.find((o) => o.id === id)?.name || 'Unavailable service').join(', ')}{g.supervisorId ? ` · Supervisor: ${data.staff.find((s) => s.staffId === g.supervisorId)?.fullName || 'Unavailable'}` : ''}{g.independentCheck ? ' · Independent check required' : ''}</p></li>)}</ul> : <p className="mt-2 text-sm text-ink-muted">No accepted activity grant is available. A software duty or assignment does not substitute for clinical review.</p>}</section></> : view === 'schedule' ? <RecordList records={currentFacilityRevisions(data.sessions).filter((s) => s.participants.some((p) => p.staffId === staff.staffId))} data={data} detail={(r) => r.type === 'service_session' ? `${data.offerings.find((o) => o.id === r.offeringId)?.name} · ${showInterval(r.startsAt, r.endsAt, r.timeZone)}` : ''} /> : <RecordList records={data.assignments.filter((a) => a.staffId === staff.staffId).sort((a, b) => b.createdOn.localeCompare(a.createdOn))} data={data} detail={(r) => r.type === 'staff_assignment' ? `Version ${r.version} · ${humanize(r.status)} · ${showInterval(r.startsAt, r.endsAt, zone)} · ${data.staff.find((s) => s.staffId === r.createdBy)?.fullName || 'Recorded staff'}` : ''} />}
    {editing ? <RecordEditor {...editing} data={data} preset={{ staffId: staff.staffId }} onClose={() => setEditing(undefined)} onSaved={query.reload} /> : null}
  </div>;
};
