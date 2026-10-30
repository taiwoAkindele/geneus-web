export * from '../src/data/facilityWorkspaces';
import type { DeviceCredential } from '@shared';
import type { FacilitySwitchIdentity } from '../src/session/facilityIdentity';
import { assertSourceSession } from '../src/session/facilityIdentity';
import { finishFacilitySetup } from '../src/data/facilitySetup';
import { primary, second, created, selected } from './organization-fixture';
export const activeWorkspace = () => ({ facilityId: selected().id, prepared: true });
export const listFacilityWorkspaces = () => [primary, second, created()].filter((facility) => Boolean(facility)).map((facility) => ({ facilityId: facility!.id, name: facility!.name, deviceId: facility!.deviceId, prepared: true }));
export const switchFacilityWorkspace = async (deviceId: string, issued?: DeviceCredential, identity?: FacilitySwitchIdentity) => {
  if (!identity) throw new Error('The browser fixture expects an authorized identity continuation');
  assertSourceSession(identity);
  if (identity.deviceId !== deviceId || issued && issued.facilityId !== identity.facilityId) throw new Error('Incorrect target enrollment');
  sessionStorage.setItem('qa-last-switch', JSON.stringify({ deviceId, issued: Boolean(issued), ...identity }));
  await finishFacilitySetup(identity.facilityId);
  window.location.replace(`/home?facility=${encodeURIComponent(identity.facilityId)}`);
};
