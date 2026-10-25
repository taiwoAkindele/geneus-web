// Synthetic browser fixture only. This module is never imported by the application.
export * from '../src/data/index';
export const useDeviceContext = () => ({
  facility: { id: 'QA-PHC', code: 'QA-PHC', name: 'Synthetic clinical facility' },
  deviceId: 'qa-device', enrolled: true,
});
