import { describe, expect, it } from 'vitest';
import { createRegistrationDraft } from './registrationDraft';

describe('registration draft across steps', () => {
  it('keeps both steps when going back and forward, rather than reseeding from old route state', () => {
    const draft = createRegistrationDraft();
    const first = draft.read('new');
    draft.keep('new', { ...first, fullName: 'Amaka', sex: 'F', age: '32', address: 'Ring Road', phone: '0803' });
    const second = draft.read('new');
    draft.keep('new', { ...second, occupation: 'Teacher', religion: 'islam', folder: '2023/1187' });
    expect(draft.read('new', { fullName: '' })).toMatchObject({ fullName: 'Amaka', age: '32', phone: '0803', occupation: 'Teacher', religion: 'islam', folder: '2023/1187' });
  });

  it('starts blank after saving or clearing, and never carries details into another patient', () => {
    const draft = createRegistrationDraft();
    draft.keep('new', { ...draft.read('new'), fullName: 'Unsaved person', sex: 'M' });
    expect(draft.read('patient:other', { fullName: 'Different patient', sex: 'F' }).fullName).toBe('Different patient');
    draft.clear();
    expect(draft.read('new')).toMatchObject({ fullName: '', sex: '' });
  });
});
