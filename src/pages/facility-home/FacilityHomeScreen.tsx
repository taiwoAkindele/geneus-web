import { useNavigate } from 'react-router-dom';
import { Button, Icon, Tag, type IconName } from '@/ui';
import { SyncPill } from '@/app/SyncPill';
import { useAuthorizationContext, useSession } from '@/session';
import { useLiveQuery, useSyncStatus } from '@/data';
import { listEncounters, closingEntries } from '@/data/repos/encounters';
import { useAppointments } from '@/features/appointments';
import { accessLabel } from '@/session/accessPolicy';
import { hasAdminWorkspace } from '@/app/navigation';
import { calendarDate } from '@/lib/calendarDate';

const loadCounts = async () => {
  const [encounters, closing] = await Promise.all([listEncounters(), closingEntries()]);
  const closed = new Set(closing.map((entry) => entry.encounterId));
  return { today: encounters.filter((encounter) => calendarDate(encounter.openedOn) === calendarDate()).length, open: encounters.filter((encounter) => !closed.has(encounter.id)).length };
};

export const FacilityHomeScreen = () => {
  const navigate = useNavigate();
  const { user, facility, shift, access } = useSession();
  const context = useAuthorizationContext();
  const appointments = useAppointments();
  const counts = useLiveQuery(loadCounts);
  const sync = useSyncStatus();
  const cashier = user.roles.every((role) => role === 'cashier') && !hasAdminWorkspace(context) && !context.permissions.some((permission) => ['patient:create', 'appointment:create', 'encounter:record', 'register_entry:create'].includes(permission));
  const takesPayments = context.permissions.includes('payment:receive');
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const actions: { label: string; icon: IconName; to: string; primary?: boolean }[] = [];
  if (context.permissions.includes('patient:create')) actions.push({ label: 'New patient', icon: 'plus', to: '/patients/new', primary: user.roles.includes('records_officer') });
  if (cashier || takesPayments || context.permissions.includes('fee_item:manage')) actions.push({ label: 'Billing', icon: 'registers', to: '/billing', primary: cashier });
  actions.push({ label: 'Find patient', icon: 'search', to: '/patients/search', primary: cashier });
  if (!cashier) actions.push({ label: "Today's appointments", icon: 'clock', to: '/appointments', primary: context.permissions.includes('encounter:record') });
  if (context.permissions.includes('encounter:record')) actions.push({ label: 'Unit queue', icon: 'clock', to: '/units' });
  if (!cashier) actions.push({ label: 'Register books', icon: 'registers', to: '/registers' });
  if (hasAdminWorkspace(context)) actions.unshift({ label: 'Facility admin', icon: 'patients', to: '/admin', primary: true });

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto w-full max-w-md px-5 py-4 md:max-w-4xl">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div><p className="text-[13px] text-ink-muted">{greeting},</p><h1 className="text-[24px] font-extrabold">{user.name.split(' ')[0]}</h1><p className="mt-1 text-[13px] text-ink-muted">{user.role} · {facility.name}</p></div>
          <div className="flex flex-col items-end gap-2"><SyncPill /><Tag tone="amber">{shift ? shift.ended ? 'Shift ended · still signed in' : `Shift ends ${shift.endsAtLabel}` : accessLabel(access)}</Tag></div>
        </div>
        {cashier || takesPayments ? <section className="mb-5 rounded-card border border-outline-soft bg-white p-4"><h2 className="text-[17px] font-bold">Cashier workspace</h2><p className="mt-2 text-[14px] leading-relaxed text-ink-muted">Open Billing to find patient bills, record cash, view department collections and reconcile incoming bank transfers.</p></section> : null}
        <div className="grid grid-cols-2 gap-3">
          {actions.map((action) => <button key={action.to} type="button" onClick={() => navigate(action.to)} className={`flex min-h-[104px] flex-col justify-between gap-3 rounded-card border p-4 text-left ${action.primary ? 'border-brand bg-brand text-white' : 'border-outline-soft bg-white text-ink'}`}><Icon name={action.icon} className="h-6 w-6" /><span className="text-[15px] font-bold">{action.label}</span></button>)}
        </div>
        {!cashier ? (
          <section className="mt-6">
            <h2 className="mb-3 text-[15px] font-bold">On this device</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { label: 'Encounters today', value: counts.loading || counts.error ? '—' : String(counts.data?.today ?? 0), to: '/encounters' },
                { label: 'Open encounters', value: counts.loading || counts.error ? '—' : String(counts.data?.open ?? 0), to: '/encounters' },
                { label: "Today's appointments", value: appointments.loading || appointments.error ? '—' : String(appointments.appointments.filter((appointment) => appointment.group === 'today').length), to: '/appointments' },
                { label: 'Changes to sync', value: String(sync.pending), to: '/sync' },
              ].map((metric) => <button key={metric.label} type="button" onClick={() => navigate(metric.to)} className="rounded-card border border-outline-soft bg-white p-4 text-left"><div className="font-mono text-[25px] font-semibold text-brand">{metric.value}</div><div className="mt-1 text-[12px] text-ink-muted">{metric.label}</div></button>)}
            </div>
            {counts.error || appointments.error ? <div role="alert" className="mt-3 rounded-card bg-white p-3 text-sm text-danger">Some counts could not be read. <Button variant="ghost" onClick={() => { counts.reload(); appointments.reload(); }}>Try again</Button></div> : null}
            <p className="mt-3 text-xs leading-relaxed text-ink-muted">These are the records currently saved on this device. Other devices' changes arrive when it syncs.</p>
          </section>
        ) : null}
      </div>
    </div>
  );
};
