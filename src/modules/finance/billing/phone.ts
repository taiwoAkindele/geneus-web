/**
 * A WhatsApp number in the international form providers require (+2349035589426).
 * Accepts what staff naturally type: local Nigerian numbers (09035589426), 234…, or +…,
 * with spaces, dashes or brackets. Returns undefined when it can't be a phone number.
 */
export const internationalPhone = (input: string): string | undefined => {
  const trimmed = input.trim();
  const digits = trimmed.replace(/[\s\-().]/g, '');
  let candidate: string;

  if (/^\+\d+$/.test(digits)) {
    candidate = digits;
  } else if (/^0\d{10}$/.test(digits)) {
    candidate = `+234${digits.slice(1)}`;
  } else if (/^234\d{10}$/.test(digits)) {
    candidate = `+${digits}`;
  } else {
    return undefined;
  }

  return /^\+[1-9]\d{7,14}$/.test(candidate) ? candidate : undefined;
};
