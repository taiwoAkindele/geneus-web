/** Overall UX audit fixture. Actual screens and providers; synthetic, in-memory records only. */
import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Appointment, BillingDepartment, Charge, ClinicalEvent, Device, Encounter, EncounterEntry, FeeItem, Handoff, Patient, Payment, RegisterDefinition, RegisterEntry, Staff, StockItem, StockMovement, SyncRejection, Unit } from '@shared';
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
import { DevicesScreen } from '@/pages/facility-onboarding/DevicesScreen';
import { StockScreen } from '@/pages/stock/StockScreen';
import { MonthlySummaryScreen } from '@/pages/monthly-summary/MonthlySummaryScreen';
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
import { AdminDashboardScreen } from '@/pages/facility-onboarding/AdminDashboardScreen';
import { ManageStaffScreen } from '@/pages/facility-onboarding/ManageStaffScreen';
import { InviteStaffScreen } from '@/pages/facility-onboarding/InviteStaffScreen';
import { RolesPermissionsScreen } from '@/pages/facility-onboarding/RolesPermissionsScreen';
import { AddDeviceScreen } from '@/pages/facility-onboarding/AddDeviceScreen';
import { UnitsScreen } from '@/pages/units/UnitsScreen';
import { RegisterEntriesScreen } from '@/pages/registers/RegisterEntriesScreen';
import { RegisterBuilderScreen } from '@/pages/registers/RegisterBuilderScreen';
import { BillingScreen } from '@/pages/billing/BillingScreen';
import { BillingSettingsScreen } from '@/pages/billing/BillingSettingsScreen';
import { FeeScheduleScreen } from '@/pages/billing/FeeScheduleScreen';
import { UnavailableScreen } from '@/app/UnavailableScreen';
import '../src/index.css';

const now = new Date().toISOString();
const earlier = new Date(Date.now() - 7 * 86400000).toISOString();
const envelope = { facilityId: 'QA-PHC', deviceId: 'qa-device', createdBy: 'qa-doctor', createdOn: now, schemaVersion: 3 };
const patientId = 'QA-PHC-000001-K2';
const secondId = 'QA-PHC-000002-K3';
const patients = [Patient.parse({ ...envelope, id: patientId, patientId, type: 'patient', fullName: 'Amaka Okoro', address: 'Synthetic address', phone: '08000000000', occupation: 'Test occupation', sex: 'female', ageYears: 30, allergies: ['Penicillin'] }), Patient.parse({ ...envelope, id: secondId, patientId: secondId, type: 'patient', fullName: 'Demo Second Patient', address: 'Synthetic address', sex: 'male', ageYears: 41, allergies: [] })];
const auditParams = new URLSearchParams(location.search);
const selectedRole = auditParams.get('role') ?? 'doctor';
const staff = Staff.parse({ ...envelope, id: 'qa-doctor', staffId: 'qa-doctor', type: 'staff', fullName: selectedRole === 'cashier' ? 'Chika Eze' : selectedRole === 'records_officer' ? 'Ngozi Bello' : 'Dr Ada Obi', role: selectedRole, ...(auditParams.has('combined') ? { additionalRoles: ['facility_admin'] } : {}), permission: auditParams.has('readonly') ? 'read_only' : 'read_write', active: true, loginAccess: 'always' });
const visits = [Encounter.parse({ ...envelope, id: 'encounter:open', type: 'encounter', patientId, openedOn: now, setting: 'facility' }), Encounter.parse({ ...envelope, id: 'encounter:closed', type: 'encounter', patientId, openedOn: earlier, setting: 'facility' }), Encounter.parse({ ...envelope, id: 'encounter:lab', type: 'encounter', patientId: secondId, openedOn: now, setting: 'facility' })];
const entry = (id: string, encounterId: string, step: string, values: Record<string, unknown>) => EncounterEntry.parse({ ...envelope, id, type: 'encounter_entry', patientId: encounterId === 'encounter:lab' ? secondId : patientId, encounterId, actorRole: 'doctor', step, values, createdOn: encounterId === 'encounter:closed' ? earlier : now });
const entries = [entry('entry:vitals', 'encounter:open', 'vitals', { temperatureC: 37, systolicMmHg: 120, diastolicMmHg: 80, weightKg: 65, pulseBpm: 80 }), entry('entry:diagnosis', 'encounter:closed', 'diagnosis', { diagnosis: 'Routine review', prescription: [] }), entry('entry:closed', 'encounter:closed', 'follow_up', {}), entry('entry:lab', 'encounter:lab', 'lab_order', { tests: ['Synthetic test'] })];
entries.push(entry('entry:closed-vitals', 'encounter:closed', 'vitals', { temperatureC: 36.8, systolicMmHg: 120, diastolicMmHg: 80, weightKg: 64, pulseBpm: 78 }), entry('entry:closed-note', 'encounter:closed', 'complaint', { complaints: ['Routine review'], note: 'Synthetic follow-up concerns reviewed.' }));
const future = Appointment.parse({ ...envelope, id: 'appointment:future', type: 'appointment', patientId, reason: 'Ongoing care review', scheduledFor: new Date(Date.now() + 7 * 86400000).toISOString(), status: 'scheduled', visitType: 'follow_up' });
const problem = ClinicalEvent.parse({ ...envelope, id: 'clinical:problem', recordId: 'clinical:problem', type: 'clinical_event', patientId, kind: 'problem', actorRole: 'doctor', values: { label: 'Hypertension', status: 'active', certainty: 'confirmed' } });
const db = fakeDatabase({ appointments: [toRow('appointment', future)], patients: patients.map((p) => toRow('patient', p)), staff: [toRow('staff', staff)], encounters: visits.map((v) => toRow('encounter', v)), encounter_entries: entries.map((e) => toRow('encounter_entry', e)), clinical_events: [toRow('clinical_event', problem)] });
for (const [index, role] of ['nurse', 'records_officer', 'cashier', 'supervisor', 'chew'].entries()) db.rows.staff.push(toRow('staff', Staff.parse({ ...envelope, id: 'staff:sample-' + index, staffId: 'staff:sample-' + index, type: 'staff', fullName: ['Nurse Grace Musa', 'Ngozi Bello', 'Chika Eze', 'Dr Ibrahim Lawal', 'Tunde Adeyemi'][index], role, permission: 'read_write', active: true, loginAccess: index % 2 ? 'always' : 'shift' })));
db.rows.units = ['Registration', 'Consultation', 'Laboratory', 'Injection room'].map((name, index) => toRow('unit', Unit.parse({ ...envelope, id: 'unit:' + index, unitId: 'unit:' + index, type: 'unit', name })));
db.rows.handoffs = [toRow('handoff', Handoff.parse({ ...envelope, id: 'handoff:sample', type: 'handoff', patientId: secondId, fromUnitId: 'unit:1', toUnitId: 'unit:2', encounterId: 'encounter:lab', instruction: 'Collect the requested test sample and record the result.', status: 'pending' }))];
db.rows.appointments.push(...[
  { id: 'appointment:today', patientId, scheduledFor: now, reason: 'Review today', encounterId: undefined },
  { id: 'appointment:overdue', patientId: secondId, scheduledFor: earlier, reason: 'Missed follow-up' },
].map((values) => toRow('appointment', Appointment.parse({ ...envelope, type: 'appointment', status: 'scheduled', visitType: 'general', ...values }))));
const register = RegisterDefinition.parse({ ...envelope, id: 'register:malaria:v1', registerId: 'register:malaria', type: 'register_definition', version: 1, name: 'Malaria register', category: 'General OPD', description: 'Tests and treatment recorded for the facility malaria programme.', status: 'published', fields: [{ id: 'name', type: 'text', label: 'Patient name', required: true }, { id: 'result', type: 'select', label: 'RDT result', options: ['Positive', 'Negative'], required: true }, { id: 'treatment', type: 'text', label: 'Treatment recorded' }] });
db.rows.register_definitions = [toRow('register_definition', register), toRow('register_definition', RegisterDefinition.parse({ ...register, id: 'register:outreach:v1', registerId: 'register:outreach', name: 'Outreach activity', status: 'draft', fields: [] }))];
db.rows.register_entries = [toRow('register_entry', RegisterEntry.parse({ ...envelope, id: 'register-entry:sample', type: 'register_entry', registerId: register.registerId, registerVersion: 1, entryDate: now.slice(0, 10), patientId, values: { name: 'Amaka Okoro', result: 'Negative', treatment: 'Synthetic entry for UX inspection' } }))];
db.rows.billing_departments = ['General services', 'Laboratory'].map((name, index) => toRow('billing_department', BillingDepartment.parse({ ...envelope, id: 'department:' + index, type: 'billing_department', name })));
const fees = [FeeItem.parse({ ...envelope, id: 'fee:consultation', type: 'fee_item', name: 'General consultation', departmentId: 'department:0', category: 'consultation', amountMinor: 200000, currency: 'NGN', chargeWhen: 'every_visit' }), FeeItem.parse({ ...envelope, id: 'fee:lab', type: 'fee_item', name: 'Malaria RDT', departmentId: 'department:1', category: 'laboratory', amountMinor: 150000, currency: 'NGN', chargeWhen: 'when_ordered' })];
db.rows.fee_items = fees.map((fee) => toRow('fee_item', fee));
db.rows.charges = fees.map((fee, index) => toRow('charge', Charge.parse({ ...envelope, id: 'charge:' + index, type: 'charge', patientId, feeItemId: fee.id, description: fee.name, departmentId: fee.departmentId, category: fee.category, listPriceMinor: fee.amountMinor, amountMinor: fee.amountMinor, currency: fee.currency })));
db.rows.payments = [toRow('payment', Payment.parse({ ...envelope, id: 'payment:sample', type: 'payment', patientId, receiptNumber: 'QA-PHC-R-000001-K2', method: 'cash', amountMinor: 100000, currency: 'NGN', allocations: [{ chargeId: 'charge:0', amountMinor: 100000 }] }))];
db.rows.devices = [toRow('device', Device.parse({ ...envelope, id: envelope.deviceId, type: 'device', label: 'Synthetic facility tablet', enrolledBy: staff.staffId, enrolledOn: now, lastSeenOn: now }))];
db.rows.stock_items = [toRow('stock_item', StockItem.parse({ ...envelope, id: 'stock:gloves', type: 'stock_item', name: 'Gloves', category: 'consumable', unitOfMeasure: 'boxes', quantityOnHand: 10, reorderLevel: 5 }))];
db.rows.stock_movements = [toRow('stock_movement', StockMovement.parse({ ...envelope, id: 'stock:issued', type: 'stock_movement', itemId: 'stock:gloves', change: -8, reason: 'dispensed', movedOn: now }))];
localStorage.setItem('geneus.deviceUnit', 'unit:2');
db.currentStatus = { connected: false, connecting: false, hasSynced: false, dataFlowStatus: { uploading: false, downloading: false } } as typeof db.currentStatus;
const listeners = new Set<() => void>();
Object.assign(window, { overallAuditAddRejection: () => {
  db.rows.sync_rejections = [toRow('sync_rejection', SyncRejection.parse({ ...envelope, id: 'sync-rejection:sample', type: 'sync_rejection', entityType: 'encounter_entry', entityId: 'entry:lab', operation: 'put', category: 'validation', reason: 'This synthetic entry needs review before the upload can be accepted.', attributedTo: staff.staffId, refusedRecord: entries.find((entry) => entry.id === 'entry:lab') }))];
  listeners.forEach((listener) => listener());
} });
db.onChangeWithCallback = ({ onChange }) => { listeners.add(onChange); return () => listeners.delete(onChange); };
db.execute = async (sql, parameters = []) => {
  if (sql.startsWith('DELETE FROM encounter_drafts')) {
    db.rows.encounter_drafts = (db.rows.encounter_drafts ?? []).filter((row) => sql.includes('"id" = ?') ? row.id !== parameters[0] : !(row.staffId === parameters[0] && row.patientId === parameters[1] && row.encounterKey === parameters[2]));
    return;
  }
  if (sql.startsWith('DELETE FROM register_builder_drafts')) { db.rows.register_builder_drafts = (db.rows.register_builder_drafts ?? []).filter((row) => row.id !== parameters[0]); return; }
  if (sql.startsWith('UPDATE encounter_drafts')) { const draft = db.rows.encounter_drafts?.find((r) => r.id === parameters[2]); if (draft) { draft.data = parameters[0]; draft.updatedOn = parameters[1]; } return; }
  const update = /^UPDATE (\w+) SET (.+) WHERE id = \?/.exec(sql);
  if (update) {
    const columns = update[2].split(',').map((assignment) => assignment.split('=')[0].trim().replaceAll('"', ''));
    const row = db.rows[update[1]]?.find((candidate) => candidate.id === parameters[columns.length]);
    if (!row) throw new Error('Missing synthetic update target');
    columns.forEach((column, index) => { row[column] = parameters[index]; });
    window.setTimeout(() => listeners.forEach((listener) => listener()), 0);
    return;
  }
  const match = /^INSERT INTO (\w+) \(([^)]+)\)/.exec(sql);
  if (!match) throw new Error('Unexpected audit write: ' + sql);
  const fields = match[2].split(',').map((field) => field.trim().replaceAll('"', ''));
  const record = Object.fromEntries(fields.map((field, index) => [field, parameters[index]]));
  const existingRecovery = match[1] === 'register_builder_drafts' ? db.rows[match[1]]?.find((row) => row.id === record.id) : undefined;
  if (existingRecovery) Object.assign(existingRecovery, record); else (db.rows[match[1]] ??= []).push(record);
  if (!['encounter_drafts', 'register_builder_drafts'].includes(match[1])) window.setTimeout(() => listeners.forEach((listener) => listener()), 0);
};
db.writeTransaction = async (callback) => callback({ execute: db.execute });
setDatabaseForTests(db);
localStorage.setItem('geneus.signedInStaffId', staff.id);
localStorage.setItem('geneus.lastActivityOn', String(Date.now()));
recordServerContact(now);
const RouteObserver = () => {
  const navigate = useNavigate(); const route = useLocation();
  useEffect(() => { Object.assign(window, { designAudit: { go: (path: string, state?: unknown) => navigate(path, { state }), path: route.pathname, search: route.search, patientId, rows: db.rows, seedHistory: (count: number) => { for (let i = 0; i < count; i++) { const opened = new Date(Date.now() - (i + 20) * 86400000).toISOString(); const historical = Encounter.parse({ ...envelope, id: 'encounter:history-' + i, type: 'encounter', patientId, openedOn: opened, createdOn: opened, setting: 'facility' }); db.rows.encounters.push(toRow('encounter', historical)); db.rows.encounter_entries.push(toRow('encounter_entry', EncounterEntry.parse({ ...envelope, id: 'entry:history-close-' + i, type: 'encounter_entry', patientId, encounterId: historical.id, createdOn: opened, step: 'follow_up', values: {}, actorRole: 'doctor' }))); } listeners.forEach((listener) => listener()); }, setPatient: (fields: Record<string, unknown>) => { Object.assign(db.rows.patients[0], fields); listeners.forEach((listener) => listener()); } } }); }, [navigate, route]);
  return null;
};
const Ready = ({ children }: { children: React.ReactNode }) => {
  const auth = useAuth();
  return auth.signedIn ? children : <p>Preparing synthetic staff session…</p>;
};
createRoot(document.getElementById('root')!).render(<ToastProvider><SessionProvider><Ready><AppointmentsProvider><RegistersProvider><RegistrationDraftProvider><MemoryRouter initialEntries={[auditParams.get('start')?.startsWith('/') && !auditParams.get('start')?.startsWith('//') ? auditParams.get('start')! : '/home']}><RouteObserver /><Routes><Route element={<AppShell />}>
  <Route path="/home" element={<FacilityHomeScreen />} /><Route path="/patients/search" element={<PatientSearchScreen />} /><Route path="/patients/profile" element={<PatientProfileScreen />} /><Route path="/patients/new" element={<NewPatientStep1Screen />} /><Route path="/encounters" element={<EncountersScreen />} /><Route path="/encounters/record" element={<EncounterScreen />} /><Route path="/appointments" element={<AppointmentsScreen />} /><Route path="/units" element={<UnitQueueScreen />} /><Route path="/registers" element={<RegistersListScreen />} /><Route path="/sync" element={<SyncCenterScreen />} />
  <Route path="/admin" element={<AdminDashboardScreen />} /><Route path="/admin/staff" element={<ManageStaffScreen />} /><Route path="/admin/staff/invite" element={<InviteStaffScreen />} /><Route path="/admin/staff/access" element={<RolesPermissionsScreen />} /><Route path="/admin/units" element={<UnitsScreen />} /><Route path="/admin/devices" element={<DevicesScreen />} /><Route path="/admin/devices/add" element={<AddDeviceScreen />} /><Route path="/registers/new" element={<RegisterBuilderScreen />} /><Route path="/registers/:id" element={<RegisterEntriesScreen />} /><Route path="/registers/:id/configure" element={<RegisterBuilderScreen />} /><Route path="/billing" element={<BillingScreen />} /><Route path="/billing/fees" element={<FeeScheduleScreen />} /><Route path="/billing/settings" element={<BillingSettingsScreen />} />
  <Route path="/reports/month" element={<MonthlySummaryScreen />} />
  <Route path="/referrals/track" element={<UnavailableScreen title="Referrals" description="Cross-facility referral tracking is not available in this version. Continue using your facility’s established referral process." />} />
  <Route path="/stock" element={<StockScreen />} />
</Route></Routes></MemoryRouter></RegistrationDraftProvider></RegistersProvider></AppointmentsProvider></Ready></SessionProvider></ToastProvider>);
