import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ActionMenu } from '@/ui';
import { useAuthorizationContext } from '@/session';
import { SaveStatus } from './settings/SettingsLayout';
import { activeSettingsPage, moduleSettingsFor, type ModuleSettingsId } from './moduleSettings';

/** The module header's Settings control. Absent for people with nothing to configure here. */
export const ModuleSettingsMenu = ({ module }: { module: ModuleSettingsId }) => {
  const navigate = useNavigate();
  const settings = moduleSettingsFor(module, useAuthorizationContext());
  if (!settings.pages.length) return null;
  return <ActionMenu label="Settings" title={`${settings.label} settings`} actions={settings.pages.map((p) => ({ label: p.label, onSelect: () => navigate(p.to) }))} />;
};

/**
 * A module's configuration pages. The module stays selected in navigation;
 * the way back to its daily work is always at the top. Saving behaves as in
 * global Settings: online only, in the name of the person signed in.
 */
export const ModuleSettingsLayout = ({ module }: { module: ModuleSettingsId }) => {
  const { pathname } = useLocation();
  const settings = moduleSettingsFor(module, useAuthorizationContext());
  const tabs = settings.pages.filter((p) => p.tab);
  const active = activeSettingsPage(settings, pathname);
  if (!tabs.length) return <div className="px-4 py-5 md:px-8"><h1 className="text-xl font-bold">{settings.label} settings</h1><p className="mt-2 text-sm">Your role has no {settings.label.toLowerCase()} settings to manage.</p></div>;
  if (!active) return <Navigate to={tabs[0].to} replace />;
  return <div>
    <div className="space-y-3 px-4 pt-5 md:px-8">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-ink-soft"><Link className="inline-flex min-h-[44px] items-center font-bold text-brand" to={settings.home}>← {settings.label}</Link><span aria-hidden="true">›</span><span>Settings</span></nav>
      {tabs.length > 1 ? <nav aria-label={`${settings.label} settings pages`} className="flex flex-wrap gap-1 border-b border-outline-soft">{tabs.map((t) =>
        <Link key={t.key} to={t.to} aria-current={t === active ? 'page' : undefined}
          className={`min-h-[44px] rounded-t-field px-4 py-2.5 text-sm font-semibold ${t === active ? 'border-b-2 border-brand text-brand' : 'text-ink-muted hover:text-ink'}`}>{t.label}</Link>)}</nav> : null}
      <SaveStatus />
    </div>
    <Outlet />
  </div>;
};
