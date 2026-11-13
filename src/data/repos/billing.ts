import {
  findExemption,
  patientAge,
  paymentPermission,
  type AuthorizationContext,
  type Charge,
  type ExemptionFacts,
  type FeeItem,
  type Payment,
  type BillingAdjustment,
  type IncomingTransfer,
  type BillingDepartment,
  type Patient,
  type VisitType,
  type CoverageEstimate,
  type Refund,
  patientResponsibility,
} from '@shared';
import { assertAllowed } from '@/auth/authorization';
import { assertAmountMinor } from '@/lib/money';
import { mintReceiptNumber } from '@/lib/receiptNumber';
import { allOfType, allWhere, fieldValuesOf, envelope, findRecord, insertRecord, newId, updateRecord } from '../db';
import { usablePharmacyEffects } from './pharmacyAcceptance';
import { estimatesFor, loadCoverage } from './insurance';

/** Coverage and refunds for these charges, as this device holds them. */
export const balanceCoverage = async (charges: readonly Charge[]): Promise<BalanceCoverage> => {
  const data = await loadCoverage(charges);
  return { estimates: estimatesFor(charges, data), refunds: data.refunds };
};

export type FeeDraft = Pick<FeeItem, 'name' | 'category' | 'amountMinor' | 'currency' | 'chargeWhen' | 'exemptions' | 'departmentId'>;

export const listFeeItems = () => allOfType<FeeItem>('fee_item');
export const chargesForPatient = (patientId: string) => allWhere<Charge>('charge', 'patientId', patientId).then(usablePharmacyEffects);
export const paymentsForPatient = (patientId: string) => allWhere<Payment>('payment', 'patientId', patientId);
export const adjustmentsForPatient = (patientId: string) => allWhere<BillingAdjustment>('billing_adjustment', 'patientId', patientId).then(usablePharmacyEffects);
export const listCharges = () => allOfType<Charge>('charge').then(usablePharmacyEffects);
export const listPayments = () => allOfType<Payment>('payment');
export const listAdjustments = () => allOfType<BillingAdjustment>('billing_adjustment').then(usablePharmacyEffects);
export const listIncomingTransfers = () => allOfType<IncomingTransfer>('incoming_transfer');
export const listBillingDepartments = () => allOfType<BillingDepartment>('billing_department');
export const patientBillingFacts = (patient: Pick<Patient, 'dateOfBirth' | 'ageYears' | 'sex'> & Partial<Pick<Patient, 'createdOn' | 'ageObservedOn'>>, visitType?: VisitType): ExemptionFacts => {
  const ageYears = patientAge({ ...patient, createdOn: patient.createdOn ?? new Date().toISOString() });
  return { sex: patient.sex, ageYears, visitType };
};
export const createBillingDepartment = (name: string, context: AuthorizationContext) => insertRecord<BillingDepartment>(context, 'fee_item:manage', 'billing_department', {
  ...envelope(context), id: newId('billing_department'), type: 'billing_department', name: name.trim(), active: true,
});

export const adjustCharge = async (chargeId: string, kind: BillingAdjustment['kind'], amountMinor: number, reason: string, context: AuthorizationContext) => {
  assertAllowed(context, 'payment:waive');
  const charge = await findRecord<Charge>('charge', chargeId);
  if (!charge || charge.facilityId !== context.facilityId) throw new Error('This bill is not available');
  const [payments, adjustments, coverage] = await Promise.all([paymentsForPatient(charge.patientId), adjustmentsForPatient(charge.patientId), balanceCoverage([charge])]);
  // The payer's part, or an undetermined one, is never reduced on the patient's account.
  const [{ balanceMinor }] = chargeBalances([charge], payments, adjustments, coverage);
  assertAmountMinor(amountMinor);
  if (amountMinor <= 0 || amountMinor > balanceMinor) throw new Error('The reduction must fit the unpaid balance');
  return insertRecord<BillingAdjustment>(context, 'payment:waive', 'billing_adjustment', {
    ...envelope(context), id: newId('billing_adjustment'), type: 'billing_adjustment',
    chargeId, patientId: charge.patientId, kind, amountMinor, reason: reason.trim(),
  });
};

const feeValues = (draft: FeeDraft): FeeDraft => {
  assertAmountMinor(draft.amountMinor);
  return { name: draft.name.trim(), category: draft.category, departmentId: draft.departmentId || null, amountMinor: draft.amountMinor, currency: draft.currency.trim().toUpperCase(), chargeWhen: draft.chargeWhen, exemptions: draft.exemptions };
};

export const createFeeItem = async (draft: FeeDraft, context: AuthorizationContext): Promise<FeeItem> =>
  insertRecord<FeeItem>(context, 'fee_item:manage', 'fee_item', {
    ...envelope(context), ...feeValues(draft), id: newId('fee_item'), type: 'fee_item', active: true,
  });

export const updateFeeItem = async (id: string, draft: FeeDraft, context: AuthorizationContext): Promise<FeeItem> =>
  updateRecord<FeeItem>(context, 'fee_item:manage', 'fee_item', id, { ...feeValues(draft), priceVersion: undefined });

/** Retire instead of delete: every old bill must still name its fee. */
export const setFeeItemActive = (id: string, active: boolean, context: AuthorizationContext) =>
  updateRecord<FeeItem>(context, 'fee_item:manage', 'fee_item', id, { active });

export type ChargeDraft = {
  patientId: string;
  facts: ExemptionFacts;
  appointmentId?: string;
  encounterId?: string;
};

/** Also usable by booking when its appointment and charges are saved together. */
export const newCharge = (fee: FeeItem, draft: ChargeDraft, context: AuthorizationContext): Charge => {
  if (fee.facilityId !== context.facilityId) throw new Error('This fee belongs to another facility');
  if (!fee.active) throw new Error('This fee has been retired');
  assertAmountMinor(fee.amountMinor);
  const exemption = findExemption(fee.exemptions, draft.facts);
  return {
    ...envelope(context),
    id: fee.chargeWhen === 'first_visit' ? `charge:first:${draft.patientId}:${fee.id}` : newId('charge'),
    type: 'charge',
    patientId: draft.patientId,
    feeItemId: fee.id,
    description: fee.name,
    category: fee.category,
    departmentId: fee.departmentId ?? undefined,
    listPriceMinor: fee.amountMinor,
    amountMinor: exemption ? 0 : fee.amountMinor,
    currency: fee.currency,
    exemptionReason: exemption?.reason,
    appointmentId: draft.appointmentId,
    encounterId: draft.encounterId,
  };
};

export const createCharge = async (feeId: string, draft: ChargeDraft, context: AuthorizationContext) => {
  assertAllowed(context, 'charge:create');
  const fee = await findRecord<FeeItem>('fee_item', feeId);
  if (!fee) throw new Error('This fee is no longer available');
  return insertRecord<Charge>(context, 'charge:create', 'charge', newCharge(fee, draft, context));
};

export type PaymentDraft = Pick<Payment, 'patientId' | 'method' | 'currency' | 'allocations' | 'reference' | 'reason'>;

const nextReceipt = async (facilityCode: string): Promise<string> =>
  mintReceiptNumber(facilityCode, await fieldValuesOf('payment', 'receiptNumber'));

const checkAllocations = async (draft: PaymentDraft, context: AuthorizationContext): Promise<void> => {
  for (const allocation of draft.allocations) {
    assertAmountMinor(allocation.amountMinor);
    const charge = await findRecord<Charge>('charge', allocation.chargeId);
    if (!charge || charge.facilityId !== context.facilityId || charge.patientId !== draft.patientId) {
      throw new Error("Every allocation must name this patient's own charge");
    }
    if (charge.currency !== draft.currency) throw new Error('A payment and its charges must use the same currency');
  }
};

/** A second offline cashier may already have taken this money. Keep it; show the credit. */
export const recordPayment = async (draft: PaymentDraft, context: AuthorizationContext): Promise<Payment> => {
  const permission = paymentPermission(draft);
  assertAllowed(context, permission);
  const amountMinor = draft.allocations.reduce((total, allocation) => total + allocation.amountMinor, 0);
  assertAmountMinor(amountMinor);
  await checkAllocations(draft, context);
  return insertRecord<Payment>(context, permission, 'payment', {
    ...envelope(context),
    ...draft,
    id: newId('payment'),
    type: 'payment',
    amountMinor,
    receiptNumber: await nextReceipt(context.facilityId),
    reference: draft.reference?.trim() || undefined,
    reason: draft.reason?.trim() || undefined,
  });
};

/** Copy the original allocations exactly. The original payment is never patched. */
export const reversePayment = async (paymentId: string, reason: string, context: AuthorizationContext): Promise<Payment> => {
  assertAllowed(context, 'payment:reverse');
  if (!reason.trim()) throw new Error('Give a reason for the reversal');
  const original = await findRecord<Payment>('payment', paymentId);
  if (!original || original.facilityId !== context.facilityId) throw new Error('This payment is not available at this facility');
  if (original.reverses) throw new Error('A reversal cannot itself be reversed');
  const payments = await paymentsForPatient(original.patientId);
  if (payments.some((payment) => payment.reverses === original.id)) throw new Error('This payment has already been reversed');
  return insertRecord<Payment>(context, 'payment:reverse', 'payment', {
    ...envelope(context),
    id: newId('payment'),
    type: 'payment',
    patientId: original.patientId,
    receiptNumber: await nextReceipt(context.facilityId),
    method: original.method,
    amountMinor: original.amountMinor,
    currency: original.currency,
    allocations: original.allocations,
    reference: original.reference,
    reason: reason.trim(),
    reverses: original.id,
  });
};

export type ChargeBalance = {
  charge: Charge; settledMinor: number; balanceMinor: number; discountMinor: number; waivedMinor: number; dueMinor: number;
  /** Money handed back from a credit. Payments stay as received. */
  refundedMinor: number;
  /** Insurance: the part whose payer is not yet decided. Never added to what is due. */
  undeterminedMinor: number;
  /** Insurance: how this charge's responsibility was decided, when it was. */
  coverage?: CoverageEstimate;
  /** Insurance: true while the patient's part is an estimate a confirmation may still change. */
  estimated: boolean;
  /** No later decision can change the patient's part: the condition for refunding a credit. */
  final: boolean;
};

/**
 * Insurance and refunds, when the facility uses them. Without this, every
 * charge is a cash bill exactly as before insurance existed.
 */
export type BalanceCoverage = { estimates: ReadonlyMap<string, CoverageEstimate>; refunds: readonly Refund[] };

/**
 * One pass over allocations; reversals subtract instead of removing history.
 * With coverage, the patient owes only their responsibility (the shared
 * `patientResponsibility`, the same figure the server uses) and refunds add
 * back to the balance. The server applies the same arithmetic in
 * `availableOnCharge`, so a device and the server cannot disagree on it.
 */
export const chargeBalances = (charges: readonly Charge[], payments: readonly Payment[], adjustments: readonly BillingAdjustment[] = [], coverage?: BalanceCoverage): ChargeBalance[] => {
  const byId = new Map(charges.map((charge) => [charge.id, charge]));
  const settled = new Map<string, number>();
  const legacyWaivers = new Map<string, number>();
  const refunded = new Map<string, number>();
  for (const refund of coverage?.refunds ?? []) {
    for (const allocation of refund.allocations) {
      const charge = byId.get(allocation.chargeId);
      if (!charge || charge.patientId !== refund.patientId || charge.currency !== refund.currency || charge.facilityId !== refund.facilityId) continue;
      refunded.set(charge.id, (refunded.get(charge.id) ?? 0) + allocation.amountMinor);
    }
  }
  for (const payment of payments) {
    for (const allocation of payment.allocations) {
      const charge = byId.get(allocation.chargeId);
      if (!charge || charge.patientId !== payment.patientId || charge.currency !== payment.currency || charge.facilityId !== payment.facilityId) continue;
      const amount = allocation.amountMinor * (payment.reverses ? -1 : 1);
      const target = payment.method === 'waiver' ? legacyWaivers : settled;
      target.set(charge.id, (target.get(charge.id) ?? 0) + amount);
    }
  }
  return charges.map((charge) => {
    const settledMinor = settled.get(charge.id) ?? 0;
    const reductions = adjustments.filter((a) => a.chargeId === charge.id && a.patientId === charge.patientId && a.facilityId === charge.facilityId);
    const discountMinor = reductions.filter((a) => a.kind === 'discount').reduce((n, a) => n + a.amountMinor, 0);
    const waivedMinor = (legacyWaivers.get(charge.id) ?? 0) + reductions.filter((a) => a.kind === 'waiver').reduce((n, a) => n + a.amountMinor, 0);
    const estimate = coverage?.estimates.get(charge.id);
    const responsibility = estimate ? patientResponsibility(charge, estimate) : { baseMinor: charge.amountMinor, undeterminedMinor: 0, estimated: false, final: true };
    const refundedMinor = refunded.get(charge.id) ?? 0;
    const dueMinor = responsibility.baseMinor - discountMinor - waivedMinor;
    return {
      charge, settledMinor, discountMinor, waivedMinor, dueMinor, refundedMinor, balanceMinor: dueMinor - settledMinor + refundedMinor,
      undeterminedMinor: responsibility.undeterminedMinor, estimated: responsibility.estimated, final: responsibility.final,
      ...(estimate && estimate.state !== 'self_pay' && estimate.state !== 'exempt' ? { coverage: estimate } : {}),
    };
  });
};

/** Never add different currencies into a single patient balance. */
export const balancesByCurrency = (charges: readonly Charge[], payments: readonly Payment[], adjustments: readonly BillingAdjustment[] = [], coverage?: BalanceCoverage): Map<string, number> => {
  const totals = new Map<string, number>();
  for (const { charge, balanceMinor } of chargeBalances(charges, payments, adjustments, coverage)) {
    totals.set(charge.currency, (totals.get(charge.currency) ?? 0) + balanceMinor);
  }
  return totals;
};

/** With no fees configured there is nothing to pay, so care continues immediately. */
export const isAppointmentConfirmed = (appointmentId: string, charges: readonly Charge[], payments: readonly Payment[], adjustments: readonly BillingAdjustment[] = [], chargeIds: readonly string[] = [], coverage?: BalanceCoverage): boolean =>
  chargeIds.every((id) => charges.some((charge) => charge.id === id)) &&
  chargeBalances(charges.filter((charge) => charge.appointmentId === appointmentId || chargeIds.includes(charge.id)), payments, adjustments, coverage).every(({ balanceMinor }) => balanceMinor <= 0);
