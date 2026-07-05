import type { CSSProperties } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Icon, type IconName } from '@/ui';
import { AppHeader, ShiftBanner } from './AppHeader';

/**
 * Responsive app shell for the signed-in daily-use screens (design "Responsive
 * behaviour"). The single nav definition renders three ways:
 *   ≤640  bottom tab bar (home only, matching the phone design)
 *   641–1024  rail sidebar (icon + tiny label)
 *   ≥1025  full sidebar (icon + label, wordmark, user card)
 * Auth and admin screens live outside this shell. A persistent AppHeader +
 * ShiftBanner sit above every screen; screen AppBars stick just beneath the
 * header via the `--app-header-h` offset set on the content column.
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

const BottomBar = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <nav className="flex justify-around border-t border-outline-soft bg-white px-2 pb-5 pt-2.5 sm:hidden">
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
    </nav>
  );
};

export const AppShell = () => {
  const { pathname } = useLocation();
  // The phone design only shows the bottom tab bar on the home screen; the
  // other screens are drill-downs with their own back button + footer actions.
  const showBottomBar = pathname === '/home';

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar />
      <div
        className="flex min-h-screen min-w-0 flex-1 flex-col"
        style={{ '--app-header-h': '46px' } as CSSProperties}
      >
        <AppHeader />
        <ShiftBanner />
        <div className="flex-1">
          <Outlet />
        </div>
        {showBottomBar ? <BottomBar /> : null}
      </div>
    </div>
  );
};
