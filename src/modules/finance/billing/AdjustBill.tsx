import { adjustmentLabel } from './billingLabels';
import { useCallback, useRef, useState } from 'react';
import {
  linkedPatientIds,
  type CoverCheck,
  type CoverageFinancialSummary,
  type Location,
  type PatientCover,
} from '@shared';
import { useLiveQuery } from '@/data';
import { allOfType, allWhere } from '@/data/db';
import { listIdentityEvents } from '@/data/repos/patientIdentity';
import {
  adjustCharge,
  createCharge,
  patientBillingFacts,
  type ChargeBalance,
} from '@/data/repos/billing';
import { useAuthorizationContext } from '@/session';
import { Button, SelectField, Sheet, TextField, useToast } from '@/ui';
import { parseAmount } from '@/lib/money';
import { userMessage } from '@/lib/api/userMessage';
import {
  ChargeCoverage,
  RefundSheet,
  SelfPaySheet,
} from '@/modules/finance/insurance/AccountCoverage';
import { ServiceAssociationHistory } from './ServiceAssociations';
import { CatalogueBrowser } from './CatalogueBrowser';
import { billingRows } from './ledger';
import type { BillingData } from './useBilling';
import { displayMoney } from './billingUi';

const loadServicePoints = () => allOfType<Location>('location');

/**
 * Changes to a bill other than taking money: discount or waive, add items, insurance choices and refunds of credit.
 * The repository and server rules are the existing ones; this sheet only gathers them in one place.
 */
export const AdjustBill = ({
  patientId,
  chargeIds,
  data,
  onClose,
  onSaved,
  onOpenPatient,
}: {
  patientId: string;
  chargeIds: readonly string[];
  data: BillingData;
  onClose: () => void;
  onSaved: () => void;
  onOpenPatient: (patientId: string) => void;
}) => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const identities = useLiveQuery(listIdentityEvents);

  const summaries = useLiveQuery(
    useCallback(
      () =>
        allWhere<CoverageFinancialSummary>('coverage_financial_summary', 'patientId', patientId),
      [patientId],
    ),
    ['coverage_financial_summary'],
  );

  const servicePoints = useLiveQuery(loadServicePoints, ['location']);

  const rows = billingRows(
    data.charges.filter((c) => c.patientId === patientId && chargeIds.includes(c.id)),
    data.payments,
    data.adjustments,
    data.coverage,
  );

  const patient = data.patients.find((p) => p.patientId === patientId);

  const linkedIds = linkedPatientIds(patientId, identities.data ?? []).filter(
    (id) => id !== patientId,
  );

  const [adjusting, setAdjusting] = useState('');
  const [kind, setKind] = useState<'discount' | 'waiver'>('discount');
  const [reduction, setReduction] = useState('');
  const [percent, setPercent] = useState(false);
  const [reason, setReason] = useState('');
  const [feeId, setFeeId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('');
  const [servicePoint, setServicePoint] = useState('');

  const [selfPay, setSelfPay] = useState<{
    row: ChargeBalance;
    cover: PatientCover;
    check?: CoverCheck;
  }>();

  const [refunding, setRefunding] = useState<ChargeBalance>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const dirty = Boolean(adjusting || reduction || reason || feeId);

  const perform = async (action: () => Promise<unknown>, done: string) => {
    if (saving.current) {
      return;
    }

    saving.current = true;
    setBusy(true);
    setError('');

    try {
      await action();
      toast(done);
      onSaved();
    } catch (e) {
      const message = userMessage(e, 'The change was not saved. Try again.');
      setError(message);
      toast(message, { tone: 'error' });
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  const reduce = () =>
    perform(
      async () => {
        const row = rows.find((r) => r.charge.id === adjusting);

        if (!row) {
          throw new Error('Choose the item to discount or waive');
        }

        let amount =
          kind === 'waiver' ? row.balanceMinor : parseAmount(reduction, row.charge.currency);

        if (kind === 'discount' && percent) {
          const value = Number(reduction);

          if (!Number.isFinite(value) || value <= 0 || value > 100) {
            throw new Error('Enter a percentage from 0 to 100');
          }

          amount = Math.round((row.balanceMinor * value) / 100);
        }

        await adjustCharge(adjusting, kind, amount, reason, context);
        setAdjusting('');
        setReason('');
        setReduction('');
      },
      kind === 'waiver' ? 'Balance waived' : 'Discount saved',
    );

  const addFee = () =>
    perform(async () => {
      if (!patient || !feeId) {
        throw new Error('Choose an item');
      }

      await createCharge(
        feeId,
        {
          patientId,
          facts: patientBillingFacts(patient),
          billId: rows[0]?.charge.billId,
          quantity: Number(quantity),
          unitOfMeasure: unit.trim() || undefined,
          servicePointId: servicePoint || undefined,
        },
        context,
      );

      setFeeId('');
      setQuantity('1');
      setUnit('');
    }, 'Item added to the bill');

  const insurance = (row: ChargeBalance) => {
    const estimate = row.coverage;

    if (!estimate || !('allocation' in estimate)) {
      return null;
    }

    const s = summaries.data?.find((x) => x.allocationId === estimate.allocation.id);

    return s ? (
      <p className="text-xs text-ink-muted">
        Insurer pays {displayMoney(s.payerShareMinor, s.currency)} · contract adjustment{' '}
        {displayMoney(s.contractAdjustmentMinor, s.currency)}
        {s.capitationCoveredMinor
          ? ` · capitation ${displayMoney(s.capitationCoveredMinor, s.currency)}`
          : ''}
      </p>
    ) : (
      <p className="text-xs text-ink-muted">Insurance amounts are still syncing.</p>
    );
  };

  const mayWaive = context.permissions.includes('payment:waive');
  const mayAdd = context.permissions.includes('charge:create') && Boolean(rows[0]?.charge.billId);

  return (
    <Sheet
      placement="side"
      title="Adjust bill"
      eyebrow={patient?.fullName ?? patientId}
      onClose={onClose}
      closeDisabled={busy}
      hasUnsavedChanges={dirty}
    >
      <fieldset disabled={busy} className="space-y-4">
        {rows.map((r) => {
          const money = (n: number) => displayMoney(n, r.charge.currency);

          return (
            <article
              key={r.charge.id}
              className="space-y-1 rounded-card border border-outline-soft bg-white p-3 text-sm"
            >
              <div className="flex justify-between gap-3">
                <h3 className="font-bold">{r.charge.description}</h3>
                <span className="font-semibold tabular-nums">
                  {r.balanceMinor < 0
                    ? `Credit ${money(-r.balanceMinor)}`
                    : `${money(r.balanceMinor)} due`}
                </span>
              </div>
              <p className="text-ink-muted">
                Price {money(r.charge.listPriceMinor)} · paid {money(r.settledMinor)}
                {r.charge.exemptionReason ? ` · exempt: ${r.charge.exemptionReason}` : ''}
              </p>
              {data.adjustments
                .filter((a) => a.chargeId === r.charge.id)
                .map((a) => (
                  <p key={a.id} className="text-xs text-ink-muted">
                    {adjustmentLabel(a)} {money(a.amountMinor)} · {a.reason} ·{' '}
                    {data.staff.find((s) => s.staffId === a.createdBy)?.fullName ?? a.createdBy}
                  </p>
                ))}
              {insurance(r)}
              <ChargeCoverage
                row={r}
                insurance={data.insurance}
                onSelfPay={(row, cover, check) => setSelfPay({ row, cover, check })}
                onRefund={setRefunding}
              />
              {r.balanceMinor > 0 && mayWaive && adjusting !== r.charge.id ? (
                <Button
                  variant="ghost"
                  fullWidth={false}
                  className="!px-0 !py-2"
                  onClick={() => {
                    setAdjusting(r.charge.id);
                    setKind('discount');
                  }}
                >
                  Discount or waive
                </Button>
              ) : null}
              {adjusting === r.charge.id ? (
                <div className="mt-2 space-y-3 rounded-field bg-surface p-3">
                  <SelectField
                    label="Change"
                    value={kind}
                    options={[
                      { value: 'discount', label: 'Discount' },
                      { value: 'waiver', label: 'Waive what is left' },
                    ]}
                    onChange={(e) => setKind(e.target.value as typeof kind)}
                  />
                  {kind === 'discount' ? (
                    <>
                      <label className="flex min-h-[44px] items-center gap-2">
                        <input
                          type="checkbox"
                          checked={percent}
                          onChange={(e) => setPercent(e.target.checked)}
                        />
                        As a percentage
                      </label>
                      <TextField
                        label={percent ? 'Percentage' : 'Discount amount'}
                        value={reduction}
                        inputMode="decimal"
                        onChange={(e) => setReduction(e.target.value)}
                      />
                    </>
                  ) : (
                    <p>Waives {money(r.balanceMinor)}. It's a reduction, not money received.</p>
                  )}
                  <TextField
                    label="Reason"
                    required
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outlined"
                      fullWidth={false}
                      onClick={() => {
                        setAdjusting('');
                        setReason('');
                        setReduction('');
                      }}
                    >
                      Cancel
                    </Button>
                    <Button className="flex-1" loading={busy} onClick={() => void reduce()}>
                      Save
                    </Button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
        {mayAdd ? (
          <section className="space-y-2 border-t border-outline-soft pt-4">
            <h3 className="font-bold">Add items</h3>
            <CatalogueBrowser onSelect={(fee) => setFeeId(fee.id)} />
            {feeId ? (
              <>
                <p className="font-semibold">
                  Selected: {data.fees.find((f) => f.id === feeId)?.name}
                </p>
                <TextField
                  label="Quantity"
                  type="number"
                  min="0.000001"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
                <TextField
                  label="Unit (optional)"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                />
                <SelectField
                  label="Service point (optional)"
                  value={servicePoint}
                  options={[
                    { value: '', label: 'Not recorded' },
                    ...(servicePoints.data ?? [])
                      .filter((l) => l.active)
                      .map((l) => ({ value: l.id, label: l.name })),
                  ]}
                  onChange={(e) => setServicePoint(e.target.value)}
                />
              </>
            ) : null}
            <Button variant="outlined" disabled={!feeId} onClick={() => void addFee()}>
              Add to bill
            </Button>
          </section>
        ) : null}
        {linkedIds.length ? (
          <section className="space-y-2 border-t border-outline-soft pt-4">
            <h3 className="font-bold">Other IDs for this patient</h3>
            <p className="text-xs text-ink-muted">Each ID keeps its own bills and receipts.</p>
            {linkedIds.map((id) => (
              <Button
                key={id}
                variant="ghost"
                fullWidth={false}
                className="!px-0"
                onClick={() => onOpenPatient(id)}
              >
                {data.patients.find((p) => p.patientId === id)?.fullName ?? id} · {id}
              </Button>
            ))}
          </section>
        ) : null}
        <details className="border-t border-outline-soft pt-3 text-sm">
          <summary className="min-h-[44px] cursor-pointer py-3 font-semibold">
            Order and supply links for this patient
          </summary>
          <ServiceAssociationHistory patientId={patientId} />
        </details>
      </fieldset>
      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-field border border-danger bg-danger-bg p-3 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}
      {selfPay ? (
        <SelfPaySheet
          row={selfPay.row}
          cover={selfPay.cover}
          check={selfPay.check}
          onClose={() => setSelfPay(undefined)}
          onSaved={() => {
            setSelfPay(undefined);
            toast('Choice recorded. The patient now owes the full price for this charge.');
            onSaved();
          }}
        />
      ) : null}
      {refunding ? (
        <RefundSheet
          row={refunding}
          onClose={() => setRefunding(undefined)}
          onDone={(refund) => {
            setRefunding(undefined);
            toast(`Refund ${refund.refundNumber} recorded`);
            onSaved();
          }}
        />
      ) : null}
    </Sheet>
  );
};
