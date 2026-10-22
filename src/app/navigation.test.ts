import { describe, expect, it } from 'vitest';
import { permissionsFor, type Role } from '@shared';
import { navigationFor } from './navigation';

const keys = (role: Role) => navigationFor({ role, permissions: [...permissionsFor(role, 'read_write')] }).map((item) => item.key);
describe('role workspaces', () => {
  it('keeps clinical and configuration work out of the cashier navigation', () => {
    expect(keys('cashier')).toEqual(['home', 'patients']);
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
