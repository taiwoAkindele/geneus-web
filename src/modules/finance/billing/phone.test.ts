import { describe, expect, it } from 'vitest';
import { internationalPhone } from './phone';

describe('WhatsApp number for payment alerts', () => {
  it('turns local Nigerian numbers into the international form', () => {
    expect(internationalPhone('09035589426')).toBe('+2349035589426');
    expect(internationalPhone('0903 558 9426')).toBe('+2349035589426');
    expect(internationalPhone('0903-558-9426')).toBe('+2349035589426');
    expect(internationalPhone('2349035589426')).toBe('+2349035589426');
  });
  it('keeps numbers already in international form, including other countries', () => {
    expect(internationalPhone('+2349035589426')).toBe('+2349035589426');
    expect(internationalPhone('+233 24 412 3456')).toBe('+233244123456');
  });
  it('refuses anything that cannot be a phone number', () => {
    for (const value of ['', '0', '0903558942', '+0123456789', 'abc', '0903558942612', '+12']) expect(internationalPhone(value)).toBeUndefined();
  });
});
