import { parseDocument, type AnyDocument, type AuthorizationContext, type Credential } from '@shared';
import { getDeviceCredential } from '@/data/deviceCredential';
import { workforceRequest } from './client';
type PrivateSession = {
  owner: string;
  token: string;
  expiresOn: string;
  records: AnyDocument[];
};
let current: PrivateSession | undefined;
const historicalPermits = new Set<string>();
const owner = (context: AuthorizationContext) => JSON.stringify([context.facilityId, context.deviceId, context.userId]);
const credential = () => {
  const device = getDeviceCredential(); if (!device)
    throw new Error('This device is not enrolled'); return device.credential;
};
const session = (context: AuthorizationContext) => {
  if (!current || current.owner !== owner(context) || Date.parse(current.expiresOn) <= Date.now())
    throw new Error('Verify your staff contact to access private workforce evidence');
  return current;
};
export const clearPrivateWorkforce = (): void => {
  const token = current?.token;
  current = undefined;
  historicalPermits.clear();
  const device = getDeviceCredential();
  if (token && device)
    void workforceRequest('/workforce/access/end', device.credential, token, undefined, 'POST').catch(() => { });
};
export const requestWorkforceCode = (context: AuthorizationContext) => workforceRequest<{
  sentTo: string;
}>('/workforce/access/code', credential(), undefined, { staffId: context.userId });
export const verifyWorkforceCode = async (context: AuthorizationContext, code: string): Promise<void> => {
  const response = await workforceRequest<{
    token: string;
    expiresOn: string;
  }>('/workforce/access/verify', credential(), undefined, { staffId: context.userId, code });
  clearPrivateWorkforce();
  current = { owner: owner(context), ...response, records: [] };
};
export const readWorkforceEvidence = async (context: AuthorizationContext, type: string, staffId: string): Promise<AnyDocument[]> => {
  const bound = session(context);
  const response = await workforceRequest<{
    records: unknown[];
  }>(`/workforce/evidence?type=${encodeURIComponent(type)}&staffId=${encodeURIComponent(staffId)}`, credential(), bound.token);
  if (current !== bound)
    throw new Error('Staff session changed; private response discarded');
  const records = response.records.map((r) => {
    const parsed = parseDocument(r); if (!parsed.success)
      throw new Error('The private record contract has changed. Update the application'); return parsed.data;
  });
  bound.records = [...bound.records.filter((r) => !(r.type === type && 'staffId' in r && r.staffId === staffId)), ...records];
  return records;
};
export const privateCredentials = (context: AuthorizationContext): Credential[] => session(context).records.filter((r): r is Credential => r.type === 'credential');
export const workforceReadiness = (context: AuthorizationContext) => workforceRequest<{
  ready: boolean;
  blockers: {
    kind: string;
    ids: string[];
  }[];
}>(`/workforce/readiness?requestedBy=${encodeURIComponent(context.userId)}`, credential());
export const readPrivateRejections = async (context: AuthorizationContext) => {
  const bound = session(context), response = await workforceRequest<{
    records: unknown[];
  }>('/workforce/rejections', credential(), bound.token);
  if (current !== bound)
    throw new Error('Staff session changed; private response discarded');
  return {
    records: response.records.map((value) => {
      const parsed = parseDocument(value); if (!parsed.success || parsed.data.type !== 'sync_rejection')
        throw new Error('Update the application to read this private review item'); return parsed.data;
    })
  };
};
export const resolvePrivateRejection = (context: AuthorizationContext, id: string, resolution: string) => workforceRequest<void>(`/workforce/rejections/${encodeURIComponent(id)}/resolve`, credential(), session(context).token, { resolution });
export const privateAccessValid = (context: AuthorizationContext): boolean => Boolean(current && current.owner === owner(context) && Date.parse(current.expiresOn) > Date.now());
export const privateAccessExpires = (context: AuthorizationContext): string | undefined => privateAccessValid(context) ? current?.expiresOn : undefined;
export const reviewHistoricalCare = async (context: AuthorizationContext, id: string, reason: string, record: AnyDocument): Promise<void> => {
  const bound = session(context);
  const response = await workforceRequest<{
    reviewId: string;
  }>(`/workforce/rejections/${encodeURIComponent(id)}/review`, credential(), bound.token, { reason });
  if (current !== bound || !response.reviewId)
    throw new Error('The private staff session changed during review');
  historicalPermits.add(`${owner(context)}:${await (await import('@/data/workforceClinical')).clinicalPayloadHash(record)}`);
};
export const reviewHistoricalDraft = async (context: AuthorizationContext, record: AnyDocument, reason: string): Promise<void> => {
  const bound = session(context);
  const response = await workforceRequest<{
    reviewId: string;
  }>('/workforce/clinical-drafts/review', credential(), bound.token, { record, reason });
  if (current !== bound || !response.reviewId)
    throw new Error('The private staff session changed during review');
  historicalPermits.add(`${owner(context)}:${await (await import('@/data/workforceClinical')).clinicalPayloadHash(record)}`);
};
export const consumeHistoricalPermit = async (context: AuthorizationContext, record: AnyDocument): Promise<boolean> => {
  if (!privateAccessValid(context) || !historicalPermits.size)
    return false;
  const key = `${owner(context)}:${await (await import('@/data/workforceClinical')).clinicalPayloadHash(record)}`;
  const allowed = privateAccessValid(context) && historicalPermits.has(key);
  historicalPermits.delete(key);
  return allowed;
};
