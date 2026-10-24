import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Icon, useToast } from '@/ui';
import { useAuth, useAuthorizationContext } from '@/session';
import { accessLabel } from '@/session/accessPolicy';
import { SyncPill } from './SyncPill';
import { formatCountdown, useSession, useShiftCountdown, type Shift } from '@/session';
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
  const { notifications, notificationsLoading, notificationsError } = useSession();
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
          <NotificationList notifications={notifications} loading={notificationsLoading} error={notificationsError} onDone={onClose} />
        </div>
      </div>
    </>
  );
};

export const AppHeader = () => {
  const navigate = useNavigate();
  const { facility, shift, access, unreadCount, markAllRead } = useSession();
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
        <SyncPill />

        {/* Shift chip — tap for the sync/shift center. An admin has no shift to end (accessPolicy.ts). */}
        <button
          type="button"
          onClick={() => navigate('/sync')}
          className="flex min-h-0 items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-1.5 text-xs font-bold text-ink-soft"
          aria-label={shift ? `Shift ${shift.ended ? 'ended' : 'ends'} at ${shift.endsAtLabel}; sign-out is manual` : accessLabel(access)}
        >
          <Icon name={shift ? 'clock' : 'lock'} className="h-4 w-4" />
          {shift ? <span className="font-mono">{shift.ended ? 'Shift ended' : shift.endsAtLabel}</span> : <span>{accessLabel(access)}</span>}
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
/** Roster reminders are informational. Shift end never closes the session. */
const ShiftNotice = ({ shift, compact }: { shift: Shift; compact: boolean }) => {
  const [dismissed, setDismissed] = useState(false);
  const seconds = useShiftCountdown(shift.minutesLeft, shift.endsOn);
  const { signOut } = useAuth();
  if (dismissed || shift.minutesLeft > 30) return null;
  return <div role="status" className={`items-center gap-2 border-amber-border bg-amber-bg px-4 py-2 text-amber-text ${compact ? 'flex border-t sm:hidden' : 'hidden border-b sm:flex'}`}>
    <Icon name="clock" className="h-[18px] w-[18px] flex-none" />
    <div className="min-w-0 flex-1">
      <div className="text-[13px] font-bold">{seconds === 0 ? 'Shift ended' : <>Shift ends in <span className="font-mono">{formatCountdown(seconds)}</span></>}</div>
      <p className="text-xs">You stay signed in. Sign out when finished.</p>
    </div>
    <ExtendShiftAction />
    <Button variant="ghost" fullWidth={false} className="min-h-[44px] flex-none bg-white/70 px-2 py-2 text-[12px]" onClick={signOut}>Sign out</Button>
    {!compact ? <button type="button" aria-label="Dismiss shift reminder" onClick={() => setDismissed(true)} className="flex h-9 w-9 min-h-0 flex-none items-center justify-center"><Icon name="close" className="h-4 w-4" /></button> : null}
  </div>;
};

export const ShiftBanner = () => {
  const { shift } = useSession();
  return shift ? <ShiftNotice key={shift.endsOn} shift={shift} compact={false} /> : null;
};
export const ShiftCountdownStrip = () => {
  const { shift } = useSession();
  return shift ? <ShiftNotice key={shift.endsOn} shift={shift} compact /> : null;
};

const ExtendShiftAction = () => {
  const { extendShift } = useSession();
  const context = useAuthorizationContext();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const allowed = context.permissions.includes('roster:extend');
  const extend = async () => {
    if (busy || !allowed) return;
    setBusy(true);
    try { await extendShift(); toast('Shift extended'); }
    catch (cause) { toast(cause instanceof Error ? cause.message : 'Could not extend the shift', { tone: 'error' }); }
    finally { setBusy(false); }
  };
  return allowed ? <Button variant="ghost" fullWidth={false} className="min-h-[44px] flex-none bg-white/70 px-2 py-2 text-[12px]" loading={busy} onClick={() => void extend()}>Extend</Button> : null;
};
