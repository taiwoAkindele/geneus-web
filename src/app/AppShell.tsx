import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Icon, Sheet } from '@/ui';
import { useAuth, useAuthorizationContext, useSession } from '@/session';
import { accessLabel } from '@/session/accessPolicy';
import { hasAdminWorkspace, navigationFor } from './navigation';
import { AppHeader, ShiftBanner, ShiftCountdownStrip } from './AppHeader';
import { NotificationList } from './NotificationList';

/** Shared navigation stays available during daily work; the phone dock reserves room for screen actions. */
const Logo = () => (
  <div className="relative h-[34px] w-[34px] flex-none rounded-[10px] bg-brand-accent-soft">
    <div className="absolute left-1/2 top-1/2 h-[4.5px] w-[15px] -translate-x-1/2 -translate-y-1/2 rounded bg-brand" />
    <div className="absolute left-1/2 top-1/2 h-[15px] w-[4.5px] -translate-x-1/2 -translate-y-1/2 rounded bg-brand" />
  </div>
);

const isActive = (pathname: string, match: string) =>
  pathname === match || pathname.startsWith(`${match}/`);

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
            {shift ? `Shift ${shift.label} · ${shift.ended ? 'ended' : 'ends'} ${shift.endsAtLabel} · sign-out is manual` : access === 'admin' ? 'Admin access · signs out after 30 minutes idle' : `${accessLabel(access)} · sign out when finished`}
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
  const navigation = navigationFor(useAuthorizationContext());
  return (
    <aside className="sticky top-0 hidden h-screen w-[92px] flex-none flex-col bg-brand px-0 py-5 text-white sm:flex lg:w-[236px] lg:px-4">
      <div className="mb-5 flex items-center justify-center gap-3 lg:justify-start lg:px-1.5">
        <Logo />
        <span className="hidden text-[17px] font-extrabold tracking-[-0.02em] lg:block">
          Geneus Health
        </span>
      </div>

      <nav className="flex flex-col gap-1 px-2 lg:px-0">
        {navigation.map((item) => {
          const active = isActive(pathname, item.match);
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => navigate(item.to)}
              className={`flex min-h-0 flex-col items-center gap-1 rounded-xl px-2 py-3 lg:flex-row lg:gap-3 lg:px-3 ${
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
          );
        })}
      </nav>

      {/* Signed-in staff — opens the profile actions, including signing out. */}
      <button
        type="button"
        onClick={onProfile}
        className="mt-auto flex w-full items-center gap-2.5 rounded-[13px] bg-white/10 p-3 text-left"
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

const BottomBar = ({
  onAlerts,
  onProfile,
  unread,
}: {
  onAlerts: () => void;
  onProfile: () => void;
  unread: number;
}) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useSession();
  const navigation = navigationFor(useAuthorizationContext());
  return (
    <nav aria-label="Main navigation" className="flex items-center justify-around border-t border-outline-soft bg-white px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 sm:hidden">
      {navigation.filter((n) => n.bottom).map((item) => {
        const active = isActive(pathname, item.match);
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => navigate(item.to)}
            className="flex min-h-[52px] flex-col items-center justify-center gap-1"
          >
            <Icon name={item.icon} className={`h-[22px] w-[22px] ${active ? 'text-brand' : 'text-ink-muted'}`} />
            <span
              className={`text-[11px] ${active ? 'font-bold text-brand' : 'font-semibold text-ink-muted'}`}
            >
              {item.label}
            </span>
          </button>
        );
      })}
      {/* Notifications live in the bottom nav on phones (no top header here). */}
      <button
        type="button"
        onClick={onAlerts}
        className="flex min-h-[52px] flex-col items-center justify-center gap-1"
        aria-label={`Alerts${unread ? `, ${unread} unread` : ''}`}
      >
        <span className="relative">
          <Icon name="bell" className="h-[22px] w-[22px] text-ink-muted" />
          {unread > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 font-mono text-[10px] font-bold leading-none text-white">
              {unread}
            </span>
          ) : null}
        </span>
        <span className="text-[11px] font-semibold text-ink-muted">Alerts</span>
      </button>
      {/* The only way to sign out on a phone — no top header here. */}
      <button
        type="button"
        onClick={onProfile}
        className="flex min-h-[52px] flex-col items-center justify-center gap-1"
        aria-label="Your profile and sign out"
      >
        <Avatar tone="mint" size="sm">
          {user.initials}
        </Avatar>
        <span className="text-[11px] font-semibold text-ink-muted">You</span>
      </button>
    </nav>
  );
};

const MobileNotificationSheet = ({ onClose }: { onClose: () => void }) => {
  const { notifications, notificationsLoading, notificationsError } = useSession();
  return <Sheet title="Notifications" onClose={onClose}><NotificationList notifications={notifications} loading={notificationsLoading} error={notificationsError} onDone={onClose} /></Sheet>;
};

export const AppShell = () => {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }); }, [pathname]);
  const { unreadCount, markAllRead, shift } = useSession();
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // Reserve space for the fixed dock, including a shift warning when one is due.
  const ending = Boolean(shift && shift.minutesLeft <= 30);

  const openAlerts = () => {
    markAllRead();
    setAlertsOpen(true);
  };

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar onProfile={() => setProfileOpen(true)} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col [--app-header-h:0px] sm:[--app-header-h:46px]">
        <AppHeader />
        <ShiftBanner />
        <div className={`flex-1 ${ending ? 'pb-44' : 'pb-28'} sm:pb-0`}>
          <Outlet />
        </div>
        <div className="fixed inset-x-0 bottom-0 z-30 sm:hidden">
          <ShiftCountdownStrip />
          <BottomBar onAlerts={openAlerts} onProfile={() => setProfileOpen(true)} unread={unreadCount} />
        </div>
      </div>
      {alertsOpen ? <MobileNotificationSheet onClose={() => setAlertsOpen(false)} /> : null}
      {profileOpen ? <ProfileSheet onClose={() => setProfileOpen(false)} /> : null}
    </div>
  );
};
