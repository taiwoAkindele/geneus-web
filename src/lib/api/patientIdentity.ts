import { PatientIdentityEvent, PatientIdentityPreview } from '@shared';
import { getDeviceCredential } from '@/data/deviceCredential';
import { postAsDevice } from './client';

export type IdentityAction = { patientId: string; otherPatientId: string; outcome: 'linked' | 'distinct' | 'unlinked' };
const request = async (path: string, body: unknown) => {
  const device = getDeviceCredential();
  if (!device) throw new Error('This device is not enrolled');
  return postAsDevice(`/patients/identity/${path}`, device.credential, body);
};
export const previewPatientIdentity = async (action: IdentityAction, actorStaffId: string) => {
  const result = PatientIdentityPreview.safeParse(await request('preview', { ...action, actorStaffId }));
  if (!result.success) throw new Error('The identity preview is incomplete. Refresh the app and try again.');
  return result.data;
};
export const confirmPatientIdentity = async (action: IdentityAction, actorStaffId: string, reason: string, revision: string, requestId: string) => {
  const result = PatientIdentityEvent.safeParse(await request('confirm', { ...action, actorStaffId, reason, revision, requestId }));
  if (!result.success) throw new Error('The decision response could not be read. Retry the same decision to check its status.');
  return result.data;
};
