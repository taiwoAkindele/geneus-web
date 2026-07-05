import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Icon, type IconName } from '@/ui';
import { useSession } from '@/session';
import { AppHeader, ShiftBanner, ShiftCountdownStrip } from './AppHeader';
import { NotificationList } from './NotificationList';

/**
 * Responsive app shell for the signed-in daily-use screens.
 *   ≤640  phone — NO top header (the design's full-height frames with pinned
 *         footers stay intact); notifications live in the bottom nav and the
 *         shift countdown sits above it. Bottom nav shows on home only.
 *   641+  the persistent AppHeader + ShiftBanner appear (they hide themselves
 *         below sm), plus the rail/sidebar. Screen AppBars stick beneath the
 *         header via the `--app-header-h` offset (0 on phone, 46px on sm+).
 */
type NavItem = { key: string; label: string; to: string; match: string; icon: IconName; bottom?: boolean };

const NAV: NavItem[] = [
  { key: 'home', label: 'Home', to: '/home', match: '/home', icon: 'home', bottom: true },
  { key: 'patients', label: 'Patients', to: '/patients/search', match: '/patients', icon: 'patients', bottom: true },
  { key: 'registers', label: 'Registers', to: '/registers/malaria', match: '/registers', icon: 'registers', bottom: true },
  { key: 'referrals', label: 'Referrals', to: '/referrals/track', match: '/referrals', icon: 'referrals' },
  { key: 'month', label: 'This month', to: '/reports/month', match: '/reports', icon: 'month' },
  { key: 'stock', label: 'Stock', to: '/stock', match: '/stock', icon: 'stock', bottom: true },
];

const Logo = () => (
  <div className="relative h-[34px] w-[34px] flex-none rounded-[10px] bg-brand-accent-soft">
    <div className="absolute left-1/2 top-1/2 h-[4.5px] w-[15px] -translate-x-1/2 -translate-y-1/2 rounded bg-brand" />
    <div className="absolute left-1/2 top-1/2 h-[15px] w-[4.5px] -translate-x-1/2 -translate-y-1/2 rounded bg-brand" />
  </div>
);

const isActive = (pathname: string, match: string) =>
  pathname === match || pathname.startsWith(`${match}/`);

const Sidebar = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <aside className="sticky top-0 hidden h-screen w-[92px] flex-none flex-col bg-brand px-0 py-5 text-white sm:flex lg:w-[236px] lg:px-4">
      <div className="mb-5 flex items-center justify-center gap-3 lg:justify-start lg:px-1.5">
        <Logo />
        <span className="hidden text-[17px] font-extrabold tracking-[-0.02em] lg:block">
          Geneus Health
        </span>
      </div>

      <nav className="flex flex-col gap-1 px-2 lg:px-0">
        {NAV.map((item) => {
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

      {/* User card — full sidebar only */}
      <div className="mt-auto hidden rounded-[13px] bg-white/10 p-3 lg:block">
        <div className="flex items-center gap-2.5">
          <Avatar tone="mint" size="sm">TB</Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-bold">Dr. Tunde Bello</div>
            <div className="text-[11px] text-brand-accent-soft">Shift ends 15:00</div>
          </div>
        </div>
      </div>
    </aside>
  );
};

const BottomBar = ({ onAlerts, unread }: { onAlerts: () => void; unread: number }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <nav className="flex justify-around border-t border-outline-soft bg-white px-1 pb-5 pt-2.5 sm:hidden">
      {NAV.filter((n) => n.bottom).map((item) => {
        const active = isActive(pathname, item.match);
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => navigate(item.to)}
            className="flex min-h-0 flex-col items-center gap-1"
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
        className="flex min-h-0 flex-col items-center gap-1"
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
    </nav>
  );
};

const MobileNotificationSheet = ({ onClose }: { onClose: () => void }) => {
  const { notifications } = useSession();
  return (
    <div className="fixed inset-0 z-50 sm:hidden">
      <button
        type="button"
        aria-label="Close notifications"
        onClick={onClose}
        className="absolute inset-0 min-h-0 cursor-default bg-black/40"
      />
      <div className="absolute inset-x-0 bottom-0 max-h-[75vh] overflow-hidden rounded-t-sheet bg-white pb-4 shadow-sheet">
        <div className="flex items-center justify-between border-b border-outline-soft px-4 py-3.5">
          <span className="text-base font-bold text-ink">Notifications</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 min-h-0 items-center justify-center rounded-full text-ink-soft"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-auto">
          <NotificationList notifications={notifications} onDone={onClose} />
        </div>
      </div>
    </div>
  );
};

export const AppShell = () => {
  const { pathname } = useLocation();
  const { unreadCount, markAllRead } = useSession();
  const [alertsOpen, setAlertsOpen] = useState(false);

  // The phone design only shows the bottom bar (and thus the mobile notification
  // + shift chrome) on the home screen; drill-downs keep their own footer action.
  const showBottomBar = pathname === '/home';

  const openAlerts = () => {
    markAllRead();
    setAlertsOpen(true);
  };

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col [--app-header-h:0px] sm:[--app-header-h:46px]">
        <AppHeader />
        <ShiftBanner />
        <div className="flex-1">
          <Outlet />
        </div>
        {showBottomBar ? (
          <>
            <ShiftCountdownStrip />
            <BottomBar onAlerts={openAlerts} unread={unreadCount} />
          </>
        ) : null}
      </div>
      {alertsOpen ? <MobileNotificationSheet onClose={() => setAlertsOpen(false)} /> : null}
    </div>
  );
};
