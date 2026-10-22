import type { AuthorizationContext } from '@shared';
import type { IconName } from '@/ui';

export type NavItem = { key: string; label: string; to: string; match: string; icon: IconName; bottom?: boolean };

/** Navigation is a courtesy; repositories and the server still enforce every write. */
export const navigationFor = (context: Pick<AuthorizationContext, 'role' | 'permissions'>): NavItem[] => {
  const clinical = context.role !== 'cashier' && context.role !== 'records_officer' && context.role !== 'facility_admin';
  const items: NavItem[] = [
    { key: 'home', label: 'Home', to: '/home', match: '/home', icon: 'home', bottom: true },
    { key: 'patients', label: 'Patients', to: '/patients/search', match: '/patients', icon: 'patients', bottom: true },
  ];
  if (context.role !== 'cashier') {
    items.push(
      { key: 'appointments', label: 'Appointments', to: '/appointments', match: '/appointments', icon: 'clock', bottom: context.role === 'records_officer' },
      { key: 'encounters', label: 'Encounters', to: '/encounters', match: '/encounters', icon: 'encounter', bottom: clinical },
      { key: 'registers', label: 'Registers', to: '/registers', match: '/registers', icon: 'registers', bottom: context.role === 'records_officer' },
      { key: 'units', label: 'Unit queue', to: '/units', match: '/units', icon: 'clock', bottom: clinical },
    );
  }
  if (context.role === 'facility_admin') items.push({ key: 'admin', label: 'Admin', to: '/admin', match: '/admin', icon: 'patients', bottom: true });
  return items;
};
