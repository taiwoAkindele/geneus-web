/** Local audit harness. Actual screens and providers; synthetic, in-memory records only. */
import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ClinicalEvent, Encounter, EncounterEntry, Patient, Staff } from '@shared';
import { SessionProvider, useAuth } from '@/session';
import { ToastProvider } from '@/ui';
import { AppShell } from '@/app/AppShell';
import { AppointmentsProvider } from '@/features/appointments';
import { RegistersProvider } from '@/features/registers';
import { RegistrationDraftProvider } from '@/features/registration';
import { setDatabaseForTests } from '@/data/database';
import { recordServerContact } from '@/data/deviceCredential';
import { fakeDatabase } from '@/data/testing/fakeDatabase';
import { toRow } from '@/data/rows';
import { FacilityHomeScreen } from '@/pages/facility-home/FacilityHomeScreen';
import { PatientSearchScreen } from '@/pages/patient-search/PatientSearchScreen';
import { PatientProfileScreen } from '@/pages/patient/PatientProfileScreen';
import { EncountersScreen } from '@/pages/encounters/EncountersScreen';
import { EncounterScreen } from '@/pages/encounter/EncounterScreen';
import { AppointmentsScreen } from '@/pages/appointments/AppointmentsScreen';
import { UnitQueueScreen } from '@/pages/units/UnitQueueScreen';
import { RegistersListScreen } from '@/pages/registers/RegistersListScreen';
import { SyncCenterScreen } from '@/pages/sync-center/SyncCenterScreen';
import { NewPatientStep1Screen } from '@/pages/patient-registration/NewPatientStep1Screen';
import '../src/index.css';

const now = new Date().toISOString();
const earlier = new Date(Date.now() - 7 * 86400000).toISOString();
const envelope = { facilityId: 'QA-PHC', deviceId: 'qa-device', createdBy: 'qa-doctor', createdOn: now, schemaVersion: 3 };
const patientId = 'QA-PHC-000001-K2';
const secondId = 'QA-PHC-000002-K3';
const patients = [Patient.parse({ ...envelope, id: patientId, patientId, type: 'patient', fullName: 'Synthetic Clinical Patient', address: 'Synthetic address', phone: '08000000000', occupation: 'Test occupation', sex: 'female', ageYears: 30, allergies: ['Synthetic legacy allergen'] }), Patient.parse({ ...envelope, id: secondId, patientId: secondId, type: 'patient', fullName: 'Synthetic Second Patient', address: 'Synthetic address', sex: 'male', ageYears: 41, allergies: [] })];
const staff = Staff.parse({ ...envelope, id: 'qa-doctor', staffId: 'qa-doctor', type: 'staff', fullName: 'Dr Synthetic Reviewer', role: 'doctor', permission: 'read_write', active: true, loginAccess: 'always' });
const visits = [Encounter.parse({ ...envelope, id: 'encounter:open', type: 'encounter', patientId, openedOn: now, setting: 'facility' }), Encounter.parse({ ...envelope, id: 'encounter:closed', type: 'encounter', patientId, openedOn: earlier, setting: 'facility' }), Encounter.parse({ ...envelope, id: 'encounter:lab', type: 'encounter', patientId: secondId, openedOn: now, setting: 'facility' })];
const entry = (id: string, encounterId: string, step: string, values: Record<string, unknown>) => EncounterEntry.parse({ ...envelope, id, type: 'encounter_entry', patientId: encounterId === 'encounter:lab' ? secondId : patientId, encounterId, actorRole: 'doctor', step, values, createdOn: encounterId === 'encounter:closed' ? earlier : now });
const entries = [entry('entry:vitals', 'encounter:open', 'vitals', { temperatureC: 37, systolicMmHg: 120, diastolicMmHg: 80, weightKg: 65, pulseBpm: 80 }), entry('entry:diagnosis', 'encounter:closed', 'diagnosis', { diagnosis: 'Synthetic prior diagnosis', prescription: [] }), entry('entry:closed', 'encounter:closed', 'follow_up', {}), entry('entry:lab', 'encounter:lab', 'lab_order', { tests: ['Synthetic test'] })];
const problem = ClinicalEvent.parse({ ...envelope, id: 'clinical:problem', recordId: 'clinical:problem', type: 'clinical_event', patientId, kind: 'problem', actorRole: 'doctor', values: { label: 'Synthetic ongoing problem', status: 'active', certainty: 'confirmed' } });
const db = fakeDatabase({ patients: patients.map((p) => toRow('patient', p)), staff: [toRow('staff', staff)], encounters: visits.map((v) => toRow('encounter', v)), encounter_entries: entries.map((e) => toRow('encounter_entry', e)), clinical_events: [toRow('clinical_event', problem)] });
db.currentStatus = { connected: false, connecting: false, hasSynced: false, dataFlowStatus: { uploading: false, downloading: false } } as typeof db.currentStatus;
const listeners = new Set<() => void>();
db.onChangeWithCallback = ({ onChange }) => { listeners.add(onChange); return () => listeners.delete(onChange); };
db.execute = async (sql, parameters = []) => {
  if (sql.startsWith('DELETE FROM encounter_drafts')) { db.rows.encounter_drafts = []; return; }
  if (sql.startsWith('UPDATE encounter_drafts')) { const draft = db.rows.encounter_drafts?.find((r) => r.id === parameters[2]); if (draft) { draft.data = parameters[0]; draft.updatedOn = parameters[1]; } return; }
  const match = /^INSERT INTO (\w+) \(([^)]+)\)/.exec(sql);
  if (!match) throw new Error('Unexpected audit write: ' + sql);
  const fields = match[2].split(',').map((field) => field.trim().replaceAll('"', ''));
  (db.rows[match[1]] ??= []).push(Object.fromEntries(fields.map((field, index) => [field, parameters[index]])));
  if (match[1] !== 'encounter_drafts') window.setTimeout(() => listeners.forEach((listener) => listener()), 0);
};
db.writeTransaction = async (callback) => callback({ execute: db.execute });
setDatabaseForTests(db);
localStorage.setItem('geneus.signedInStaffId', staff.id);
localStorage.setItem('geneus.lastActivityOn', String(Date.now()));
recordServerContact(now);
const RouteObserver = () => {
  const navigate = useNavigate(); const route = useLocation();
  useEffect(() => { Object.assign(window, { designAudit: { go: (path: string, state?: unknown) => navigate(path, { state }), path: route.pathname, patientId, rows: db.rows } }); }, [navigate, route]);
  return null;
};
const Ready = ({ children }: { children: React.ReactNode }) => {
  const auth = useAuth();
  return auth.signedIn ? children : <p>Preparing synthetic staff session…</p>;
};
createRoot(document.getElementById('root')!).render(<ToastProvider><SessionProvider><Ready><AppointmentsProvider><RegistersProvider><RegistrationDraftProvider><MemoryRouter initialEntries={['/patients/search']}><RouteObserver /><Routes><Route element={<AppShell />}>
  <Route path="/home" element={<FacilityHomeScreen />} /><Route path="/patients/search" element={<PatientSearchScreen />} /><Route path="/patients/profile" element={<PatientProfileScreen />} /><Route path="/patients/new" element={<NewPatientStep1Screen />} /><Route path="/encounters" element={<EncountersScreen />} /><Route path="/encounters/record" element={<EncounterScreen />} /><Route path="/appointments" element={<AppointmentsScreen />} /><Route path="/units" element={<UnitQueueScreen />} /><Route path="/registers" element={<RegistersListScreen />} /><Route path="/sync" element={<SyncCenterScreen />} />
</Route></Routes></MemoryRouter></RegistrationDraftProvider></RegistersProvider></AppointmentsProvider></Ready></SessionProvider></ToastProvider>);
