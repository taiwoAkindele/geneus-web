import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PinSetupCode } from '@shared';
import { authorizationFor, AuthorizationError, claimingFor } from '@/auth/authorization';
import { pbkdf2Base64 } from '@/lib/pbkdf2';
import { recordServerContact } from '../deviceCredential';
import { setDatabaseForTests } from '../database';
import { fakeDatabase, type FakeDatabase } from '../testing/fakeDatabase';
import { findMatchingCode, markCodeUsed } from './pinSetupCodes';

const HOUR = 60 * 60 * 1000;
/** Low, to keep the test quick; the server issues them at 100,000. */
const ITERATIONS = 1000;
const SALT = 'c2FsdC1mb3ItdGVzdHM=';

const codeRow = async (overrides: Partial<PinSetupCode> = {}): Promise<Record<string, unknown>> => ({
  id: 'pin_setup_code:one',
  facilityId: 'OOE-PHC',
  schemaVersion: 3,
  createdBy: 'staff:admin',
  createdOn: new Date(Date.now() - HOUR).toISOString(),
  deviceId: 'device-admin',
  staffId: 'staff:nurse',
  codeHash: await pbkdf2Base64('K7QM2XPA', SALT, ITERATIONS),
  codeSalt: SALT,
  codeIterations: ITERATIONS,
  expiresOn: new Date(Date.now() + 23 * HOUR).toISOString(),
  ...overrides,
});

/**
 * The code arrives by sync as a hash; the device checks what the person typed
 * against it with no signal, and marks it used as that person — the one write
 * someone without a PIN can make.
 */
describe('PIN setup codes on the device', () => {
  let db: FakeDatabase;

  const seed = async (...rows: Record<string, unknown>[]) => {
    db = fakeDatabase({ pin_setup_codes: rows });
    setDatabaseForTests(db);
  };

  beforeEach(() => recordServerContact(new Date(Date.now() - HOUR).toISOString()));
  afterEach(() => setDatabaseForTests(undefined));

  it('matches the code as read aloud, whatever the case or spacing', async () => {
    await seed(await codeRow());

    expect((await findMatchingCode('staff:nurse', ' k7qm 2xpa '))?.id).toBe('pin_setup_code:one');
    expect(await findMatchingCode('staff:nurse', 'K7QM2XPB')).toBeUndefined();
  });

  it('matches only the person it was issued for', async () => {
    await seed(await codeRow());

    expect(await findMatchingCode('staff:chew', 'K7QM2XPA')).toBeUndefined();
  });

  it('ignores a code that has expired, been replaced, or been used', async () => {
    await seed(
      await codeRow({ id: 'pin_setup_code:expired', expiresOn: new Date(Date.now() - HOUR).toISOString() }),
      await codeRow({ id: 'pin_setup_code:revoked', revokedOn: new Date().toISOString() }),
      await codeRow({ id: 'pin_setup_code:used', usedOn: new Date().toISOString(), usedOnDevice: 'device-2' }),
    );

    expect(await findMatchingCode('staff:nurse', 'K7QM2XPA')).toBeUndefined();
  });

  it('marks the code used as the person it names, and nothing more', async () => {
    await seed(await codeRow());
    const code = await findMatchingCode('staff:nurse', 'K7QM2XPA');

    await markCodeUsed(
      code as PinSetupCode,
      claimingFor({ staff: { staffId: 'staff:nurse', role: 'nurse' }, facilityId: 'OOE-PHC', deviceId: 'device-1' }),
    );

    expect(db.statements).toHaveLength(1);
    expect(db.statements[0]?.sql).toMatch(/^UPDATE pin_setup_codes SET usedOn = \?, usedOnDevice = \?, updatedBy = \?, updatedOn = \?/);
    expect(db.statements[0]?.parameters).toContain('staff:nurse');
  });

  it('cannot be marked used through a signed-in session — not even an admin holds the claim', async () => {
    await seed(await codeRow());
    const code = await findMatchingCode('staff:nurse', 'K7QM2XPA');
    const admin = authorizationFor({
      staff: { staffId: 'staff:admin', role: 'facility_admin', permission: 'read_write' },
      facilityId: 'OOE-PHC',
      deviceId: 'device-1',
    });

    await expect(markCodeUsed(code as PinSetupCode, admin)).rejects.toBeInstanceOf(AuthorizationError);
    expect(db.statements).toEqual([]);
  });
});
