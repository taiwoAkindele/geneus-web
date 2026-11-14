import { useEffect, useState } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthorizationContext } from '@/session';
import { useSyncStatus } from '@/data';
import { CONFIGURATION_SAVE_EVENT, type ConfigurationSaveState } from '@/data/configurationSave';
import { StaffVerification } from '@/modules/insurance/StaffVerification';
import { settingsTabsFor } from './settingsTabs';

/**
 * Settings: everything a facility configures, one tab per area. Settings are
 * readable offline from this device's copy, but saved only online, in the
 * name of the person signed in, and only once the server accepts them.
 */
export const SettingsLayout = () => {
  const context = useAuthorizationContext();
  const { pathname } = useLocation();
  const tabs = settingsTabsFor(context);
  useEffect(() => { document.title = 'Settings · Geneus Health'; }, []);
  if (!tabs.length) return <main className="p-4"><h1 className="text-xl font-bold">Settings</h1><p className="mt-2 text-sm">Your role has no facility settings to manage.</p></main>;
  const active = tabs.find((t) => pathname === t.to || pathname.startsWith(t.to + '/'));
  if (!active) return <Navigate to={tabs[0].sub?.[0].to ?? tabs[0].to} replace />;
  if (active.sub && pathname === active.to) return <Navigate to={active.sub[0].to} replace />;
  return <div className="mx-auto max-w-7xl space-y-4 px-4 py-5 md:px-8">
    <header><h1 className="text-[28px] font-extrabold">Settings</h1><p className="mt-1 text-sm text-ink-muted">Facility-wide settings. You can read them offline; saving needs a connection and is confirmed by the server.</p></header>
    <nav aria-label="Settings sections" className="flex flex-wrap gap-1 border-b border-outline-soft">{tabs.map((t) =>
      <Link key={t.key} to={t.sub?.[0].to ?? t.to} aria-current={t === active ? 'page' : undefined}
        className={`min-h-[44px] rounded-t-field px-4 py-2.5 text-sm font-semibold ${t === active ? 'border-b-2 border-brand text-brand' : 'text-ink-muted hover:text-ink'}`}>{t.label}</Link>)}</nav>
    {active.sub ? <nav aria-label={`${active.label} sections`} className="flex flex-wrap gap-2">{active.sub.map((s) =>
      <Link key={s.key} to={s.to} aria-current={pathname.startsWith(s.to) ? 'page' : undefined}
        className={`min-h-[40px] rounded-full px-4 py-2 text-sm font-semibold ${pathname.startsWith(s.to) ? 'bg-brand-wash text-brand' : 'text-ink-muted hover:text-ink'}`}>{s.label}</Link>)}</nav> : null}
    <SaveStatus />
    <Outlet />
  </div>;
};

/** Connection, identity and save state, so nobody wonders whether a setting was saved. */
const SaveStatus = () => {
  const sync = useSyncStatus();
  const [state, setState] = useState<ConfigurationSaveState>();
  useEffect(() => {
    const on = (event: Event) => setState((event as CustomEvent<ConfigurationSaveState>).detail);
    window.addEventListener(CONFIGURATION_SAVE_EVENT, on);
    return () => window.removeEventListener(CONFIGURATION_SAVE_EVENT, on);
  }, []);
  useEffect(() => { if (state?.phase === 'arrived' && !state.message) { const t = window.setTimeout(() => setState(undefined), 4000); return () => window.clearTimeout(t); } }, [state]);
  const online = sync.connected || (typeof navigator !== 'undefined' && navigator.onLine);
  return <div className="space-y-2">
    {!online ? <p role="status" className="rounded-field border border-amber-border bg-amber-bg p-3 text-sm">You are offline. Settings below are this device's last synced copy; saving needs a connection.</p> : <StaffVerification purpose="Changing settings" />}
    {state ? <p role="status" data-testid="settings-save-state" className={`rounded-field border p-3 text-sm ${state.phase === 'refused' ? 'border-danger bg-danger-bg text-danger' : 'border-outline-soft bg-surface'}`}>
      {state.phase === 'saving' ? 'Saving on the server…' : state.phase === 'confirmed' ? 'Saved by the server. Updating this device…' : state.phase === 'arrived' ? state.message ?? 'Saved and up to date on this device.' : state.message ?? 'Not saved.'}
    </p> : null}
  </div>;
};
