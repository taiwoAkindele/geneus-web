import { useCallback, useEffect, useState } from 'react';
import { mayApprovePin, type Staff } from '@shared';
import { useSyncStatus } from '@/data';
import { describeInsuranceError } from '@/lib/api/insurance';
import {
  invitationNeedsAttention,
  revokeStaffInvitation,
  sendStaffInvitation,
  staffContactActivation,
  staffOnboardingSummaries,
  type ContactActivation,
  type InvitationView,
  type StaffOnboardingSummary,
} from '@/lib/api/staff';
import { EmailConfirmationsCard } from '@/modules/administration/screens/facility-onboarding/EmailConfirmationsCard';
import {
  StaffVerification,
  useStaffVerification,
  useAuth,
  useAuthorizationContext,
} from '@/session';
import { Button, Tag, TextField, useToast } from '@/ui';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
const isEmail = (value: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());

/** One plain sentence for where an invitation stands. Delivery is what the email service said, never more. */
const invitationSummary = (
  invitation: InvitationView,
): { tone: 'green' | 'amber' | 'neutral'; text: string } => {
  switch (invitation.status) {
    case 'accepted':
      return { tone: 'green', text: `Accepted ${when(invitation.acceptedOn!)}.` };
    case 'expired':
      return {
        tone: 'amber',
        text: `The invitation to ${invitation.destination} expired ${when(invitation.expiresOn)} without being used. Send a new one.`,
      };
    case 'locked':
      return {
        tone: 'amber',
        text: 'Too many wrong codes were entered for this invitation, so it stopped working. Send a new one.',
      };
    case 'revoked':
      return {
        tone: 'neutral',
        text:
          invitation.revokedReason === 'pin_code_issued'
            ? 'Replaced by a PIN code given in person.'
            : `Withdrawn ${when(invitation.revokedOn!)}.`,
      };
    case 'pending':
      switch (invitation.delivery) {
        case 'provider_rejected':
          return {
            tone: 'amber',
            text: `The email to ${invitation.destination} could not be sent. Check the address and send again.`,
          };
        case 'not_configured':
          return {
            tone: 'amber',
            text: 'Email is not set up on this server, so nothing was sent. Give them a PIN code in person instead.',
          };
        case 'sending':
          return {
            tone: 'amber',
            text: `Sending to ${invitation.destination} was not confirmed. Send again if it does not arrive.`,
          };
        case 'provider_accepted':
          return {
            tone: 'neutral',
            text: `Emailed to ${invitation.destination} — handed to the email service, which does not confirm it arrived. Waiting for them to use it before ${when(invitation.expiresOn)}.`,
          };
      }
  }
};

/**
 * Contact & activation on a staff profile: the person's verified email, the
 * invitation that lets them set their PIN, and whether their PIN has reached
 * the server. All of it is kept on the server only, so it needs a connection
 * and the administrator's own verified session. Nothing here grants access:
 * their roles at this facility do.
 */
export const ContactActivationSection = ({ staff }: { staff: Staff }) => {
  const context = useAuthorizationContext();
  const { roster } = useAuth();
  const sync = useSyncStatus();
  const online = sync.connected || (typeof navigator !== 'undefined' && navigator.onLine);
  if (!context.permissions.includes('staff:manage')) {
    return null;
  }
  const actor = roster.find((entry) => entry.staff.staffId === context.userId)?.staff;
  const canInvite =
    staff.active &&
    staff.staffId !== context.userId &&
    Boolean(actor && mayApprovePin(actor, staff));
  return (
    <section
      aria-label="Contact and activation"
      className="space-y-3 rounded-card border border-outline-soft bg-white p-5"
    >
      <h2 className="font-bold">Contact &amp; activation</h2>
      {!online ? (
        <p role="status" className="text-sm text-ink-muted">
          Contact details and invitations are kept on the server. Connect to the internet to see or
          change them.
        </p>
      ) : (
        <StaffVerification requireServerSession purpose="Viewing contact details and invitations">
          <Details staff={staff} canInvite={canInvite} />
        </StaffVerification>
      )}
      <EmailConfirmationsCard staffId={staff.staffId} />
      <p className="text-xs leading-relaxed text-ink-muted">
        A verified email shows the person can read that inbox. It does not confirm who they are or
        give them any access — their roles at this facility decide that.
      </p>
    </section>
  );
};

const Details = ({ staff, canInvite }: { staff: Staff; canInvite: boolean }) => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const [state, setState] = useState<ContactActivation>();
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<'send' | 'revoke'>();
  const load = useCallback(() => {
    setError('');
    void staffContactActivation(context, staff.staffId).then(setState, (cause) =>
      setError(describeInsuranceError(cause)),
    );
  }, [context, staff.staffId]);
  useEffect(() => {
    load();
  }, [load]);

  if (error && !state) {
    return (
      <div role="alert" className="text-sm text-danger">
        {error}{' '}
        <Button variant="ghost" fullWidth={false} onClick={load}>
          Try again
        </Button>
      </div>
    );
  }
  if (!state) {
    return (
      <div
        role="status"
        aria-label="Loading contact details"
        className="h-16 animate-pulse rounded-field bg-surface-muted"
      />
    );
  }

  const invitation = state.invitation;
  const waiting = invitation?.status === 'pending';
  const activated = state.activation.serverPinDevices > 0;
  // A verified address is the only place an invitation may go; the administrator sees it masked and need not type it.
  const needsAddress = !state.email;
  const coolingDown =
    state.nextSendAllowedOn !== undefined && Date.parse(state.nextSendAllowedOn) > Date.now();
  const run = async (kind: 'send' | 'revoke', action: () => Promise<string>) => {
    if (busy) {
      return;
    }
    setBusy(kind);
    setError('');
    try {
      toast(await action());
      setEmail('');
      load();
    } catch (cause) {
      setError(describeInsuranceError(cause));
    } finally {
      setBusy(undefined);
    }
  };
  const send = () =>
    run('send', async () => {
      const { invitation: sent } = await sendStaffInvitation(
        context,
        staff.staffId,
        needsAddress ? email.trim() : undefined,
      );
      return sent.delivery === 'provider_accepted'
        ? `Invitation emailed to ${sent.destination}`
        : invitationSummary(sent).text;
    });
  const revoke = () =>
    run('revoke', async () => {
      await revokeStaffInvitation(context, staff.staffId);
      return 'Invitation withdrawn';
    });
  const summary = invitation ? invitationSummary(invitation) : undefined;

  return (
    <div className="space-y-4">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-semibold">Email</dt>
          <dd className="mt-1 flex flex-wrap items-center gap-2">
            {state.email ? (
              <>
                <span>{state.email.address}</span>
                <Tag tone="green">Verified</Tag>
              </>
            ) : (
              <span className="text-ink-muted">No verified email</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Activation</dt>
          <dd className="mt-1">
            {activated ? (
              <span className="flex flex-wrap items-center gap-2">
                <Tag tone="green">Active</Tag>
                <span>
                  PIN registered with the server on {state.activation.serverPinDevices}{' '}
                  {state.activation.serverPinDevices === 1 ? 'device' : 'devices'}
                </span>
              </span>
            ) : (
              <span className="text-ink-muted">
                No PIN registered with the server yet. A PIN set on a phone without internet counts
                once that phone connects.
              </span>
            )}
          </dd>
        </div>
      </dl>
      {summary ? (
        <p
          className={`rounded-field border p-3 text-sm ${summary.tone === 'amber' ? 'border-amber-border bg-amber-bg' : 'border-outline-soft'}`}
        >
          <strong>Invitation: </strong>
          {summary.text}
        </p>
      ) : null}
      {canInvite ? (
        <div className="space-y-3">
          {needsAddress && invitation?.status !== 'accepted' ? (
            <TextField
              label="Email address"
              type="email"
              autoComplete="off"
              inputMode="email"
              value={email}
              placeholder={invitation?.destination ?? 'e.g. amaka@example.org'}
              hint="We email them a one-time code to set their PIN on one of this facility's devices. The code is never shown to you."
              onChange={(event) => setEmail(event.target.value)}
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            {invitation?.status !== 'accepted' || !activated ? (
              <Button
                fullWidth={false}
                loading={busy === 'send'}
                disabled={Boolean(busy) || coolingDown || (needsAddress && !isEmail(email))}
                onClick={() => void send()}
              >
                {invitation && invitation.status !== 'accepted' ? 'Send again' : 'Send invitation'}
              </Button>
            ) : null}
            {waiting ? (
              <Button
                variant="outlined"
                fullWidth={false}
                loading={busy === 'revoke'}
                disabled={Boolean(busy)}
                onClick={() => void revoke()}
              >
                Withdraw invitation
              </Button>
            ) : null}
          </div>
          {coolingDown ? (
            <p className="text-xs text-ink-muted">You can send again in a minute.</p>
          ) : null}
          {waiting ? (
            <p className="text-xs text-ink-muted">
              Sending again replaces the earlier code. A code read aloud also replaces it.
            </p>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
};

/**
 * Invitation and activation state for the Staff directory, read from the server
 * when this person has a verified session; `undefined` otherwise (offline, no
 * session or no permission) — the directory then simply shows nothing extra.
 */
export const useOnboardingSummaries = () => {
  const context = useAuthorizationContext();
  const { hasServerSession } = useStaffVerification();
  const allowed = context.permissions.includes('staff:manage') && hasServerSession;
  const [summaries, setSummaries] = useState<Map<string, StaffOnboardingSummary>>();
  useEffect(() => {
    if (!allowed) {
      setSummaries(undefined);
      return;
    }
    let alive = true;
    void staffOnboardingSummaries(context).then(
      (r) => {
        if (alive) {
          setSummaries(new Map(r.staff.map((s) => [s.staffId, s])));
        }
      },
      () => {
        if (alive) {
          setSummaries(undefined);
        }
      },
    );
    return () => {
      alive = false;
    };
  }, [context, allowed]);
  return summaries;
};

/** A short label for a person who was invited and has not yet activated; nothing otherwise. */
export const onboardingTag = (
  summary: StaffOnboardingSummary | undefined,
): { tone: 'amber' | 'neutral'; label: string } | undefined => {
  if (
    !summary?.invitation ||
    summary.activated ||
    summary.invitation.status === 'accepted' ||
    summary.invitation.status === 'revoked'
  ) {
    return undefined;
  }
  return invitationNeedsAttention(summary.invitation)
    ? { tone: 'amber', label: 'Invitation needs attention' }
    : { tone: 'neutral', label: 'Invited' };
};
