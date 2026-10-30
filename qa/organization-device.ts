export * from '../src/data/index';
import { selected } from './organization-fixture';
export const useDeviceContext = () => ({ facility: selected(), deviceId: selected().deviceId, enrolled: true, enroll: async () => true });
