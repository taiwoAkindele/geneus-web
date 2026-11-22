import { describe, expect, it } from 'vitest';
import { checkoutReference } from './BillCheckout';

const ref = 'geneus-co-b8ca5856-800c-4a08-9dfb-8d60dcf46a1b';

describe('reading the checkout reference on return from the provider', () => {
  it('finds it in our own parameter', () => expect(checkoutReference(`?checkout=${ref}`)).toBe(ref));
  it('survives Monnify appending its own query without a separator', () => {
    expect(checkoutReference(`?checkout=${ref}?paymentReference=${ref}`)).toBe(ref);
    expect(checkoutReference(`?paymentReference=${encodeURIComponent(ref)}`)).toBe(ref);
  });
  it("finds Paystack's reference too", () => expect(checkoutReference(`?checkout=${ref}&trxref=${ref}&reference=${ref}`)).toBe(ref));
  it('ignores anything else', () => {
    expect(checkoutReference('')).toBeUndefined();
    expect(checkoutReference('?checkout=geneus-co-nope')).toBeUndefined();
  });
});
