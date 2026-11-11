import { patientSexLabel, type Patient } from '@shared';
import { currentAge, namesMatch, phoneKey } from '@/features/search/patientMatching';

/** `unknown` when either record lacks the fact: a missing value is never evidence either way. */
export type Agreement = 'match' | 'differs' | 'unknown';
export type ComparisonRow = { label: string; first: string; second: string; agreement: Agreement };

const NOT_RECORDED = 'Not recorded';
const show = (value: string | undefined) => value?.trim() || NOT_RECORDED;
const agree = (a: unknown, b: unknown, same: () => boolean): Agreement => (a === undefined || a === '' || b === undefined || b === '' ? 'unknown' : same() ? 'match' : 'differs');
const ageText = (patient: Patient, now: number) => { const age = currentAge(patient, now); return age === undefined ? NOT_RECORDED : `${age} years${patient.dobEstimated || !patient.dateOfBirth ? ' (estimated)' : ''}`; };
const maskedNin = (nin?: string) => (nin ? `•••••••${nin.slice(-4)}` : NOT_RECORDED);

/**
 * Two patient records side by side for an identity decision. Names, phones
 * and ages use the registration duplicate check's rules (spelling slips,
 * number formats, a two-year age tolerance), so both screens agree.
 */
export const compareIdentities = (a: Patient, b: Patient, now = Date.now()): ComparisonRow[] => {
  const ageA = currentAge(a, now), ageB = currentAge(b, now);
  return [
    { label: 'Name', first: a.fullName, second: b.fullName, agreement: namesMatch(a.fullName, b.fullName) ? 'match' : 'differs' },
    { label: 'Sex', first: a.sex ? patientSexLabel(a.sex) : NOT_RECORDED, second: b.sex ? patientSexLabel(b.sex) : NOT_RECORDED, agreement: agree(a.sex, b.sex, () => a.sex === b.sex) },
    { label: 'Age', first: ageText(a, now), second: ageText(b, now), agreement: agree(ageA, ageB, () => Math.abs(ageA! - ageB!) <= 2) },
    { label: 'Birth date', first: show(a.dateOfBirth), second: show(b.dateOfBirth), agreement: agree(a.dateOfBirth, b.dateOfBirth, () => a.dateOfBirth === b.dateOfBirth) },
    { label: 'Phone', first: show(a.phone), second: show(b.phone), agreement: agree(phoneKey(a.phone), phoneKey(b.phone), () => phoneKey(a.phone) === phoneKey(b.phone)) },
    { label: 'Address', first: show(a.address), second: show(b.address), agreement: agree(a.address?.trim(), b.address?.trim(), () => a.address!.trim().toLowerCase() === b.address!.trim().toLowerCase()) },
    { label: 'Old folder', first: show(a.legacyPaperRef), second: show(b.legacyPaperRef), agreement: agree(a.legacyPaperRef, b.legacyPaperRef, () => a.legacyPaperRef === b.legacyPaperRef) },
    { label: 'NIN', first: maskedNin(a.nin), second: maskedNin(b.nin), agreement: agree(a.nin, b.nin, () => a.nin === b.nin) },
    { label: 'Identity', first: a.identityEvidence === 'document_seen' ? 'Document checked by staff' : 'Reported', second: b.identityEvidence === 'document_seen' ? 'Document checked by staff' : 'Reported', agreement: 'unknown' },
  ];
};
