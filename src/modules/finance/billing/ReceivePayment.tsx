import { useEffect, useRef, useState } from 'react';
import type { IncomingTransfer, Payment } from '@shared';
import { recordPayment } from '@/data/repos/billing';
import { useAuthorizationContext, StaffVerification } from '@/session';
import { Button, SegmentedControl, Sheet, TextField, useToast } from '@/ui';
import { userMessage } from '@/lib/api/userMessage';
import { amountInput, parseAmount } from '@/lib/money';
import { billingRequest, matchTransfer, type ReceivingAccount } from '@/lib/api/billing';
import { billingRows } from './ledger';
import type { BillingData } from './useBilling';
import { PaymentInputError, preparePayment } from './paymentDraft';
import { useReceiptCapacity } from './ReceiptCapacity';
import { unlinkedTransfers } from './billDocuments';
import { displayMoney, whenText } from './billingUi';

type Row = ReturnType<typeof billingRows>[number];
type Method = 'cash' | 'bank';
/** One amount applied to the oldest unpaid charges first, as before. Returns what is left over. */
const split = (payable: readonly Row[], minor: number, currency: string) => {
  const amounts: Record<string, string> = {};
  let left = minor;
  for (const r of payable) {
    if (left <= 0) {
      break;
    }
    const part = Math.min(left, r.balanceMinor);
    amounts[r.charge.id] = amountInput(part, currency);
    left -= part;
  }
  return { amounts, left };
};
const parseOr = (value: string, currency: string) => {
  try {
    return value.trim() ? parseAmount(value, currency) : 0;
  } catch {
    return undefined;
  }
};

/**
 * Receive payment for one bill: cash or a verified bank transfer, one review, then record.
 * Validation, the oldest-first split, server allocation and offline cash are the existing ones.
 */
export const ReceivePayment = ({
  patientId,
  chargeIds,
  data,
  transfer: given,
  onClose,
  onReceipt,
  onSaved,
}: {
  patientId: string;
  chargeIds: readonly string[];
  data: BillingData;
  transfer?: IncomingTransfer;
  onClose: () => void;
  onReceipt: (payment: Payment) => void;
  onSaved: () => void;
}) => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const allowed = context.permissions.includes('payment:receive');
  const rows = billingRows(
    data.charges.filter((c) => c.patientId === patientId && chargeIds.includes(c.id)),
    data.payments,
    data.adjustments,
    data.coverage,
  );
  const patient = data.patients.find((p) => p.patientId === patientId);
  const [method, setMethod] = useState<Method>(given ? 'bank' : 'cash');
  const [transfer, setTransfer] = useState<IncomingTransfer | undefined>(given);
  const [received, setReceived] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);
  const [showSplit, setShowSplit] = useState(false);
  const [review, setReview] = useState<ReturnType<typeof preparePayment>>();
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState<ReceivingAccount[]>();
  const saving = useRef(false);
  const requestId = useRef(crypto.randomUUID());
  const errorBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) {
      errorBox.current?.focus();
    }
  }, [error]);

  const bankTransfer = method === 'bank' ? transfer : undefined;
  const payable = rows
    .filter(
      (r) => r.balanceMinor > 0 && (!bankTransfer || bankTransfer.currency === r.charge.currency),
    )
    .sort(
      (a, b) =>
        a.charge.createdOn.localeCompare(b.charge.createdOn) ||
        a.charge.id.localeCompare(b.charge.id),
    );
  const currency =
    new Set(payable.map((r) => r.charge.currency)).size === 1
      ? payable[0].charge.currency
      : undefined;
  const due = payable.reduce((n, r) => n + r.balanceMinor, 0);
  const money = (n: number) => displayMoney(n, currency ?? rows[0]?.charge.currency ?? 'NGN');

  const candidates = unlinkedTransfers(data.transfers, data.payments).filter(
    (t) => !currency || t.transfer.currency === currency,
  );
  const capacity = useReceiptCapacity(
    [...candidates.map((t) => t.transfer.id), ...(transfer ? [transfer.id] : [])],
    data.payments.length,
  );
  const available = bankTransfer ? capacity.sources[bankTransfer.id]?.availableMinor : undefined;

  // Until the cashier types, the amount is the whole amount due (or what the chosen transfer can still cover).
  useEffect(() => {
    if (touched || !currency) {
      return;
    }
    let target = 0;

    if (method === 'cash') {
      target = due;
    } else if (bankTransfer && available !== undefined) {
      target = Math.min(due, available);
    }

    setReceived(target ? amountInput(target, currency) : '');
    setAmounts(split(payable, target, currency).amounts);
    // `payable` is rebuilt (and re-sorted) on every render. Listing it here would re-run
    // this effect each render and overwrite the default, so the effect keys on the values
    // that actually change the default amount instead.
  }, [touched, currency, method, bankTransfer?.id, available, due]);

  const typed = currency ? parseOr(received, currency) : undefined;
  const over = typed !== undefined && typed > due ? typed - due : 0;
  const cashNote = over
    ? `Cash · give back ${money(over)} as change. Saved on this device first, so it works offline.`
    : 'Cash · saved on this device first, so it works offline.';
  const availabilityPendingText = capacity.busy
    ? 'checking what is left…'
    : 'availability not checked yet';
  const total = Object.values(amounts).reduce(
    (n, v) => n + (currency ? (parseOr(v, currency) ?? 0) : 0),
    0,
  );

  const enter = (value: string) => {
    setTouched(true);
    setReceived(value);
    setError('');
    setFieldError(undefined);
    setReview(undefined);
    if (!currency) {
      return;
    }
    const minor = parseOr(value, currency);
    if (minor === undefined) {
      setError('Enter the amount in numbers, for example 20500 or 20500.50.');
      return;
    }
    setAmounts(split(payable, minor, currency).amounts);
  };
  const choose = (next: Method) => {
    setMethod(next);
    setTouched(false);
    setReview(undefined);
    setError('');
    setFieldError(undefined);
  };
  const pick = (t?: IncomingTransfer) => {
    setTransfer(t);
    requestId.current = crypto.randomUUID();
    setTouched(false);
    setReview(undefined);
    setError('');
  };

  const check = () => {
    if (method === 'bank' && !bankTransfer) {
      throw new PaymentInputError('Choose the transfer the patient made.');
    }
    if (bankTransfer && available === undefined) {
      throw new PaymentInputError(
        'Checking how much of this transfer is still available. Try again in a moment.',
      );
    }
    return preparePayment(payable, amounts, bankTransfer, available);
  };
  const startReview = () => {
    setError('');
    setFieldError(undefined);
    try {
      setReview(check());
    } catch (cause) {
      const message = userMessage(cause, 'Check the payment amount.');
      setError(message);
      toast(message, { tone: 'error' });
      if (cause instanceof PaymentInputError && cause.chargeId) {
        setFieldError(cause.chargeId);
        setShowSplit(true);
      }
    }
  };
  const record = async () => {
    if (saving.current) {
      return;
    }
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      const checked = check();
      if (!review || JSON.stringify(review) !== JSON.stringify(checked)) {
        setReview(undefined);
        throw new Error(
          'The bill changed while you were reviewing. Check the amount and review it again.',
        );
      }
      const payment = bankTransfer
        ? await matchTransfer(
            context,
            bankTransfer.id,
            patientId,
            checked.allocations,
            requestId.current,
          )
        : await recordPayment(
            {
              patientId,
              method: 'cash',
              currency: checked.currency,
              allocations: checked.allocations,
            },
            context,
          );
      toast(
        bankTransfer
          ? `${money(payment.amountMinor)} applied from the transfer`
          : `${money(payment.amountMinor)} cash recorded`,
      );
      onReceipt(payment);
      onSaved();
    } catch (cause) {
      const message = userMessage(cause, 'The payment was not recorded. Try again.');
      setError(message);
      toast(message, { tone: 'error' });
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  const description = (id: string) =>
    rows.find((r) => r.charge.id === id)?.charge.description ?? 'Charge';
  const pending = rows.reduce((n, r) => n + r.undeterminedMinor, 0);

  const renderPaymentForm = () => {
    if (!allowed) {
      return <p>Your account can't receive payments. Ask a cashier or administrator.</p>;
    }

    if (!payable.length || !currency) {
      return (
        <p>
          {payable.length
            ? 'This bill has charges in more than one currency. Receive each currency separately from the patient statement.'
            : 'Nothing is due on this bill.'}
        </p>
      );
    }

    if (review) {
      return (
        <section aria-label="Payment review" className="space-y-4">
          <dl className="divide-y divide-outline-soft rounded-card border border-outline-soft bg-white px-4">
            {review.allocations.map((a) => (
              <div key={a.chargeId} className="flex justify-between gap-3 py-3 text-sm">
                <dt>{description(a.chargeId)}</dt>
                <dd className="font-semibold tabular-nums">{money(a.amountMinor)}</dd>
              </div>
            ))}
          </dl>
          <div className="flex items-baseline justify-between">
            <span className="font-semibold">Total</span>
            <span className="text-2xl font-extrabold tabular-nums">
              {money(review.amountMinor)}
            </span>
          </div>
          <p className="text-sm text-ink-muted">
            {bankTransfer
              ? `From ${bankTransfer.payerName ?? 'a verified bank transfer'} · needs a connection; the server confirms it.`
              : cashNote}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outlined"
              fullWidth={false}
              disabled={busy}
              onClick={() => {
                setReview(undefined);
                setError('');
              }}
            >
              Edit
            </Button>
            <StaffVerification
              requireServerSession={Boolean(bankTransfer)}
              purpose="Applying a bank transfer"
            >
              <Button className="flex-1" loading={busy} onClick={() => void record()}>
                {bankTransfer
                  ? `Apply ${money(review.amountMinor)} from transfer`
                  : `Record ${money(review.amountMinor)} cash`}
              </Button>
            </StaffVerification>
          </div>
        </section>
      );
    }

    return (
      <div className="space-y-4">
        {given ? null : (
          <SegmentedControl
            ariaLabel="Payment method"
            value={method}
            onChange={choose}
            options={[
              { value: 'cash', label: 'Cash' },
              { value: 'bank', label: 'Bank transfer' },
            ]}
          />
        )}
        {method === 'bank' ? (
          <StaffVerification requireServerSession purpose="Checking bank transfers">
            {bankTransfer ? (
              <div className="space-y-1 rounded-card border border-brand-tint bg-brand-wash p-3 text-sm">
                <div className="flex justify-between gap-3">
                  <strong>{bankTransfer.payerName ?? 'Bank transfer'}</strong>
                  <span className="font-semibold tabular-nums">
                    {displayMoney(bankTransfer.amountMinor, bankTransfer.currency)}
                  </span>
                </div>
                <p className="text-ink-muted">
                  {whenText(bankTransfer.receivedOn)} ·{' '}
                  {available === undefined
                    ? availabilityPendingText
                    : `${displayMoney(available, bankTransfer.currency)} left to apply`}
                </p>
                {capacity.error ? (
                  <p role="alert" className="text-danger">
                    {capacity.error}
                  </p>
                ) : null}
                {given ? null : (
                  <Button
                    variant="ghost"
                    fullWidth={false}
                    className="!px-0 !py-2"
                    onClick={() => pick(undefined)}
                  >
                    Choose a different transfer
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-semibold">Which transfer did the patient make?</p>
                {candidates.length ? (
                  candidates.slice(0, 12).map(({ transfer: t, applied }) => {
                    const left = capacity.sources[t.id]?.availableMinor ?? t.amountMinor - applied;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={left <= 0}
                        onClick={() => pick(t)}
                        className="flex w-full items-center justify-between gap-3 rounded-field border-[1.5px] border-outline bg-white p-3 text-left text-sm hover:border-brand disabled:opacity-50"
                      >
                        <span>
                          <strong className="block">{t.payerName ?? 'Bank transfer'}</strong>
                          <span className="text-ink-muted">
                            {whenText(t.receivedOn)} · {displayMoney(left, t.currency)} left
                          </span>
                        </span>
                        <span className="font-semibold tabular-nums">
                          {displayMoney(t.amountMinor, t.currency)}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="rounded-field bg-surface-muted p-3 text-sm">
                    No verified transfers are waiting. When the patient's transfer arrives it
                    appears here. A missing one can be checked by reference in Payment history.
                  </p>
                )}
                <Button
                  variant="ghost"
                  fullWidth={false}
                  className="!px-0"
                  onClick={() =>
                    void billingRequest<ReceivingAccount[]>(context, 'accounts/list', {}).then(
                      setAccounts,
                      (e) => {
                        const message = userMessage(
                          e,
                          'The account details could not be read. Try again.',
                        );
                        setError(message);
                        toast(message, { tone: 'error' });
                      },
                    )
                  }
                >
                  Show account details for the patient
                </Button>
                {accounts
                  ?.filter((a) => a.general)
                  .map((a) => (
                    <div key={a.id} className="rounded-field bg-brand-wash p-3 text-sm">
                      <p>
                        {a.bankName} · {a.accountName}
                      </p>
                      <p className="font-mono text-lg">{a.accountNumber}</p>
                    </div>
                  ))}
                {accounts && !accounts.some((a) => a.general) ? (
                  <p className="text-sm">
                    No receiving account is set up. An administrator can add one in Settings →
                    Billing.
                  </p>
                ) : null}
              </div>
            )}
          </StaffVerification>
        ) : null}
        {method === 'cash' || bankTransfer ? (
          <>
            <TextField
              label={method === 'cash' ? 'Amount received' : 'Amount to apply'}
              name="amount-received"
              inputMode="decimal"
              value={received}
              onChange={(e) => enter(e.target.value)}
            />
            {method === 'cash' && over ? (
              <p
                role="status"
                className="rounded-field border border-amber-border bg-amber-bg p-3 text-sm text-amber-text"
              >
                Give back <strong>{money(over)}</strong> as change. Only {money(due)} is recorded.
              </p>
            ) : null}
            {pending ? (
              <p className="text-sm text-ink-muted">
                {money(pending)} is waiting for an insurance decision and isn't part of the amount
                due.
              </p>
            ) : null}
            <div className="space-y-1 text-sm">
              {payable.map((r) =>
                showSplit ? (
                  <TextField
                    key={r.charge.id}
                    id={`amount-${r.charge.id}`}
                    label={`${r.charge.description} · ${money(r.balanceMinor)} due`}
                    inputMode="decimal"
                    error={fieldError === r.charge.id ? error : undefined}
                    value={amounts[r.charge.id] ?? ''}
                    onChange={(e) => {
                      setTouched(true);
                      setReview(undefined);
                      setAmounts((v) => ({ ...v, [r.charge.id]: e.target.value }));
                      setFieldError(undefined);
                      setError('');
                    }}
                  />
                ) : (
                  <div key={r.charge.id} className="flex justify-between gap-3 py-1">
                    <span className="text-ink-soft">{r.charge.description}</span>
                    <span className="tabular-nums">
                      {amounts[r.charge.id]
                        ? money(parseOr(amounts[r.charge.id], currency) ?? 0)
                        : '—'}
                    </span>
                  </div>
                ),
              )}
              {payable.length > 1 ? (
                <Button
                  variant="ghost"
                  fullWidth={false}
                  className="!px-0 !py-2"
                  onClick={() => setShowSplit((v) => !v)}
                >
                  {showSplit ? 'Hide the split' : "Change how it's split"}
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
        {error && !fieldError ? (
          <div
            ref={errorBox}
            tabIndex={-1}
            role="alert"
            className="rounded-field border border-danger bg-danger-bg p-3 text-sm text-danger"
          >
            {error}
          </div>
        ) : null}
        {method === 'cash' || bankTransfer ? (
          <Button disabled={!total} onClick={startReview}>
            {total ? `Review ${money(total)}` : 'Enter an amount'}
          </Button>
        ) : null}
      </div>
    );
  };

  return (
    <Sheet
      placement="side"
      title={review ? 'Check and confirm' : 'Receive payment'}
      eyebrow={`${patient?.fullName ?? patientId} · ${money(due)} due`}
      onClose={onClose}
      closeDisabled={busy}
      hasUnsavedChanges={touched && !busy}
    >
      {renderPaymentForm()}
      {review && error ? (
        <div
          ref={errorBox}
          tabIndex={-1}
          role="alert"
          className="mt-3 rounded-field border border-danger bg-danger-bg p-3 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}
    </Sheet>
  );
};
