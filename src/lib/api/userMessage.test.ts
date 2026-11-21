import { describe, expect, it } from 'vitest';
import { ApiError } from './client';
import { userMessage } from './userMessage';

const fallback = 'The change was not saved. Try again.';

describe('messages shown to staff', () => {
  it('passes through plain guidance from the server, as a sentence', () => {
    expect(userMessage(new ApiError('conflict', 'A general receiving account is already linked. Select its existing bank details.', 409), fallback))
      .toBe('A general receiving account is already linked. Select its existing bank details.');
    expect(userMessage(new Error('Enter an amount with at most 2 decimal places'), fallback)).toBe('Enter an amount with at most 2 decimal places.');
  });
  it('never shows setting names, code, addresses or database detail', () => {
    for (const leak of [
      'Paystack setup requires BILLING_ENCRYPTION_KEY on the server',
      'duplicate key value violates unique constraint "payments_pkey"',
      'connect ECONNREFUSED 127.0.0.1:5432',
      "Cannot read properties of undefined (reading 'id')",
      'Request to https://api.paystack.co/transaction failed',
      'Invalid token signature',
      'at ingest (/app/src/routes/billing.ts:201:12)',
    ]) expect(userMessage(new Error(leak), fallback)).toBe(fallback);
  });
  it('hides every server fault behind a general message', () => {
    expect(userMessage(new ApiError('internal', 'relation "x" does not exist', 500), fallback)).toBe('Something went wrong on the server. Try again in a moment.');
    expect(userMessage(new ApiError('internal', 'Looks harmless', 503), fallback)).toBe('Something went wrong on the server. Try again in a moment.');
  });
  it('uses the action-specific message for a generic refusal, and known codes for common cases', () => {
    expect(userMessage(new ApiError('bad_request', 'Missing or invalid billing request fields', 400), 'Check the WhatsApp number and try again.')).toBe('Check the WhatsApp number and try again.');
    expect(userMessage(new ApiError('staff_session_required', 'Confirm your PIN to continue', 403), fallback)).toBe('Confirm your PIN to continue.');
    expect(userMessage(new ApiError('not_configured', 'The server administrator must configure BILLING_ENCRYPTION_KEY first', 503), fallback)).toBe('This needs server setup first. Ask your system administrator.');
    expect(userMessage(new ApiError('offline', 'Cannot reach the Geneus server', undefined), fallback)).toBe("You're offline. Check the connection and try again.");
  });
  it('shows a payment provider’s refusal reason, still filtered', () => {
    expect(userMessage(new ApiError('provider_refused', 'The provider refused this operation: Dedicated NUBAN not available for this business.', 502), fallback))
      .toBe('The provider refused this operation: Dedicated NUBAN not available for this business.');
    expect(userMessage(new ApiError('provider_refused', 'The provider refused this operation: see https://x.test', 502), fallback))
      .toBe("The provider refused this operation. Check the account's access and settings with the provider.");
    expect(userMessage(new ApiError('provider_unavailable', 'anything', 502), fallback)).toBe('The provider could not be reached. Try again in a moment.');
  });
  it('falls back for anything that is not an error message', () => {
    expect(userMessage(undefined, fallback)).toBe(fallback);
    expect(userMessage({ code: 42 }, fallback)).toBe(fallback);
  });
});
