import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { patientSexLabel } from '@shared';
import { Button, DataTable, Icon, SectionTabs, Tag, type TableColumn } from '@/ui';
import { currentAge, searchPatients } from '@/features/search';
import { useAuthorizationContext } from '@/session';
import { useLiveQuery } from '@/data';
import { loadPatientDirectory, type PatientDirectoryRow } from '@/data/repos/patientDirectory';
import { PatientChartAccess } from '@/features/patients/PatientChartAccess';
import { loadPatientClinicalSummaries, type PatientClinicalSummary } from '@/features/patients/clinicalSummary';
import { patientChartPath } from '@/features/patients/patientRoutes';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const ALLERGY_TONE = { severe: 'danger', moderate: 'amber', mild: 'neutral', unknown: 'neutral' } as const;

const Status = ({ row, summary }: { row: PatientDirectoryRow; summary?: PatientClinicalSummary }) => {
  if (row.stay) return <><Tag tone="green">Admitted</Tag><p className="mt-1 text-xs text-ink-soft">{row.stay.ward} · {row.stay.bed}</p></>;
  if (summary?.status === 'in_progress') return <><Tag tone="slate">Visit in progress</Tag><p className="mt-1 text-xs text-ink-soft">Started {time(summary.openVisit!.openedOn)}</p></>;
  if (summary?.status === 'unfinished') return <><Tag tone="amber">Unfinished visit</Tag><p className="mt-1 text-xs text-ink-soft">Started {day(summary.openVisit!.openedOn)}</p></>;
  return <Tag>Not admitted</Tag>;
};
const Allergies = ({ summary }: { summary?: PatientClinicalSummary }) => summary?.allergies.length
  ? <div className="flex flex-wrap gap-1">{summary.allergies.map((a) => <Tag key={a.allergen} tone={ALLERGY_TONE[a.severity]}>{a.allergen}{a.severity === 'unknown' ? '' : ` · ${a.severity}`}</Tag>)}</div>
  : <span className="text-ink-soft">None recorded</span>;

/** Clinical services' patient list: safety facts and care status, opening straight into the chart. */
export const ClinicalPatientsScreen = () => <PatientChartAccess><ClinicalPatients /></PatientChartAccess>;

const ClinicalPatients = () => {
  const navigate = useNavigate(), [params, setParams] = useSearchParams(), context = useAuthorizationContext();
  const data = useLiveQuery(useCallback(async () => { const rows = await loadPatientDirectory(context); return { rows, clinical: await loadPatientClinicalSummaries(context, rows) }; }, [context.userId, context.facilityId, context.deviceId]));
  const query = params.get('q') ?? '', care = params.get('care') ?? 'all', page = Math.max(0, Number(params.get('page')) || 0);
  const set = (changes: Record<string, string>) => setParams((current) => { const next = new URLSearchParams(current); for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key); } return next; }, { replace: true });
  useEffect(() => { document.title = 'Patients · Geneus Health'; }, []);
  const rows = data.data?.rows ?? [], clinical = data.data?.clinical;
  const found = useMemo(() => {
    const ids = new Set(searchPatients(rows.flatMap((row) => row.searchRecords), query, context.facilityId).map((patient) => patient.patientId));
    return rows.filter((row) => row.ids.some((id) => ids.has(id)) && (care === 'all' || (care === 'inpatient' ? Boolean(row.stay) : !row.stay && Boolean(row.lastVisit))));
  }, [rows, query, care, context.facilityId]);
  const chart = (row: PatientDirectoryRow) => navigate(patientChartPath(row.patient.patientId, 'overview', { from: '/clinical/patients?' + params }));
  const sortKey = params.get('sort'), sort = ['patient', 'lastVisit'].includes(sortKey ?? '') ? { key: sortKey!, descending: params.get('descending') === '1' } : { key: 'lastVisit', descending: true };
  const columns: TableColumn<PatientDirectoryRow>[] = [
    { key: 'patient', label: 'Patient', sortValue: (row) => row.patient.fullName, render: (row) => <div className="min-w-[140px] max-w-[260px]">
      <button type="button" className="min-h-0 text-left text-sm font-bold text-brand underline" onClick={() => chart(row)}>{row.patient.fullName}</button>
      <p className="text-xs text-ink-soft"><span className="break-all font-mono">{row.patient.patientId}</span> · {currentAge(row.patient) ?? 'Age not recorded'} · {patientSexLabel(row.patient.sex)}</p>
      <div className="mt-2 space-y-2 md:hidden"><Allergies summary={clinical?.get(row.patient.id)} /><div><Status row={row} summary={clinical?.get(row.patient.id)} /></div></div>
    </div> },
    { key: 'allergies', label: 'Allergies', className: 'hidden md:table-cell', render: (row) => <Allergies summary={clinical?.get(row.patient.id)} /> },
    { key: 'problems', label: 'Active problems', className: 'hidden lg:table-cell', render: (row) => { const problems = clinical?.get(row.patient.id)?.problems ?? []; return problems.length ? <div className="flex flex-wrap gap-1">{problems.slice(0, 2).map((p) => <Tag key={p}>{p}</Tag>)}{problems.length > 2 ? <Tag>+{problems.length - 2}</Tag> : null}</div> : <span className="text-ink-soft">None recorded</span>; } },
    { key: 'status', label: 'Status', className: 'hidden md:table-cell', render: (row) => <Status row={row} summary={clinical?.get(row.patient.id)} /> },
    { key: 'lastVisit', label: 'Last visit', className: 'hidden md:table-cell', sortValue: (row) => row.lastVisit?.openedOn ?? '', render: (row) => row.lastVisit ? day(row.lastVisit.openedOn) : <span className="text-ink-soft">—</span> },
    { key: 'action', label: 'Action', render: (row) => <Button variant="outlined" fullWidth={false} className="px-3 text-sm" onClick={() => chart(row)}>View chart</Button> },
  ];
  return <div className="min-h-screen space-y-5 bg-white px-4 py-5 md:px-8">
    <h1 className="text-[28px] font-extrabold">Patients</h1>
    <SectionTabs label="Patient care type" value={care} onChange={(value) => set({ care: value === 'all' ? '' : value, page: '' })} options={[{ value: 'all', label: 'All', count: rows.length }, { value: 'inpatient', label: 'Inpatients', count: rows.filter((r) => r.stay).length }, { value: 'outpatient', label: 'Outpatients', count: rows.filter((r) => !r.stay && r.lastVisit).length }]} />
    <div><label htmlFor="clinical-patient-search" className="mb-2 block text-sm font-bold">Search patients</label><div className="flex min-h-[52px] items-center gap-3 rounded-field border border-outline px-4"><Icon name="search" className="h-5 w-5 shrink-0 text-ink-soft" /><input id="clinical-patient-search" type="search" value={query} onChange={(e) => set({ q: e.target.value, page: '' })} placeholder="Name, phone, ID or folder number" className="min-w-0 flex-1 border-0 bg-transparent p-0 outline-none" autoComplete="off" /></div></div>
    {data.loading && !data.data ? <p role="status">Reading patients…</p> : data.error ? <div role="alert"><p>Patients could not be read.</p><Button fullWidth={false} onClick={data.reload}>Try again</Button></div>
      : found.length ? <DataTable caption="Patients" uniformHeaders rows={found} rowKey={(row) => row.patient.id} page={page} onPageChange={(value) => set({ page: String(value) })} sort={sort} onSortChange={(value) => set({ sort: value.key, descending: value.descending ? '1' : '0', page: '' })} columns={columns} />
      : <p className="rounded-field border border-dashed border-outline p-6">{rows.length ? 'No patients match this search.' : 'No patients registered on this device yet.'}</p>}
  </div>;
};
