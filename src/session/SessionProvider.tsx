import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { rolesFor, type AuthorizationContext, type RosterShift, type Staff } from '@shared';
import { useDeviceContext, useLiveQuery } from '@/data';
import { extendShift as persistExtension, findShift, listShifts, listStaff } from '@/data/repos/staff';
import { authorizationFor, nobody, freshAuthorization } from '@/auth/authorization';
import { lastServerContactOn } from '@/data/deviceCredential';
import { listOpenRejections } from '@/data/repos/syncRejections';
import { checkPin, needsLongerPin } from './credentials';
import { approvePinSetup } from './pinApproval';
import { accessFor, maySignIn, mayStaySignedIn, SESSION_IDLE_MS, shiftEnd, type Access } from './accessPolicy';
import { shiftEndLabel, shiftRangeLabel } from './shiftLabels';
import { checkShiftSignature, isFrozen } from './signInChecks';
import { canContinueFacilitySession, clearFacilityIdentity, pendingFacilityIdentity } from './facilityIdentity';
import { activeWorkspace, isWorkspaceSwitching } from '@/data/facilityWorkspaces';
import { getDatabase } from '@/data/database';
import { waitForFirstSync } from '@/data/sync';

/**
 * Shift login (PRD §14.1). Access is evaluated entirely on this device against
 * the roster and staff documents already in the replica, so a facility with no
 * signal can still start its day. Sign-out never waits for the network.
 *
 * Beyond the PIN and configured sign-in access, sign-in refuses a device that has not
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
  roles: Staff['role'][];
  canWrite: boolean;
};
export type Facility = { name: string; code: string };
export type Shift = { label: string; endsAtLabel: string; endsOn: string; minutesLeft: number; ended: boolean };

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
  error: Error | undefined;
  reload: () => void;
  /** Staff on this facility's roster, for the login screen's picker. */
  roster: RosterEntry[];
  signIn: (staffId: string, pin: string) => Promise<SignInRefusal | undefined>;
  signOut: () => void;
};

type SessionValue = {
  user: SessionUser;
  facility: Facility;
  /** Whether fresh sign-in is shift-based, available 24 hours, or administrator access. */
  access: Access;
  /** Informational roster window; its end never expires the signed-in session. */
  shift: Shift | undefined;
  /** Who is acting, from where, with what rights — what every repository write is checked against. */
  authorization: AuthorizationContext;
  notifications: AppNotification[];
  unreadCount: number;
  extendShift: () => Promise<void>;
  notificationsLoading: boolean;
  notificationsError: Error | undefined;
  markAllRead: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);
const SessionContext = createContext<SessionValue | null>(null);

const SIGNED_IN_KEY = 'geneus.signedInStaffId';
/** Persist inactivity across reloads for every signed-in staff member. */
const LAST_ACTIVITY_KEY = 'geneus.lastActivityOn';
/** Activity is written down at most this often; the idle limit is 30 minutes, so this is precise enough. */
const ACTIVITY_WRITE_MS = 15_000;

const readLastActivity = (): number | undefined => {
  const stored = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : undefined;
};
const EXTENSION_MINUTES = 240;

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
  cashier: 'Cashier',
};

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const { facility, deviceId } = useDeviceContext();
  const [staffId, setStaffId] = useState<string | null>(() => localStorage.getItem(SIGNED_IN_KEY));
  const [facilityIdentity, setFacilityIdentity] = useState(pendingFacilityIdentity);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const rejections = useLiveQuery(listOpenRejections);
  const notifications = useMemo<AppNotification[]>(() => (rejections.data ?? []).map((rejection) => ({
    id: rejection.id, kind: 'conflict', title: 'A record needs review',
    body: 'A queued change was refused. Open Sync & device to review it.', to: '/sync', read: readIds.has(rejection.id),
  })), [rejections.data, readIds]);
  useEffect(() => setReadIds(new Set()), [staffId]);
  const [now, setNow] = useState(() => Date.now());
  const lastActivity = useRef<number | undefined>(readLastActivity());

  const load = useCallback(async () => {
    const [staff, shifts] = await Promise.all([listStaff(), listShifts()]);
    return { staff: staff.filter((member) => member.active), shifts };
  }, []);

  const { data, loading, error: rosterError, reload: reloadRoster } = useLiveQuery(load);
  const roster = useMemo<RosterEntry[]>(() => (data?.staff ?? []).map((member) => ({ staff: member, shift: findShift(data?.shifts ?? [], member.staffId, now) })), [data, now]);

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

  // Check expiry before accepting input: a sleeping tab must not revive an expired session.
  useEffect(() => {
    if (!staffId) return;
    let written = 0;
    const touched = (event: Event) => {
      const at = Date.now();
      if (lastActivity.current === undefined || at - lastActivity.current >= SESSION_IDLE_MS || at < lastActivity.current) {
        if ((event.type === 'pointerdown' || event.type === 'keydown') && event.cancelable) event.preventDefault();
        event.stopImmediatePropagation();
        localStorage.removeItem(SIGNED_IN_KEY);
        localStorage.removeItem(LAST_ACTIVITY_KEY);
        lastActivity.current = undefined;
        setStaffId(null);
        setNow(at);
        return;
      }
      lastActivity.current = at;
      if (at - written < ACTIVITY_WRITE_MS) return;
      written = at;
      localStorage.setItem(LAST_ACTIVITY_KEY, String(at));
    };
    window.addEventListener('pointerdown', touched, true);
    window.addEventListener('keydown', touched, true);
    window.addEventListener('wheel', touched, { passive: true });
    window.addEventListener('touchmove', touched, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', touched, true);
      window.removeEventListener('keydown', touched, true);
      window.removeEventListener('wheel', touched);
      window.removeEventListener('touchmove', touched);
    };
  }, [staffId]);

  const entry = roster.find((candidate) => candidate.staff.staffId === staffId);
  // `now` is a coarse display tick. Input can update lastActivity between
  // ticks, so comparing it with `now` mistakes fresh activity for a clock
  // rollback when a database/sync refresh renders this provider again.
  const active = Boolean(!facilityIdentity && entry && mayStaySignedIn(entry, Date.now(), lastActivity.current));

  const signOut = useCallback(() => {
    if (isWorkspaceSwitching()) return;
    void clearFacilityIdentity();
    setFacilityIdentity(undefined);
    localStorage.removeItem(SIGNED_IN_KEY);
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    lastActivity.current = undefined;
    setStaffId(null);
  }, []);

  // A fresh online organization check links the same person to a different local
  // membership. Wait for its replica, then apply that facility's login rules.
  useEffect(() => {
    if (!facilityIdentity || loading || !data || !facility?.code) return;
    let cancelled = false;
    void (async () => {
      try {
        if (!activeWorkspace()?.prepared && !await waitForFirstSync(getDatabase())) throw new Error('First sync is required');
        const snapshot = await load();
        const member = snapshot.staff.find((candidate) => candidate.staffId === facilityIdentity.staffId);
        const shift = findShift(snapshot.shifts, facilityIdentity.staffId, Date.now());
        const accepted = member && canContinueFacilitySession(facilityIdentity, { facilityId: facility.code, deviceId, staff: member, shift, lastServerContact: lastServerContactOn() }) &&
          !(accessFor(member) === 'shift' && shift && await checkShiftSignature(shift) === 'invalid');
        if (cancelled) return;
        if (!accepted) { signOut(); return; }
        if (!entry) { reloadRoster(); return; }
        await clearFacilityIdentity();
        if (!cancelled) setFacilityIdentity(undefined);
      } catch { if (!cancelled) signOut(); }
    })();
    return () => { cancelled = true; };
  }, [facilityIdentity, loading, data, facility?.code, deviceId, entry, load, reloadRoster, signOut]);

  // Shift end never expires an authenticated session. Deactivation and staff
  // inactivity still clear the saved identity so reactivation cannot revive it.
  useEffect(() => {
    if (!facilityIdentity && staffId && !loading && !rosterError && data && (!entry || !active)) signOut();
  }, [facilityIdentity, staffId, loading, rosterError, data, entry, active, signOut]);

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
      const currentShift = findShift(data?.shifts ?? [], candidateId, Date.now());
      if (!maySignIn({ staff: candidate.staff, shift: currentShift }, Date.now())) return { reason: 'off-shift' };
      if (accessFor(candidate.staff) === 'shift' && currentShift && (await checkShiftSignature(currentShift)) === 'invalid') return { reason: 'shift-altered' };
      const signedInAt = Date.now();
      lastActivity.current = signedInAt;
      localStorage.setItem(LAST_ACTIVITY_KEY, String(signedInAt));
      localStorage.setItem(SIGNED_IN_KEY, candidateId);
      // Refresh roster display immediately after a successful PIN sign-in.
      setNow(Date.now());
      setStaffId(candidateId);
      return undefined;
    },
    [roster, data],
  );

  const auth = useMemo<AuthValue>(
    () => ({ signedIn: active, loading: loading || Boolean(facilityIdentity), error: rosterError, reload: reloadRoster, roster, signIn, signOut }),
    [active, loading, facilityIdentity, roster, signIn, signOut, rosterError, reloadRoster],
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
  const extend = useCallback(async () => {
    if (!entry?.shift) throw new Error('There is no active shift to extend');
    await persistExtension(entry.shift, new Date(Date.now() + EXTENSION_MINUTES * 60_000).toISOString(), authorization);
  }, [entry, authorization]);

  const markAllRead = useCallback(
    () => setReadIds(new Set(notifications.map((notification) => notification.id))),
    [notifications],
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
        role: rolesFor(staff).map((role) => ROLE_LABELS[role] ?? role).join(' + '),
        roles: rolesFor(staff),
        roleId: staff.role,
        canWrite: staff.permission === 'read_write',
      },
      facility: { name: facility?.name ?? '', code: facility?.code ?? '' },
      authorization,
      access,
      shift:
        access === 'shift' && shift
          ? {
              label: shiftRangeLabel(shift),
              endsAtLabel: shiftEndLabel(shift),
              endsOn: shift.extendedUntil ?? shift.endsAt,
              ended: now >= shiftEnd(shift),
              minutesLeft: Math.max(0, Math.ceil((shiftEnd(shift) - now) / 60_000)),
            }
          : undefined,
      notifications,
      notificationsLoading: rejections.loading,
      notificationsError: rejections.error,
      unreadCount: notifications.filter((item) => !item.read).length,
      extendShift: extend,
      markAllRead,
    };
  }, [entry, active, facility, authorization, notifications, now, extend, markAllRead, rejections.loading, rejections.error]);

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
  const contact=lastServerContactOn();
  return useMemo(
    () => freshAuthorization(session?.authorization ?? nobody(facility?.code ?? '', deviceId)),
    [session?.authorization, facility?.code, deviceId, contact],
  );
};

/** Only valid behind the shift guard — screens outside it have no signed-in staff. */
export const useSession = (): SessionValue => {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession requires signed-in staff (render inside RequireShift)');
  return session;
};
