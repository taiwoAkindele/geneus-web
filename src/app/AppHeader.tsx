import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, StatusPill } from '@/ui';
import { formatCountdown, useSession, useShiftCountdown } from '@/session';
import { NotificationList } from './NotificationList';

/**
 * Persistent header for the signed-in app — TABLET & DESKTOP ONLY (`sm:` and up),
 * where there's room for it. On phones it is hidden: the design gives each phone
 * screen a full-height frame with a pinned footer and no top chrome, so mobile
 * puts notifications in the bottom nav and the shift countdown above it instead
 * (see AppShell). Rendered once by AppShell; screen AppBars stick just beneath it
 * via the `--app-header-h` offset.
 */
const NotificationCenter = ({ onClose }: { onClose: () => void }) => {
  const { notifications } = useSession();
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
        <div className="max-h-[60vh] overflow-auto">
          <NotificationList notifications={notifications} onDone={onClose} />
        </div>
      </div>
    </>
  );
};

export const AppHeader = () => {
  const navigate = useNavigate();
  const { facility, shift, unreadCount, markAllRead } = useSession();
  const [open, setOpen] = useState(false);

  const toggle = () => {
    setOpen((o) => {
      if (!o) markAllRead();
      return !o;
    });
  };

  return (
    <header className="sticky top-0 z-30 hidden h-[46px] items-center gap-2 border-b border-outline-soft bg-surface px-3 sm:flex">
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
          {open ? <NotificationCenter onClose={() => setOpen(false)} /> : null}
        </div>
      </div>
    </header>
  );
};

/** Colour ramp shared by the desktop banner and the mobile strip. */
const shiftTone = (minutesLeft: number) => {
  if (minutesLeft <= 5) return 'bg-danger-bg border-danger text-danger-strong';
  if (minutesLeft <= 15) return 'bg-amber-bg border-amber text-amber-text';
  return 'bg-amber-bg border-amber-border text-amber-text';
};

/**
 * Escalating shift banner — TABLET & DESKTOP ONLY. Auto-logout closes any open
 * record (PRD §14.1), so the warning escalates calm → amber → red and shows a
 * live countdown. On phones the slim ShiftCountdownStrip does this job instead.
 */
export const ShiftBanner = () => {
  const { shift, extendShift } = useSession();
  const [dismissed, setDismissed] = useState(false);
  const seconds = useShiftCountdown(shift.minutesLeft);
  const { minutesLeft, endsAtLabel } = shift;

  if (dismissed || minutesLeft > 30) return null;

  return (
    <div className={`hidden items-center gap-3 border-b px-4 py-2.5 sm:flex ${shiftTone(minutesLeft)}`} role="alert">
      <Icon name={minutesLeft <= 5 ? 'warning' : 'clock'} className="h-5 w-5" />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-bold">
          Shift ends in <span className="font-mono">{formatCountdown(seconds)}</span>
        </div>
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

/**
 * Slim shift countdown for PHONES — sits just above the bottom nav on the home
 * screen (the only phone screen with persistent bottom chrome), so it never
 * pushes a screen's pinned footer action below the fold. Only appears in the
 * last 30 minutes of a shift; escalates and shows a live m:ss countdown.
 */
export const ShiftCountdownStrip = () => {
  const navigate = useNavigate();
  const { shift, extendShift } = useSession();
  const seconds = useShiftCountdown(shift.minutesLeft);

  if (shift.minutesLeft > 30) return null;

  return (
    <div className={`flex items-center gap-2 border-t px-4 py-2 sm:hidden ${shiftTone(shift.minutesLeft)}`} role="alert">
      <Icon name={shift.minutesLeft <= 5 ? 'warning' : 'clock'} className="h-[18px] w-[18px]" />
      <button type="button" onClick={() => navigate('/sync')} className="min-h-0 flex-1 text-left text-[13px] font-bold">
        Shift ends in <span className="font-mono">{formatCountdown(seconds)}</span>
      </button>
      <button
        type="button"
        onClick={extendShift}
        className="min-h-0 flex-none rounded-lg bg-white/70 px-2.5 py-1.5 text-[12px] font-bold"
      >
        Extend
      </button>
    </div>
  );
};
