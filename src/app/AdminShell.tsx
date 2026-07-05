import { Outlet, useLocation, useNavigate } from 'react-router-dom';

/**
 * Admin shell (design "Responsive behaviour", pattern B). Admin is its own
 * context with a rail sidebar (Home / Staff / Roster / Reports). Shown on
 * tablet & desktop; on phones the admin screens render on their own (bottom of
 * the funnel — the admin sets up on a larger screen).
 */
const NAV = [
  { key: 'home', label: 'Home', to: '/admin', match: '/admin' },
  { key: 'staff', label: 'Staff', to: '/admin/staff', match: '/admin/staff' },
  { key: 'roster', label: 'Roster', to: '/admin', match: '__roster__' },
  { key: 'reports', label: 'Reports', to: '/admin', match: '__reports__' },
];

export const AdminShell = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="sticky top-0 hidden h-screen w-[92px] flex-none flex-col items-center gap-2 bg-brand py-5 text-white sm:flex">
        <div className="relative mb-3.5 h-[38px] w-[38px] rounded-[11px] bg-brand-accent-soft">
          <div className="absolute left-1/2 top-1/2 h-[5px] w-4 -translate-x-1/2 -translate-y-1/2 rounded bg-brand" />
          <div className="absolute left-1/2 top-1/2 h-4 w-[5px] -translate-x-1/2 -translate-y-1/2 rounded bg-brand" />
        </div>
        {NAV.map((item) => {
          const active = item.match.startsWith('__')
            ? false
            : item.match === '/admin'
              ? pathname === '/admin'
              : pathname.startsWith(item.match);
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => navigate(item.to)}
              className={`flex min-h-0 w-16 flex-col items-center gap-1.5 rounded-[13px] py-2.5 ${
                active ? 'bg-white/15' : ''
              }`}
            >
              <span
                className={`h-[22px] w-[22px] rounded-[7px] ${
                  active ? 'bg-brand-accent-soft' : 'bg-white/25'
                }`}
              />
              <span
                className={`text-[10px] ${active ? 'font-bold text-white' : 'font-semibold text-brand-on-dark'}`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </aside>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
};
