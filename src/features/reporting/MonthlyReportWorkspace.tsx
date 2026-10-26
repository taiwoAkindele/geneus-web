import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, DataTable, TextField } from '@/ui';
import { useSession } from '@/session';
import { calendarDate } from '@/lib/calendarDate';
import { downloadCsv } from '@/lib/csv';
import { monthlyReport, validMonth } from './monthlyReport';
import { useMonthlyReport } from './useMonthlyReport';

export const MonthlyReport = () => {
  const { facility } = useSession();
  const [params, setParams] = useSearchParams();
  const month = params.get('month') ?? calendarDate().slice(0, 7);
  const query = useMonthlyReport();
  useEffect(() => { document.title = 'Monthly reports · Geneus Health'; }, []);
  const report = query.data && validMonth(month) ? monthlyReport(query.data, month) : undefined;
  const exportReport = () => {
    if (!report) return;
    downloadCsv(`facility-summary-${month}.csv`, [
      ['Facility', facility.name], ['Month', month], ['Scope', 'Records on this device; other devices may not have synced'],
      ['Metric', 'Count'], ['Visits started', report.visits], ['Patients with visits (current linked identities)', report.people], ['Completed/admitted visits', report.completed], ['Visits still open', report.inProgress], ['Patient records created', report.patientRecordsCreated],
      [], ['Diagnosis label', 'Visits in selected cohort'], ...report.diagnoses.map((row) => [row.label, row.visits]),
      [], ['Register', 'Entries by entry date'], ...report.registers.map((row) => [row.name, row.count]),
      [], ['Commodity', 'Unit', 'Starting / initial', 'Received', 'Used', 'Expired', 'Adjustments / transfers', 'Closing'], ...report.commodities.map((row) => [row.name, row.unit, row.opening, row.received, row.used, row.expired, row.adjusted, row.closing]),
      [], ['Month', 'Visits started'], ...report.trends.map((row) => [row.month, row.visits]),
    ]);
  };
  return <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 md:px-7">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-[28px] font-extrabold">Monthly reports</h1><p className="mt-1 text-sm text-ink-muted">{facility.name} · recorded activity, diagnoses, registers and commodities.</p></div><Button fullWidth={false} variant="outlined" disabled={!report || query.loading || Boolean(query.error)} onClick={exportReport}>Export monthly summary</Button></header>
    <div className="max-w-xs"><TextField label="Report month" type="month" value={month} onChange={(event) => setParams({ month: event.target.value })} error={validMonth(month) ? undefined : 'Choose a valid month.'} /></div>
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-card border border-outline-soft bg-white px-4 py-3 text-sm"><div><p className="font-bold">Records on this device</p><p className="mt-1 text-ink-muted">Check sync before preparing a facility return. Other devices' changes appear after they upload.</p></div><Link to="/sync" className="inline-flex min-h-[44px] items-center font-bold text-brand">Check sync &amp; review</Link></div>
    {query.loading ? <p role="status">Preparing the report from this device…</p> : query.error ? <div role="alert"><p>Report records could not be read.</p><Button variant="ghost" onClick={query.reload}>Try again</Button></div> : report ? <>
      <section aria-label="Monthly activity" className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[['Visits started', report.visits], ['Patients with visits', report.people], ['Completed / admitted', report.completed], ['Visits still open', report.inProgress]].map(([label, value]) => <div key={label} className="rounded-card border border-outline-soft bg-white p-4"><p className="text-xs font-bold text-ink-muted">{label}</p><p className="mt-2 font-mono text-2xl font-bold text-brand">{value}</p></div>)}</section>
      <p className="text-sm leading-relaxed text-ink-muted">Visits are grouped by their local start month, including their latest saved status and corrected diagnosis. Patients use current confirmed identity links. {report.patientRecordsCreated} patient records were created this month; that count is separate from care attendance.</p>
      <section className="space-y-3"><h2 className="text-xl font-bold">Recorded diagnoses</h2><p className="text-sm text-ink-muted">Diagnosis labels for visits started in this month. Labels are grouped as entered; these are not mapped national programme indicators.</p>{report.diagnoses.length ? <DataTable caption="Diagnosis labels by visit count" rows={report.diagnoses} rowKey={(row) => row.label} columns={[{ key: 'label', label: 'Recorded diagnosis', render: (row) => row.label }, { key: 'count', label: 'Visits', render: (row) => row.visits }]} /> : <p className="rounded-card border border-outline-soft bg-white p-4 text-sm text-ink-muted">No diagnoses recorded for this month's visits.</p>}</section>
      <section className="space-y-3"><h2 className="text-xl font-bold">Programme registers</h2><p className="text-sm text-ink-muted">Entries by their recorded entry date. An entry count is not automatically a patient or attendance count.</p>{report.registers.length ? <DataTable caption="Register entry counts" rows={report.registers} rowKey={(row) => row.id} columns={[{ key: 'register', label: 'Register', render: (row) => <Link to={`/registers/${row.id}`} className="font-bold text-brand underline">{row.name}</Link> }, { key: 'count', label: 'Entries', render: (row) => row.count }]} /> : <p className="rounded-card border border-outline-soft bg-white p-4 text-sm text-ink-muted">No register entries for this month.</p>}</section>
      <section className="space-y-3"><h2 className="text-xl font-bold">Commodity movements</h2><p className="text-sm text-ink-muted">Quantities stay in each item's own unit. Starting balances include the initial quantity of items first recorded during the month. Negative balances require a physical-count review.</p>{report.commodities.length ? <DataTable caption="Commodity movement summary" rows={report.commodities} rowKey={(row) => row.id} columns={[{ key: 'name', label: 'Item / unit', render: (row) => <Link to={`/stock?item=${encodeURIComponent(row.id)}`} className="font-bold text-brand">{row.name}<span className="block text-xs font-normal text-ink-muted">{row.unit}</span></Link> }, ...(['opening', 'received', 'used', 'expired', 'adjusted', 'closing'] as const).map((key) => ({ key, label: { opening: 'Starting / initial', received: 'Received', used: 'Used', expired: 'Expired', adjusted: 'Adjustments / transfers', closing: 'Closing' }[key], render: (row: typeof report.commodities[number]) => row[key] }))]} /> : <p className="rounded-card border border-outline-soft bg-white p-4 text-sm text-ink-muted">No stock items available for this period. <Link to="/stock" className="font-bold text-brand underline">Open stock</Link></p>}</section>
      <section className="space-y-3"><h2 className="text-xl font-bold">Visit trend</h2><DataTable caption="Visits started over six months" rows={report.trends} rowKey={(row) => row.month} columns={[{ key: 'month', label: 'Month', render: (row) => row.month }, { key: 'visits', label: 'Visits started', render: (row) => row.visits }]} /></section>
    </> : null}
  </div>;
};
