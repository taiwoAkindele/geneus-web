import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Role } from '@shared';
import { Button, TextField } from '@/ui';
import { useDeviceContext } from '@/data';
import { getDeviceCredential } from '@/data/deviceCredential';
import { listFacilityWorkspaces, switchFacilityWorkspace } from '@/data/facilityWorkspaces';
import { ApiError } from '@/lib/api/client';
import {
  enrolDeviceFromInvitation,
  invitationLinkCode,
  openInvitationLink,
  type InvitationLinkView,
} from '@/lib/api/staff';
import { rememberSetupCode } from '@/lib/api/staffSession';
import { ROLE_LABELS } from '@/modules/operations/staff';
import { approvePinSetup } from '@/session';
import { invitationStep, invitationTokenFromHash } from './invitationLink';

/** In words the person holding the phone can act on; a refusal from the server already is. */
const explain = (cause: unknown, fallback: string): string => {
  if (cause instanceof ApiError && cause.code === 'offline') {
    return 'Can’t reach Geneus. Check the internet connection and try again.';
  }

  if (cause instanceof Error && cause.message) {
    return cause.message;
  }

  return fallback;
};

const UNUSABLE: Record<string, string> = {
  expired: 'This invitation has expired.',
  revoked: 'This invitation was withdrawn, or replaced by a newer one.',
  locked: 'This invitation stopped working after too many wrong codes.',
};

/**
 * The token for this tab only, so the screen survives being remounted once the device enrols.
 * Storage can be unavailable (private mode); the token in hand still works then.
 */
const TOKEN_KEY = 'geneus.invitationToken';
const keepToken = (token: string | undefined) => {
  try {
    if (token) {
      sessionStorage.setItem(TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    /* the token in hand is enough */
  }
};
const keptToken = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
};
const initialToken = () => {
  const fromLink = invitationTokenFromHash(window.location.hash);
  if (fromLink) {
    keepToken(fromLink);
  }
  return fromLink ?? invitationTokenFromHash(`#token=${keptToken() ?? ''}`);
};

const Card = ({ children }: { children: ReactNode }) => (
  <div className="mt-6 space-y-4 rounded-[22px] bg-white p-5 text-[15px] text-ink">{children}</div>
);
const Steps = ({ current }: { current: 1 | 2 }) => (
  <ol className="flex gap-4 text-sm" aria-label="Steps">
    {['Set up this device', 'Choose your PIN'].map((label, index) => (
      <li
        key={label}
        aria-current={index + 1 === current ? 'step' : undefined}
        className={index + 1 === current ? 'font-bold text-white' : 'text-brand-on-dark'}
      >
        {index + 1}. {label}
      </li>
    ))}
  </ol>
);

/**
 * Accept invitation (SCHEMA.md §10). Opened from the link in a staff invitation
 * email. It reads who the invitation is for, then takes the shortest path this
 * device allows: straight to choosing a PIN on one of the facility's devices;
 * setting up this device first when the administrator allowed it; otherwise it
 * explains where to open the link. The person never copies a code by hand. The
 * token is removed from the address bar as soon as it is read.
 */
export const InvitationScreen = () => {
  const navigate = useNavigate();
  const { deviceId, enroll } = useDeviceContext();
  const [token] = useState(initialToken);
  const [view, setView] = useState<InvitationLinkView>();
  const [loadError, setLoadError] = useState<string>();
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    document.title = 'Accept invitation · Geneus Health';
  }, []);
  // Keep the token out of browser history and anything the address bar is shared with.
  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
  }, []);
  useEffect(() => {
    if (!token) {
      return;
    }
    let alive = true;
    setLoadError(undefined);
    openInvitationLink(token).then(
      (found) => {
        if (alive) {
          setView(found);
        }
      },
      (cause) => {
        if (alive) {
          setLoadError(explain(cause, 'This invitation could not be opened'));
        }
      },
    );
    return () => {
      alive = false;
    };
  }, [token, attempt]);

  const credential = getDeviceCredential();
  const workspaces = listFacilityWorkspaces();
  const step = view
    ? invitationStep(view, {
        facilityId: credential?.facilityId,
        workspaceFacilityIds: workspaces.map((w) => w.facilityId),
      })
    : undefined;
  const firstName = view?.staffName.split(' ')[0] ?? 'there';

  const run = async (message: string, action: () => Promise<void>, fallback: string) => {
    if (busy) {
      return;
    }
    setBusy(message);
    setError(undefined);
    try {
      await action();
    } catch (cause) {
      setError(explain(cause, fallback));
    } finally {
      setBusy(undefined);
    }
  };

  // Nothing more can be done with a link that is accepted or unusable: forget it.
  useEffect(() => {
    if (step === 'done' || step === 'unusable') {
      keepToken(undefined);
    }
  }, [step]);

  /** On a facility device: swap the link for a one-time setup code, approved here, and go to choosing the PIN. */
  const toPinSetup = async (link: string, invited: InvitationLinkView) => {
    const { staffId, code } = await invitationLinkCode(link);
    rememberSetupCode(staffId, code, true);
    approvePinSetup(staffId);
    keepToken(undefined);
    navigate('/onboarding/accept', {
      replace: true,
      state: {
        staffId,
        fullName: invited.staffName,
        role: ROLE_LABELS[invited.role as Role] ?? invited.role,
      },
    });
  };
  const choosePin = () =>
    run(
      'Opening your invitation…',
      () => toPinSetup(token!, view!),
      'Your invitation could not be opened',
    );

  const setUpDevice = () =>
    run(
      'Setting up this device and syncing. This can take a minute on a slow connection…',
      async () => {
        const issued = await enrolDeviceFromInvitation(token!, deviceId, label);
        await enroll(issued);
        await toPinSetup(token!, view!);
      },
      'This device could not be set up',
    );

  // Adding or opening another facility reloads Geneus, so the person opens the link again afterwards.
  const addFacility = () =>
    run(
      'Adding this facility…',
      async () => {
        const issued = await enrolDeviceFromInvitation(
          token!,
          `device:${crypto.randomUUID()}`,
          label,
        );
        await switchFacilityWorkspace(issued.deviceId, issued);
      },
      'This facility could not be added',
    );
  const openFacility = () =>
    run(
      'Opening the facility…',
      async () => {
        const target = workspaces.find((w) => w.facilityId === view!.facilityId);
        if (!target) {
          throw new Error('This facility is no longer on this device');
        }
        await switchFacilityWorkspace(target.deviceId);
      },
      'The facility could not be opened',
    );

  const reopenNote = (
    <p className="text-sm text-ink-muted">
      Geneus restarts in {view?.facilityName}. Then open the invitation link from your email again
      to choose your PIN.
    </p>
  );
  const deviceName = (
    <TextField
      label="Name for this device"
      name="device_label"
      placeholder="e.g. Ward 2 phone"
      hint="Helps your administrator tell devices apart"
      value={label}
      onChange={(event) => setLabel(event.target.value)}
      disabled={Boolean(busy)}
    />
  );
  const renderStatus = () => {
    if (busy) {
      return (
        <p role="status" className="text-sm text-ink-muted">
          {busy}
        </p>
      );
    }

    if (error) {
      return (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      );
    }

    return null;
  };
  const status = renderStatus();

  let body: ReactNode;
  if (!token) {
    body = (
      <Card>
        <p>
          This invitation link is incomplete. Open it again from your email, or ask your
          administrator to send a new invitation.
        </p>
        <Button variant="outlined" onClick={() => navigate('/login')}>
          Go to sign-in
        </Button>
      </Card>
    );
  } else if (loadError) {
    body = (
      <Card>
        <p role="alert">{loadError}</p>
        <Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
      </Card>
    );
  } else if (!view || !step) {
    body = (
      <Card>
        <p role="status" className="text-ink-muted">
          Opening your invitation…
        </p>
      </Card>
    );
  } else if (step === 'done') {
    body = (
      <Card>
        <p>
          You have already accepted this invitation. Sign in with your PIN on {view.facilityName}’s
          devices.
        </p>
        <Button onClick={() => navigate('/login')}>Go to sign-in</Button>
      </Card>
    );
  } else if (step === 'unusable') {
    body = (
      <Card>
        <p>
          {UNUSABLE[view.status] ?? 'This invitation can no longer be used.'} Ask your administrator
          to send a new invitation.
        </p>
      </Card>
    );
  } else if (step === 'pin') {
    body = (
      <Card>
        <p>
          This device belongs to {view.facilityName}. Next, choose the 6-digit PIN you’ll use to
          sign in at the start of every shift.
        </p>
        {status}
        <Button onClick={() => void choosePin()} loading={Boolean(busy)} disabled={Boolean(busy)}>
          Choose my PIN
        </Button>
      </Card>
    );
  } else if (step === 'new_device') {
    body = (
      <>
        <Steps current={1} />
        <Card>
          <p>
            Your administrator allowed this invitation to set up this device for {view.facilityName}
            . You need an internet connection for this step only.
          </p>
          {deviceName}
          {status}
          <Button
            onClick={() => void setUpDevice()}
            loading={Boolean(busy)}
            disabled={Boolean(busy) || !label.trim()}
          >
            Set up this device
          </Button>
        </Card>
      </>
    );
  } else if (step === 'add_facility') {
    body = (
      <Card>
        <p>
          This device is set up for another facility. Your administrator allowed this invitation to
          add {view.facilityName} to it as well; each facility’s records stay separate.
        </p>
        {deviceName}
        {reopenNote}
        {status}
        <Button
          onClick={() => void addFacility()}
          loading={Boolean(busy)}
          disabled={Boolean(busy) || !label.trim()}
        >
          Add {view.facilityName}
        </Button>
      </Card>
    );
  } else if (step === 'switch_facility') {
    body = (
      <Card>
        <p>{view.facilityName} is on this device, but another facility is open.</p>
        {reopenNote}
        {status}
        <Button
          onClick={() => void openFacility()}
          loading={Boolean(busy)}
          disabled={Boolean(busy)}
        >
          Open {view.facilityName}
        </Button>
      </Card>
    );
  } else {
    body = (
      <Card>
        <p>
          This device isn’t set up for {view.facilityName}. Open this link on one of{' '}
          {view.facilityName}’s phones or computers, or ask your administrator to add this device.
        </p>
        {credential ? (
          <Button variant="outlined" onClick={() => navigate('/login')}>
            Go to sign-in
          </Button>
        ) : (
          <Link
            to="/onboarding/join"
            className="inline-flex min-h-[44px] items-center font-bold text-brand underline"
          >
            I have a device code from my administrator
          </Link>
        )}
      </Card>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-brand px-7 pb-8 pt-12 text-white sm:min-h-0">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="relative mb-7 h-14 w-14 flex-none rounded-2xl bg-brand-accent-soft">
          <div className="absolute left-1/2 top-1/2 h-[7px] w-6 -translate-x-1/2 -translate-y-1/2 rounded bg-brand" />
          <div className="absolute left-1/2 top-1/2 h-6 w-[7px] -translate-x-1/2 -translate-y-1/2 rounded bg-brand" />
        </div>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.02em]">
          {view ? `Welcome, ${firstName}` : 'Accept invitation'}
        </h1>
        {view ? (
          <p className="mb-4 mt-3 text-[15px] leading-relaxed text-brand-on-dark">
            {view.facilityName} invited you to Geneus as{' '}
            {ROLE_LABELS[view.role as Role] ?? view.role}.
          </p>
        ) : null}
        {body}
      </div>
    </div>
  );
};
