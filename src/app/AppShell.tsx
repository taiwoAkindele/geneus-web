import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
const CareContext=lazy(()=>import('@/modules/operations/workforce/CareContext').then((m)=>({default:m.CareContext})));
import { Avatar, Icon, Sheet } from '@/ui';
import { useAuth, useAuthorizationContext, useSession } from '@/session';
import { accessLabel } from '@/session/accessPolicy';
import { rememberPlace } from '@/session/lastPlace';
import { activeWorkspaceLink, rememberWorkspace, type WorkspaceId } from './workspaces';
import { useWorkspace } from './useWorkspace';
import { AppHeader, ShiftBanner, ShiftCountdownStrip } from './AppHeader';
import { NotificationList } from './NotificationList';

/**
 * Who is signed in, and the actions that belong to the person rather than to a
 * screen — signing out above all, which staff sharing a phone need on every
 * screen, not only while a shift is ending.
 */
const ProfileSheet = ({ onClose }: { onClose: () => void }) => {
  const navigate = useNavigate();
  const { user, facility, shift, access } = useSession();
  const { signOut } = useAuth();
  const { available } = useWorkspace();

  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  return (
    <Sheet onClose={onClose} eyebrow={`${facility.name} · ${facility.code}`} title={user.name}>
      <div className="flex items-center gap-3">
        <Avatar tone="mint">{user.initials}</Avatar>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold">{user.role}</div>
          <div className="text-[13px] text-ink-muted">
            {shift ? `Shift ${shift.label} · ${shift.ended ? 'ended' : 'ends'} ${shift.endsAtLabel}` : accessLabel(access)} · signs out after 30 minutes idle
            {user.canWrite ? '' : ' · read only'}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <button type="button" className="min-h-[44px] rounded-field border border-outline-soft px-4 py-3 text-left font-bold" onClick={() => go('/profile')}>My profile and email</button>
        <button type="button" className="min-h-[44px] rounded-field border border-outline-soft px-4 py-3 text-left font-bold" onClick={() => go('/facilities')}>Switch facility</button>
        {available.some((workspace) => workspace.id === 'administration') ? (
          <button
            type="button"
            onClick={() => go('/admin')}
            className="flex items-center gap-3 rounded-[14px] border-[1.5px] border-outline-soft px-4 py-3.5 text-left text-[15px] font-semibold"
          >
            <Icon name="patients" className="h-5 w-5 text-brand" />
            Administration
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => go('/sync')}
          className="flex items-center gap-3 rounded-[14px] border-[1.5px] border-outline-soft px-4 py-3.5 text-left text-[15px] font-semibold"
        >
          <Icon name="sync" className="h-5 w-5 text-brand" />
          Sync &amp; device
        </button>
        <button
          type="button"
          onClick={signOut}
          className="flex items-center gap-3 rounded-[14px] border-[1.5px] border-danger-bg bg-danger-bg px-4 py-3.5 text-left text-[15px] font-bold text-danger-strong"
        >
          <Icon name="lock" className="h-5 w-5" />
          Sign out
        </button>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-muted">
        Signing out never waits for the network — anything not yet synced stays safely on this device.
      </p>
    </Sheet>
  );
};

/**
 * Home and every module this person can use, each opening to its pages. One
 * module is open at a time; the module of the current page opens on its own.
 * A one-page module goes straight to that page. Shared on the desktop sidebar
 * (dark) and the phone More sheet (light).
 */
const ModuleNav = ({ tone, onNavigate }: { tone: 'dark' | 'light'; onNavigate?: () => void }) => {
  const { pathname, search } = useLocation();
  const { available, current } = useWorkspace();
  const context = useAuthorizationContext();
  const [open, setOpen] = useState<string | undefined>(current?.id);
  useEffect(() => { if (current) setOpen(current.id); }, [current?.id]);
  const dark = tone === 'dark';
  const row = (active: boolean) => `flex min-h-[48px] w-full items-center gap-3 rounded-field px-3 py-2.5 text-left text-sm ${dark ? active ? 'bg-white/15 font-bold text-white' : 'font-semibold text-brand-on-dark hover:bg-white/10' : active ? 'bg-brand-wash font-bold text-brand' : 'font-semibold text-ink hover:bg-surface'}`;
  const iconTone = (active: boolean) => `h-5 w-5 shrink-0 ${dark ? active ? 'text-brand-accent-soft' : 'text-white/80' : 'text-brand'}`;
  // Choosing a page inside a module keeps that module current, including pages several modules share.
  const enter = (id: WorkspaceId) => { rememberWorkspace(context.facilityId, context.userId, id); onNavigate?.(); };
  return <nav aria-label="Modules" className="space-y-1">
    <Link to="/home" onClick={onNavigate} aria-current={pathname === '/home' ? 'page' : undefined} className={row(pathname === '/home')}><Icon name="home" className={iconTone(pathname === '/home')} /><span>Home</span></Link>
    {available.map((workspace) => {
      const here = current?.id === workspace.id;
      const activeKey = here ? activeWorkspaceLink(workspace, pathname, search) : undefined;
      if (workspace.links.length === 1) {
        const only = workspace.links[0];
        return <Link key={workspace.id} to={only.to} onClick={() => enter(workspace.id)} aria-current={activeKey ? 'page' : undefined} className={row(Boolean(activeKey))}><Icon name={workspace.icon} className={iconTone(Boolean(activeKey))} /><span className="flex-1">{workspace.label}</span></Link>;
      }
      const expanded = open === workspace.id;
      const panel = `module-pages-${workspace.id}`;
      return <div key={workspace.id}>
        <button type="button" aria-expanded={expanded} aria-controls={panel} onClick={() => setOpen(expanded ? undefined : workspace.id)} className={row(here && !expanded)}>
          <Icon name={workspace.icon} className={iconTone(here)} /><span className="flex-1">{workspace.label}</span><Icon name="chevron" className={`h-4 w-4 transition-transform motion-reduce:transition-none ${expanded ? 'rotate-90' : ''}`} />
        </button>
        {expanded ? <ul id={panel} className={`mb-1 mt-0.5 space-y-0.5 border-l ${dark ? 'border-white/20' : 'border-outline-soft'} ml-5 pl-2`}>{workspace.links.map((item) => {
          const active = item.key === activeKey;
          return <li key={item.key}><Link to={item.to} onClick={() => enter(workspace.id)} aria-current={active ? 'page' : undefined} className={row(active)}><Icon name={item.icon} className={iconTone(active)} /><span>{item.label}</span></Link></li>;
        })}</ul> : null}
      </div>;
    })}
  </nav>;
};

/** Desktop navigation on every page. Profile and sign-out live in the top bar. */
const Sidebar = () => <aside className="sticky top-0 hidden h-screen w-[248px] flex-none flex-col overflow-y-auto bg-brand px-3 py-5 text-white lg:flex"><ModuleNav tone="dark" /></aside>;

const MoreSheet = ({ onClose, onAlerts, unread }: { onClose: () => void; onAlerts: () => void; unread: number }) => {
  const navigate = useNavigate();
  const go = (to: string) => { onClose(); navigate(to); };
  return <Sheet title="Menu" eyebrow="Modules and pages" onClose={onClose}>
    <ModuleNav tone="light" onNavigate={onClose} />
    <div className="mt-4 border-t border-outline-soft pt-3"><button type="button" onClick={() => { onClose(); onAlerts(); }} className="flex min-h-[52px] w-full items-center gap-3 text-left font-semibold"><Icon name="bell" />Notifications{unread ? ' · ' + unread + ' unread' : ''}</button><button type="button" onClick={() => go('/sync')} className="flex min-h-[52px] w-full items-center gap-3 text-left font-semibold"><Icon name="sync" />Sync &amp; review</button></div>
  </Sheet>;
};

const BottomBar = ({ onMore }: { onMore: () => void }) => {
  const { pathname, search } = useLocation();
  const { current } = useWorkspace();
  const activeKey = current ? activeWorkspaceLink(current, pathname, search) : undefined;
  // Home, the current module's two main pages, then More for everything else.
  const primary = current?.links.slice(0, 2) ?? [];
  const moreActive = Boolean(activeKey && !primary.some((item) => item.key === activeKey));
  return <nav aria-label={`${current?.label ?? 'App'} mobile navigation`} className="flex items-stretch justify-around border-t border-outline-soft bg-white px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 lg:hidden">
    <Link to="/home" aria-current={pathname === '/home' ? 'page' : undefined} className="flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-ink-muted"><Icon name="home" className={pathname === '/home' ? 'h-[22px] w-[22px] text-brand' : 'h-[22px] w-[22px]'} /><span className={pathname === '/home' ? 'text-[11px] font-bold text-brand' : 'text-[11px] font-semibold'}>Home</span></Link>
    {primary.map((item) => <Link key={item.key} to={item.to} aria-current={item.key === activeKey ? 'page' : undefined} className="flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-brand"><Icon name={item.icon} className={item.key === activeKey ? 'h-[22px] w-[22px] text-brand' : 'h-[22px] w-[22px] text-ink-muted'} /><span className={item.key === activeKey ? 'text-[11px] font-bold text-brand' : 'text-[11px] font-semibold text-ink-muted'}>{item.label === 'Patient accounts' ? 'Accounts' : item.label === 'Appointments & arrivals' ? 'Appointments' : item.label}</span></Link>)}
    <button type="button" onClick={onMore} aria-label="More navigation" aria-haspopup="dialog" className="flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1"><Icon name="more" className={moreActive ? 'h-[22px] w-[22px] text-brand' : 'h-[22px] w-[22px] text-ink-muted'} /><span className={moreActive ? 'text-[11px] font-bold text-brand' : 'text-[11px] font-semibold text-ink-muted'}>More</span></button>
  </nav>;
};

const MobileNotificationSheet = ({ onClose }: { onClose: () => void }) => {
  const { notifications, notificationsLoading, notificationsError } = useSession();
  return <Sheet title="Notifications" onClose={onClose}><NotificationList notifications={notifications} loading={notificationsLoading} error={notificationsError} onDone={onClose} /></Sheet>;
};

export const AppShell = () => {
  const { pathname } = useLocation();
  const { current } = useWorkspace();
  // The billing workspace already owns its main landmark.
  const Content = pathname === '/billing' || pathname === '/billing/settings' ? 'div' : 'main';
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }); }, [pathname]);
  const { unreadCount, markAllRead, shift, user, facility } = useSession();
  const { search } = useLocation();
  useEffect(() => { rememberPlace(user.staffId, facility.code, pathname + search); }, [user.staffId, facility.code, pathname, search]);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // Reserve space for the fixed dock, including a shift warning when one is due.
  const ending = Boolean(shift && shift.minutesLeft <= 30);

  const openAlerts = () => {
    markAllRead();
    setAlertsOpen(true);
  };

  return (
    <div className="flex min-h-screen bg-surface">
      <a href="#main-content" className="sr-only z-50 rounded-field bg-white p-3 font-bold text-brand focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to content</a>
      <Sidebar />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col [--app-header-h:64px]">
        <AppHeader onProfile={() => setProfileOpen(true)} />
        <ShiftBanner />
        <Content id="main-content" tabIndex={-1} className={`flex-1 outline-none ${current && ending ? 'pb-44 lg:pb-0' : 'pb-24 lg:pb-0'}`}>
          {current?.id === 'clinical' ? <Suspense fallback={null}><CareContext/></Suspense> : null}
          <Outlet />
        </Content>
        <div className="fixed inset-x-0 bottom-0 z-30 lg:hidden">
          {current ? <ShiftCountdownStrip /> : null}
          <BottomBar onMore={() => setMoreOpen(true)} />
        </div>
      </div>
      {alertsOpen ? <MobileNotificationSheet onClose={() => setAlertsOpen(false)} /> : null}
      {profileOpen ? <ProfileSheet onClose={() => setProfileOpen(false)} /> : null}
      {moreOpen ? <MoreSheet onClose={() => setMoreOpen(false)} onAlerts={openAlerts} unread={unreadCount} /> : null}
    </div>
  );
};
