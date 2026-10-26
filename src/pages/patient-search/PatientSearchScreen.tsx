import { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, DataTable, Icon } from '@/ui';
import { currentAge, searchPatients, usePatients } from '@/features/search';
import { useAuthorizationContext } from '@/session';
import { useLiveQuery } from '@/data';
import { listIdentityEvents } from '@/data/repos/patientIdentity';
import { canonicalPatientId } from '@shared';
import { ScanPatientCard } from '@/features/patients/ScanPatientCard';
import { patientChartPath } from '@/features/patients/patientRoutes';

export const PatientSearchScreen = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const context = useAuthorizationContext();
  useEffect(() => { document.title = 'Patients · Geneus Health'; }, []);
  const patients = usePatients();
  const identities = useLiveQuery(listIdentityEvents);
  const query = params.get('q') ?? '';
  const pageValue = Number(params.get('page') ?? 0);
  const page = Number.isInteger(pageValue) && pageValue >= 0 ? pageValue : 0;
  const found = useMemo(() => {
    const list = patients.data ?? [];
    const searchable = context.permissions.includes('patient:update') ? list : list.map((p) => ({ ...p, nin: undefined }));
    const results = searchPatients(searchable, query, context.facilityId);
    const byId = new Map(list.map((p) => [p.id, p]));
    return [...new Map(results.map((p) => { const root = canonicalPatientId(p.id, identities.data ?? []); const primary = byId.get(root) ?? p; return [primary.id, primary] as const; })).values()];
  }, [patients.data, query, context.facilityId, context.permissions, identities.data]);
  const setQuery = (value: string) => setParams(value ? { q: value } : {}, { replace: true });
  const open = (patientId: string) => navigate(patientChartPath(patientId, 'overview', { from: '/patients/search?' + params }));

  return <div className="min-h-screen bg-white px-4 py-5 md:px-8">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-[28px] font-extrabold">Patients</h1><p className="mt-1 text-sm text-ink-soft">Find a patient and open their complete medical chart.</p></div>{context.permissions.includes('patient:create') ? <Button fullWidth={false} onClick={() => navigate('/patients/new')}>Add patient</Button> : null}</div>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><ScanPatientCard onRead={setQuery} />{context.permissions.some((permission) => ['patient_identity:review', 'patient_identity:resolve'].includes(permission)) ? <Button variant="outlined" fullWidth={false} onClick={() => navigate('/patients/identity')}>Review duplicate patients</Button> : null}</div>
    <div className="mb-3 flex items-center gap-3 rounded-field border border-outline bg-white px-4 py-3"><Icon name="search" className="h-5 w-5 text-ink-soft" /><input type="search" aria-label="Search patients" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, phone or patient ID…" autoComplete="off" className="min-h-[28px] min-w-0 flex-1 border-0 p-0 outline-none" /></div>
    <p className="mb-5 text-sm text-ink-soft">Search covers records on this device, including old folder numbers{context.permissions.includes('patient:update') ? ' and exact NIN' : ''}. Other devices’ records arrive when this device syncs.</p>
    {identities.error ? <p role="alert" className="mb-4 text-sm text-danger">Linked identities could not be read. <button type="button" onClick={identities.reload}>Try again</button></p> : null}
    {patients.loading ? <p role="status">Reading patients…</p> : patients.error ? <div role="alert"><p>Patients could not be read from this device.</p><Button variant="ghost" onClick={patients.reload}>Try again</Button></div> : <>
      <p className="mb-3 text-sm text-ink-soft">{found.length} {query ? 'matching' : 'registered'} patients</p>
      {found.length ? <DataTable caption="Registered patients" rows={found} rowKey={(patient) => patient.patientId} page={page} onPageChange={(nextPage) => setParams((current) => { const next = new URLSearchParams(current); next.set('page', String(nextPage)); return next; }, { replace: true })} columns={[
        { key: 'name', label: 'Patient', sortValue: (patient) => patient.fullName, render: (patient) => <div><button type="button" className="min-h-[44px] text-left font-bold text-brand hover:underline" onClick={() => open(patient.patientId)}>{patient.fullName}</button><p className="break-all font-mono text-xs text-ink-soft">{patient.patientId}</p><p className="mt-2 text-sm text-ink-soft md:hidden">{patient.phone ?? 'Phone not recorded'}</p></div> },
        { key: 'age', label: 'Age / sex', sortValue: (patient) => currentAge(patient) ?? -1, render: (patient) => <div>{currentAge(patient) === undefined ? 'Age not recorded' : String(currentAge(patient)) + ' years'}<p className="mt-1 text-sm text-ink-soft">{patient.sex === 'female' ? 'Female' : 'Male'}</p></div> },
        { key: 'phone', label: 'Phone', className: 'hidden md:table-cell', render: (patient) => patient.phone ?? 'Not recorded' },
        { key: 'address', label: 'Address', className: 'hidden xl:table-cell', render: (patient) => patient.address },
        { key: 'open', label: 'Action', className: 'hidden sm:table-cell', render: (patient) => <Button variant="outlined" fullWidth={false} onClick={() => open(patient.patientId)}>Open chart</Button> },
      ]} /> : <p className="rounded-field border border-dashed border-outline p-6 text-sm text-ink-soft">{query ? 'No matching patient. Check the name, phone or patient number.' : 'No patients registered on this device yet.'}</p>}
    </>}
  </div>;
};
