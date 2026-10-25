import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Button, DataTable, Icon, PatientIdToken } from '@/ui';
import { currentAge, searchPatients, usePatients } from '@/features/search';
import { PatientProfile } from '@/features/patients/PatientProfile';
import { useAuthorizationContext } from '@/session';
import { useLiveQuery } from '@/data';
import { listIdentityEvents } from '@/data/repos/patientIdentity';
import { canonicalPatientId } from '@shared';
import { ScanPatientCard } from '@/features/patients/ScanPatientCard';

const MAX_SHOWN = 50;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('');

export const PatientSearchScreen = () => {
  const navigate = useNavigate();
  const context = useAuthorizationContext();
  const patients = usePatients();
  const identities = useLiveQuery(listIdentityEvents);
  const [query, setQuery] = useState('');
  const [mobileLimit, setMobileLimit] = useState(MAX_SHOWN);
  const [selectedId, setSelectedId] = useState<string>();
  const found = useMemo(() => {
    const list = patients.data ?? [];
    const searchable = context.permissions.includes('patient:update') ? list : list.map((p) => ({ ...p, nin: undefined }));
    const results = searchPatients(searchable, query, context.facilityId);
    const byId = new Map(list.map((p) => [p.id, p]));
    return [...new Map(results.map((p) => { const root = canonicalPatientId(p.id, identities.data ?? []); const primary = byId.get(root) ?? p; return [primary.id, primary] as const; })).values()];
  }, [patients.data, query, context.facilityId, context.permissions, identities.data]);
  const shown = found.slice(0, mobileLimit);
  const open = (patientId: string) => navigate('/patients/profile', { state: { patientId } });

  return (
    <div className="min-h-screen bg-surface">
      <div className="w-full space-y-4 px-5 py-4 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><button type="button" aria-label="Back" onClick={() => navigate('/home')} className="-ml-2 flex h-11 w-11 min-h-0 items-center justify-center"><Icon name="back" className="h-6 w-6" /></button><h1 className="text-[24px] font-extrabold tracking-[-0.02em]">Find a patient</h1></div>
          {context.permissions.includes('patient:create') ? <Button fullWidth={false} className="px-4" onClick={() => navigate('/patients/new')}>＋ Add patient</Button> : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2"><ScanPatientCard onRead={setQuery} />{context.permissions.some((p) => ['patient_identity:review', 'patient_identity:resolve'].includes(p)) ? <Button variant="outlined" fullWidth={false} onClick={() => navigate('/patients/identity')}>Review duplicate patients</Button> : null}</div>
        <p className="text-xs text-ink-muted">Search covers records currently on this device, including old folder numbers{context.permissions.includes('patient:update') ? ' and exact NIN' : ''}. A missing result may still be waiting to synchronise.</p>
        {identities.error ? <p role="alert" className="text-sm text-danger">Linked identities could not be read. <button onClick={identities.reload}>Try again</button></p> : null}
        <div className="flex items-center gap-3 rounded-field border-[1.5px] border-outline bg-white px-4 py-3">
          <Icon name="search" className="h-5 w-5 text-ink-muted" /><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setMobileLimit(MAX_SHOWN); }} aria-label="Search patients" placeholder="Name, phone or Patient ID…" autoComplete="off" className="min-h-0 min-w-0 flex-1 border-0 p-0 text-base outline-none" />
        </div>
        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wide text-ink-muted"><span>{query.trim() ? 'Matching patients' : 'Registered patients'}</span>{!patients.loading && !patients.error ? <span>{found.length}</span> : null}</div>
        {patients.loading ? <div role="status" aria-label="Loading patients" className="h-40 animate-pulse rounded-card bg-surface-muted" /> : patients.error ? (
          <div role="alert" className="rounded-card bg-white p-4"><p>Patients could not be read from this device.</p><Button variant="ghost" onClick={patients.reload}>Try again</Button></div>
        ) : found.length === 0 ? (
          <p className="rounded-card border border-dashed border-outline p-5 text-center text-sm text-ink-muted">{query.trim() ? 'No matching patient. Check the spelling, phone or patient number.' : 'No patients registered on this device yet.'}</p>
        ) : (
          <>
            <div className="space-y-2 lg:hidden">
              {shown.map((patient) => <button key={patient.patientId} type="button" onClick={() => open(patient.patientId)} className="flex w-full items-center gap-3 rounded-card border border-outline-soft bg-white p-3.5 text-left"><Avatar tone={patient.sex === 'female' ? 'green' : 'slate'} size="sm">{initials(patient.fullName)}</Avatar><div className="min-w-0 flex-1"><div className="font-bold">{patient.fullName}</div><div className="text-[13px] text-ink-muted">{patient.sex === 'female' ? 'F' : 'M'} · {currentAge(patient) ?? 'Age not recorded'} · {patient.phone ?? patient.address}</div><PatientIdToken id={patient.patientId} variant="inline" /></div><Icon name="chevron" className="h-4 w-4 text-ink-muted" /></button>)}
            </div>
            <div className="hidden items-start gap-4 lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(290px,0.8fr)]">
              <DataTable caption="Registered patients" rows={found} rowKey={(row) => row.patientId} selectedKey={selectedId} columns={[
                { key: 'name', label: 'Patient', sortValue: (row) => row.fullName, render: (row) => <button type="button" className="min-h-0 py-1 text-left font-bold text-brand hover:underline" onClick={() => setSelectedId(row.patientId)}>{row.fullName}</button> },
                { key: 'id', label: 'Patient ID', sortValue: (row) => row.patientId, render: (row) => <span className="font-mono text-[11px]">{row.patientId}</span> },
                { key: 'age', label: 'Age / sex', sortValue: (row) => currentAge(row) ?? -1, render: (row) => `${currentAge(row) ?? '—'} / ${row.sex === 'female' ? 'F' : 'M'}` },
                { key: 'phone', label: 'Phone', render: (row) => row.phone ?? '—' },
              ]} />
              <aside aria-label="Selected patient" className="sticky top-28 max-h-[calc(100dvh-8rem)] overflow-y-auto rounded-card border border-outline-soft bg-white">
                {selectedId ? <><div className="flex items-center justify-between border-b border-outline-soft px-3 py-2"><span className="text-[13px] font-bold">Patient details</span><button type="button" className="min-h-[44px] px-2 text-[13px] font-bold text-brand" onClick={() => setSelectedId(undefined)}>Close details</button></div><PatientProfile key={selectedId} patientId={selectedId} embedded /><div className="px-3 pb-3"><Button variant="outlined" onClick={() => open(selectedId)}>Open full record</Button></div></> : <p className="p-5 text-sm leading-relaxed text-ink-muted">Select a patient's name to see their details and history here.</p>}
              </aside>
            </div>
          </>
        )}
        {found.length > mobileLimit ? <div className="space-y-2 lg:hidden"><p className="text-xs text-ink-muted">Showing {shown.length} of {found.length}. Search to narrow the list.</p><Button variant="outlined" onClick={() => setMobileLimit((limit) => limit + MAX_SHOWN)}>Load more patients</Button></div> : null}
        <p className="text-xs leading-relaxed text-ink-muted">You can search by the number said aloud: “47” finds patient 47.</p>
      </div>
    </div>
  );
};
