import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
const CareContext=lazy(()=>import('@/features/workforce/CareContext').then((m)=>({default:m.CareContext})));
import { Avatar, Icon, Sheet } from '@/ui';
import { useAuth, useSession } from '@/session';
import { accessLabel } from '@/session/accessPolicy';
import { activeWorkspaceLink, workspacePath, type WorkspaceId } from './workspaces';
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

const Sidebar = ({ onProfile }: { onProfile: () => void }) => {
  const { pathname, search } = useLocation();
  const { user } = useSession();
  const { current } = useWorkspace();
  if (!current) return null;
  const activeKey = activeWorkspaceLink(current, pathname, search);
  const overview = pathname === workspacePath(current.id);
  return (
    <aside className="sticky top-0 hidden h-screen w-[232px] flex-none flex-col bg-brand px-3 py-5 text-white lg:flex">
      <Link to="/home" className="mb-7 flex min-h-11 items-center gap-2 rounded-field px-3 text-sm font-semibold text-brand-on-dark hover:bg-white/10"><Icon name="back" className="h-5 w-5" />All modules</Link>
      <div className="mb-5 flex items-center gap-3 px-3"><Icon name={current.icon} className="h-6 w-6 text-brand-accent-soft" /><h2 className="text-lg font-extrabold">{current.label}</h2></div>
      <nav aria-label={`${current.label} navigation`} className="min-h-0 space-y-1 overflow-y-auto">
        <Link to={workspacePath(current.id)} aria-current={overview ? 'page' : undefined} className={`flex min-h-[52px] items-center gap-3 rounded-field px-3 text-sm font-semibold ${overview ? 'bg-white/15 text-white' : 'text-brand-on-dark hover:bg-white/10'}`}><Icon name="home" className="h-5 w-5" />Overview</Link>
        {current.links.map((item) => {
          const active = item.key === activeKey;
          return (
            <Link
              key={item.key}
              to={item.to}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-[52px] w-full items-center gap-3 rounded-field px-3 py-3 text-sm ${active ? 'bg-white/15 font-bold text-white' : 'font-semibold text-brand-on-dark hover:bg-white/10'}`}
            >
              <Icon name={item.icon} className={`h-5 w-5 ${active ? 'text-brand-accent-soft' : 'text-white/80'}`} /><span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Signed-in staff — opens the profile actions, including signing out. */}
      <button
        type="button"
        onClick={onProfile}
        aria-label="Your profile and sign out"
        className="mt-auto flex w-full shrink-0 items-center gap-2.5 rounded-[13px] bg-white/10 p-3 text-left"
      >
        <Avatar tone="mint" size="sm">
          {user.initials}
        </Avatar>
        <div className="hidden min-w-0 flex-1 lg:block">
          <div className="truncate text-[13px] font-bold">{user.name}</div>
          <div className="text-[11px] text-brand-accent-soft">{user.role}</div>
        </div>
      </button>
    </aside>
  );
};

const MoreSheet = ({ onClose, onAlerts, unread }: { onClose: () => void; onAlerts: () => void; unread: number }) => {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const { current } = useWorkspace();
  const activeKey = current ? activeWorkspaceLink(current, pathname, search) : undefined;
  const go = (to: string) => { onClose(); navigate(to); };
  return <Sheet title={current?.label ?? 'More'} eyebrow="Workspace navigation" onClose={onClose}>
    <div className="divide-y divide-outline-soft">{current?.links.map((item) => <button key={item.key} type="button" aria-current={item.key === activeKey ? 'page' : undefined} onClick={() => go(item.to)} className="flex min-h-[56px] w-full items-center gap-3 py-3 text-left font-semibold text-brand"><Icon name={item.icon} className="h-5 w-5" /><span className="flex-1">{item.label}</span><Icon name="chevron" className="h-4 w-4" /></button>)}</div>
    <div className="mt-4 border-t border-outline-soft pt-3"><button type="button" onClick={() => go('/home')} className="flex min-h-[52px] w-full items-center gap-3 text-left font-semibold"><Icon name="modules" />All modules</button><button type="button" onClick={() => { onClose(); onAlerts(); }} className="flex min-h-[52px] w-full items-center gap-3 text-left font-semibold"><Icon name="bell" />Notifications{unread ? ' · ' + unread + ' unread' : ''}</button><button type="button" onClick={() => go('/sync')} className="flex min-h-[52px] w-full items-center gap-3 text-left font-semibold"><Icon name="sync" />Sync &amp; review</button></div>
  </Sheet>;
};

const BottomBar = ({ onMore }: { onMore: () => void }) => {
  const { pathname, search } = useLocation();
  const { current } = useWorkspace();
  if (!current) return null;
  const activeKey = activeWorkspaceLink(current, pathname, search);
  const primary = current.links.slice(0, 1);
  const moreActive = Boolean(activeKey && !primary.some((item) => item.key === activeKey));
  return <nav aria-label={`${current.label} mobile navigation`} className="flex items-stretch justify-around border-t border-outline-soft bg-white px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 lg:hidden">
    <Link to="/home" className="flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-ink-muted"><Icon name="modules" className="h-[22px] w-[22px]" /><span className="text-[11px] font-semibold">All modules</span></Link>
    <Link to={workspacePath(current.id)} aria-current={pathname === workspacePath(current.id) ? 'page' : undefined} className="flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-brand"><Icon name={current.icon} className="h-[22px] w-[22px]" /><span className="text-[11px] font-semibold">Overview</span></Link>
    {primary.map((item) => <Link key={item.key} to={item.to} aria-current={item.key === activeKey ? 'page' : undefined} className="flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-brand"><Icon name={item.icon} className={item.key === activeKey ? 'h-[22px] w-[22px] text-brand' : 'h-[22px] w-[22px] text-ink-muted'} /><span className={item.key === activeKey ? 'text-[11px] font-bold text-brand' : 'text-[11px] font-semibold text-ink-muted'}>{item.label === 'Consultation & nursing' ? 'Visits' : item.label === 'Patient accounts' ? 'Accounts' : item.label}</span></Link>)}
    <button type="button" onClick={onMore} aria-label="More navigation" aria-haspopup="dialog" className="flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1"><Icon name="more" className={moreActive ? 'h-[22px] w-[22px] text-brand' : 'h-[22px] w-[22px] text-ink-muted'} /><span className={moreActive ? 'text-[11px] font-bold text-brand' : 'text-[11px] font-semibold text-ink-muted'}>More</span></button>
  </nav>;
};

const MobileNotificationSheet = ({ onClose }: { onClose: () => void }) => {
  const { notifications, notificationsLoading, notificationsError } = useSession();
  return <Sheet title="Notifications" onClose={onClose}><NotificationList notifications={notifications} loading={notificationsLoading} error={notificationsError} onDone={onClose} /></Sheet>;
};

export const AppShell = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { current, available } = useWorkspace();
  const home = pathname === '/home';
  // The billing workspace already owns its main landmark.
  const Content = pathname === '/billing' || pathname === '/billing/settings' ? 'div' : 'main';
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }); }, [pathname]);
  const { unreadCount, markAllRead, shift } = useSession();
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
      <Sidebar onProfile={() => setProfileOpen(true)} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col [--app-header-h:64px]">
        <AppHeader onProfile={() => setProfileOpen(true)} />
        {!home ? <div className="flex min-h-[56px] flex-wrap items-center justify-between gap-2 border-b border-outline-soft bg-white px-4 py-2 md:px-6"><Link to="/home" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-brand"><Icon name="modules" className="h-4 w-4" />All modules</Link><label className="flex min-w-0 items-center gap-2"><span className="sr-only">Switch module</span><select aria-label="Switch module" value={current?.id ?? ''} onChange={(event) => navigate(workspacePath(event.target.value as WorkspaceId))} className="min-h-11 w-[164px] max-w-[48vw] rounded-field border border-outline-soft bg-surface px-3 py-2 text-base font-semibold text-brand sm:w-auto sm:max-w-[220px] sm:text-sm"><option value="" disabled>Choose module</option>{available.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.label}</option>)}</select></label></div> : null}
        <ShiftBanner />
        <Content id="main-content" tabIndex={-1} className={`flex-1 outline-none ${current ? ending ? 'pb-44 lg:pb-0' : 'pb-24 lg:pb-0' : ''}`}>
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
