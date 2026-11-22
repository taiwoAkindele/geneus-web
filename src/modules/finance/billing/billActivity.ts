import type { Payment } from '@shared';
import { messageActivity } from '@/data/repos/patientContacts';
import type { BillDocument } from './billDocuments';
import { adjustmentLabel } from './billingLabels';
import type { BillingData } from './useBilling';

/** One line in a bill's activity list: what happened, when, by whom, and its effect on the bill. */
export type BillActivity = {
  id: string;
  at: string;
  text: string;
  by: string;
  amount?: number;
  payment?: Payment;
};

type PatientMessage = Parameters<typeof messageActivity>[0];
type Allocation = { chargeId: string; amountMinor: number };

/** The part of a payment, refund or allocation list that lands on this bill's charges. */
const amountOnCharges = (
  allocations: readonly Allocation[],
  chargeIds: readonly string[],
): number => {
  return allocations
    .filter((allocation) => chargeIds.includes(allocation.chargeId))
    .reduce((total, allocation) => total + allocation.amountMinor, 0);
};

export const paymentActivityText = (
  payment: Payment,
  transfers: BillingData['transfers'],
): string => {
  if (payment.reverses) {
    return 'Payment reversed';
  }

  if (payment.method === 'waiver') {
    return 'Waived';
  }

  if (payment.method === 'cash') {
    return 'Cash received';
  }

  if (payment.method === 'online') {
    const transfer = transfers.find((candidate) => candidate.id === payment.incomingTransferId);

    // Test-mode payments come from the provider's sandbox: say so, so nobody counts them as money.
    if (transfer?.mode === 'test') {
      return 'Paid online (TEST, not real money)';
    }

    return 'Paid online';
  }

  return 'Bank transfer applied';
};

/** A payment can cover several rows of one bill; each payment is listed once. */
const uniquePayments = (bill: BillDocument): Payment[] => {
  const paymentsById = new Map<string, Payment>();

  for (const row of bill.rows) {
    for (const receipt of row.receipts) {
      paymentsById.set(receipt.id, receipt);
    }
  }

  return [...paymentsById.values()];
};

const firstCharge = (bill: BillDocument) => {
  const charges = bill.rows.map((row) => row.charge);

  return charges.sort((a, b) => a.createdOn.localeCompare(b.createdOn))[0];
};

/** Everything that happened to a bill, newest first. */
export const billActivity = ({
  bill,
  data,
  messages,
  staffName,
}: {
  bill: BillDocument;
  data: BillingData;
  messages: readonly PatientMessage[];
  staffName: (staffId: string) => string;
}): BillActivity[] => {
  const chargeIds = bill.rows.map((row) => row.charge.id);
  const activity: BillActivity[] = [];

  // Each SMS or email of this bill to the patient, with its outcome.
  for (const message of messages) {
    activity.push({
      id: message.id,
      at: message.createdOn,
      text: messageActivity(message).text,
      by: message.automatic ? 'Automatically' : staffName(message.createdBy),
    });
  }

  const raised = firstCharge(bill);

  if (raised) {
    const itemWord = bill.rows.length === 1 ? 'item' : 'items';

    activity.push({
      id: 'raised',
      at: raised.createdOn,
      text: `Bill raised · ${bill.rows.length} ${itemWord}`,
      by: staffName(raised.createdBy),
    });
  }

  for (const payment of uniquePayments(bill)) {
    const direction = payment.reverses ? -1 : 1;

    activity.push({
      id: payment.id,
      at: payment.createdOn,
      payment,
      by: staffName(payment.createdBy),
      amount: direction * amountOnCharges(payment.allocations, chargeIds),
      text: paymentActivityText(payment, data.transfers),
    });
  }

  for (const adjustment of data.adjustments) {
    if (!chargeIds.includes(adjustment.chargeId)) {
      continue;
    }

    activity.push({
      id: adjustment.id,
      at: adjustment.createdOn,
      by: staffName(adjustment.createdBy),
      amount: -adjustment.amountMinor,
      text: `${adjustmentLabel(adjustment)} · ${adjustment.reason}`,
    });
  }

  for (const refund of data.coverage.refunds) {
    const refundedHere = amountOnCharges(refund.allocations, chargeIds);
    const touchesThisBill = refund.allocations.some((allocation) =>
      chargeIds.includes(allocation.chargeId),
    );

    if (!touchesThisBill) {
      continue;
    }

    activity.push({
      id: refund.id,
      at: refund.createdOn,
      by: staffName(refund.createdBy),
      amount: -refundedHere,
      text: `Refund handed back · ${refund.method}`,
    });
  }

  return activity.sort((a, b) => b.at.localeCompare(a.at));
};
