import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { PulseLoader, ToastProvider } from '@/ui';
import { SessionProvider } from '@/session';
import { DataProvider } from '@/data';
import { AppointmentsProvider } from '@/modules/front-desk/appointments';
import { RegistersProvider } from '@/modules/reports/registers';
import { RegistrationDraftProvider } from '@/modules/front-desk/registration';
import { RequireCapability } from './RequireCapability';
import { ClinicalDocumentsAccess } from '@/modules/clinical/documents/ClinicalDocumentsAccess';
import { AppShell } from './AppShell';
import { AuthShell } from './AuthShell';
import { RequireFacility } from './RequireFacility';
import { RequireShift } from './RequireShift';
import { RouteIndex } from './RouteIndex';

/**
 * App router. Each screen is lazy-imported from its own file so every route
 * ships as a separate chunk — route-level code splitting matters on the cheap
 * phones this product targets. Screens live under `@/modules/<module>/screens/<feature>/` (app-level screens under `@/app/screens/`).
 */
const MagicLinkScreen = lazy(() =>
  import('@/modules/administration/screens/facility-onboarding/MagicLinkScreen').then((m) => ({
    default: m.MagicLinkScreen,
  })),
);
const FacilityWorkspacesScreen = lazy(() => import('@/modules/administration/screens/facilities/FacilityWorkspacesScreen').then((m) => ({ default: m.FacilityWorkspacesScreen })));
const OrganizationScreen = lazy(() => import('@/modules/administration/screens/facilities/OrganizationScreen').then((m) => ({ default: m.OrganizationScreen })));
const AddFacilityScreen = lazy(() => import('@/modules/administration/screens/facilities/AddFacilityScreen').then((m) => ({ default: m.AddFacilityScreen })));
const InvestigationCatalogueScreen = lazy(() => import('@/modules/operations/screens/investigations/InvestigationCatalogueScreen').then((m) => ({ default: m.InvestigationCatalogueScreen })));
const CatalogueSettingsScreen = lazy(() => import('@/modules/operations/screens/investigations/CatalogueSettingsScreen').then((m) => ({ default: m.CatalogueSettingsScreen })));
const ResultTemplateEditorScreen = lazy(() => import('@/modules/operations/screens/investigations/ResultTemplateEditorScreen').then((m) => ({ default: m.ResultTemplateEditorScreen })));
const FacilityReferralsScreen = lazy(() => import('@/modules/clinical/screens/referral/FacilityReferralsScreen').then((m) => ({ default: m.FacilityReferralsScreen })));
const WorkspaceScreen = lazy(() => import('@/app/screens/workspace/WorkspaceScreen').then((m) => ({ default: m.WorkspaceScreen })));
const MagicLinkSentScreen = lazy(() =>
  import('@/modules/administration/screens/facility-onboarding/MagicLinkSentScreen').then((m) => ({
    default: m.MagicLinkSentScreen,
  })),
);
const RegisterFacilityScreen = lazy(() =>
  import('@/modules/administration/screens/facility-onboarding/RegisterFacilityScreen').then((m) => ({
    default: m.RegisterFacilityScreen,
  })),
);
const AdminDashboardScreen = lazy(() =>
  import('@/modules/administration/screens/facility-onboarding/AdminDashboardScreen').then((m) => ({
    default: m.AdminDashboardScreen,
  })),
);
const InviteStaffScreen = lazy(() =>
  import('@/modules/administration/screens/facility-onboarding/InviteStaffScreen').then((m) => ({
    default: m.InviteStaffScreen,
  })),
);
const JoinFacilityScreen = lazy(() =>
  import('@/modules/administration/screens/facility-onboarding/JoinFacilityScreen').then((m) => ({ default: m.JoinFacilityScreen })),
);
const AddDeviceScreen = lazy(() =>
  import('@/modules/administration/screens/facility-onboarding/AddDeviceScreen').then((m) => ({ default: m.AddDeviceScreen })),
);
const RolesPermissionsScreen = lazy(() =>
  import('@/modules/administration/screens/facility-onboarding/RolesPermissionsScreen').then((m) => ({
    default: m.RolesPermissionsScreen,
  })),
);
const ManageStaffScreen = lazy(() =>
  import('@/modules/operations/screens/workforce/StaffDirectoryScreen').then((m) => ({
    default: m.StaffDirectoryScreen,
  })),
);

// Staff onboarding & access
const CreatePinScreen = lazy(() =>
  import('@/app/screens/staff-onboarding/CreatePinScreen').then((m) => ({ default: m.CreatePinScreen })),
);
const ShiftLoginScreen = lazy(() =>
  import('@/app/screens/staff-onboarding/ShiftLoginScreen').then((m) => ({ default: m.ShiftLoginScreen })),
);
const PinApprovalScreen = lazy(() =>
  import('@/app/screens/staff-onboarding/PinApprovalScreen').then((m) => ({ default: m.PinApprovalScreen })),
);

// Daily use
const FacilityHomeScreen = lazy(() =>
  import('@/app/screens/facility-home/FacilityHomeScreen').then((m) => ({ default: m.FacilityHomeScreen })),
);
const PatientSearchScreen = lazy(() =>
  import('@/modules/front-desk/screens/patient-search/PatientSearchScreen').then((m) => ({
    default: m.PatientSearchScreen,
  })),
);
const NewPatientStep1Screen = lazy(() =>
  import('@/modules/front-desk/screens/patient-registration/NewPatientStep1Screen').then((m) => ({
    default: m.NewPatientStep1Screen,
  })),
);
const NewPatientStep2Screen = lazy(() =>
  import('@/modules/front-desk/screens/patient-registration/NewPatientStep2Screen').then((m) => ({
    default: m.NewPatientStep2Screen,
  })),
);
const DuplicateCheckScreen = lazy(() =>
  import('@/modules/front-desk/screens/patient-registration/DuplicateCheckScreen').then((m) => ({
    default: m.DuplicateCheckScreen,
  })),
);
const IdentityReviewScreen = lazy(() => import('@/modules/front-desk/screens/patient-registration/IdentityReviewScreen').then((m) => ({ default: m.IdentityReviewScreen })));
const SendToUnitScreen = lazy(() =>
  import('@/modules/clinical/screens/send-to-unit/SendToUnitScreen').then((m) => ({ default: m.SendToUnitScreen })),
);
const UnitQueueScreen = lazy(() => import('@/modules/clinical/screens/units/UnitQueueScreen').then((m) => ({ default: m.UnitQueueScreen })));
const FacilityScreen = lazy(() => import('@/modules/operations/screens/workforce/FacilityScreen').then((m) => ({ default: m.FacilityScreen })));
const ServiceScreen = lazy(() => import('@/modules/operations/screens/workforce/ServiceScreen').then((m) => ({ default: m.ServiceScreen })));
const StaffScreen = lazy(() => import('@/modules/operations/screens/workforce/StaffScreen').then((m) => ({ default: m.StaffScreen })));
const ClinicalReviewsScreen = lazy(() => import('@/modules/clinical/screens/workforce/ClinicalReviewsScreen').then((m) => ({ default: m.ClinicalReviewsScreen })));
const RegistersListScreen = lazy(() =>
  import('@/modules/reports/screens/registers/RegistersListScreen').then((m) => ({ default: m.RegistersListScreen })),
);
const RegisterEntriesScreen = lazy(() =>
  import('@/modules/reports/screens/registers/RegisterEntriesScreen').then((m) => ({ default: m.RegisterEntriesScreen })),
);
const RegisterBuilderScreen = lazy(() =>
  import('@/modules/reports/screens/registers/RegisterBuilderScreen').then((m) => ({ default: m.RegisterBuilderScreen })),
);
const SyncCenterScreen = lazy(() =>
  import('@/modules/administration/screens/sync-center/SyncCenterScreen').then((m) => ({ default: m.SyncCenterScreen })),
);
const EncountersScreen = lazy(() =>
  import('@/modules/clinical/screens/encounters/EncountersScreen').then((m) => ({ default: m.EncountersScreen })),
);
const ServiceQueueScreen = lazy(() => import('@/modules/clinical/screens/service-queue/ServiceQueueScreen').then((m) => ({ default: m.ServiceQueueScreen })));
const LabRequestScreen = lazy(() => import('@/modules/clinical/screens/service-queue/LabRequestScreen').then((m) => ({ default: m.LabRequestScreen })));
const DispenseScreen = lazy(() => import('@/modules/clinical/screens/service-queue/DispenseScreen').then((m) => ({ default: m.DispenseScreen })));
const ClinicalPatientsScreen = lazy(() => import('@/modules/clinical/screens/clinical-patients/ClinicalPatientsScreen').then((m) => ({ default: m.ClinicalPatientsScreen })));
const InpatientScreen = lazy(() => import('@/modules/clinical/screens/inpatient/InpatientScreen').then((module) => ({ default: module.InpatientScreen })));
const DocumentsScreen = lazy(()=>import('@/modules/clinical/screens/documents/DocumentsScreen').then(module=>({default:module.DocumentsScreen})));
const PatientProfileScreen = lazy(() =>
  import('@/modules/front-desk/screens/patient/PatientProfileScreen').then((m) => ({ default: m.PatientProfileScreen })),
);
const EncounterScreen = lazy(() =>
  import('@/modules/clinical/screens/encounter/EncounterScreen').then((m) => ({ default: m.EncounterScreen })),
);
const FeeScheduleScreen = lazy(() =>
  import('@/modules/finance/screens/billing/FeeScheduleScreen').then((m) => ({ default: m.FeeScheduleScreen })),
);
const BillingScreen = lazy(() => import('@/modules/finance/screens/billing/BillingScreen').then((m) => ({ default: m.BillingScreen })));
const BillingSettingsScreen = lazy(() => import('@/modules/finance/screens/billing/BillingSettingsScreen').then((m) => ({ default: m.BillingSettingsScreen })));
const DevicesScreen = lazy(() => import('@/modules/administration/screens/facility-onboarding/DevicesScreen').then((module) => ({ default: module.DevicesScreen })));
const StockScreen = lazy(() => import('@/modules/inventory/screens/stock/StockScreen').then((module) => ({ default: module.StockScreen })));
const MonthlySummaryScreen = lazy(() => import('@/modules/reports/screens/monthly-summary/MonthlySummaryScreen').then((module) => ({ default: module.MonthlySummaryScreen })));
const AppointmentsScreen = lazy(() =>
  import('@/modules/front-desk/screens/appointments/AppointmentsScreen').then((m) => ({ default: m.AppointmentsScreen })),
);

const ScreenFallback = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <PulseLoader label="Loading…" />
    </div>
  );
}

const App = () => {
  return (
    <ToastProvider>
      <DataProvider>
        <SessionProvider>
        <AppointmentsProvider>
        <RegistersProvider>
        <RegistrationDraftProvider>
        <BrowserRouter>
          <Suspense fallback={<ScreenFallback />}>
        <Routes>
          <Route path="/facilities" element={<FacilityWorkspacesScreen />} />
          {/* Default screen is the staff shift-login. */}
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* Auth & onboarding — brand-split card on tablet/desktop */}
          <Route element={<AuthShell />}>
            {/* A device with no facility can only register one. */}
            <Route element={<RequireFacility />}>
              <Route path="/login" element={<ShiftLoginScreen />} />
              <Route path="/onboarding/approve" element={<PinApprovalScreen />} />
            </Route>
            <Route path="/onboarding/start" element={<MagicLinkScreen />} />
            <Route path="/onboarding/join" element={<JoinFacilityScreen />} />
            <Route path="/onboarding/link-sent" element={<MagicLinkSentScreen />} />
            <Route path="/onboarding/register" element={<RegisterFacilityScreen />} />
            <Route path="/onboarding/accept" element={<CreatePinScreen />} />
          </Route>

          {/* Daily use — behind the facility and shift guards */}
          <Route element={<RequireFacility />}>
          <Route element={<RequireShift />}>
          <Route element={<AppShell />}>
            <Route path="/home" element={<FacilityHomeScreen />} />
            <Route path="/workspace/:moduleId" element={<WorkspaceScreen />} />
            <Route path="/patients/search" element={<PatientSearchScreen />} />
            <Route path="/patients/identity" element={<RequireCapability permissions={['patient_identity:review', 'patient_identity:resolve']}><IdentityReviewScreen /></RequireCapability>} />
            <Route path="/patients/profile" element={<PatientProfileScreen />} />
            <Route path="/encounters" element={<EncountersScreen />} />
            <Route path="/clinical/patients" element={<ClinicalPatientsScreen />} />
            <Route path="/laboratory" element={<ServiceQueueScreen key="lab" station="lab" />} />
            <Route path="/pharmacy" element={<ServiceQueueScreen key="pharmacy" station="pharmacy" />} />
            <Route path="/laboratory/request" element={<LabRequestScreen />} />
            <Route path="/pharmacy/request" element={<DispenseScreen />} />
            <Route path="/admissions" element={<RequireCapability permissions={['admission:manage']}><InpatientScreen /></RequireCapability>} />
            <Route path="/documents" element={<ClinicalDocumentsAccess><DocumentsScreen/></ClinicalDocumentsAccess>}/>
            <Route path="/encounters/record" element={<EncounterScreen />} />
            <Route path="/appointments" element={<AppointmentsScreen />} />
            <Route path="/patients/new" element={<RequireCapability permissions={['patient:create', 'patient:update']}><NewPatientStep1Screen /></RequireCapability>} />
            <Route path="/patients/new/details" element={<RequireCapability permissions={['patient:create', 'patient:update']}><NewPatientStep2Screen /></RequireCapability>} />
            <Route path="/patients/send-to-unit" element={<SendToUnitScreen />} />
            <Route path="/units" element={<UnitQueueScreen />} />
            <Route path="/registers" element={<RegistersListScreen />} />
            <Route path="/registers/new" element={<RegisterBuilderScreen />} />
            <Route path="/registers/:id/configure" element={<RegisterBuilderScreen />} />
            <Route path="/registers/:id" element={<RegisterEntriesScreen />} />
            <Route path="/reports/month" element={<MonthlySummaryScreen />} />
            <Route path="/referrals/track" element={<FacilityReferralsScreen />} />
            <Route path="/stock" element={<StockScreen />} />
            <Route path="/sync" element={<SyncCenterScreen />} />

            {/* Facility admin — the same shell as daily use, reached from the
                Admin nav entry; each screen deep-links to the next. */}
            <Route path="/admin" element={<AdminDashboardScreen />} />
            <Route path="/admin/staff" element={<ManageStaffScreen />} />
            <Route path="/admin/staff/:staffId" element={<StaffScreen />} />
            <Route path="/facility" element={<FacilityScreen />} />
            <Route path="/organization" element={<RequireCapability permissions={['staff:manage']}><OrganizationScreen /></RequireCapability>} />
            <Route path="/facilities/new" element={<RequireCapability permissions={['staff:manage']}><AddFacilityScreen /></RequireCapability>} />
            <Route path="/investigations/catalogue" element={<InvestigationCatalogueScreen />} />
            <Route path="/investigations/settings" element={<RequireCapability permissions={['result_template:manage']}><CatalogueSettingsScreen /></RequireCapability>} />
            <Route path="/investigations/settings/templates/new" element={<RequireCapability permissions={['result_template:manage']}><ResultTemplateEditorScreen /></RequireCapability>} />
            <Route path="/investigations/settings/templates/:templateId" element={<RequireCapability permissions={['result_template:manage']}><ResultTemplateEditorScreen /></RequireCapability>} />
            <Route path="/clinical-reviews" element={<ClinicalReviewsScreen />} />
            <Route path="/facility/services/:offeringId" element={<ServiceScreen />} />
            <Route path="/admin/staff/invite" element={<InviteStaffScreen />} />
            <Route path="/admin/staff/access" element={<RolesPermissionsScreen />} />
            <Route path="/admin/units" element={<Navigate to="/facility?view=structure" replace />} />
            <Route path="/billing" element={<BillingScreen />} />
            <Route path="/billing/fees" element={<FeeScheduleScreen />} />
            <Route path="/billing/settings" element={<BillingSettingsScreen />} />
            <Route path="/admin/fees" element={<Navigate to="/billing/fees" replace />} />
            <Route path="/admin/devices" element={<DevicesScreen />} />
            <Route path="/admin/devices/add" element={<AddDeviceScreen />} />
          </Route>
          {/* Duplicate check is a modal-style screen — outside the shell for now */}
          <Route path="/patients/duplicate" element={<RequireCapability permissions={['patient:create']}><DuplicateCheckScreen /></RequireCapability>} />
          </Route>
          </Route>

          {/* Dev screen index — development builds only; it lists every screen unguarded. */}
          {import.meta.env.DEV ? <Route path="/menu" element={<RouteIndex />} /> : null}

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
          </Suspense>
        </BrowserRouter>
        </RegistrationDraftProvider>
        </RegistersProvider>
        </AppointmentsProvider>
        </SessionProvider>
      </DataProvider>
    </ToastProvider>
  );
};

export default App;
