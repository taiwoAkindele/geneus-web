import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { RosterShift, Staff } from '@shared';
import { useDeviceContext, useLiveQuery } from '@/data';
import { extendShift as persistExtension, findShift, listShifts, listStaff } from '@/data/repos/staff';
import { verifyPin } from './credentials';

/**
 * Shift login (PRD §14.1). Access is evaluated entirely on this device against
 * the roster and staff documents already in the replica, so a facility with no
 * signal can still start its day. Sign-out never waits for the network.
 *
 * Not yet enforced, because both need geneus-server: the roster's signature is
 * a development placeholder (see UNSIGNED_ROSTER), and the 7-day sync-or-freeze
 * window needs the server's clock as its authority (root §4.3).
 */
export type SessionUser = {
  staffId: string;
  name: string;
  initials: string;
  /** Display label, e.g. "CHEW". */
  role: string;
  /** The contract value, for gating admin-only surfaces. */
  roleId: Staff['role'];
  canWrite: boolean;
};
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

export type SignInFailure = 'unknown-staff' | 'wrong-pin' | 'off-shift';

export type RosterEntry = { staff: Staff; shift: RosterShift | undefined };

type AuthValue = {
  signedIn: boolean;
  loading: boolean;
  /** Staff on this facility's roster, for the login screen's picker. */
  roster: RosterEntry[];
  signIn: (staffId: string, pin: string) => Promise<SignInFailure | undefined>;
  signOut: () => void;
};

type SessionValue = {
  user: SessionUser;
  facility: Facility;
  shift: Shift;
  notifications: AppNotification[];
  unreadCount: number;
  extendShift: () => void;
  markAllRead: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);
const SessionContext = createContext<SessionValue | null>(null);

const SIGNED_IN_KEY = 'geneus.signedInStaffId';
const EXTENSION_MINUTES = 240;

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

const initialsOf = (fullName: string): string =>
  fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

const ROLE_LABELS: Record<string, string> = {
  chew: 'CHEW',
  nurse: 'Nurse',
  doctor: 'Doctor',
  records_officer: 'Records Officer',
  facility_admin: 'Facility Admin',
  supervisor: 'Supervisor',
};

const shiftEnd = (shift: RosterShift): number =>
  new Date(shift.extendedUntil ?? shift.endsAt).getTime();

const covers = (shift: RosterShift, at: number): boolean =>
  new Date(shift.startsAt).getTime() <= at && at < shiftEnd(shift);

const timeLabel = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const { facility } = useDeviceContext();
  const [staffId, setStaffId] = useState<string | null>(() => localStorage.getItem(SIGNED_IN_KEY));
  const [notifications, setNotifications] = useState<AppNotification[]>(INITIAL_NOTIFICATIONS);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const [staff, shifts] = await Promise.all([listStaff(), listShifts()]);
    return staff
      .filter((member) => member.active)
      .map<RosterEntry>((member) => ({ staff: member, shift: findShift(shifts, member.staffId) }));
  }, []);

  const { data, loading } = useLiveQuery(load);
  const roster = useMemo(() => data ?? [], [data]);

  // Coarse on purpose: every consumer re-renders on this, and the visible
  // per-second countdown is derived locally by useShiftCountdown.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const entry = roster.find((candidate) => candidate.staff.staffId === staffId);
  const onShift = Boolean(entry?.shift && covers(entry.shift, now));

  const signOut = useCallback(() => {
    localStorage.removeItem(SIGNED_IN_KEY);
    setStaffId(null);
  }, []);

  // Auto-logout is the system's job, not the user's (PRD §14.1).
  useEffect(() => {
    if (staffId && !loading && entry && !onShift) signOut();
  }, [staffId, loading, entry, onShift, signOut]);

  const signIn = useCallback(
    async (candidateId: string, pin: string): Promise<SignInFailure | undefined> => {
      const candidate = roster.find((member) => member.staff.staffId === candidateId);
      if (!candidate) return 'unknown-staff';
      if (!(await verifyPin(candidateId, pin))) return 'wrong-pin';
      if (!candidate.shift || !covers(candidate.shift, Date.now())) return 'off-shift';
      localStorage.setItem(SIGNED_IN_KEY, candidateId);
      // Re-anchor the clock: the coarse tick could still be behind a shift that
      // began seconds ago, which would read as off-shift and sign them out.
      setNow(Date.now());
      setStaffId(candidateId);
      return undefined;
    },
    [roster],
  );

  const auth = useMemo<AuthValue>(
    () => ({ signedIn: Boolean(entry) && onShift, loading, roster, signIn, signOut }),
    [entry, onShift, loading, roster, signIn, signOut],
  );

  const extend = useCallback(() => {
    if (!entry?.shift) return;
    void persistExtension(entry.shift, new Date(Date.now() + EXTENSION_MINUTES * 60_000).toISOString());
  }, [entry]);

  const markAllRead = useCallback(
    () => setNotifications((list) => list.map((item) => ({ ...item, read: true }))),
    [],
  );

  const session = useMemo<SessionValue | null>(() => {
    if (!entry?.shift || !onShift) return null;
    const { staff, shift } = entry;
    return {
      user: {
        staffId: staff.staffId,
        name: staff.fullName,
        initials: initialsOf(staff.fullName),
        role: ROLE_LABELS[staff.role] ?? staff.role,
        roleId: staff.role,
        canWrite: staff.permission === 'read_write',
      },
      facility: { name: facility?.name ?? '', code: facility?.code ?? '' },
      shift: {
        label: `${timeLabel(shift.startsAt)}–${timeLabel(shift.endsAt)}`,
        endsAtLabel: timeLabel(shift.extendedUntil ?? shift.endsAt),
        minutesLeft: Math.max(0, Math.ceil((shiftEnd(shift) - now) / 60_000)),
      },
      notifications,
      unreadCount: notifications.filter((item) => !item.read).length,
      extendShift: extend,
      markAllRead,
    };
  }, [entry, onShift, facility, notifications, now, extend, markAllRead]);

  return (
    <AuthContext.Provider value={auth}>
      <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthValue => {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth must be used within a SessionProvider');
  return auth;
};

/**
 * Who to attribute a write to. Feature providers mount above the shift guard, so
 * this falls back to 'system'; every screen that actually writes sits behind the
 * guard, where a signed-in staff id is guaranteed.
 */
export const useOptionalStaffId = (): string => useContext(SessionContext)?.user.staffId ?? 'system';

/** Read-only staff may look at records but not record care. */
export const useCanWrite = (): boolean => useContext(SessionContext)?.user.canWrite ?? false;

/** Only valid behind the shift guard — screens outside it have no signed-in staff. */
export const useSession = (): SessionValue => {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession requires a signed-in shift (render inside RequireShift)');
  return session;
};
