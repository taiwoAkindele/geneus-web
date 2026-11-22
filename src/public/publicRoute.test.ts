import { describe, expect, it } from 'vitest';
import { publicRoute } from './PublicDocumentsApp';
import { isPublicPath } from './publicPath';

const token = 'Ab3_-'.repeat(8) + 'xyz';

describe('patient link routes', () => {
  it('reads bills, receipts and message choices', () => {
    expect(publicRoute(`/p/b/${token}`)).toEqual({ kind: 'bill', token, messages: false });
    expect(publicRoute(`/p/r/${token}/`)).toEqual({ kind: 'receipt', token, messages: false });
    expect(publicRoute(`/p/b/${token}/messages`)).toEqual({ kind: 'bill', token, messages: true });
  });
  it('refuses anything else', () => {
    expect(publicRoute('/p/x/' + token)).toBeUndefined();
    expect(publicRoute('/p/b/short')).toBeUndefined();
    expect(publicRoute(`/p/b/${token}/pay`)).toBeUndefined();
  });
  it('keeps patient pages apart from the staff app', () => {
    expect(isPublicPath(`/p/b/${token}`)).toBe(true);
    expect(isPublicPath('/patients/profile')).toBe(false);
  });
});
