import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthorizationContext } from '@/session';
import { useLiveQuery } from '@/data';
import { listStaff } from '@/data/repos/staff';
import { currentOrganization, organizationRequest } from '@/lib/api/organizations';
import { Button, SelectField } from '@/ui';

/**
 * Staff → Facility assignments: give a staff member access at another facility
 * in the organization. The receiving facility's administrator accepts and sets
 * the local access; each facility keeps its own permissions. Needs a connection.
 */
export const StaffFacilityAssignments = () => {
  const context = useAuthorizationContext(), staff = useLiveQuery(listStaff);
  const [data, setData] = useState<Awaited<ReturnType<typeof currentOrganization>>>();
  const [staffId, setStaffId] = useState(''), [destination, setDestination] = useState('');
  const [role, setRole] = useState('nurse'), [permission, setPermission] = useState('read_only');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const load = useCallback(async () => { try { setData(await currentOrganization(context.userId)); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load organization'); } }, [context.userId]);
  useEffect(() => { void load(); }, [load]);
  const run = async (operation: () => Promise<unknown>, success: string) => { if (busy) return; setBusy(true); setError(''); setMessage(''); try { await operation(); setMessage(success); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'The request failed'); } finally { setBusy(false); } };
  return <div className="space-y-6">
    <p className="text-sm text-ink-muted">Each facility keeps its own staff permissions. Adding someone to another facility sends a request; that facility&rsquo;s administrator accepts it and sets their local access. Organization links grant no patient access. This needs a connection.</p>
    {error ? <div role="alert" className="text-danger-strong">{error}<Button variant="outlined" onClick={() => void load()}>Retry</Button></div> : null}{message ? <p role="status" className="text-brand">{message}</p> : null}
    {!data && !error ? <p role="status">Loading organization…</p> : null}
    {data?.organization ? <>
      <section className="space-y-3 rounded-card border border-outline-soft bg-white p-5"><h2 className="text-lg font-bold">Add staff to another facility</h2><SelectField label="Local staff member" value={staffId} onChange={(e) => setStaffId(e.target.value)} options={[{ value: '', label: 'Choose staff' }, ...(staff.data ?? []).filter((s) => s.active).map((s) => ({ value: s.id, label: s.fullName }))]} /><SelectField label="Receiving facility" value={destination} onChange={(e) => setDestination(e.target.value)} options={[{ value: '', label: 'Choose facility' }, ...data.organization.facilities.filter((f) => f.id !== context.facilityId).map((f) => ({ value: f.id, label: f.name }))]} /><Button disabled={busy || !staffId || !destination} onClick={() => void run(() => organizationRequest('/organization/staff-requests', context.userId, { staffId, toFacilityId: destination }), 'Request sent. The receiving administrator must accept and assign local access.')}>Send provisioning request</Button></section>
      <section className="space-y-3 rounded-card border border-outline-soft bg-white p-5"><h2 className="text-lg font-bold">Incoming staff requests</h2><p className="text-sm">Acceptance creates a separate local membership. Configure its PIN, sign-in access, assignments and clinical authority in the staff directory.</p><SelectField label="Local role for acceptance" value={role} onChange={(e) => setRole(e.target.value)} options={['nurse', 'doctor', 'chew', 'records_officer', 'cashier', 'laboratory_staff', 'pharmacy_staff'].map((value) => ({ value, label: value.replace(/_/g, ' ') }))} /><SelectField label="Local access for acceptance" value={permission} onChange={(e) => setPermission(e.target.value)} options={[{ value: 'read_only', label: 'Read only' }, { value: 'read_write', label: 'Read and write' }]} />{!data.requests.length ? <p>No pending requests.</p> : data.requests.map((request) => <article key={request.id} className="space-y-2 rounded-field border border-outline-soft p-3"><strong>{request.fullName}</strong><p>From {request.fromFacilityId}</p><Button disabled={busy} onClick={() => void run(() => organizationRequest(`/organization/staff-requests/${encodeURIComponent(request.id)}/accept`, context.userId, { role, permission }), 'Local membership created. Complete its access setup in the staff directory.')}>Accept with selected local access</Button><Button variant="outlined" disabled={busy} onClick={() => void run(() => organizationRequest(`/organization/staff-requests/${encodeURIComponent(request.id)}/reject`, context.userId), 'Request declined')}>Decline</Button></article>)}</section>
    </> : data ? <p className="rounded-card border border-dashed border-outline bg-white p-5 text-sm">This facility is not linked to an organization, so there is no other facility to add staff to. An administrator can link facilities in <Link className="font-semibold text-brand underline" to="/settings/organization">Settings → Organization</Link>.</p> : null}
  </div>;
};
