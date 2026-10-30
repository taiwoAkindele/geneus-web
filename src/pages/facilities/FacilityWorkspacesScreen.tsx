import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDeviceContext } from '@/data';
import { listFacilityWorkspaces, switchFacilityWorkspace } from '@/data/facilityWorkspaces';
import { joinFacility } from '@/lib/api/devices';
import { Button, TextField } from '@/ui';
import { useAuth, useSession } from '@/session';
import { AppHeader } from '@/app/AppHeader';

const CreationLink = () => {
  const { user } = useSession();
  return user.roles.includes('facility_admin') && user.canWrite ? <Link to="/facilities/new" className="inline-flex min-h-11 items-center font-bold text-brand">Create another facility</Link> : null;
};

export const FacilityWorkspacesScreen = () => {
  const { deviceId } = useDeviceContext();
  const { signedIn } = useAuth();
  const [code, setCode] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const entries = listFacilityWorkspaces();
  const run = async (operation: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await operation(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not open this facility'); } finally { setBusy(false); }
  };
  return <>{signedIn ? <AppHeader /> : null}<main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
    <Link to="/login" className="font-bold text-brand">Back to sign-in</Link>
    <div><h1 className="text-2xl font-extrabold">Facility access</h1><p className="mt-2 text-ink-soft">Each facility has separate patient records, staff access, prices and pending work. These are the facilities set up on this device.</p>{signedIn ? <CreationLink /> : null}</div>
    {error ? <p role="alert" className="rounded-field bg-danger-bg p-3 text-danger-strong">{error}</p> : null}
    <ul className="space-y-3">{entries.map((entry) => <li key={entry.deviceId} className="rounded-card border border-outline-soft p-4"><h2 className="font-bold">{entry.name}</h2><p className="text-sm text-ink-soft">{entry.facilityId} {entry.deviceId === deviceId ? '· Current facility' : ''}</p>{!entry.prepared ? <p className="mt-2 text-sm text-ink-soft">First synchronization required before offline use.</p> : null}{entry.pending ? <p className="mt-2 text-sm text-amber-text">{entry.pending} queued changes when last switched away. Open this facility to synchronize.</p> : null}<Button variant="outlined" className="mt-3" disabled={busy || entry.deviceId === deviceId} onClick={() => void run(() => switchFacilityWorkspace(entry.deviceId))}>{entry.deviceId === deviceId ? 'Current facility' : 'Open facility'}</Button></li>)}</ul>
    <section className="space-y-3 border-t border-outline-soft pt-5"><h2 className="text-lg font-bold">Connect an existing facility</h2><p className="text-sm text-ink-soft">Connect to the internet and enter an enrollment code issued by that facility’s administrator. Use this option when the receiving administrator must approve this device.</p><TextField label="Facility enrollment code" value={code} onChange={(event) => setCode(event.target.value)} /><Button disabled={busy || !code.trim()} loading={busy} onClick={() => void run(async () => { const issued = await joinFacility(code, `device:${crypto.randomUUID()}`, 'Additional facility workspace'); await switchFacilityWorkspace(issued.deviceId, issued); })}>Enroll & open facility</Button></section>
  </main></>;
};
