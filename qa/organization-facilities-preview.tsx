// Real navigation, registration, API client and session components; synthetic API and replica.
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Facility, Staff, OrganizationFacilityRegistration } from '@shared';
import { SessionProvider, useAuth, useSession } from '@/session';
import { ToastProvider } from '@/ui';
import { AppHeader } from '@/app/AppHeader';
import { AddFacilityScreen } from '@/pages/facilities/AddFacilityScreen';
import { setDatabaseForTests } from '@/data/database';
import { fakeDatabase } from '@/data/testing/fakeDatabase';
import { toRow } from '@/data/rows';
import { recordServerContact, saveDeviceCredential } from '@/data/deviceCredential';
import { unlockSecureStorage } from '@/lib/secureStorage';
import { primary, second, created, selected, staffIdFor } from './organization-fixture';
import '@/index.css';

const facility = selected();
const staff = Staff.parse({ id: staffIdFor(facility.id), staffId: staffIdFor(facility.id), type: 'staff', facilityId: facility.id, deviceId: facility.deviceId, schemaVersion: 4, createdBy: 'system', createdOn: facility.createdOn, fullName: 'Ada Okoro', role: facility.id === second.id ? 'nurse' : 'facility_admin', permission: facility.id === second.id ? 'read_only' : 'read_write', loginAccess: 'always', active: true, personId: 'person:qa-one' });
await unlockSecureStorage();
await saveDeviceCredential({ deviceId: facility.deviceId, facilityId: facility.id, credential: `${facility.deviceId}.synthetic-browser-fixture`, syncEndpoint: 'http://sync.invalid' });
recordServerContact(new Date().toISOString());
localStorage.setItem('geneus.signedInStaffId', staff.id); localStorage.setItem('geneus.lastActivityOn', String(Date.now()));
const db = fakeDatabase({ staff: [toRow('staff', staff)] });
db.currentStatus = { connected: true, hasSynced: true, lastSyncedAt: new Date(), dataFlowStatus: { uploading: false, downloading: false } } as typeof db.currentStatus;
setDatabaseForTests(db);

const organization = { id: 'organization:qa', name: 'Sunrise Healthcare Group' };
const nativeFetch = window.fetch.bind(window);
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
window.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin);
  if (!url.pathname.startsWith('/organization/')) return nativeFetch(input, init);
  const body = JSON.parse(String(init?.body ?? '{}'));
  if (body.actorStaffId !== staff.id) throw new Error('Incorrect source membership');
  if (url.pathname === '/organization/facilities/list') return json({ organization, canCreateFacility: staff.role === 'facility_admin', facilities: [primary, second, created()].filter(Boolean).map((item) => ({ id: item!.id, name: item!.name, accessible: true, canEnrollDevice: item!.id !== second.id })).concat([{ id: 'SUN-ABJ', name: 'Sunrise Hospital, Abuja', accessible: false, canEnrollDevice: false }]) });
  if (url.pathname === '/organization/facilities/defaults') return json({ organization, administrator: { staffId: staff.id, fullName: staff.fullName, verifiedEmail: 'a***@example.org' } });
  if (url.pathname === '/organization/facilities/open') return json({ facilityId: body.facilityId, staffId: staffIdFor(body.facilityId), personId: staff.personId });
  if (url.pathname === '/organization/facilities') {
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(OrganizationFacilityRegistration.parse(body)))))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const previous = sessionStorage.getItem('qa-create-request');
    if (previous && previous !== digest) throw new Error('A retry changed the creation inputs');
    sessionStorage.setItem('qa-create-request', digest);
    sessionStorage.setItem('qa-create-keys', JSON.stringify(Object.keys(body)));
    sessionStorage.setItem('qa-create-attempts', String(Number(sessionStorage.getItem('qa-create-attempts') ?? '0') + 1));
    const target = Facility.parse({ ...facility, id: body.code, code: body.code, facilityId: body.code, deviceId: body.deviceId, name: body.name, state: body.state, lga: body.lga, level: body.level });
    sessionStorage.setItem('qa-created-facility', JSON.stringify(target));
    if (!previous) throw new TypeError('Failed to fetch'); // server committed, response was lost
    return json({ facility: target, admin: { ...staff, id: 'qa-admin-new', staffId: 'qa-admin-new', facilityId: target.id, deviceId: target.deviceId }, organization, device: { facilityId: target.id, deviceId: target.deviceId, credential: `${target.deviceId}.${body.deviceSecret}`, syncEndpoint: 'http://sync.invalid' } });
  }
  throw new Error(`Unmocked fixture endpoint: ${url.pathname}`);
};
const Home = () => { const { user } = useSession(); return <><AppHeader /><main className="mx-auto max-w-2xl space-y-3 p-5"><h1 className="text-2xl font-extrabold">{facility.name}</h1><p>Local staff role: {user.role}</p><p>Local access: {user.canWrite ? 'Read and write' : 'Read only'}</p><p>Separate facility records</p></main></>; };
const Ready = () => { const { signedIn, loading } = useAuth(); return loading || !signedIn ? <p>Loading synthetic session…</p> : <Routes><Route path="/facilities/new" element={<><AppHeader /><AddFacilityScreen /></>} /><Route path="*" element={<Home />} /></Routes>; };
createRoot(document.getElementById('root')!).render(<ToastProvider><SessionProvider><BrowserRouter><Ready /></BrowserRouter></SessionProvider></ToastProvider>);
