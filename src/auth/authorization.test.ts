import { describe, expect, it } from 'vitest';
import { recordServerContact } from '@/data/deviceCredential';
import { assertAllowed, AuthorizationError, authorizationFor, isAllowed, nobody } from './authorization';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const staff = (role: Parameters<typeof authorizationFor>[0]['staff']['role'], permission: 'read_only' | 'read_write' = 'read_write') => ({
  staffId: `staff:${role}`,
  role,
  permission,
});

const contextFor = (member: ReturnType<typeof staff>, lastContact = ago(HOUR)) => ({
  ...authorizationFor({ staff: member, facilityId: 'OOE-PHC', deviceId: 'device-1' }),
  lastServerContactOn: lastContact,
});

/**
 * The rule that runs before every local write. These pin the two answers it
 * can give — not granted, or not fresh enough — and that both are refusals
 * a screen can explain.
 */
describe('assertAllowed', () => {
  it('lets a nurse record care', () => {
    expect(() => assertAllowed(contextFor(staff('nurse')), 'register_entry:create')).not.toThrow();
    expect(() => assertAllowed(contextFor(staff('nurse')), 'patient:create')).not.toThrow();
  });

  it('refuses a nurse an admin-only action, naming the permission', () => {
    expect(() => assertAllowed(contextFor(staff('nurse')), 'staff:manage')).toThrow(AuthorizationError);
    try {
      assertAllowed(contextFor(staff('nurse')), 'staff:manage');
    } catch (cause) {
      expect((cause as AuthorizationError).denial).toEqual({ kind: 'not_granted', permission: 'staff:manage' });
      expect((cause as AuthorizationError).message).toMatch(/role doesn't allow/);
    }
  });

  it('refuses read-only staff every write', () => {
    const readOnly = contextFor(staff('facility_admin', 'read_only'));
    expect(readOnly.permissions).toEqual([]);
    expect(isAllowed(readOnly, 'patient:create')).toBe(false);
    expect(isAllowed(readOnly, 'staff:manage')).toBe(false);
  });

  it('refuses a high-risk action when the device has not checked in for 25 hours, but still allows clinical work', () => {
    const admin = contextFor(staff('facility_admin'), ago(25 * HOUR));

    expect(isAllowed(admin, 'staff:manage')).toBe(false);
    expect(isAllowed(admin, 'device:enroll')).toBe(false);
    expect(isAllowed(admin, 'patient:update')).toBe(true);
    try {
      assertAllowed(admin, 'staff:manage');
    } catch (cause) {
      expect((cause as AuthorizationError).denial.kind).toBe('stale_authorization');
      expect((cause as AuthorizationError).message).toMatch(/connect and try again/);
    }
  });

  it('freezes everything once the device has been dark for more than 7 days', () => {
    const nurse = contextFor(staff('nurse'), ago(8 * DAY));
    expect(isAllowed(nurse, 'register_entry:create')).toBe(false);
  });

  it('reads the latest server contact when the snapshot has none, so a sync a moment ago counts', () => {
    recordServerContact(ago(HOUR));
    const { lastServerContactOn: _dropped, ...withoutSnapshot } = contextFor(staff('nurse'));

    expect(isAllowed(withoutSnapshot, 'register_entry:create')).toBe(true);
  });

  it('gives nobody no permission at all', () => {
    const anonymous = nobody('OOE-PHC', 'device-1');
    expect(anonymous.permissions).toEqual([]);
    expect(isAllowed(anonymous, 'patient:create')).toBe(false);
  });
});

describe('authorizationFor', () => {
  it('builds the context from the staff record, facility and device — never from anything else', () => {
    const context = authorizationFor({ staff: staff('doctor'), facilityId: 'OOE-PHC', deviceId: 'device-1' });

    expect(context).toMatchObject({ userId: 'staff:doctor', facilityId: 'OOE-PHC', deviceId: 'device-1', role: 'doctor' });
    expect(context.permissions).toContain('referral:update');
    expect(context.permissions).not.toContain('staff:manage');
    expect(context.policyVersion).toBeGreaterThan(0);
  });
});
