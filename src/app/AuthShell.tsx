import { Outlet } from 'react-router-dom';

/**
 * Auth / onboarding shell (design "Responsive behaviour", pattern E). These are
 * single-task screens, so they don't get master–detail — instead the full-screen
 * phone form becomes a fixed-width card centered on a branded split:
 *   ≤640   panel hidden, the screen fills the viewport (the phone design)
 *   641+   green welcome panel on the left, the screen framed as a card on the right
 * Mobile stays exactly the phone screens; only the container changes.
 */
const Logo = () => (
  <div className="relative h-[38px] w-[38px] flex-none rounded-[11px] bg-brand-accent-soft">
    <div className="absolute left-1/2 top-1/2 h-[5px] w-4 -translate-x-1/2 -translate-y-1/2 rounded bg-brand" />
    <div className="absolute left-1/2 top-1/2 h-4 w-[5px] -translate-x-1/2 -translate-y-1/2 rounded bg-brand" />
  </div>
);

export const AuthShell = () => (
  <div className="min-h-screen bg-surface sm:flex">
    {/* Brand panel — tablet/desktop only */}
    <aside className="relative hidden overflow-hidden bg-brand p-12 text-white sm:flex sm:w-[38%] sm:flex-col lg:w-[44%]">
      <div className="relative z-10 flex items-center gap-3">
        <Logo />
        <span className="text-xl font-extrabold tracking-[-0.02em]">Geneus Health</span>
      </div>
      <div className="relative z-10 mt-auto">
        <div className="mb-4 font-mono text-xs uppercase tracking-[0.16em] text-brand-on-dark-muted">
          Offline-first health records
        </div>
        <h2 className="text-[34px] font-extrabold leading-[1.08] tracking-[-0.03em]">
          One patient. One record. Every level of care.
        </h2>
        <p className="mt-4 max-w-[38ch] text-[15px] leading-relaxed text-brand-on-dark">
          Register once and your facility code, admin account and staff invites are ready in
          minutes — works offline from day one.
        </p>
        <div className="mt-6 flex gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-brand-accent-soft" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/30" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/30" />
        </div>
      </div>
      <div className="pointer-events-none absolute -bottom-40 -right-28 h-[420px] w-[420px] rounded-full border-[56px] border-brand-accent-soft/10" />
    </aside>

    {/* Form side — the screen, framed as a card on wider screens */}
    <div className="flex-1 sm:flex sm:items-center sm:justify-center sm:p-6 lg:p-10">
      <div className="w-full sm:max-w-[420px] sm:overflow-hidden sm:rounded-[26px] sm:shadow-sheet">
        <Outlet />
      </div>
    </div>
  </div>
);
