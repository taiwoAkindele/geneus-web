import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthorizationContext } from '@/session';
import { currentOrganization, organizationRequest } from '@/lib/api/organizations';
import { Button, TextField } from '@/ui';
import { IncomingStaffRequests } from './StaffFacilityAssignments';

/** Linked facilities, and staff access requests from them. Requests to other facilities start from a staff profile. */
export const OrganizationScreen = () => {
  const context = useAuthorizationContext();
  const [data, setData] = useState<Awaited<ReturnType<typeof currentOrganization>>>();
  const [name, setName] = useState(''), [code, setCode] = useState(''), [invitation, setInvitation] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const load = useCallback(async () => { try { setData(await currentOrganization(context.userId)); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load organization'); } }, [context.userId]);
  useEffect(() => { void load(); }, [load]);
  const run = async (operation: () => Promise<unknown>, success: string) => { if (busy) return; setBusy(true); setError(''); setMessage(''); try { await operation(); setMessage(success); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'The request failed'); } finally { setBusy(false); } };
  return <main className="mx-auto max-w-3xl space-y-6 px-4 py-6"><Link to="/settings/facility" className="font-bold text-brand">Back to facility</Link><h1 className="text-2xl font-extrabold">Organization</h1><Link to="/facilities/new" className="inline-flex min-h-11 items-center font-bold text-brand">Create another facility</Link><p>Facilities remain independent. Organization links grant no patient access. Each facility keeps its own staff permissions, stock and finances. Organization administration requires a connection.</p>
    {error ? <div role="alert" className="text-danger-strong">{error}<Button variant="outlined" onClick={() => void load()}>Retry</Button></div> : null}{message ? <p role="status" className="text-brand">{message}</p> : null}
    {!data && !error ? <p role="status">Loading organization…</p> : null}
    {data?.organization ? <><section className="space-y-3"><h2 className="text-lg font-bold">{data.organization.name}</h2><ul>{data.organization.facilities.map((f) => <li key={f.id}>{f.name} · {f.id}</li>)}</ul><Button disabled={busy} onClick={() => void run(async () => { const issued = await organizationRequest<{ code: string; expiresOn: string }>('/organization/invitations', context.userId); setInvitation(`${issued.code} · expires ${new Date(issued.expiresOn).toLocaleString()}`); }, 'Invitation issued')}>Invite another facility</Button>{invitation ? <p className="break-all rounded-field bg-surface-muted p-3">{invitation}</p> : null}</section>
      <IncomingStaffRequests />
      <p className="text-sm text-ink-muted">To ask another facility to give one of your staff access, open that person in <Link className="font-semibold text-brand underline" to="/admin/staff">Staff</Link>.</p></> : data ? <div className="space-y-6"><section className="space-y-3"><TextField label="New organization name" value={name} onChange={(e) => setName(e.target.value)} /><Button disabled={busy || !name.trim()} onClick={() => void run(() => organizationRequest('/organizations', context.userId, { name }), 'Organization created')}>Create organization</Button></section><section className="space-y-3"><TextField label="Organization invitation code" value={code} onChange={(e) => setCode(e.target.value)} /><Button disabled={busy || !code.trim()} onClick={() => void run(() => organizationRequest('/organization/join', context.userId, { code }), 'Facility linked without sharing operational records')}>Join organization</Button></section></div> : null}
  </main>;
};
