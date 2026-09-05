import type { Facility, Staff } from '@shared';
import { get, post } from './client';

export type SyncCredential = {
  url: string;
  database: string;
  username: string;
  password: string;
};

export type FacilityRegistration = {
  code: string;
  name: string;
  state: string;
  lga: string;
  level: Facility['level'];
  adminFullName: string;
  deviceId: string;
  inviteToken: string;
};

export type InviteCheck = { label: string; expiresOn: string };

/** Checks the code before the admin fills in anything else. */
export const checkInvite = (token: string) => get<InviteCheck>(`/invites/${encodeURIComponent(token)}`);

export type RegistrationResult = {
  facility: Facility;
  admin: Staff;
  sync: SyncCredential;
};

/**
 * The one operation that cannot happen offline: the server creates the
 * facility's database, its validation guard, and this device's sync credential
 * before any document can exist (geneus-server PLAN §4.3).
 */
export const registerFacility = (registration: FacilityRegistration) =>
  post<RegistrationResult>('/facilities', registration);
