import { describe, expect, it } from 'vitest';
import { permissionsFor, staffPermissions, type Role } from '@shared';
import { activeNavigationKey, navigationFor } from './navigation';

const keys = (role: Role) => navigationFor({ role, permissions: [...permissionsFor(role, 'read_write')] }).map((item) => item.key);
describe('role workspaces', () => {
  it('adds clinical work for a cashier with nursing duties while keeping their Billing shortcut', () => {
    const staff = { role: 'cashier' as const, additionalRoles: ['nurse' as const], permission: 'read_write' as const };
    const items = navigationFor({ role: staff.role, roles: [staff.role, ...staff.additionalRoles], permissions: staffPermissions(staff) });
    expect(items.find((item) => item.key === 'encounters')?.to).toBe('/encounters');
    expect(items.find((item) => item.key === 'billing')?.bottom).toBe(true);
  });
  it('makes delegated admin actions and secondary admin roles reachable', () => {
    expect(navigationFor({ role: 'nurse', roles: ['nurse'], permissions: ['fee_item:manage'] }).map((item) => item.key)).toContain('admin');
    expect(navigationFor({ role: 'nurse', roles: ['nurse', 'facility_admin'], permissions: [] }).map((item) => item.key)).toContain('admin');
  });
  it('keeps clinical and configuration work out of the cashier navigation', () => {
    expect(keys('cashier')).toEqual(['home', 'patients', 'billing']);
  });
  it('prioritizes appointments for records staff and visits for clinicians, with the unit queue hidden', () => {
    const records = navigationFor({ role: 'records_officer', permissions: [...permissionsFor('records_officer', 'read_write')] });
    expect(records.find((item) => item.key === 'appointments')?.bottom).toBe(true);
    const nurse = navigationFor({ role: 'nurse', permissions: [...permissionsFor('nurse', 'read_write')] });
    expect(nurse.find((item) => item.key === 'encounters')?.bottom).toBe(true);
    // Handoffs & unit queue is hidden until a facility needs it.
    expect(nurse.find((item) => item.key === 'units')).toBeUndefined();
    expect(keys('nurse')).not.toContain('admin');
    expect(keys('facility_admin')).toContain('admin');
  });
  it('preserves clinical navigation when administration is added, within three phone shortcuts', () => {
    const roles: Role[] = ['doctor', 'facility_admin'];
    const items = navigationFor({ role: 'doctor', roles, permissions: staffPermissions({ role: 'doctor', additionalRoles: ['facility_admin'], permission: 'read_write' }) });
    expect(items.filter((item) => item.bottom).map((item) => item.key)).toEqual(['home', 'patients', 'encounters']);
    expect(items.map((item) => item.key)).toEqual(expect.arrayContaining(['billing', 'admin', 'staff']));
    expect(activeNavigationKey(items, '/admin/staff/access')).toBe('staff');
  });
  it('preserves reception and cashier shortcuts when administrator access is added', () => {
    for (const role of ['records_officer', 'cashier'] as const) {
      const staff = { role, additionalRoles: ['facility_admin' as const], permission: 'read_write' as const };
      const items = navigationFor({ role, roles: [role, 'facility_admin'], permissions: staffPermissions(staff) });
      expect(items.filter((item) => item.bottom).map((item) => item.key)).toEqual(['home', 'patients', role === 'cashier' ? 'billing' : 'appointments']);
      expect(items.map((item) => item.key)).toEqual(expect.arrayContaining(['encounters', 'billing', 'staff']));
    }
  });
  it('advertises connected stock and reporting, while keeping unavailable referrals out', () => {
    expect(keys('facility_admin')).toEqual(expect.arrayContaining(['stock', 'month']));
    expect(keys('facility_admin')).not.toContain('referrals');
  });
});
