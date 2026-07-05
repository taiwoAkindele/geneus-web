import { Link } from 'react-router-dom';

/**
 * Temporary index / navigation hub. Stands in until the real product home
 * (the facility home, design section 04) is built; it just lists the screens
 * that exist so they're reachable. Replace when section 04 lands.
 */
type Item = { to: string; label: string; note: string };

const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: 'Daily use',
    items: [
      { to: '/home', label: 'Facility home', note: 'Signed-in hub' },
      { to: '/patients/search', label: 'Patient search', note: '' },
      { to: '/patients/new', label: 'New patient · step 1', note: '' },
      { to: '/patients/new/details', label: 'New patient · step 2', note: '' },
      { to: '/patients/duplicate', label: 'Duplicate check', note: 'Bottom sheet' },
      { to: '/patients/send-to-unit', label: 'Send to another unit', note: '' },
      { to: '/registers/malaria', label: 'Programme register — Malaria', note: '' },
      { to: '/reports/month', label: 'This month at a glance', note: '' },
      { to: '/referrals/track', label: 'Refer & track', note: '' },
      { to: '/sync', label: 'Sync center & shift warning', note: '' },
    ],
  },
  {
    title: 'Staff onboarding & access',
    items: [
      { to: '/login', label: 'Shift login (PIN)', note: 'Default screen' },
      { to: '/onboarding/accept', label: 'Accept invite · create PIN', note: 'From the link' },
      { to: '/forgot-pin', label: 'Forgot PIN', note: '' },
      { to: '/reset-pin', label: 'Reset PIN', note: 'From the link' },
    ],
  },
  {
    title: 'Facility onboarding & admin',
    items: [
      { to: '/onboarding/start', label: 'Get started (magic link)', note: 'Flow entry' },
      { to: '/onboarding/register', label: 'Register facility', note: 'From the link' },
      { to: '/admin', label: 'Admin dashboard', note: 'Set up the team' },
      { to: '/admin/staff/invite', label: 'Invite staff', note: '' },
      { to: '/admin/staff/access', label: 'Roles & permissions', note: '' },
      { to: '/admin/staff', label: 'Manage staff', note: '' },
    ],
  },
];

export const RouteIndex = () => {
  return (
    <div className="min-h-screen bg-surface-container">
      <div className="mx-auto max-w-md px-5 py-8 md:max-w-2xl">
        <h1 className="text-2xl font-extrabold tracking-[-0.02em]">Geneus Health</h1>
        <p className="mt-1 text-[13px] text-ink-muted">
          Screen index — temporary, until the facility home is built.
        </p>

        <div className="mt-8 space-y-8">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">
                {s.title}
              </h2>
              <div className="overflow-hidden rounded-card border border-outline-soft bg-white">
                {s.items.map((it, i) => (
                  <Link
                    key={it.to}
                    to={it.to}
                    className={`flex items-center justify-between px-4 py-3.5 ${
                      i > 0 ? 'border-t border-outline-soft' : ''
                    }`}
                  >
                    <span className="text-[15px] font-semibold text-ink">{it.label}</span>
                    <span className="ml-3 text-xs text-ink-muted">{it.note}</span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
