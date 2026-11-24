import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import type { FacilitySignupReview } from '@shared';
import { Button, PulseLoader, TextAreaField, useToast } from '@/ui';
import {
  decideSignupRequest,
  openSignupReview,
  resendSignupDecision,
} from '@/lib/api/facilitySignupReview';
import { userMessage } from '@/lib/api/userMessage';
import { keepLinkToken, keptLinkToken, tokenFromHash } from '@/lib/linkToken';
import { FACILITY_LEVEL_LABELS } from '@/modules/administration/screens/facility-onboarding/facilityLevels';

const TOKEN_KEY = 'geneus.facilityReviewToken';

const STATUS_LABELS: Record<FacilitySignupReview['status'], string> = {
  requested: 'Waiting for a decision',
  approved: 'Approved',
  rejected: 'Rejected',
};

type ReviewState =
  | { kind: 'loading' }
  | { kind: 'refused'; message: string }
  | { kind: 'ready'; review: FacilitySignupReview };

/** Reads the token from the link (then clears it from the address bar), or from this tab. */
const useReviewToken = (): string | undefined => {
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

/** Whether the requester has not heard about the decision, and the operator should send it again. */
const requesterNotReached = (review: FacilitySignupReview): boolean =>
  review.status !== 'requested' &&
  !review.registeredOn &&
  review.requesterEmail !== undefined &&
  review.requesterEmail !== 'sent';

/**
 * A Geneus operator deciding a facility sign-up request, from the link in the
 * email they were sent. Opening the page changes nothing; approving emails the
 * requester a registration link, rejecting emails them the reason. The decision
 * is recorded under this operator's name.
 */
export const FacilityRequestReviewScreen = () => {
  const toast = useToast();
  const token = useReviewToken();
  const [state, setState] = useState<ReviewState>(() =>
    token
      ? { kind: 'loading' }
      : { kind: 'refused', message: 'Open the review link from the email you were sent.' },
  );
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }

    let current = true;

    openSignupReview(token)
      .then((review) => {
        if (current) {
          setState({ kind: 'ready', review });
        }
      })
      .catch((cause: unknown) => {
        if (current) {
          setState({
            kind: 'refused',
            message: userMessage(cause, 'This review link cannot be used.'),
          });
        }
      });

    return () => {
      current = false;
    };
  }, [token]);

  /** Runs one decision call, showing what it did. */
  const act = async (
    call: () => Promise<FacilitySignupReview>,
    success: (review: FacilitySignupReview) => string,
    fallback: string,
  ) => {
    if (busy) {
      return;
    }

    setBusy(true);

    try {
      const review = await call();

      setState({ kind: 'ready', review });
      setRejecting(false);
      toast(success(review), { tone: 'success' });
    } catch (cause) {
      toast(userMessage(cause, fallback), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (state.kind === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <PulseLoader label="Opening the request" />
      </div>
    );
  }

  if (state.kind === 'refused' || !token) {
    return (
      <ReviewFrame>
        <p className="text-[15px] text-ink-soft">
          {state.kind === 'refused' ? state.message : 'Open the review link from the email.'}
        </p>
      </ReviewFrame>
    );
  }

  const { review } = state;
  const emailed = (decided: FacilitySignupReview) =>
    decided.requesterEmail === 'sent'
      ? `${decided.adminEmail} has been emailed.`
      : `The email to ${decided.adminEmail} did not go out. Send it again below.`;

  const approve = () =>
    act(
      () => decideSignupRequest(token, 'approve'),
      (decided) => `Approved. ${emailed(decided)}`,
      'Could not approve the request. Try again.',
    );

  const reject = () =>
    act(
      () => decideSignupRequest(token, 'reject', note),
      (decided) => `Rejected. ${emailed(decided)}`,
      'Could not reject the request. Try again.',
    );

  const resend = () =>
    act(
      () => resendSignupDecision(token),
      (decided) => emailed(decided),
      'Could not send the email. Try again.',
    );

  return (
    <ReviewFrame>
      <p className="text-[13px] font-semibold text-ink-muted">{STATUS_LABELS[review.status]}</p>

      <dl className="mt-3 space-y-2 rounded-[18px] border border-outline-soft p-4 text-[15px]">
        <ReviewDetail label="Facility" value={review.facility.name} />
        <ReviewDetail label="Facility code" value={review.facility.code} />
        <ReviewDetail label="Level of care" value={FACILITY_LEVEL_LABELS[review.facility.level]} />
        <ReviewDetail label="Location" value={`${review.facility.lga}, ${review.facility.state}`} />
        <ReviewDetail label="Requested by" value={review.adminFullName} />
        <ReviewDetail label="Email (confirmed)" value={review.adminEmail} />
        <ReviewDetail label="Requested" value={new Date(review.requestedOn).toLocaleString()} />
      </dl>

      {review.decision ? (
        <div className="mt-4 rounded-[18px] bg-brand-tint p-4 text-[14px]">
          <p>
            {STATUS_LABELS[review.status]} by <b>{review.decision.decidedBy}</b> on{' '}
            {new Date(review.decision.decidedOn).toLocaleString()}.
          </p>
          {review.decision.note ? <p className="mt-1">Note: {review.decision.note}</p> : null}
          {review.registeredOn ? (
            <p className="mt-1">
              The facility was registered on {new Date(review.registeredOn).toLocaleString()}.
            </p>
          ) : null}
        </div>
      ) : null}

      {review.status === 'requested' && !rejecting ? (
        <div className="mt-6 space-y-3">
          <Button variant="primary" loading={busy} disabled={busy} onClick={approve}>
            Approve and email the registration link
          </Button>
          <Button variant="danger-outline" disabled={busy} onClick={() => setRejecting(true)}>
            Reject
          </Button>
        </div>
      ) : null}

      {review.status === 'requested' && rejecting ? (
        <div className="mt-6 space-y-3">
          <TextAreaField
            label="Why is it rejected?"
            name="rejection_note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={1000}
          />
          <p className="text-[13px] text-ink-muted">
            This reason is emailed to {review.adminEmail}.
          </p>
          <Button
            variant="danger-outline"
            loading={busy}
            disabled={busy || note.trim().length < 3}
            onClick={reject}
          >
            Reject and email the reason
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setRejecting(false)}>
            Cancel
          </Button>
        </div>
      ) : null}

      {requesterNotReached(review) ? (
        <div className="mt-6 space-y-3">
          <p className="text-[14px] text-danger">
            The email telling {review.adminEmail} the decision did not go out.
          </p>
          <Button variant="outlined" loading={busy} disabled={busy} onClick={resend}>
            Send the email again
          </Button>
        </div>
      ) : null}

      <p className="mt-8 text-[12px] text-ink-muted">
        Signed in from your review link as {review.reviewer.name} ({review.reviewer.email}).
      </p>
    </ReviewFrame>
  );
};

const ReviewFrame = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen bg-surface px-5 py-10">
    <div className="mx-auto w-full max-w-lg">
      <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
        Geneus operator
      </p>
      <h1 className="mt-1 text-[22px] font-extrabold tracking-[-0.02em]">Facility request</h1>
      <div className="mt-5">{children}</div>
    </div>
  </div>
);

const ReviewDetail = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-4">
    <dt className="text-ink-muted">{label}</dt>
    <dd className="text-right font-semibold">{value}</dd>
  </div>
);
