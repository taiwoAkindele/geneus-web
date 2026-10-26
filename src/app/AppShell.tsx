import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Icon, Sheet } from '@/ui';
import { useAuth, useAuthorizationContext, useSession } from '@/session';
import { accessLabel } from '@/session/accessPolicy';
import { activeNavigationKey, hasAdminWorkspace, navigationFor } from './navigation';
import { AppHeader, ShiftBanner, ShiftCountdownStrip } from './AppHeader';
import { NotificationList } from './NotificationList';

/** Shared navigation stays available during daily work; the phone dock reserves room for screen actions. */
const Logo = () => (
  <div className="relative h-[34px] w-[34px] flex-none rounded-[10px] bg-brand-accent-soft">
    <div className="absolute left-1/2 top-1/2 h-[4.5px] w-[15px] -translate-x-1/2 -translate-y-1/2 rounded bg-brand" />
    <div className="absolute left-1/2 top-1/2 h-[15px] w-[4.5px] -translate-x-1/2 -translate-y-1/2 rounded bg-brand" />
  </div>
);

/**
 * Who is signed in, and the actions that belong to the person rather than to a
 * screen — signing out above all, which staff sharing a phone need on every
 * screen, not only while a shift is ending.
 */
const ProfileSheet = ({ onClose }: { onClose: () => void }) => {
  const navigate = useNavigate();
  const { user, facility, shift, access } = useSession();
  const { signOut } = useAuth();
  const context = useAuthorizationContext();

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
        {hasAdminWorkspace(context) ? (
          <button
            type="button"
            onClick={() => go('/admin')}
            className="flex items-center gap-3 rounded-[14px] border-[1.5px] border-outline-soft px-4 py-3.5 text-left text-[15px] font-semibold"
          >
            <Icon name="patients" className="h-5 w-5 text-brand" />
            Facility admin &amp; staff
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
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useSession();
  const navigation = navigationFor(useAuthorizationContext()).sort((a, b) => ['Daily work', 'Money', 'Facility'].indexOf(a.group ?? 'Daily work') - ['Daily work', 'Money', 'Facility'].indexOf(b.group ?? 'Daily work'));
  const activeKey = activeNavigationKey(navigation, pathname);
  return (
    <aside className="sticky top-0 hidden h-screen w-[92px] flex-none flex-col bg-brand px-0 py-5 text-white sm:flex lg:w-[236px] lg:px-4">
      <div className="mb-5 flex items-center justify-center gap-3 lg:justify-start lg:px-1.5">
        <Logo />
        <span className="hidden text-[17px] font-extrabold tracking-[-0.02em] lg:block">
          Geneus Health
        </span>
      </div>

      <nav aria-label="Main navigation" className="min-h-0 overflow-y-auto px-2 lg:px-0">
        {navigation.map((item, index) => {
          const active = item.key === activeKey;
          return (
            <div key={item.key}>
            {index > 0 && navigation[index - 1].group !== item.group ? <p className="mb-1 mt-5 hidden px-3 text-[10px] font-bold uppercase tracking-widest text-brand-accent-soft lg:block">{item.group}</p> : null}
            <button
              type="button"
              onClick={() => navigate(item.to)}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-0 w-full flex-col items-center gap-1 rounded-xl px-2 py-3 lg:flex-row lg:gap-3 lg:px-3 ${
                active ? 'bg-white/15' : ''
              }`}
            >
              <Icon
                name={item.icon}
                className={`h-[22px] w-[22px] ${active ? 'text-brand-accent-soft' : 'text-white/80'}`}
              />
              <span
                className={`text-[10px] lg:whitespace-nowrap lg:text-sm ${
                  active ? 'font-bold text-white' : 'font-semibold text-brand-on-dark'
                }`}
              >
                {item.label}
              </span>
            </button>
            </div>
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
  const { pathname } = useLocation();
  const navigation = navigationFor(useAuthorizationContext());
  const activeKey = activeNavigationKey(navigation, pathname);
  const go = (to: string) => { onClose(); navigate(to); };
  return <Sheet title="More" eyebrow="All your work" onClose={onClose}>
    <div className="space-y-5">{(['Daily work', 'Money', 'Facility'] as const).map((group) => {
      const items = navigation.filter((item) => item.group === group);
      return items.length ? <section key={group} aria-label={group}><h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-muted">{group}</h3><div className="divide-y divide-outline-soft rounded-card border border-outline-soft">{items.map((item) => <button key={item.key} type="button" aria-current={item.key === activeKey ? 'page' : undefined} onClick={() => go(item.to)} className="flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left font-semibold text-brand"><Icon name={item.icon} className="h-5 w-5" /><span className="flex-1">{item.label}</span><Icon name="chevron" className="h-4 w-4" /></button>)}</div></section> : null;
    })}<div className="border-t border-outline-soft pt-3"><button type="button" onClick={() => { onClose(); onAlerts(); }} className="flex min-h-[52px] w-full items-center gap-3 text-left font-semibold"><Icon name="bell" />Notifications{unread ? ' · ' + unread + ' unread' : ''}</button><button type="button" onClick={() => go('/sync')} className="flex min-h-[52px] w-full items-center gap-3 text-left font-semibold"><Icon name="sync" />Sync &amp; review</button></div></div>
  </Sheet>;
};

const BottomBar = ({ onMore, onProfile }: { onMore: () => void; onProfile: () => void }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const navigation = navigationFor(useAuthorizationContext());
  const activeKey = activeNavigationKey(navigation, pathname);
  const primary = navigation.filter((item) => item.bottom);
  const moreActive = Boolean(activeKey && !primary.some((item) => item.key === activeKey));
  return <nav aria-label="Main navigation" className="flex items-stretch justify-around border-t border-outline-soft bg-white px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 sm:hidden">
    {primary.map((item) => <button key={item.key} type="button" onClick={() => navigate(item.to)} aria-current={item.key === activeKey ? 'page' : undefined} className="flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-brand"><Icon name={item.icon} className={item.key === activeKey ? 'h-[22px] w-[22px] text-brand' : 'h-[22px] w-[22px] text-ink-muted'} /><span className={item.key === activeKey ? 'text-[11px] font-bold text-brand' : 'text-[11px] font-semibold text-ink-muted'}>{item.label}</span></button>)}
    <button type="button" onClick={onMore} aria-label="More navigation" aria-haspopup="dialog" className="flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1"><Icon name="more" className={moreActive ? 'h-[22px] w-[22px] text-brand' : 'h-[22px] w-[22px] text-ink-muted'} /><span className={moreActive ? 'text-[11px] font-bold text-brand' : 'text-[11px] font-semibold text-ink-muted'}>More</span></button>
    <button type="button" onClick={onProfile} aria-label="Your profile and sign out" aria-haspopup="dialog" className="flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1"><Icon name="lock" className="h-[22px] w-[22px] text-ink-muted" /><span className="text-[11px] font-semibold text-ink-muted">Account</span></button>
  </nav>;
};

const MobileNotificationSheet = ({ onClose }: { onClose: () => void }) => {
  const { notifications, notificationsLoading, notificationsError } = useSession();
  return <Sheet title="Notifications" onClose={onClose}><NotificationList notifications={notifications} loading={notificationsLoading} error={notificationsError} onDone={onClose} /></Sheet>;
};

export const AppShell = () => {
  const { pathname } = useLocation();
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
      <div className="flex min-h-screen min-w-0 flex-1 flex-col [--app-header-h:52px] sm:[--app-header-h:46px]">
        <AppHeader />
        <ShiftBanner />
        <Content id="main-content" tabIndex={-1} className={`flex-1 outline-none ${ending ? 'pb-44' : 'pb-28'} sm:pb-0`}>
          <Outlet />
        </Content>
        <div className="fixed inset-x-0 bottom-0 z-30 sm:hidden">
          <ShiftCountdownStrip />
          <BottomBar onMore={() => setMoreOpen(true)} onProfile={() => setProfileOpen(true)} />
        </div>
      </div>
      {alertsOpen ? <MobileNotificationSheet onClose={() => setAlertsOpen(false)} /> : null}
      {profileOpen ? <ProfileSheet onClose={() => setProfileOpen(false)} /> : null}
      {moreOpen ? <MoreSheet onClose={() => setMoreOpen(false)} onAlerts={openAlerts} unread={unreadCount} /> : null}
    </div>
  );
};
