import {
  decide,
  permissionsFor,
  POLICY_VERSION,
  type AuthorizationContext,
  type Denial,
  type Permission,
  type Staff,
} from '@shared';
import { lastServerContactOn } from '@/data/deviceCredential';

/**
 * Local authorization: the rule that runs before any SQLite write (root §4.3,
 * migration plan §15). Repositories call `assertAllowed`; a denial throws, so
 * nothing is written and PowerSync has nothing to upload. The UI may hide a
 * button as a courtesy — this is the actual rule.
 *
 * The decision itself (`decide`) is the shared contract's, so the device and
 * the server agree; the server re-decides on upload from its own facts and its
 * answer is the one that counts. This copy exists so offline behaviour is
 * deterministic and an unauthorized action never becomes a mutation.
 */
export class AuthorizationError extends Error {
  constructor(readonly denial: Denial) {
    super(describe(denial));
    this.name = 'AuthorizationError';
  }
}

const describe = (denial: Denial): string => {
  switch (denial.kind) {
    case 'not_granted':
      return "Your role doesn't allow this — ask a facility admin";
    case 'stale_authorization':
      return "This device hasn't checked in with the server recently enough for this — connect and try again";
  }
};

/**
 * Throws unless `context` may exercise `permission` right now. The last server
 * contact is read live rather than from the snapshot: a sync that completed a
 * moment ago should count.
 */
export const assertAllowed = (context: AuthorizationContext, permission: Permission): void => {
  const denial = decide({ ...context, lastServerContactOn: context.lastServerContactOn ?? lastServerContactOn() }, permission);
  if (denial) throw new AuthorizationError(denial);
};

export const isAllowed = (context: AuthorizationContext, permission: Permission): boolean => {
  try {
    assertAllowed(context, permission);
    return true;
  } catch (cause) {
    if (cause instanceof AuthorizationError) return false;
    throw cause;
  }
};

/** The context for a member of staff acting from this device at this facility. */
export const authorizationFor = (input: {
  staff: Pick<Staff, 'staffId' | 'role' | 'permission'>;
  facilityId: string;
  deviceId: string;
}): AuthorizationContext => ({
  userId: input.staff.staffId,
  facilityId: input.facilityId,
  deviceId: input.deviceId,
  role: input.staff.role,
  permissions: [...permissionsFor(input.staff.role, input.staff.permission)],
  policyVersion: POLICY_VERSION,
  lastServerContactOn: lastServerContactOn(),
});

/**
 * Nobody signed in: holds no permission, so every write is refused. Used where
 * a provider mounts above the shift guard and has no session yet.
 */
export const nobody = (facilityId: string, deviceId: string): AuthorizationContext => ({
  userId: 'nobody',
  facilityId,
  deviceId,
  role: 'chew',
  permissions: [],
  policyVersion: POLICY_VERSION,
});
