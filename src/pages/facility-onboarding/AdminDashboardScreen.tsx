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
  useEffect(() => { document.title = 'Settings · Geneus Health'; }, []);
  const admin = user.roles.includes('facility_admin');
  const staff = admin || context.permissions.some((permission) => ['staff:manage', 'staff:permission', 'staff:deactivate', 'roster:assign'].includes(permission));
  const fees = admin || context.permissions.includes('fee_item:manage');
  const units = admin || context.permissions.includes('unit:manage');
  const devices = admin || context.permissions.some((permission) => ['device:enroll', 'device:revoke'].includes(permission));
  const registers = admin || context.permissions.includes('register_definition:publish');
  return <div className="mx-auto max-w-5xl space-y-5 px-4 py-5 md:px-7"><header><h1 className="text-[28px] font-extrabold">Settings</h1><p className="mt-1 text-sm text-ink-muted">{facility.name} · {facility.code}. Manage the people and services behind daily work.</p></header>
    <div className="grid items-start gap-5 lg:grid-cols-2"><div className="space-y-5"><SettingsGroup title="People & access" items={[
      ...(staff ? [{ label: 'Staff & roster', description: 'Staff profiles, combined duties, permissions and planned shifts.', to: '/admin/staff', icon: 'patients' as const }] : []),
      ...(devices ? [{ label: 'Facility devices', description: 'Enrollment, recent server contact and revocation.', to: '/admin/devices', icon: 'lock' as const }] : []),
    ]} /><SettingsGroup title="Care & recording" items={[
      ...(units ? [{ label: 'Units & rooms', description: 'Places patients can be sent, with instructions.', to: '/admin/units', icon: 'referrals' as const }] : []),
      ...(registers ? [{ label: 'Register books', description: 'Review published books and configure new versions.', to: '/registers', icon: 'registers' as const }] : []),
    ]} /></div><div className="space-y-5"><SettingsGroup title="Fees & payments" items={fees ? [
      { label: 'Fee schedule', description: 'Prices, applicability and exemptions. Existing charges retain their original price.', to: '/billing/fees', icon: 'registers' },
      { label: 'Departments & receiving accounts', description: 'Configure provider connection and department accounts.', to: '/billing/settings', icon: 'referrals' },
    ] : []} /><SettingsGroup title="Device status" items={[{ label: 'Sync & review', description: 'Queued changes, last sync and records that need a decision.', to: '/sync', icon: 'sync' }]} /></div></div>
    {admin ? <details className="rounded-card border border-outline-soft bg-white p-5"><summary className="cursor-pointer font-bold">Administrator account recovery</summary><p className="mt-2 text-sm text-ink-muted">Set or change your recovery email when needed.</p><div className="mt-4"><RecoveryEmailCard /></div></details> : null}
    <p className="text-xs leading-relaxed text-ink-muted">One identity can hold several duties. Access changes sync to other devices; existing clinical and financial history is preserved.</p>
  </div>;
};
