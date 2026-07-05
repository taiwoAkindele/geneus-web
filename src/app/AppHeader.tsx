import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, type IconName, StatusPill } from '@/ui';
import { useSession, type AppNotification, type NotificationKind } from '@/session';

/**
 * Persistent header for the signed-in app. Rendered once by AppShell (not per
 * screen), so the cross-cutting facts the product promises to keep honest —
 * which facility, sync state, how much shift is left, and what needs your
 * attention — always have a home, on every screen. Screen-level AppBars keep
 * only their title + back button and sit directly beneath this via the
 * `--app-header-h` offset AppShell sets.
 */
const KIND_ICON: Record<NotificationKind, IconName> = {
  referral: 'referrals',
  conflict: 'warning',
  shift: 'clock',
};

const NotificationCenter = ({
  notifications,
  onClose,
}: {
  notifications: AppNotification[];
  onClose: () => void;
}) => {
  const navigate = useNavigate();
  return (
    <>
      {/* Backdrop — tap anywhere to dismiss. */}
      <button
        type="button"
        aria-label="Close notifications"
        onClick={onClose}
        className="fixed inset-0 z-40 min-h-0 cursor-default bg-transparent"
      />
      <div className="absolute right-3 top-[52px] z-50 w-[min(92vw,360px)] overflow-hidden rounded-card border border-outline-soft bg-white shadow-sheet">
        <div className="flex items-center justify-between border-b border-outline-soft px-4 py-3">
          <span className="text-sm font-bold text-ink">Notifications</span>
          <span className="text-xs text-ink-muted">{notifications.length}</span>
        </div>
        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-ink-muted">You're all caught up.</div>
        ) : (
          <ul className="max-h-[60vh] divide-y divide-outline-soft overflow-auto">
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (n.to) navigate(n.to);
                    onClose();
                  }}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left"
                >
                  <span
                    className={`mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-[10px] ${
                      n.kind === 'conflict' ? 'bg-amber-bg text-amber-text' : 'bg-brand-tint text-brand'
                    }`}
                  >
                    <Icon name={KIND_ICON[n.kind]} className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-bold text-ink">{n.title}</span>
                      {!n.read ? <span className="h-2 w-2 flex-none rounded-full bg-brand-strong" /> : null}
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-ink-muted">{n.body}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
};

export const AppHeader = () => {
  const navigate = useNavigate();
  const { facility, shift, notifications, unreadCount, markAllRead } = useSession();
  const [open, setOpen] = useState(false);

  const toggle = () => {
    setOpen((o) => {
      if (!o) markAllRead();
      return !o;
    });
  };

  return (
    <header className="sticky top-0 z-30 flex h-[46px] items-center gap-2 border-b border-outline-soft bg-surface px-3">
      {/* Facility identity */}
      <button
        type="button"
        onClick={() => navigate('/home')}
        className="flex min-h-0 items-center gap-2"
        aria-label="Go to facility home"
      >
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-[8px] bg-brand text-white">
          <Icon name="home" className="h-[17px] w-[17px]" />
        </span>
        <span className="font-mono text-[13px] font-semibold text-ink">{facility.code}</span>
        <span className="hidden text-[13px] text-ink-muted lg:inline">{facility.name}</span>
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        <StatusPill status="synced" />

        {/* Shift chip — tap for the sync/shift center. */}
        <button
          type="button"
          onClick={() => navigate('/sync')}
          className="flex min-h-0 items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-1.5 text-xs font-bold text-ink-soft"
          aria-label={`Shift ends at ${shift.endsAtLabel}`}
        >
          <Icon name="clock" className="h-4 w-4" />
          <span className="font-mono">{shift.endsAtLabel}</span>
        </button>

        {/* Notification bell */}
        <div className="relative">
          <button
            type="button"
            onClick={toggle}
            aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
            aria-expanded={open}
            className="relative flex h-9 w-9 min-h-0 items-center justify-center rounded-full text-ink-soft active:bg-surface-container"
          >
            <Icon name="bell" className="h-[22px] w-[22px]" />
            {unreadCount > 0 ? (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 font-mono text-[10px] font-bold leading-none text-white">
                {unreadCount}
              </span>
            ) : null}
          </button>
          {open ? <NotificationCenter notifications={notifications} onClose={() => setOpen(false)} /> : null}
        </div>
      </div>
    </header>
  );
};

/**
 * Escalating shift-ending banner. Auto-logout closes any open record (PRD §14.1),
 * so the warning is safety-critical and must be visible regardless of screen —
 * not buried on the Sync screen. Calm at 30 min, amber at 15, red at 5.
 */
export const ShiftBanner = () => {
  const { shift, extendShift } = useSession();
  const [dismissed, setDismissed] = useState(false);
  const { minutesLeft, endsAtLabel } = shift;

  if (dismissed || minutesLeft > 30) return null;

  const critical = minutesLeft <= 5;
  const urgent = minutesLeft <= 15;
  const box = critical
    ? 'bg-danger-bg border-danger text-danger-strong'
    : urgent
      ? 'bg-amber-bg border-amber text-amber-text'
      : 'bg-amber-bg border-amber-border text-amber-text';

  return (
    <div className={`flex items-center gap-3 border-b px-4 py-2.5 ${box}`} role="alert">
      <Icon name={critical ? 'warning' : 'clock'} className="h-5 w-5" />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-bold">Your shift ends in {minutesLeft} min</div>
        <div className="text-[12px] opacity-90">
          You'll be signed out at {endsAtLabel} on every device — finish and tidy up open records.
        </div>
      </div>
      <button
        type="button"
        onClick={extendShift}
        className="min-h-0 flex-none rounded-lg bg-white/70 px-3 py-2 text-[13px] font-bold"
      >
        Extend
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="flex h-8 w-8 min-h-0 flex-none items-center justify-center rounded-lg"
      >
        <Icon name="close" className="h-4 w-4" />
      </button>
    </div>
  );
};
