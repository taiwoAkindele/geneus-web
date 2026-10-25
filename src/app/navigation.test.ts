import { describe, expect, it } from 'vitest';
import { permissionsFor, staffPermissions, type Role } from '@shared';
import { navigationFor } from './navigation';

const keys = (role: Role) => navigationFor({ role, permissions: [...permissionsFor(role, 'read_write')] }).map((item) => item.key);
describe('role workspaces', () => {
  it('gives a cashier with nursing duties the clinical workspace', () => {
    const staff = { role: 'cashier' as const, additionalRoles: ['nurse' as const], permission: 'read_write' as const };
    const items = navigationFor({ role: staff.role, roles: [staff.role, ...staff.additionalRoles], permissions: staffPermissions(staff) });
    expect(items.find((item) => item.key === 'encounters')?.bottom).toBe(true);
  });
  it('makes delegated admin actions and secondary admin roles reachable', () => {
    expect(navigationFor({ role: 'nurse', roles: ['nurse'], permissions: ['fee_item:manage'] }).map((item) => item.key)).toContain('admin');
    expect(navigationFor({ role: 'nurse', roles: ['nurse', 'facility_admin'], permissions: [] }).map((item) => item.key)).toContain('admin');
  });
  it('keeps clinical and configuration work out of the cashier navigation', () => {
    expect(keys('cashier')).toEqual(['home', 'patients', 'billing']);
  });
  it('makes appointments a primary task for records staff and unit queues one for clinicians', () => {
    const records = navigationFor({ role: 'records_officer', permissions: [...permissionsFor('records_officer', 'read_write')] });
    expect(records.find((item) => item.key === 'appointments')?.bottom).toBe(true);
    const nurse = navigationFor({ role: 'nurse', permissions: [...permissionsFor('nurse', 'read_write')] });
    expect(nurse.find((item) => item.key === 'units')?.bottom).toBe(true);
    expect(keys('nurse')).not.toContain('admin');
    expect(keys('facility_admin')).toContain('admin');
  });
  it('does not advertise routes that still render prototype data', () => {
    expect(keys('facility_admin')).not.toEqual(expect.arrayContaining(['stock', 'referrals', 'month']));
  });
});
