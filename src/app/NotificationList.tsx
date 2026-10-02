import { useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '@/ui';
import type { AppNotification, NotificationKind } from '@/session';

/**
 * The notification list body, shared by the desktop header dropdown and the
 * mobile bottom sheet so both surfaces stay identical. Tapping an item routes to
 * the thing that needs attention (a referral, the reconcile queue) and closes.
 */
const KIND_ICON: Record<NotificationKind, IconName> = {
  referral: 'referrals',
  conflict: 'warning',
  shift: 'clock',
};

type Props = {
  notifications: AppNotification[];
  onDone: () => void;
};

export const NotificationList = ({ notifications, onDone }: Props) => {
  const navigate = useNavigate();

  if (notifications.length === 0) {
    return <div className="px-4 py-8 text-center text-[13px] text-ink-muted">You're all caught up.</div>;
  }

  return (
    <ul className="divide-y divide-outline-soft">
      {notifications.map((n) => (
        <li key={n.id}>
          <button
            type="button"
            onClick={() => {
              if (n.to) navigate(n.to);
              onDone();
            }}
            className="flex w-full items-start gap-3 px-4 py-3.5 text-left"
          >
            <span
              className={`mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-[10px] ${
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
  );
};
