import type {
  EmailSent,
  FacilityRegistration,
  FacilityRegistrationResponse,
  FacilityRegistrationView,
  FacilitySignupRequest,
} from '@shared';
import { post } from './client';
import { adoptStaffSession, rememberPinGrant } from './staffSession';

/**
 * Facility sign-up (SCHEMA.md §10): prove an email, ask Geneus for a facility,
 * and register it from the link emailed once Geneus approves.
 */

/** Emails the would-be admin a 6-digit code proving their address; it goes back with the request. */
export const sendSignupEmailCode = (email: string) =>
  post<EmailSent>('/email-verifications', { email });

/** "Create an account": the request Geneus approves or rejects. Answers where the decision will be emailed. */
export const requestFacility = (request: FacilitySignupRequest) =>
  post<{ sentTo: string }>('/facility-requests', request);

/** What the registration link was approved for. Spends nothing. */
export const openRegistrationLink = (token: string) =>
  post<FacilityRegistrationView>('/facility-registration/open', { token });

/**
 * The one operation that cannot happen offline: the server creates the
 * facility, its first admin and this device's credential before any record can
 * exist. The credential comes back exactly once (SCHEMA.md §12); the caller
 * saves it. The admin's session and the permission to register their PIN on
 * this device are held here, as after a password sign-in.
 */
export const registerFacility = async (
  registration: FacilityRegistration,
): Promise<FacilityRegistrationResponse> => {
  const result = await post<FacilityRegistrationResponse>('/facilities', registration);

  adoptStaffSession(result.session, result.device.deviceId);
  rememberPinGrant(
    result.session.staffId,
    result.session.pinGrant,
    result.session.pinGrantExpiresOn,
  );

  return result;
};
