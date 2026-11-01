import { useEffect, useId, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Icon, Tag, type IconName } from '@/ui';
import { useAuth, useAuthorizationContext, useSession } from '@/session';
import { useAppointments } from '@/features/appointments';
import { readDeviceUnit, useIncomingHandoffs, useUnits } from '@/features/units';
import { patientChartPath, visitRecordPath } from '@/features/patients/patientRoutes';
import { usePatients } from '@/features/search';
import { useStock } from '@/features/stock';
import { formatMoney } from '@/lib/money';
import { dashboardAccess } from './dashboardModel';
import { useDashboard } from './useDashboard';
import { WorkforceHome } from '@/features/workforce/WorkforceHome';

const Section = ({ title, description, to, linkLabel = 'View all', count, loading, error, reload, children }: {
  title: string; description: string; to: string; linkLabel?: string; count?: number;
  loading?: boolean; error?: Error; reload?: () => void; children: ReactNode;
}) => {
  const id = useId();
  return <section aria-labelledby={id} className="min-w-0 overflow-hidden rounded-card border border-outline-soft bg-white">
    <div className="flex items-start justify-between gap-3 border-b border-outline-soft px-4 py-4 md:px-5">
      <div><h2 id={id} className="flex items-center gap-2 text-[17px] font-extrabold">{title}{!loading && !error && count !== undefined ? <span className="rounded-full bg-brand-wash px-2 py-0.5 font-mono text-xs text-brand">{count}</span> : null}</h2><p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{description}</p></div>
      <Link to={to} className="inline-flex min-h-[44px] shrink-0 items-center gap-1 text-sm font-bold text-brand hover:underline">{linkLabel}<Icon name="chevron" className="h-4 w-4" /></Link>
    </div>
    {loading ? <div role="status" aria-label={`Loading ${title.toLowerCase()}`} className="space-y-3 p-5"><div className="h-4 w-2/3 animate-pulse rounded bg-surface-container" /><div className="h-4 w-1/2 animate-pulse rounded bg-surface-container" /></div>
      : error ? <div role="alert" className="p-4 text-sm"><p className="text-danger">{title} could not be read from this device.</p><Button fullWidth={false} variant="ghost" onClick={reload}>Try again</Button></div>
      : children}
  </section>;
};
const Empty = ({ children }: { children: ReactNode }) => <p className="p-5 text-sm leading-relaxed text-ink-muted">{children}</p>;
const dateTime = (at: string) => new Date(at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const statValue = (loading: boolean, error: Error | undefined, value: number | undefined) => loading || error ? '—' : String(value ?? 0);

const StockAttention = () => {
  const query = useStock();
  const low = query.data?.items.filter((item) => item.balance <= (item.reorderLevel ?? 0)) ?? [];
  if (!query.loading && !query.error && !low.length) return null;
  return <Section title="Stock to review" description="Recorded balances at or below the item's reorder level." to="/stock?level=low" linkLabel="Open stock" count={low.length} loading={query.loading} error={query.error} reload={query.reload}>
    <ul className="divide-y divide-outline-soft">{low.slice(0, 3).map((item) => <li key={item.id}><Link to={`/stock?item=${encodeURIComponent(item.id)}`} className="flex min-h-[64px] items-center justify-between gap-3 px-4 py-3 text-sm md:px-5"><span className="font-bold">{item.name}</span><span className="text-right font-mono text-amber-text">{item.balance} {item.unitOfMeasure ?? 'units'}{item.balance < 0 ? <span className="block font-sans text-xs">Check physical count</span> : null}</span></Link></li>)}</ul>
  </Section>;
};

const UnitWork = () => {
  const units = useUnits();
  const patients = usePatients();
  const unitId = readDeviceUnit();
  const incoming = useIncomingHandoffs(unitId);
  const unit = units.data?.find((candidate) => candidate.id === unitId && candidate.active);
  const names = new Map(patients.data?.map((patient) => [patient.patientId, patient.fullName]));
  return <Section title="Unit work" description={unit ? `${unit.name} · instructions sent here` : 'Choose the unit this device is working in.'} to="/units" linkLabel={unit ? 'Open queue' : 'Choose unit'} count={unit ? incoming.data?.length : undefined} loading={units.loading || incoming.loading || patients.loading} error={units.error ?? incoming.error ?? patients.error} reload={() => { units.reload(); incoming.reload(); patients.reload(); }}>
    {!unit ? <Empty>Select a unit to see incoming work. You can change units whenever you move.</Empty> : !incoming.data?.length ? <Empty>No unfinished handoffs to {unit.name} on this device.</Empty> : <ul className="divide-y divide-outline-soft">{incoming.data.slice(0, 3).map((handoff) => <li key={handoff.id} className="p-4 md:px-5"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold">{names.get(handoff.patientId) ?? handoff.patientId}</span><Tag tone={handoff.status === 'received' ? 'slate' : 'amber'}>{handoff.status === 'received' ? 'Arrived' : 'On the way'}</Tag></div><p className="mt-2 text-sm text-ink-soft">{handoff.instruction}</p><p className="mt-2 text-xs text-ink-muted">Sent {dateTime(handoff.createdOn)}</p></li>)}</ul>}
  </Section>;
};

const FacilityWork = () => {
  const { roster, loading, error, reload } = useAuth();
  const context = useAuthorizationContext();
  const units = useUnits();
  const canStaff = context.permissions.some((permission) => ['staff:manage', 'staff:permission', 'staff:deactivate', 'roster:assign'].includes(permission)) || context.roles?.includes('facility_admin') || context.role === 'facility_admin';
  const actions = [
    ...(canStaff ? [{ label: 'Staff & roster', detail: `${roster.length} active staff profiles · not an attendance count`, to: '/admin/staff', icon: 'patients' as const }] : []),
    ...(context.permissions.includes('unit:manage') ? [{ label: 'Units & rooms', detail: `${units.data?.filter((unit) => unit.active).length ?? 0} active units`, to: '/admin/units', icon: 'referrals' as const }] : []),
    ...(context.permissions.includes('fee_item:manage') ? [{ label: 'Fees & payment setup', detail: 'Prices, departments and receiving accounts', to: '/billing/fees', icon: 'registers' as const }] : []),
    ...(context.permissions.includes('device:enroll') || context.permissions.includes('device:revoke') ? [{ label: 'Facility devices', detail: 'Enrollment and device access', to: '/admin/devices', icon: 'lock' as const }] : []),
  ];
  return <Section title="Facility management" description="Your management duties, alongside your daily work." to="/admin" linkLabel="Settings" loading={loading || units.loading} error={error ?? units.error} reload={() => { reload(); units.reload(); }}>
    {actions.length ? <ul className="divide-y divide-outline-soft">{actions.map((action) => <li key={action.to}><Link to={action.to} className="flex min-h-[76px] items-center gap-3 px-4 py-3 hover:bg-brand-wash md:px-5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-wash text-brand"><Icon name={action.icon} className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold">{action.label}</span><span className="mt-0.5 block text-xs text-ink-muted">{action.detail}</span></span><Icon name="chevron" className="h-4 w-4 text-ink-muted" /></Link></li>)}</ul> : <Empty>Your account has access to facility settings. Open Settings to see available tasks.</Empty>}
    {!units.loading && !units.error && units.data?.every((unit) => !unit.active) && context.permissions.includes('unit:manage') ? <div className="m-4 rounded-field border border-amber-border bg-amber-bg p-3 text-sm"><p className="font-bold text-amber-text">Finish unit setup</p><p className="mt-1 text-ink-soft">Add the rooms or services patients can be sent to.</p><Link className="mt-2 inline-flex min-h-[44px] items-center font-bold text-brand" to="/admin/units">Add units<Icon name="chevron" className="ml-1 h-4 w-4" /></Link></div> : null}
  </Section>;
};

export const Dashboard = () => {
  const navigate = useNavigate();
  const { user, facility, notifications, notificationsLoading, notificationsError } = useSession();
  const context = useAuthorizationContext();
  const access = dashboardAccess(context);
  const careFirst = access.care && context.role !== 'cashier' && context.role !== 'records_officer';
  const billingFirst = access.billing && context.role === 'cashier';
  const { care, billing, today } = useDashboard(access);
  const appointments = useAppointments();
  const todayAppointments = appointments.appointments.filter((appointment) => appointment.group === 'today');
  const earlier = appointments.appointments.filter((appointment) => appointment.group === 'overdue').length;
  const review = notifications.filter((notification) => notification.kind === 'conflict').length;
  useEffect(() => { document.title = 'Home · Geneus Health'; }, []);
  const quickActions: { label: string; to: string; icon: IconName; primary?: boolean }[] = [
    ...(context.permissions.includes('patient:create') ? [{ label: 'Register patient', to: '/patients/new', icon: 'plus' as const, primary: context.role === 'records_officer' }] : []),
    { label: 'Patients', to: '/patients/search', icon: 'search', primary: careFirst },
    ...(access.billing ? [{ label: 'Open billing', to: '/billing', icon: 'registers' as const, primary: billingFirst }] : []),
  ];
  quickActions.sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)));
  const metrics = [
    ...(access.care ? [{ label: 'Visits started today', value: statValue(care.loading, care.error, care.data?.today), detail: 'By local start date', to: `/encounters?queue=all&visitFrom=${today}&visitTo=${today}` }, { label: 'Visits in progress', value: statValue(care.loading, care.error, care.data?.open.length), detail: 'All dates · unfinished care', to: '/encounters?queue=all&visitStatus=Open' }] : []),
    ...(access.appointments ? [{ label: 'Bookings today', value: statValue(appointments.loading, appointments.error, todayAppointments.length), detail: 'Not an arrival count', to: '/appointments?group=today' }] : []),
    ...(access.billing ? [{ label: 'Accounts with balances', value: statValue(billing.loading, billing.error, billing.data ? new Set(billing.data.accounts.map((account) => account.patientId)).size : undefined), detail: 'All dates · on this device', to: '/billing?tab=collections' }] : []),
  ].slice(0, 4);

  const carePanel = access.care ? <Section title="Visits in progress" description="Unfinished care · oldest started first. This is not an arrival queue." to="/encounters?queue=all&visitStatus=Open" count={care.data?.open.length} loading={care.loading} error={care.error} reload={care.reload}>
    {!care.data?.open.length ? <Empty>No unfinished visits on this device. Find a patient to start recording care.</Empty> : <ul className="divide-y divide-outline-soft">{care.data.open.slice(0, 4).map((visit) => <li key={visit.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 md:px-5"><div className="min-w-0 flex-1 basis-[170px]"><h3 className="font-bold">{visit.patientName}</h3><p className="mt-1 break-all font-mono text-[11px] text-ink-muted">{visit.patientId}</p><p className="mt-2 text-sm text-ink-soft">{visit.nextAction}</p><p className="mt-1 text-xs text-ink-muted">Started {dateTime(visit.openedOn)}</p></div><Link to={context.permissions.includes('encounter:record') ? visitRecordPath(visit.patientId, visit.id, '/home') : patientChartPath(visit.patientId, 'visits', { visit: visit.id })} className="inline-flex min-h-[44px] items-center gap-1 rounded-field bg-brand-wash px-3 py-2 text-sm font-bold text-brand hover:bg-brand-tint">{context.permissions.includes('encounter:record') ? 'Continue visit' : 'View visit'}<Icon name="chevron" className="h-4 w-4" /></Link></li>)}</ul>}
  </Section> : null;
  const appointmentsPanel = access.appointments ? <Section title="Today's appointments" description="Planned bookings · open a patient to review or begin care." to="/appointments?group=today" count={todayAppointments.length} loading={appointments.loading} error={appointments.error} reload={appointments.reload}>
    {!todayAppointments.length ? <Empty>No outstanding bookings for today on this device. Upcoming bookings are in Appointments.</Empty> : <ul className="divide-y divide-outline-soft">{todayAppointments.slice(0, 3).map((appointment) => <li key={appointment.id}><Link to={patientChartPath(appointment.patient.id, 'appointments')} className="flex min-h-[80px] items-start gap-3 px-4 py-4 hover:bg-brand-wash md:px-5"><span className="pt-0.5 font-mono text-sm font-semibold text-brand">{appointment.when}</span><span className="min-w-0 flex-1"><span className="block font-bold">{appointment.patient.name}</span><span className="mt-1 block text-sm text-ink-soft">{appointment.reason}</span><span className="mt-1 block text-xs text-ink-muted">{appointment.encounterId ? 'Visit already started' : 'Planned booking'}</span></span><Icon name="chevron" className="mt-1 h-4 w-4 text-ink-muted" /></Link></li>)}</ul>}
  </Section> : null;
  const billingPanel = access.billing ? <Section title="Billing & collections" description="Outstanding accounts · oldest charge first. Open an account to review its bill." to="/billing?tab=collections" linkLabel="Open billing" count={billing.data ? new Set(billing.data.accounts.map((account) => account.patientId)).size : undefined} loading={billing.loading} error={billing.error} reload={billing.reload}>
    {billing.data?.collected.length ? <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-outline-soft bg-brand-wash px-4 py-3 text-sm md:px-5"><span className="text-ink-soft">Net collected today</span>{billing.data.collected.map(([currency, amount]) => <strong key={currency} className="font-mono text-brand">{formatMoney(amount, currency)}</strong>)}<span className="w-full text-xs text-ink-muted">By payment date · reversals deducted · currencies kept separate</span></div> : null}
    {!billing.data?.accounts.length ? <Empty>No outstanding balances on this device. Open Billing to find a bill or review receipts.</Empty> : <ul className="divide-y divide-outline-soft">{billing.data.accounts.slice(0, 3).map((account) => <li key={account.patientId + account.currency}><Link to={`/billing?${new URLSearchParams({ tab: 'collections', patient: account.patientId })}`} className="flex min-h-[80px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-4 hover:bg-brand-wash md:px-5"><span className="min-w-0 flex-1 basis-[140px]"><span className="block font-bold">{account.name}</span><span className="mt-1 block break-all font-mono text-[11px] text-ink-muted">{account.patientId}</span></span><span className="font-mono text-sm font-bold">{formatMoney(account.outstanding, account.currency)}</span><Icon name="chevron" className="h-4 w-4 text-brand" /></Link></li>)}</ul>}
  </Section> : null;

  return <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 px-4 py-5 md:gap-6 md:px-7 md:py-7">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[13px] font-semibold text-ink-muted">{new Date(today + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p><h1 className="mt-1 text-[30px] font-extrabold tracking-[-0.03em]">Home</h1><p className="mt-1 text-sm text-ink-soft">Welcome, {user.name}. <span className="block sm:inline">Your work at {facility.name}.</span></p></div><div className="flex flex-wrap gap-2">{quickActions.map((action, index) => <Button key={action.to} fullWidth={false} variant={action.primary ? 'primary' : 'outlined'} className={`min-h-[44px] px-3 py-3 text-sm ${index > 1 ? 'hidden sm:inline-flex' : ''}`} onClick={() => navigate(action.to)}><Icon name={action.icon} className="h-4 w-4" />{action.label}</Button>)}</div></header>
    <WorkforceHome/>
    {user.roles.length > 1 ? <p className="text-xs font-semibold text-ink-muted">{user.role} · all your duties in one place</p> : null}
    {notificationsError ? <div role="alert" className="rounded-field border border-amber-border bg-amber-bg p-4 text-sm">Review alerts could not be read. <Link to="/sync" className="font-bold text-brand underline">Check sync & review</Link></div> : !notificationsLoading && review > 0 ? <section aria-label="Needs attention" className="flex flex-wrap items-center gap-3 rounded-card border border-amber-border bg-amber-bg px-4 py-3"><Icon name="warning" className="h-5 w-5 text-amber-text" /><div className="min-w-0 flex-1"><h2 className="text-sm font-bold text-amber-text">{review} {review === 1 ? 'record needs' : 'records need'} review</h2><p className="mt-0.5 text-xs text-ink-soft">A queued change was refused. Reading the alert does not resolve it.</p></div><Link to="/sync" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-bold text-brand">Review records<Icon name="chevron" className="h-4 w-4" /></Link></section> : null}
    {metrics.length ? <section aria-label="Work summary" className="order-2 grid xl:order-none grid-cols-2 gap-2 md:gap-3 xl:grid-cols-4">{metrics.map((metric) => <Link key={metric.label} to={metric.to} className="min-w-0 rounded-card border border-outline-soft bg-white px-3 py-3 hover:border-brand md:px-4"><div className="flex items-center justify-between gap-2"><span className="font-mono text-[25px] font-semibold leading-none text-brand">{metric.value}</span><Icon name="chevron" className="h-4 w-4 text-ink-muted" /></div><p className="mt-2 text-[13px] font-bold">{metric.label}</p><p className="mt-1 text-[11px] text-ink-muted">{metric.detail}</p></Link>)}</section> : null}
    <div className="order-1 grid items-start gap-5 xl:order-none xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"><div className="min-w-0 space-y-5">{careFirst ? carePanel : billingFirst ? billingPanel : appointmentsPanel}{careFirst || billingFirst ? appointmentsPanel : null}{!access.care && !access.billing ? <section className="rounded-card border border-outline-soft bg-white p-5"><h2 className="text-[17px] font-extrabold">Daily registers</h2><p className="mt-2 text-sm text-ink-soft">Record and review the facility's programme entries.</p><Link to="/registers" className="mt-3 inline-flex min-h-[44px] items-center gap-1 font-bold text-brand">Open registers<Icon name="chevron" className="h-4 w-4" /></Link></section> : null}</div><div className="min-w-0 space-y-5">{!careFirst ? carePanel : null}{access.care ? <UnitWork /> : null}{!billingFirst ? billingPanel : null}{access.facility ? <FacilityWork /> : null}{access.stock ? <StockAttention /> : null}{access.appointments && !appointments.loading && !appointments.error && earlier > 0 ? <section className="rounded-card border border-outline-soft bg-white p-4"><h2 className="text-sm font-bold">Earlier bookings to review</h2><p className="mt-1 text-sm text-ink-soft">{earlier} {earlier === 1 ? 'booking has' : 'bookings have'} a past date and no completed linked visit. Check what happened before taking action.</p><Link to="/appointments?group=overdue" className="mt-2 inline-flex min-h-[44px] items-center gap-1 text-sm font-bold text-brand">Review bookings<Icon name="chevron" className="h-4 w-4" /></Link></section> : null}</div></div>
    <p className="order-3 flex items-start gap-2 text-xs leading-relaxed text-ink-muted"><Icon name="sync" className="mt-0.5 h-3.5 w-3.5" /><span>Based on records saved on this device. Other devices' changes arrive when it syncs. <Link to="/sync" className="font-semibold text-brand underline">View sync status</Link></span></p>
  </div>;
};
