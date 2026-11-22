import { useEffect, useRef, useState } from 'react';
import type { CheckoutStart, CheckoutState } from '@shared';
import { ApiError, apiUrl, get, post } from '@/lib/api/client';

type BillCheckoutProps = {
  api: string;
  payable: boolean;
  onConfirmed: () => void;
};

const POLL_INTERVAL_MS = 3_000;
const MAX_POLLS = 20;
const REFERENCE = /^geneus-co-[a-f0-9-]{36}$/;

/**
 * The checkout this return is about. Providers add their own query to the return address, sometimes without a
 * proper separator (Monnify appends "?paymentReference=…" after our "?checkout=…"), so the reference is found
 * wherever it appears: our `checkout`, Monnify's `paymentReference` or Paystack's `reference`/`trxref`.
 */
export const checkoutReference = (search: string): string | undefined => {
  let decoded = search;
  try {
    decoded = decodeURIComponent(search);
  } catch {
    /* keep it as it came */
  }
  const found = /geneus-co-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/.exec(
    decoded,
  )?.[0];
  return found && REFERENCE.test(found) ? found : undefined;
};

export const BillCheckout = ({ api, payable, onConfirmed }: BillCheckoutProps) => {
  const reference = checkoutReference(window.location.search);
  const [payment, setPayment] = useState<CheckoutState>();
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(Boolean(reference));
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const starting = useRef(false);

  useEffect(() => {
    if (!reference) {
      return;
    }

    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;

    const confirm = async () => {
      setChecking(true);
      setError('');

      try {
        const next = await get<CheckoutState>(`${api}/checkout/${reference}`);

        if (!active) {
          return;
        }

        setPayment(next);
        polls += 1;

        if (next.status === 'paid') {
          onConfirmed();
        }

        if (next.status === 'pending' && polls < MAX_POLLS) {
          timer = setTimeout(() => void confirm(), POLL_INTERVAL_MS);
          return;
        }
      } catch (cause) {
        if (!active) {
          return;
        }

        setError(
          cause instanceof ApiError
            ? cause.message
            : 'Your payment could not be checked. Try again.',
        );
      }

      if (active) {
        setChecking(false);
      }
    };

    void confirm();

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, reference, attempt, onConfirmed]);

  const pay = async () => {
    if (starting.current) {
      return;
    }

    starting.current = true;
    setBusy(true);
    setError('');

    try {
      const checkout = await post<CheckoutStart>(`${api}/pay`, {});
      const destination = new URL(checkout.checkoutUrl);

      if (destination.protocol !== 'https:') {
        throw new Error('The provider did not return a secure checkout.');
      }

      window.location.assign(destination.toString());
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Online payment could not be started. Try again.',
      );
      setBusy(false);
      starting.current = false;
    }
  };

  const canCheckAgain = reference && !checking && payment?.status !== 'paid';
  const hasReceipt = payment?.status === 'paid' && (payment.heldMinor ?? 0) < payment.amountMinor;

  return (
    <div className="space-y-3">
      {checking ? (
        <p role="status" className="text-sm text-ink-soft">
          Confirming your payment with the provider…
        </p>
      ) : null}
      {payment?.status === 'paid' ? (
        <div role="status" className="rounded-field bg-brand-wash p-3 text-sm text-brand">
          <p className="font-bold">Payment received</p>
          {payment.heldMinor ? (
            <p className="mt-1">
              The bill balance changed while you were paying. The hospital is holding{' '}
              {payment.currency}{' '}
              {(payment.heldMinor / 100).toLocaleString('en-NG', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              for staff to review.
            </p>
          ) : null}
        </div>
      ) : null}
      {payment?.status === 'failed' ? (
        <p role="status" className="text-sm text-ink-soft">
          No live payment was applied. A test checkout does not settle this bill. Contact the
          hospital if your account was debited.
        </p>
      ) : null}
      {payment?.status === 'expired' ? (
        <p role="status" className="text-sm text-ink-soft">
          This checkout has expired. Check the payment again if your account was debited, or start a
          new checkout.
        </p>
      ) : null}
      {payment?.status === 'pending' && !checking ? (
        <p role="status" className="text-sm text-ink-soft">
          Your payment is still awaiting confirmation. Check again before starting another payment.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {canCheckAgain ? (
        <button
          type="button"
          className="min-h-[48px] w-full rounded-field border-[1.5px] border-brand px-4 font-bold text-brand"
          onClick={() => setAttempt((value) => value + 1)}
        >
          Check payment again
        </button>
      ) : null}
      {hasReceipt ? (
        <a
          href={apiUrl(`${api}/checkout/${reference}/receipt`)}
          className="flex min-h-[48px] items-center justify-center rounded-field border-[1.5px] border-brand px-4 font-bold text-brand"
        >
          Download receipt
        </a>
      ) : null}
      {payable && !checking && payment?.status !== 'paid' && payment?.status !== 'pending' ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void pay()}
          className="min-h-[48px] w-full rounded-field bg-brand px-4 font-bold text-white disabled:opacity-60"
        >
          {busy ? 'Opening payment…' : 'Pay now'}
        </button>
      ) : null}
    </div>
  );
};
