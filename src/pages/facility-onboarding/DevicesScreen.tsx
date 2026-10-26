import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { decide, type Device } from '@shared';
import { useDeviceContext, useLiveQuery, useSyncStatus } from '@/data';
import { listDevices } from '@/data/repos/devices';
import { useAuthorizationContext } from '@/session';
import { revokeFacilityDevice } from '@/lib/api/devices';
import { Button, DataTable, Sheet, Tag } from '@/ui';

export const DevicesScreen = () => {
  const context = useAuthorizationContext();
  const { deviceId } = useDeviceContext();
  const query = useLiveQuery(listDevices);
  const sync = useSyncStatus();
  const [selected, setSelected] = useState<Device>(), [wipe, setWipe] = useState(false), [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const working = useRef(false);
  useEffect(() => { document.title = 'Facility devices · Geneus Health'; }, []);
  const denial = decide(context, 'device:revoke');
  const allowed = context.permissions.includes('device:enroll') || context.permissions.includes('device:revoke') || context.roles?.includes('facility_admin') || context.role === 'facility_admin';
  const revoke = async () => {
    if (!selected || working.current || !acknowledged || denial || !sync.connected) return;
    if (selected.id === deviceId && (sync.pending > 0 || sync.pendingKnown === false)) { setError('Upload and review this device’s pending work before revoking it.'); return; }
    working.current = true; setBusy(true); setError('');
    try { await revokeFacilityDevice(selected.id, context.userId, wipe); setNotice('The server revoked access. Device status updates here after sync.'); setSelected(undefined); query.reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Device access could not be changed.'); }
    finally { working.current = false; setBusy(false); }
  };
  return <div className="mx-auto max-w-5xl space-y-5 px-4 py-5 md:px-7"><header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-[28px] font-extrabold">Facility devices</h1><p className="mt-1 text-sm text-ink-muted">Enrolled devices, recent server contact and access status.</p></div>{context.permissions.includes('device:enroll') ? <Link to="/admin/devices/add" className="inline-flex min-h-[52px] items-center rounded-field bg-brand px-4 py-3 font-bold text-white">Add device</Link> : null}</header>
    {!allowed ? <p>Your account has not been assigned device administration.</p> : query.loading ? <p role="status">Reading device records…</p> : query.error ? <div role="alert"><p>Devices could not be read from this replica.</p><Button variant="ghost" onClick={query.reload}>Try again</Button></div> : !query.data?.length ? <p className="rounded-card border border-dashed border-outline bg-white p-5 text-sm text-ink-muted">No device records are available here yet. Check sync before drawing conclusions about enrollment.</p> : <DataTable caption="Enrolled facility devices" rows={query.data} rowKey={(row) => row.id} columns={[
      { key: 'device', label: 'Device', render: (row) => <><p className="font-bold">{row.label ?? 'Unnamed device'}{row.id === deviceId ? ' · this device' : ''}</p><p className="mt-1 break-all font-mono text-xs text-ink-muted">{row.id}</p></> },
      { key: 'status', label: 'Access', render: (row) => <Tag tone={row.status === 'active' ? 'green' : 'slate'}>{row.status === 'active' ? 'Active' : 'Revoked'}</Tag> },
      { key: 'seen', label: 'Last server contact', render: (row) => row.lastSeenOn ? new Date(row.lastSeenOn).toLocaleString('en-GB') : 'Not yet recorded' },
      { key: 'action', label: 'Action', render: (row) => row.status === 'active' && context.permissions.includes('device:revoke') ? <Button fullWidth={false} variant="danger" onClick={() => { setSelected(row); setWipe(false); setAcknowledged(false); setError(''); }}>Revoke access</Button> : row.wipeRequested ? 'Local wipe requested' : '—' },
    ]} />}
    {notice ? <p role="status" className="rounded-field bg-brand-wash p-4 text-sm">{notice}</p> : null}
    <p className="text-xs leading-relaxed text-ink-muted">Status is based on the records synced to this device. Adding or revoking access requires a connection and recent authorization.</p>
    {selected ? <Sheet title={`Revoke ${selected.label ?? 'this device'}?`} onClose={() => setSelected(undefined)} closeDisabled={busy}><p className="text-sm leading-relaxed">The server will stop accepting this device's sync requests. It may contain changes that have not uploaded; arrange a review before revoking access.</p>{selected.id === deviceId ? <p className="mt-3 font-bold text-danger">You are using this device. Revoking it will block its future access.</p> : null}<label className="mt-4 flex min-h-[52px] items-center gap-3 text-sm"><input type="checkbox" checked={wipe} onChange={(event) => setWipe(event.target.checked)} />Also request removal of its local replica when it next contacts the server</label><label className="mt-3 flex min-h-[52px] items-center gap-3 text-sm"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />I have checked the impact on work saved on that device</label>{!sync.connected ? <p className="mt-3 text-sm text-amber-text">Connect before revoking access.</p> : denial ? <p className="mt-3 text-sm text-amber-text">Your authorization must be refreshed before this action. Check sync or ask a facility administrator.</p> : null}{error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}<div className="mt-5 flex flex-wrap gap-3"><Button fullWidth={false} variant="outlined" disabled={busy} onClick={() => setSelected(undefined)}>Keep access</Button><Button fullWidth={false} variant="danger-outline" loading={busy} disabled={!acknowledged || !sync.connected || Boolean(denial)} onClick={() => void revoke()}>Confirm revocation</Button></div></Sheet> : null}
  </div>;
};
