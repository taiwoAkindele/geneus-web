import { describe, expect, it } from 'vitest';
import { amountInput, formatMoney, MAX_AMOUNT_MINOR, parseAmount } from './money';
import { mintReceiptNumber } from './receiptNumber';

describe('money entered as decimal text', () => {
  it('keeps minor units exact, including amounts binary floats cannot represent', () => {
    expect(parseAmount('0.29', 'NGN')).toBe(29);
    expect(parseAmount('1500.5', 'NGN')).toBe(150050);
    expect(amountInput(150050, 'NGN')).toBe('1500.50');
    expect(parseAmount('21474836.47', 'NGN')).toBe(MAX_AMOUNT_MINOR);
  });

  it('uses the selected currency precision rather than assuming kobo everywhere', () => {
    expect(parseAmount('500', 'JPY')).toBe(500);
    expect(amountInput(500, 'JPY')).toBe('500');
    expect(parseAmount('1.005', 'KWD')).toBe(1005);
    expect(amountInput(1005, 'KWD')).toBe('1.005');
    expect(formatMoney(-50, 'NGN')).toContain('-');
  });

  it('refuses rounding, exponent notation, negative amounts and database overflow', () => {
    for (const value of ['', '0.001', '1e3', '-1', '1,000', '21474836.48']) {
      expect(() => parseAmount(value, 'NGN')).toThrow();
    }
    expect(() => parseAmount('1.5', 'JPY')).toThrow();
    expect(() => parseAmount('1', 'N')).toThrow();
  });
});

describe('offline receipt numbers', () => {
  it('uses only this facility receipt sequence, including reversal receipts', () => {
    expect(mintReceiptNumber('OOE-PHC', ['OOE-PHC-R-000009-K2', 'OTHER-R-000900-AB', 'OOE-PHC-000500-AB'])).toMatch(/^OOE-PHC-R-000010-[A-HJ-NP-Z2-9]{2}$/);
    expect(mintReceiptNumber('OOE', ['OOE-PHC-R-000999-K2'])).toMatch(/^OOE-R-000001-/);
  });

  it('never wraps a sequence or emits a receipt for an invalid facility code', () => {
    expect(() => mintReceiptNumber('OOE', ['OOE-R-999999-K2'])).toThrow(/every receipt/);
    expect(() => mintReceiptNumber('bad code', [])).toThrow();
  });
});
