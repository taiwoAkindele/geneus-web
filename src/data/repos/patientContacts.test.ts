import { describe, expect, it } from 'vitest';
import type { PatientContact } from '@shared';
import { stoppedChannelsNote, tidyEmail } from './patientContacts';

const contact = (extra: Partial<PatientContact>) => ({ smsStopped: false, emailStopped: false, ...extra }) as PatientContact;

describe('patient contact details', () => {
  it('tidies an email, accepts a blank one and explains a bad one', () => {
    expect(tidyEmail('  Ada@Example.ORG ')).toBe('ada@example.org');
    expect(tidyEmail('   ')).toBeUndefined();
    expect(() => tidyEmail('ada@')).toThrow('Enter a valid email address, or leave it blank');
  });
  it("tells staff which channels the patient stopped", () => {
    expect(stoppedChannelsNote(undefined)).toBeUndefined();
    expect(stoppedChannelsNote(contact({}))).toBeUndefined();
    expect(stoppedChannelsNote(contact({ smsStopped: true }))).toBe('The patient stopped bills and receipts by SMS. Only the patient can start them again.');
    expect(stoppedChannelsNote(contact({ smsStopped: true, emailStopped: true }))).toContain('SMS and email');
  });
});
