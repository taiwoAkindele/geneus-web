/** PostgreSQL stores each amount in an integer, in the currency's minor unit. */
export const MAX_AMOUNT_MINOR = 2_147_483_647;

export const assertAmountMinor = (amount: number): void => {
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > MAX_AMOUNT_MINOR) {
    throw new Error('Enter an amount within the supported range');
  }
};

export const currencyDigits = (currency: string): number => {
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Enter a three-letter currency code');
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
};

/** Parse decimal text without multiplying a floating-point amount (e.g. 0.29). */
export const parseAmount = (value: string, currency: string): number => {
  const digits = currencyDigits(currency);
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match || (match[2]?.length ?? 0) > digits) {
    throw new Error(`Enter an amount with at most ${digits} decimal places`);
  }
  const amount = Number(match[1]) * 10 ** digits + Number((match[2] ?? '').padEnd(digits, '0'));
  assertAmountMinor(amount);
  return amount;
};

export const amountInput = (amountMinor: number, currency: string): string => {
  assertAmountMinor(amountMinor);
  const digits = currencyDigits(currency);
  const scale = 10 ** digits;
  const whole = Math.floor(amountMinor / scale);
  return digits === 0 ? String(whole) : `${whole}.${String(amountMinor % scale).padStart(digits, '0')}`;
};

/** Negative balances deliberately remain visible: they represent an overpayment. */
export const formatMoney = (amountMinor: number, currency: string): string =>
  new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'code' }).format(amountMinor / 10 ** currencyDigits(currency));
