import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AuthorizationContext, RosterShift, Staff } from '@shared';
import { useDeviceContext, useLiveQuery } from '@/data';
import { extendShift as persistExtension, findShift, listShifts, listStaff } from '@/data/repos/staff';
import { authorizationFor, nobody } from '@/auth/authorization';
import { lastServerContactOn } from '@/data/deviceCredential';
import { checkPin, needsLongerPin } from './credentials';
import { approvePinSetup } from './pinApproval';
import { accessFor, covers, mayStaySignedIn, shiftEnd, type Access } from './accessPolicy';
import { checkShiftSignature, isFrozen } from './signInChecks';

/**
 * Shift login (PRD §14.1). Access is evaluated entirely on this device against
 * the roster and staff documents already in the replica, so a facility with no
 * signal can still start its day. Sign-out never waits for the network.
 *
 * Beyond the PIN and the shift window, sign-in refuses a device that has not
 * synced in 7 days (root §4.3) and a shift whose server signature no longer
 * matches it (signInChecks.ts).
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

export type SignInFailure =
  | 'unknown-staff'
  | 'wrong-pin'
  | 'locked'
  | 'off-shift'
  | 'sync-required'
  | 'shift-altered'
  /** Right PIN, but an old 4-digit one: they choose a 6-digit PIN before anything else. */
  | 'pin-upgrade';

/** Why sign-in was refused; `retryAt` comes with a lockout. */
export type SignInRefusal = { reason: SignInFailure; retryAt?: number };

export type RosterEntry = { staff: Staff; shift: RosterShift | undefined };

type AuthValue = {
  signedIn: boolean;
  loading: boolean;
  /** Staff on this facility's roster, for the login screen's picker. */
  roster: RosterEntry[];
  signIn: (staffId: string, pin: string) => Promise<SignInRefusal | undefined>;
  signOut: () => void;
};

type SessionValue = {
  user: SessionUser;
  facility: Facility;
  /** How this session is held: by a shift, or by a facility admin's any-time access (accessPolicy.ts). */
  access: Access;
  /** The shift holding the session; absent for an admin, whom no shift signs out. */
  shift: Shift | undefined;
  /** Who is acting, from where, with what rights — what every repository write is checked against. */
  authorization: AuthorizationContext;
  notifications: AppNotification[];
  unreadCount: number;
  extendShift: () => void;
  markAllRead: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);
const SessionContext = createContext<SessionValue | null>(null);

const SIGNED_IN_KEY = 'geneus.signedInStaffId';
/** When the signed-in person last touched the app, so a reload cannot reset an admin's idle time. */
const LAST_ACTIVITY_KEY = 'geneus.lastActivityOn';
/** Activity is written down at most this often; the idle limit is 30 minutes, so this is precise enough. */
const ACTIVITY_WRITE_MS = 15_000;

const readLastActivity = (): number | undefined => {
  const stored = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : undefined;
};
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

const timeLabel = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const { facility, deviceId } = useDeviceContext();
  const [staffId, setStaffId] = useState<string | null>(() => localStorage.getItem(SIGNED_IN_KEY));
  const [notifications, setNotifications] = useState<AppNotification[]>(INITIAL_NOTIFICATIONS);
  const [now, setNow] = useState(() => Date.now());
  const lastActivity = useRef<number | undefined>(readLastActivity());

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
  // A phone wakes from sleep with timers far behind; re-check at once rather than up to 30 s later.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Any touch or key counts as activity — the measure of an admin's idle time.
  useEffect(() => {
    if (!staffId) return;
    let written = 0;
    const touched = () => {
      const at = Date.now();
      lastActivity.current = at;
      if (at - written < ACTIVITY_WRITE_MS) return;
      written = at;
      localStorage.setItem(LAST_ACTIVITY_KEY, String(at));
    };
    window.addEventListener('pointerdown', touched, { passive: true });
    window.addEventListener('keydown', touched);
    return () => {
      window.removeEventListener('pointerdown', touched);
      window.removeEventListener('keydown', touched);
    };
  }, [staffId]);

  const entry = roster.find((candidate) => candidate.staff.staffId === staffId);
  const active = Boolean(entry && mayStaySignedIn(entry, now, lastActivity.current));

  const signOut = useCallback(() => {
    localStorage.removeItem(SIGNED_IN_KEY);
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    lastActivity.current = undefined;
    setStaffId(null);
  }, []);

  // Auto-logout is the system's job, not the user's (PRD §14.1): at shift end,
  // or after 30 idle minutes for a facility admin.
  useEffect(() => {
    if (staffId && !loading && entry && !active) signOut();
  }, [staffId, loading, entry, active, signOut]);

  const signIn = useCallback(
    async (candidateId: string, pin: string): Promise<SignInRefusal | undefined> => {
      const candidate = roster.find((member) => member.staff.staffId === candidateId);
      if (!candidate) return { reason: 'unknown-staff' };
      if (isFrozen(lastServerContactOn())) return { reason: 'sync-required' };
      const pinCheck = await checkPin(candidateId, pin);
      if (!pinCheck.ok) {
        return pinCheck.reason === 'locked' ? { reason: 'locked', retryAt: pinCheck.retryAt } : { reason: 'wrong-pin' };
      }
      if (needsLongerPin(candidateId)) {
        // The right old PIN is itself the approval to replace it.
        approvePinSetup(candidateId);
        return { reason: 'pin-upgrade' };
      }
      // A facility admin signs in shift or no shift (accessPolicy.ts); everyone else needs a genuine one.
      if (accessFor(candidate.staff) === 'shift') {
        if (!candidate.shift || !covers(candidate.shift, Date.now())) return { reason: 'off-shift' };
        if ((await checkShiftSignature(candidate.shift)) === 'invalid') return { reason: 'shift-altered' };
      }
      const signedInAt = Date.now();
      lastActivity.current = signedInAt;
      localStorage.setItem(LAST_ACTIVITY_KEY, String(signedInAt));
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
    () => ({ signedIn: active, loading, roster, signIn, signOut }),
    [active, loading, roster, signIn, signOut],
  );

  const authorization = useMemo<AuthorizationContext>(
    () =>
      entry && active
        ? authorizationFor({ staff: entry.staff, facilityId: facility?.code ?? '', deviceId })
        : nobody(facility?.code ?? '', deviceId),
    [entry, active, facility?.code, deviceId],
  );

  // Extending is a supervisor's permission (PRD §14.1); anyone else is refused
  // by the repository, and the refusal surfaces like any other write error.
  const extend = useCallback(() => {
    if (!entry?.shift) return;
    void persistExtension(entry.shift, new Date(Date.now() + EXTENSION_MINUTES * 60_000).toISOString(), authorization).catch(
      (cause: unknown) => console.warn('shift extension refused', cause),
    );
  }, [entry, authorization]);

  const markAllRead = useCallback(
    () => setNotifications((list) => list.map((item) => ({ ...item, read: true }))),
    [],
  );

  const session = useMemo<SessionValue | null>(() => {
    if (!entry || !active) return null;
    const { staff, shift } = entry;
    const access = accessFor(staff);
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
      authorization,
      access,
      shift:
        access === 'shift' && shift
          ? {
              label: `${timeLabel(shift.startsAt)}–${timeLabel(shift.endsAt)}`,
              endsAtLabel: timeLabel(shift.extendedUntil ?? shift.endsAt),
              minutesLeft: Math.max(0, Math.ceil((shiftEnd(shift) - now) / 60_000)),
            }
          : undefined,
      notifications,
      unreadCount: notifications.filter((item) => !item.read).length,
      extendShift: extend,
      markAllRead,
    };
  }, [entry, active, facility, authorization, notifications, now, extend, markAllRead]);

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
 * The authorization context repositories check writes against. Feature
 * providers mount above the shift guard, so with nobody signed in this is a
 * context that holds no permission — any write through it is refused.
 */
export const useAuthorizationContext = (): AuthorizationContext => {
  const session = useContext(SessionContext);
  const { facility, deviceId } = useDeviceContext();
  return useMemo(
    () => session?.authorization ?? nobody(facility?.code ?? '', deviceId),
    [session?.authorization, facility?.code, deviceId],
  );
};

/** Only valid behind the shift guard — screens outside it have no signed-in staff. */
export const useSession = (): SessionValue => {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession requires a signed-in shift (render inside RequireShift)');
  return session;
};
