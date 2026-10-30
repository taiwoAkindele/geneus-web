import type { AuthorizationContext, InboundReferral, Patient, Referral } from '@shared';
import { allOfType, findRecord, nowIso, updateRecord } from '../db';
export const loadReferrals = async () => {
  const [outgoing, incoming, patients] = await Promise.all([allOfType<Referral>('referral'), allOfType<InboundReferral>('inbound_referral'), allOfType<Patient>('patient')]);
  return { outgoing, incoming, patients };
};
export const recordReferralArrival = async (id: string, patientId: string, context: AuthorizationContext) => {
  const [referral, patient] = await Promise.all([findRecord<InboundReferral>('inbound_referral', id), findRecord<Patient>('patient', patientId)]);
  if (!referral || !patient || referral.facilityId !== context.facilityId || patient.facilityId !== context.facilityId) throw new Error('Choose a patient registered at this receiving facility');
  if (referral.status !== 'received') throw new Error('This referral already has an arrival record');
  return updateRecord<InboundReferral>(context, 'referral:update', 'inbound_referral', id, { status: 'arrived', localPatientId: patient.id, arrivedOn: nowIso() });
};
export const closeInboundReferral = (id: string, context: AuthorizationContext) => updateRecord<InboundReferral>(context, 'referral:update', 'inbound_referral', id, { status: 'closed', closedOn: nowIso() });
