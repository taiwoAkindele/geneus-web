import type { FacilitySignupReview } from '@shared';
import { post } from './client';

/**
 * A Geneus operator deciding a facility sign-up request from the link they
 * were emailed. The link's token is their credential for that one request;
 * nothing changes until they choose.
 */

export const openSignupReview = (token: string) =>
  post<FacilitySignupReview>('/facility-requests/review/open', { token });

export const decideSignupRequest = (token: string, decision: 'approve' | 'reject', note?: string) =>
  post<FacilitySignupReview>('/facility-requests/review/decide', {
    token,
    decision,
    ...(note?.trim() ? { note: note.trim() } : {}),
  });

/** For when the decision email did not reach the person who asked. */
export const resendSignupDecision = (token: string) =>
  post<FacilitySignupReview>('/facility-requests/review/resend', { token });
