import type { FacilityRegistration, FacilityRegistrationResult, InviteCheck } from '@shared';
import { get, post } from './client';

/** Checks the code before the admin fills in anything else. */
export const checkInvite = (token: string) => get<InviteCheck>(`/invites/${encodeURIComponent(token)}`);

/**
 * The one operation that cannot happen offline: the server creates the
 * facility, its first admin and this device's credential before any record can
 * exist. The credential comes back exactly once (SCHEMA.md §12).
 */
export const registerFacility = (registration: FacilityRegistration) =>
  post<FacilityRegistrationResult>('/facilities', registration);
