import React, { useState } from 'react';
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
  const match = /^INSERT INTO (\w+) \(([^)]+)\)/.exec(sql);
  if (!match) throw new Error(`Unexpected fixture write: ${sql}`);
  const fields = match[2].split(',').map((field) => field.trim().replaceAll('"', ''));
  const row = Object.fromEntries(fields.map((field, index) => [field, parameters[index]]));
  (db.rows[match[1]] ??= []).push(row);
  window.setTimeout(() => listeners.forEach((listener) => listener()), 0);
};
db.writeTransaction = async (callback) => callback({ execute: db.execute });
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
createRoot(document.getElementById('root')!).render(<ToastProvider><SessionProvider><Fixture /></SessionProvider></ToastProvider>);
