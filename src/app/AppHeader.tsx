import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Avatar, Button, Icon, useToast } from '@/ui';
import { useAuth, useAuthorizationContext } from '@/session';
import { accessLabel } from '@/session/accessPolicy';
import { SyncPill } from './SyncPill';
import { formatCountdown, useSession, useShiftCountdown, type Shift } from '@/session';
import { NotificationList } from './NotificationList';
import { FacilitySwitcher } from './FacilitySwitcher';

/**
 * One facility identity, sync indicator and alert entry point across screen sizes.
 * The phone dock remains available for primary work, More and Account. Screen
 * AppBars stick below this header using the shared `--app-header-h` offset.
 */
const NotificationCenter = ({ onClose }: { onClose: () => void }) => {
  const { notifications, notificationsLoading, notificationsError } = useSession();
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onClose]);
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

export const AppHeader = ({ onProfile }: { onProfile?: () => void }) => {
  const navigate = useNavigate();
  const { user, shift, access, unreadCount, markAllRead } = useSession();
  const [open, setOpen] = useState(false);

  const toggle = () => {
    setOpen((o) => {
      if (!o) markAllRead();
      return !o;
    });
  };

  return (
    <header className="sticky top-0 z-30 flex min-h-16 items-center gap-2 border-b border-outline-soft bg-white px-3 sm:gap-3 md:gap-5 md:px-7">
      {/* Facility identity */}
      <button
        type="button"
        onClick={() => navigate('/home')}
        className="flex min-h-[44px] min-w-11 shrink-0 items-center gap-2"
        aria-label="Geneus Health home"
      >
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-brand-accent-soft text-brand">
          <Icon name="plus" className="h-6 w-6" />
        </span>
        <span className="hidden text-base font-extrabold text-brand sm:inline">Geneus Health</span>
      </button>
      <span className="hidden h-6 w-px bg-outline-soft sm:block" />
      <FacilitySwitcher />

      <div className="ml-auto flex items-center gap-1.5">
        <Link to="/sync" title="Sync & review" className="inline-flex min-h-11 shrink-0 items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"><SyncPill /></Link>

        {/* Notification bell */}
        <div className="relative">
          <button
            type="button"
            onClick={toggle}
            aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
            aria-expanded={open}
            className="relative flex h-11 w-11 min-h-0 items-center justify-center rounded-full text-ink-soft active:bg-surface-container"
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
        {onProfile ? <button type="button" onClick={onProfile} title={shift ? `Shift ${shift.ended ? 'ended' : 'ends'} at ${shift.endsAtLabel}` : accessLabel(access)} aria-label="Your profile and sign out" aria-haspopup="dialog" className="flex min-h-11 shrink-0 items-center gap-2 rounded-full px-1 text-sm font-semibold text-ink hover:bg-brand-wash"><Avatar tone="mint" size="sm">{user.initials}</Avatar><span className="hidden max-w-[150px] truncate xl:block">{user.name}</span><Icon name="chevron-down" className="hidden h-4 w-4 md:block" /></button> : null}
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
