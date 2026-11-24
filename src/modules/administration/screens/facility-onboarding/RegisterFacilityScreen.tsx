import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { FacilityRegistrationView, Staff } from '@shared';
import { Button, PulseLoader, TextField, useToast } from '@/ui';
import { useDeviceContext } from '@/data';
import { assignShift, today } from '@/data/repos/staff';
import { authorizationFor } from '@/auth/authorization';
import { openRegistrationLink, registerFacility } from '@/lib/api/facilities';
import { userMessage } from '@/lib/api/userMessage';
import { keepLinkToken, keptLinkToken, tokenFromHash } from '@/lib/linkToken';
import { SyncingFacility } from '@/app/SyncingFacility';
import { approvePinSetup } from '@/session';
import {
  NewPasswordFields,
  newPasswordProblem,
} from '@/app/screens/staff-onboarding/NewPasswordFields';
import { FACILITY_LEVEL_LABELS } from './facilityLevels';

const endOfToday = (): string => {
  const end = new Date();
  end.setHours(23, 59, 0, 0);

  return end.toISOString();
};

/** The registration link's token, kept for this tab so a reload still finds it. */
const TOKEN_KEY = 'geneus.registrationToken';

/**
 * Enrolling swaps the provider tree and remounts this screen, and a slow first
 * sync may outlive it entirely — so what registration still owes (the admin's
 * first shift, the PIN step) is kept in sessionStorage until the facility has
 * actually arrived, and survives a reload.
 */
const PENDING_KEY = 'geneus.pendingRegistration';
type PendingRegistration = { facilityCode: string; facilityName: string; admin: Staff };

const readPending = (): PendingRegistration | undefined => {
  const raw = sessionStorage.getItem(PENDING_KEY);

  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as PendingRegistration;
  } catch {
    return undefined;
  }
};

/** An existing password only has to be entered; a first one must meet the rules and be typed twice. */
const registrationPasswordProblem = (
  hasPassword: boolean,
  password: string,
  confirmation: string,
): string | undefined => {
  if (!hasPassword) {
    return newPasswordProblem(password, confirmation);
  }

  if (!password) {
    return 'Enter your Geneus password.';
  }

  return undefined;
};

type LinkState =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'refused'; message: string }
  | { kind: 'ready'; view: FacilityRegistrationView };

/** Reads the token from the link (then clears it from the address bar), or from this tab. */
const useRegistrationToken = (): string | undefined => {
  const { hash } = useLocation();
  const [fromLink] = useState(() => tokenFromHash(hash));
  const [token] = useState(() => fromLink ?? keptLinkToken(TOKEN_KEY));

  useEffect(() => {
    if (!fromLink) {
      return;
    }

    keepLinkToken(TOKEN_KEY, fromLink);
    window.history.replaceState(null, '', window.location.pathname);
  }, [fromLink]);

  return token;
};

/** What the link was approved for, loaded once. */
const useRegistrationLink = (token: string | undefined): LinkState => {
  const [state, setState] = useState<LinkState>(() =>
    token ? { kind: 'loading' } : { kind: 'missing' },
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    let current = true;

    openRegistrationLink(token)
      .then((view) => {
        if (current) {
          setState({ kind: 'ready', view });
        }
      })
      .catch((cause: unknown) => {
        if (current) {
          setState({
            kind: 'refused',
            message: userMessage(cause, 'This registration link cannot be used.'),
          });
        }
      });

    return () => {
      current = false;
    };
  }, [token]);

  return state;
};

/**
 * Registers the facility Geneus approved, from the link in the approval email.
 * This is the one online step: the server creates the facility, its first
 * admin and this device's credential before any record can exist. The admin
 * chooses their password here (or enters the one their email already has),
 * then their PIN once the facility has synced down.
 */
export const RegisterFacilityScreen = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { deviceId, enroll, facility } = useDeviceContext();
  const token = useRegistrationToken();
  const link = useRegistrationLink(token);
  const [pending, setPending] = useState<PendingRegistration | undefined>(() => readPending());
  // The facility record re-renders on every local change (it is a live query), so
  // this must fire once per registration, not once per render that sees a facility.
  const finishing = useRef(false);

  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  // The facility has landed: finish what registration owes, then on to the PIN.
  useEffect(() => {
    if (!pending || !facility || finishing.current) {
      return;
    }

    finishing.current = true;
    sessionStorage.removeItem(PENDING_KEY);
    (async () => {
      // Whoever registers the facility is on duty now, or nobody could get in.
      // The admin assigns their own first shift: they hold roster:assign.
      await assignShift(
        {
          staffId: pending.admin.staffId,
          day: today(),
          startsAt: new Date().toISOString(),
          endsAt: endOfToday(),
        },
        authorizationFor({ staff: pending.admin, facilityId: pending.facilityCode, deviceId }),
      );

      // Registering proved the admin with their password; the server's PIN
      // permission came back with it and is used by the PIN screen.
      approvePinSetup(pending.admin.staffId);
      navigate('/onboarding/accept', {
        state: {
          staffId: pending.admin.staffId,
          fullName: pending.admin.fullName,
          role: 'Facility Admin',
        },
      });
    })().catch((cause: unknown) => {
      finishing.current = false;
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
      toast(userMessage(cause, 'Could not finish registration. Try again.'), { tone: 'error' });
    });
  }, [pending, facility, deviceId, navigate, toast]);

  if (pending) {
    return <SyncingFacility facilityName={pending.facilityName} />;
  }

  if (link.kind !== 'ready' || !token) {
    return <RegistrationLinkProblem state={link} onStart={() => navigate('/sign-in')} />;
  }

  const { view } = link;

  const passwordProblem = registrationPasswordProblem(view.hasPassword, password, confirmation);

  const create = async () => {
    if (saving) {
      return;
    }

    if (passwordProblem) {
      setError(passwordProblem);

      return;
    }

    setSaving(true);
    setError(undefined);

    try {
      const { admin, device } = await registerFacility({ token, deviceId, password });

      keepLinkToken(TOKEN_KEY, undefined);

      // From here the facility exists on the server and this device is enrolled:
      // the rest waits for the facility to sync down (the effect above), however
      // long that takes, and survives the remount that enrolling causes.
      const registration: PendingRegistration = {
        facilityCode: view.facility.code,
        facilityName: view.facility.name,
        admin,
      };

      sessionStorage.setItem(PENDING_KEY, JSON.stringify(registration));
      setPending(registration);
      toast(`${view.facility.name} is registered.`, { tone: 'success' });
      await enroll(device);
    } catch (cause) {
      const message = userMessage(cause, 'Could not register the facility. Try again.');

      setError(message);
      toast(message, { tone: 'error' });
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-surface sm:min-h-0">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col md:max-w-lg">
        <header className="px-5 pb-3 pt-5">
          <h1 className="text-[22px] font-extrabold tracking-[-0.02em]">Register your facility</h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            Geneus approved these details. Registering sets up this device for the facility.
          </p>
        </header>

        <div className="flex-1 space-y-4 px-5 py-2">
          <dl className="space-y-2 rounded-[18px] border border-outline-soft p-4 text-[15px]">
            <ApprovedDetail label="Facility" value={view.facility.name} />
            <ApprovedDetail label="Facility code" value={view.facility.code} />
            <ApprovedDetail
              label="Level of care"
              value={FACILITY_LEVEL_LABELS[view.facility.level]}
            />
            <ApprovedDetail
              label="Location"
              value={`${view.facility.lga}, ${view.facility.state}`}
            />
            <ApprovedDetail label="Admin" value={`${view.adminFullName} · ${view.sentTo}`} />
          </dl>

          {view.hasPassword ? (
            <TextField
              label="Your Geneus password"
              hint="This email already has a Geneus password. Enter it: registering does not change it."
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={error}
              disabled={saving}
            />
          ) : (
            <NewPasswordFields
              label="Choose your password"
              password={password}
              confirmation={confirmation}
              onPassword={setPassword}
              onConfirmation={setConfirmation}
              error={error}
              disabled={saving}
            />
          )}
        </div>

        <footer className="border-t border-outline-soft bg-surface px-5 pb-6 pt-4">
          <Button variant="primary" disabled={saving} loading={saving} onClick={create}>
            Register facility
          </Button>
        </footer>
      </div>
    </div>
  );
};

const ApprovedDetail = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-4">
    <dt className="text-ink-muted">{label}</dt>
    <dd className="text-right font-semibold">{value}</dd>
  </div>
);

/** Loading the link, or why it cannot be used. */
const RegistrationLinkProblem = ({ state, onStart }: { state: LinkState; onStart: () => void }) => {
  if (state.kind === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface sm:min-h-0">
        <PulseLoader label="Opening your registration link" />
      </div>
    );
  }

  const message =
    state.kind === 'refused'
      ? state.message
      : 'Open the registration link from the approval email. To ask Geneus for a facility, use Create an account.';

  return (
    <div className="flex min-h-screen flex-col bg-surface px-5 pt-12 sm:min-h-0">
      <div className="mx-auto w-full max-w-md space-y-4">
        <h1 className="text-[22px] font-extrabold tracking-[-0.02em]">Register your facility</h1>
        <p className="text-[15px] text-ink-soft">{message}</p>
        <Button variant="outlined" onClick={onStart}>
          Back to sign-in
        </Button>
      </div>
    </div>
  );
};
