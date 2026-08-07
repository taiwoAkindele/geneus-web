import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Signed-in session context. Today this is mock data — the screens are still
 * static prototypes — but it centralizes the facts the global header, shift
 * banner and notification center all need (who is on shift, which facility, how
 * long is left, what needs attention) instead of each screen hardcoding them.
 * When the real offline roster/auth lands (PLAN FE-M1), this provider is where
 * it plugs in; consumers don't change.
 */
export type SessionUser = { staffId: string; name: string; initials: string; role: string };
export type Facility = { name: string; code: string };
export type Shift = { label: string; endsAtLabel: string; minutesLeft: number };

export type NotificationKind = 'referral' | 'conflict' | 'shift';
export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Route opened when the notification is tapped. */
  to?: string;
  read: boolean;
};

type SessionValue = {
  user: SessionUser;
  facility: Facility;
  shift: Shift;
  notifications: AppNotification[];
  unreadCount: number;
  /** Supervisor extends the shift; clears the ending-soon warning. */
  extendShift: () => void;
  markAllRead: () => void;
};

const INITIAL_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'n-ref-1',
    kind: 'referral',
    title: 'Incoming referral · Ibrahim Musa',
    body: 'Suspected severe malaria — arrived, from Alafia CHC',
    to: '/referrals/track',
    read: false,
  },
  {
    id: 'n-ref-2',
    kind: 'referral',
    title: 'Incoming referral · Grace Eze',
    body: 'Obstructed labour — referred for C-section',
    to: '/referrals/track',
    read: false,
  },
  {
    id: 'n-conflict-1',
    kind: 'conflict',
    title: '1 record needs review',
    body: 'Two devices edited patient 47 offline — reconcile at sync',
    to: '/sync',
    read: false,
  },
];

const SessionContext = createContext<SessionValue | null>(null);

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [minutesLeft, setMinutesLeft] = useState(30);
  const [notifications, setNotifications] = useState<AppNotification[]>(INITIAL_NOTIFICATIONS);

  const extendShift = useCallback(() => setMinutesLeft(240), []);
  const markAllRead = useCallback(
    () => setNotifications((list) => list.map((n) => ({ ...n, read: true }))),
    [],
  );

  const value = useMemo<SessionValue>(
    () => ({
      user: { staffId: 'staff-demo-1', name: 'Amaka Okoro', initials: 'AO', role: 'CHEW' },
      facility: { name: 'Odo-Ona Elewe PHC', code: 'OOE-PHC' },
      shift: { label: '07–15', endsAtLabel: '15:00', minutesLeft },
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
      extendShift,
      markAllRead,
    }),
    [minutesLeft, notifications, extendShift, markAllRead],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export const useSession = (): SessionValue => {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
};
