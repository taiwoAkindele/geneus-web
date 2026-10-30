import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '@/ui';
import { useAuthorizationContext, useSession } from '@/session';
import { RecoveryEmailCard } from './RecoveryEmailCard';

type Setting = { label: string; description: string; to: string; icon: IconName };
const SettingsGroup = ({ title, items }: { title: string; items: Setting[] }) => items.length ? <section aria-label={title} className="overflow-hidden rounded-card border border-outline-soft bg-white"><h2 className="border-b border-outline-soft px-5 py-4 text-lg font-extrabold">{title}</h2><ul className="divide-y divide-outline-soft">{items.map((item) => <li key={item.to}><Link to={item.to} className="flex min-h-[84px] items-center gap-4 px-5 py-4 hover:bg-brand-wash"><Icon name={item.icon} className="h-5 w-5 text-brand" /><span className="min-w-0 flex-1"><span className="block font-bold">{item.label}</span><span className="mt-1 block text-sm text-ink-muted">{item.description}</span></span><Icon name="chevron" className="h-4 w-4 text-ink-muted" /></Link></li>)}</ul></section> : null;

export const AdminDashboardScreen = () => {
  const { user, facility } = useSession();
  const context = useAuthorizationContext();
  useEffect(() => { document.title = 'Administration · Geneus Health'; }, []);
  const admin = user.roles.includes('facility_admin');
  const staff = admin || context.permissions.some((permission) => ['staff:manage', 'staff:permission', 'staff:deactivate', 'roster:assign'].includes(permission));
  const devices = admin || context.permissions.some((permission) => ['device:enroll', 'device:revoke'].includes(permission));
  return <div className="mx-auto max-w-5xl space-y-5 px-4 py-5 md:px-7"><header><h1 className="text-[28px] font-extrabold">Administration</h1><p className="mt-1 text-sm text-ink-muted">{facility.name} · {facility.code}. Manage user access, devices and account settings.</p></header>
    <div className="grid items-start gap-5 lg:grid-cols-2"><div className="space-y-5"><SettingsGroup title="People & access" items={[
      ...(staff ? [{ label: 'User access', description: 'Open staff profiles to manage sign-in duties and permissions.', to: '/admin/staff?workspace=administration', icon: 'patients' as const }] : []),
      ...(devices ? [{ label: 'Facility devices', description: 'Enrollment, recent server contact and revocation.', to: '/admin/devices', icon: 'lock' as const }] : []),
    ]} /></div><div className="space-y-5"><SettingsGroup title="Device status" items={[{ label: 'Sync & review', description: 'Queued changes, last sync and records that need a decision.', to: '/sync', icon: 'sync' }]} /></div></div>
    {admin ? <details className="rounded-card border border-outline-soft bg-white p-5"><summary className="cursor-pointer font-bold">Administrator account recovery</summary><p className="mt-2 text-sm text-ink-muted">Set or change your recovery email when needed.</p><div className="mt-4"><RecoveryEmailCard /></div></details> : null}
    <p className="text-xs leading-relaxed text-ink-muted">One identity can hold several duties. Access changes sync to other devices; existing clinical and financial history is preserved.</p>
  </div>;
};
