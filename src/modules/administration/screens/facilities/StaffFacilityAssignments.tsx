import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthorizationContext } from '@/session';
import { currentOrganization, organizationRequest } from '@/lib/api/organizations';
import { Button, SelectField } from '@/ui';

/**
 * Access at other facilities in the organization. Each facility keeps its own
 * staff records and permissions: a request is sent, and the receiving
 * facility's administrator accepts it and sets the local access. Organization
 * links grant no patient access. Needs a connection.
 */
const useOrganization = () => {
  const context = useAuthorizationContext();
  const [data, setData] = useState<Awaited<ReturnType<typeof currentOrganization>>>();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const load = useCallback(async () => { try { setData(await currentOrganization(context.userId)); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load organization'); } }, [context.userId]);
  useEffect(() => { void load(); }, [load]);
  const run = async (operation: () => Promise<unknown>, success: string) => { if (busy) return; setBusy(true); setError(''); setMessage(''); try { await operation(); setMessage(success); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'The request failed'); } finally { setBusy(false); } };
  return { context, data, busy, error, message, load, run };
};

const Feedback = ({ error, message, retry }: { error: string; message: string; retry: () => void }) => <>
  {error ? <div role="alert" className="text-sm text-danger-strong">{error} <Button variant="outlined" fullWidth={false} onClick={retry}>Retry</Button></div> : null}
  {message ? <p role="status" className="text-sm text-brand">{message}</p> : null}
</>;

/** On a staff profile: ask another facility in the organization to give this person access there. */
export const OutgoingStaffRequest = ({ staffId, staffName }: { staffId: string; staffName: string }) => {
  const { context, data, busy, error, message, load, run } = useOrganization();
  const [destination, setDestination] = useState('');
  const others = data?.organization?.facilities.filter((f) => f.id !== context.facilityId) ?? [];
  return <section className="space-y-3 rounded-card border border-outline-soft bg-white p-5">
    <h2 className="font-bold">Other facilities</h2>
    <p className="text-sm text-ink-muted">Access at each facility is separate and managed there. To let {staffName} work at another facility in your organization, send a request; that facility&rsquo;s administrator accepts it and sets their access. Needs a connection.</p>
    <Feedback error={error} message={message} retry={() => void load()} />
    {!data && !error ? <p role="status" className="text-sm">Loading organization…</p>
      : data && !data.organization ? <p className="text-sm">This facility is not linked to an organization. An administrator can link facilities in <Link className="font-semibold text-brand underline" to="/settings/organization">Settings → Organization</Link>.</p>
      : data && !others.length ? <p className="text-sm">Your organization has no other facility yet.</p>
      : data ? <div className="flex flex-wrap items-end gap-3"><div className="min-w-56 flex-1"><SelectField label="Receiving facility" value={destination} onChange={(e) => setDestination(e.target.value)} options={[{ value: '', label: 'Choose facility' }, ...others.map((f) => ({ value: f.id, label: f.name }))]} /></div>
        <Button fullWidth={false} disabled={busy || !destination} onClick={() => void run(() => organizationRequest('/organization/staff-requests', context.userId, { staffId, toFacilityId: destination }), 'Request sent. The receiving administrator must accept and assign local access.')}>Send access request</Button></div> : null}
  </section>;
};

/** Settings → Organization: staff another facility asked this facility to give access to. */
export const IncomingStaffRequests = () => {
  const { context, data, busy, error, message, load, run } = useOrganization();
  const [role, setRole] = useState('nurse'), [permission, setPermission] = useState('read_only');
  if (data && !data.organization) return null;
  return <section className="space-y-3 border-t border-outline-soft pt-4">
    <h2 className="text-lg font-bold">Incoming staff access requests</h2>
    <p className="text-sm">Acceptance creates a separate staff record at this facility. Then open them in Staff to set their PIN, sign-in access, assignments and clinical authority here.</p>
    <Feedback error={error} message={message} retry={() => void load()} />
    {!data && !error ? <p role="status">Loading requests…</p> : data ? <>
      <SelectField label="Local role for acceptance" value={role} onChange={(e) => setRole(e.target.value)} options={['nurse', 'doctor', 'chew', 'records_officer', 'cashier', 'laboratory_staff', 'pharmacy_staff'].map((value) => ({ value, label: value.replace(/_/g, ' ') }))} />
      <SelectField label="Local access for acceptance" value={permission} onChange={(e) => setPermission(e.target.value)} options={[{ value: 'read_only', label: 'Read only' }, { value: 'read_write', label: 'Read and write' }]} />
      {!data.requests.length ? <p>No pending requests.</p> : data.requests.map((request) => <article key={request.id} className="space-y-2 rounded-field border border-outline-soft p-3"><strong>{request.fullName}</strong><p>From {request.fromFacilityId}</p>
        <Button disabled={busy} onClick={() => void run(() => organizationRequest(`/organization/staff-requests/${encodeURIComponent(request.id)}/accept`, context.userId, { role, permission }), 'Staff record created here. Complete their access setup in Staff.')}>Accept with selected local access</Button>
        <Button variant="outlined" disabled={busy} onClick={() => void run(() => organizationRequest(`/organization/staff-requests/${encodeURIComponent(request.id)}/reject`, context.userId), 'Request declined')}>Decline</Button></article>)}
    </> : null}
  </section>;
};
