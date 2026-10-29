import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Staff, Patient, type EncounterEntry } from '@shared';
import { SessionProvider } from '@/session';
import { ToastProvider, Button } from '@/ui';
import { setDatabaseForTests } from '@/data/database';
import { recordServerContact } from '@/data/deviceCredential';
import { fakeDatabase } from '@/data/testing/fakeDatabase';
import { toRow } from '@/data/rows';
import { ClinicalWorkspace, AllergyAlert } from '@/features/clinical';
import { EntryEditorSheet } from '@/features/encounter/components/EntryEditorSheet';
import { entriesForEncounter } from '@/data/repos/encounters';
import { StepForm } from '@/features/encounter/components/StepForm';
import { useEncounter } from '@/features/encounter/useEncounter';
import { STEP_DEFS } from '@/features/encounter/steps';
import type { StepKey } from '@/features/encounter/types';
import '../src/index.css';

const patientId = 'QA-PHC-000001-K2';
const envelope = { facilityId: 'QA-PHC', deviceId: 'qa-device', createdBy: 'qa-doctor', createdOn: new Date().toISOString(), schemaVersion: 3 };
const patient = Patient.parse({ ...envelope, id: patientId, patientId, type: 'patient', fullName: 'Synthetic Clinical Patient', address: 'Test facility', sex: 'female', ageYears: 30, allergies: ['Legacy synthetic allergen'] });
const staff = Staff.parse({ ...envelope, id: 'qa-doctor', staffId: 'qa-doctor', type: 'staff', fullName: 'Dr Synthetic Reviewer', role: 'doctor', permission: 'read_write', active: true, loginAccess: 'always' });
const encounter = { ...envelope, id: 'encounter:qa', type: 'encounter' as const, patientId, openedOn: envelope.createdOn, setting: 'facility' as const };
const original: EncounterEntry = { ...envelope, id: 'entry:qa-vitals', type: 'encounter_entry', patientId, encounterId: encounter.id, actorRole: 'doctor', step: 'vitals', values: { temperatureC: 39, weightKg: 80, heightCm: 200 } };
const db = fakeDatabase({ patients: [toRow('patient', patient)], staff: [toRow('staff', staff)], encounters: [toRow('encounter', encounter)], encounter_entries: [toRow('encounter_entry', original)] });
const listeners = new Set<() => void>();
db.onChangeWithCallback = ({ onChange }) => { listeners.add(onChange); return () => listeners.delete(onChange); };
db.execute = async (sql, parameters = []) => {
  if (sql.startsWith('DELETE FROM encounter_drafts')) {
    db.rows.encounter_drafts = (db.rows.encounter_drafts ?? []).filter((row) => parameters.length === 1
      ? row.id !== parameters[0]
      : row.staffId !== parameters[0] || row.patientId !== parameters[1] || row.encounterKey !== parameters[2]);
    return;
  }
  if (sql.startsWith('UPDATE encounter_drafts')) {
    const row = db.rows.encounter_drafts?.find((candidate) => candidate.id === parameters[2]);
    if (row) { row.data = parameters[0]; row.updatedOn = parameters[1]; }
    return;
  }
  const match = /^INSERT INTO (\w+) \(([^)]+)\)/.exec(sql);
  if (!match) throw new Error(`Unexpected fixture write: ${sql}`);
  const fields = match[2].split(',').map((field) => field.trim().replaceAll('"', ''));
  const row = Object.fromEntries(fields.map((field, index) => [field, parameters[index]]));
  (db.rows[match[1]] ??= []).push(row);
  if (match[1] !== 'encounter_drafts') window.setTimeout(() => listeners.forEach((listener) => listener()), 0);
};
db.writeTransaction = async (callback) => callback({ execute: db.execute,getOptional:db.getOptional });
setDatabaseForTests(db);
localStorage.setItem('geneus.signedInStaffId', staff.id);
localStorage.setItem('geneus.lastActivityOn', String(Date.now()));
recordServerContact(new Date().toISOString());
Object.assign(window, { clinicalQa: { rows: db.rows } });

const Fixture = () => {
  const [editor, setEditor] = useState<{ target?: EncounterEntry; entries: EncounterEntry[]; step: 'vitals' | 'complaint' }>();
  const open = async (correcting: boolean, step: 'vitals' | 'complaint' = 'vitals') => setEditor({ step, target: correcting ? original : undefined, entries: await entriesForEncounter(encounter.id) });
  return <main className="mx-auto max-w-5xl bg-surface p-4 md:p-8">
    <h1 className="text-2xl font-bold">Synthetic Clinical Patient</h1>
    <p className="my-2 text-sm">Acceptance fixture · synthetic data · local memory only</p>
    <AllergyAlert patientId={patientId} />
    <ClinicalWorkspace patientId={patientId} encounterId={encounter.id} />
    <div className="flex flex-wrap gap-3">
      <Button fullWidth={false} onClick={() => open(false)}>Repeat observation</Button>
      <Button fullWidth={false} onClick={() => open(true)}>Correct original observation</Button>
      <Button fullWidth={false} onClick={() => open(false, 'complaint')}>Add progress note</Button>
    </div>
    {editor ? <EntryEditorSheet patientId={patientId} encounterId={encounter.id} {...editor} onClose={() => setEditor(undefined)} /> : null}
  </main>;
};
const FieldHelpFixture = () => {
  const ctl = useEncounter(patientId, encounter.id);
  const [step, setStep] = useState<StepKey>('vitals');
  useEffect(() => { Object.assign(window, { fieldHelpQa: { data: ctl.enc.data } }); }, [ctl.enc.data]);
  return <main className="mx-auto max-w-4xl space-y-5 p-4 md:p-8">
    <h1 className="text-xl font-bold">Encounter field guidance · synthetic preview</h1>
    <label htmlFor="preview-section" className="block">Preview encounter section</label>
    <select id="preview-section" value={step} onChange={(event) => setStep(event.target.value as StepKey)} className="w-full rounded-field border border-outline p-3">
      {Object.values(STEP_DEFS).map((definition) => <option key={definition.key} value={definition.key}>{definition.title}</option>)}
    </select>
    <StepForm stepKey={step} ctl={ctl} />
  </main>;
};
const showFieldHelp = new URLSearchParams(location.search).has('field-help');
createRoot(document.getElementById('root')!).render(<ToastProvider><SessionProvider>{showFieldHelp ? <FieldHelpFixture /> : <Fixture />}</SessionProvider></ToastProvider>);
