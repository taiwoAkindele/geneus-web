import { AppointmentsProvider } from '@/features/appointments';
// Synthetic browser acceptance fixture. Never imported by the production application.
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Patient, Staff } from '@shared';
import { SessionProvider, useAuth } from '@/session';
import { ToastProvider } from '@/ui';
import { EncounterScreen } from '@/pages/encounter/EncounterScreen';
import { setDatabaseForTests } from '@/data/database';
import { fakeDatabase } from '@/data/testing/fakeDatabase';
import { toRow } from '@/data/rows';
import { recordServerContact } from '@/data/deviceCredential';
import '../src/index.css';

const patientId = 'QA-PHC-000001-K2';
const envelope = { facilityId: 'QA-PHC', deviceId: 'qa-device', createdBy: 'qa-doctor', createdOn: new Date().toISOString(), schemaVersion: 4 };
const patient = Patient.parse({ ...envelope, id: patientId, patientId, type: 'patient', fullName: 'Synthetic Care Patient', address: 'Synthetic facility', sex: 'female', ageYears: 30 });
const staff = Staff.parse({ ...envelope, id: 'qa-doctor', staffId: 'qa-doctor', type: 'staff', fullName: 'Synthetic Clinician', role: 'doctor', permission: 'read_write', active: true, loginAccess: 'always' });
const definitions = [
  { ...envelope, id: 'definition:fbc', type: 'service_definition' as const, name: 'Full blood count', category: 'laboratory', concept: { system: 'local', code: 'fbc', label: 'Full blood count' }, active: true, orderable: true, revision: 1, investigation: { specimen: 'Blood', department: 'Haematology', aliases: ['FBC'] } },
  { ...envelope, id: 'definition:glucose', type: 'service_definition' as const, name: 'Blood glucose', category: 'laboratory', concept: { system: 'local', code: 'glucose', label: 'Blood glucose' }, active: true, orderable: true, revision: 1, investigation: { specimen: 'Blood', department: 'Chemical pathology', aliases: ['Glucose'] } },
];
const offerings = definitions.map((d) => ({ ...envelope, id: `offering:${d.id}`, type: 'service_offering' as const, name: d.name, serviceDefinitionId: d.id, unitId: 'unit:lab', locationIds: ['location:lab'], delivery: 'physical', requiredActions: [], intakePolicy: 'both', timeZone: 'Africa/Lagos', configuration: 'active', resourceReadiness: 'available', revision: 1, feeItemId: `fee:${d.id}` }));
const fees = definitions.map((d, index) => ({ ...envelope, id: `fee:${d.id}`, type: 'fee_item' as const, name: d.name, category: 'laboratory', amountMinor: index ? 250000 : 450000, currency: 'NGN', chargeWhen: 'when_ordered', exemptions: [], active: true }));
const db = fakeDatabase({ patients: [toRow('patient', patient)], staff: [toRow('staff', staff)], service_definitions: definitions.map((d) => toRow('service_definition', d)), service_offerings: offerings.map((o) => toRow('service_offering', o)), fee_items: fees.map((f) => toRow('fee_item', f)) });
const listeners = new Set<() => void>();
db.onChangeWithCallback = ({ onChange }) => { listeners.add(onChange); return () => listeners.delete(onChange); };
db.execute = async (sql, parameters = []) => {
  if (sql.startsWith('DELETE FROM encounter_drafts')) {
    db.rows.encounter_drafts = (db.rows.encounter_drafts ?? []).filter((row) => parameters.length === 1 ? row.id !== parameters[0] : row.staffId !== parameters[0] || row.patientId !== parameters[1] || row.encounterKey !== parameters[2]); return;
  }
  if (sql.startsWith('UPDATE encounter_drafts')) { const row = db.rows.encounter_drafts?.find((r) => r.id === parameters[2]); if (row) { row.data = parameters[0]; row.updatedOn = parameters[1]; } return; }
  const match = /^INSERT INTO (\w+) \(([^)]+)\)/.exec(sql);
  if (!match) throw new Error(`Unexpected fixture write: ${sql}`);
  const columns = match[2].split(',').map((c) => c.trim().replace(/"/g, ''));
  (db.rows[match[1]] ??= []).push(Object.fromEntries(columns.map((column, index) => [column, parameters[index]])));
  if (match[1] !== 'encounter_drafts') window.setTimeout(() => listeners.forEach((listener) => listener()), 0);
};
db.writeTransaction = async (callback) => callback({ execute: db.execute, getOptional: db.getOptional });
setDatabaseForTests(db);
localStorage.setItem('geneus.signedInStaffId', staff.id);
localStorage.setItem('geneus.lastActivityOn', String(Date.now()));
recordServerContact(new Date().toISOString());
Object.assign(window, { careQa: { rows: db.rows } });
const Ready = () => { const { signedIn, loading } = useAuth(); return loading || !signedIn ? <p>Loading synthetic session?</p> : <EncounterScreen />; };
createRoot(document.getElementById('root')!).render(<ToastProvider><SessionProvider><AppointmentsProvider><BrowserRouter><Ready /></BrowserRouter></AppointmentsProvider></SessionProvider></ToastProvider>);
