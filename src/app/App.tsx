import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@/ui';
import { SessionProvider } from '@/session';
import { AdminShell } from './AdminShell';
import { AppShell } from './AppShell';
import { AuthShell } from './AuthShell';
import { RouteIndex } from './RouteIndex';

/**
 * App router. Each screen is lazy-imported from its own file so every route
 * ships as a separate chunk — route-level code splitting matters on the cheap
 * phones this product targets. Screens live under `@/pages/<feature>/`.
 */
const MagicLinkScreen = lazy(() =>
  import('@/pages/facility-onboarding/MagicLinkScreen').then((m) => ({
    default: m.MagicLinkScreen,
  })),
);
const MagicLinkSentScreen = lazy(() =>
  import('@/pages/facility-onboarding/MagicLinkSentScreen').then((m) => ({
    default: m.MagicLinkSentScreen,
  })),
);
const RegisterFacilityScreen = lazy(() =>
  import('@/pages/facility-onboarding/RegisterFacilityScreen').then((m) => ({
    default: m.RegisterFacilityScreen,
  })),
);
const AdminDashboardScreen = lazy(() =>
  import('@/pages/facility-onboarding/AdminDashboardScreen').then((m) => ({
    default: m.AdminDashboardScreen,
  })),
);
const InviteStaffScreen = lazy(() =>
  import('@/pages/facility-onboarding/InviteStaffScreen').then((m) => ({
    default: m.InviteStaffScreen,
  })),
);
const RolesPermissionsScreen = lazy(() =>
  import('@/pages/facility-onboarding/RolesPermissionsScreen').then((m) => ({
    default: m.RolesPermissionsScreen,
  })),
);
const ManageStaffScreen = lazy(() =>
  import('@/pages/facility-onboarding/ManageStaffScreen').then((m) => ({
    default: m.ManageStaffScreen,
  })),
);

// Staff onboarding & access
const CreatePinScreen = lazy(() =>
  import('@/pages/staff-onboarding/CreatePinScreen').then((m) => ({ default: m.CreatePinScreen })),
);
const ShiftLoginScreen = lazy(() =>
  import('@/pages/staff-onboarding/ShiftLoginScreen').then((m) => ({ default: m.ShiftLoginScreen })),
);
const ForgotPinScreen = lazy(() =>
  import('@/pages/staff-onboarding/ForgotPinScreen').then((m) => ({ default: m.ForgotPinScreen })),
);
const ResetLinkSentScreen = lazy(() =>
  import('@/pages/staff-onboarding/ResetLinkSentScreen').then((m) => ({
    default: m.ResetLinkSentScreen,
  })),
);
const ResetPinScreen = lazy(() =>
  import('@/pages/staff-onboarding/ResetPinScreen').then((m) => ({ default: m.ResetPinScreen })),
);

// Daily use
const FacilityHomeScreen = lazy(() =>
  import('@/pages/facility-home/FacilityHomeScreen').then((m) => ({ default: m.FacilityHomeScreen })),
);
const PatientSearchScreen = lazy(() =>
  import('@/pages/patient-search/PatientSearchScreen').then((m) => ({
    default: m.PatientSearchScreen,
  })),
);
const NewPatientStep1Screen = lazy(() =>
  import('@/pages/patient-registration/NewPatientStep1Screen').then((m) => ({
    default: m.NewPatientStep1Screen,
  })),
);
const NewPatientStep2Screen = lazy(() =>
  import('@/pages/patient-registration/NewPatientStep2Screen').then((m) => ({
    default: m.NewPatientStep2Screen,
  })),
);
const DuplicateCheckScreen = lazy(() =>
  import('@/pages/patient-registration/DuplicateCheckScreen').then((m) => ({
    default: m.DuplicateCheckScreen,
  })),
);
const SendToUnitScreen = lazy(() =>
  import('@/pages/send-to-unit/SendToUnitScreen').then((m) => ({ default: m.SendToUnitScreen })),
);
const MalariaRegisterScreen = lazy(() =>
  import('@/pages/programme-register/MalariaRegisterScreen').then((m) => ({
    default: m.MalariaRegisterScreen,
  })),
);
const MonthlySummaryScreen = lazy(() =>
  import('@/pages/monthly-summary/MonthlySummaryScreen').then((m) => ({
    default: m.MonthlySummaryScreen,
  })),
);
const ReferralScreen = lazy(() =>
  import('@/pages/referral/ReferralScreen').then((m) => ({ default: m.ReferralScreen })),
);
const SyncCenterScreen = lazy(() =>
  import('@/pages/sync-center/SyncCenterScreen').then((m) => ({ default: m.SyncCenterScreen })),
);
const StockScreen = lazy(() =>
  import('@/pages/stock/StockScreen').then((m) => ({ default: m.StockScreen })),
);

const ScreenFallback = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface text-ink-muted">
      Loading…
    </div>
  );
}

const App = () => {
  return (
    <SessionProvider>
      <ToastProvider>
        <BrowserRouter>
          <Suspense fallback={<ScreenFallback />}>
        <Routes>
          {/* Default screen is the staff shift-login. */}
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* Auth & onboarding — brand-split card on tablet/desktop */}
          <Route element={<AuthShell />}>
            <Route path="/login" element={<ShiftLoginScreen />} />
            <Route path="/onboarding/start" element={<MagicLinkScreen />} />
            <Route path="/onboarding/link-sent" element={<MagicLinkSentScreen />} />
            <Route path="/onboarding/register" element={<RegisterFacilityScreen />} />
            <Route path="/onboarding/accept" element={<CreatePinScreen />} />
            <Route path="/forgot-pin" element={<ForgotPinScreen />} />
            <Route path="/forgot-pin/sent" element={<ResetLinkSentScreen />} />
            <Route path="/reset-pin" element={<ResetPinScreen />} />
          </Route>

          {/* Daily use — inside the responsive app shell (sidebar / bottom nav) */}
          <Route element={<AppShell />}>
            <Route path="/home" element={<FacilityHomeScreen />} />
            <Route path="/patients/search" element={<PatientSearchScreen />} />
            <Route path="/patients/new" element={<NewPatientStep1Screen />} />
            <Route path="/patients/new/details" element={<NewPatientStep2Screen />} />
            <Route path="/patients/send-to-unit" element={<SendToUnitScreen />} />
            <Route path="/registers/malaria" element={<MalariaRegisterScreen />} />
            <Route path="/reports/month" element={<MonthlySummaryScreen />} />
            <Route path="/referrals/track" element={<ReferralScreen />} />
            <Route path="/stock" element={<StockScreen />} />
            <Route path="/sync" element={<SyncCenterScreen />} />
          </Route>
          {/* Duplicate check is a modal-style screen — outside the shell for now */}
          <Route path="/patients/duplicate" element={<DuplicateCheckScreen />} />

          {/* Facility admin — inside the admin rail shell */}
          <Route element={<AdminShell />}>
            <Route path="/admin" element={<AdminDashboardScreen />} />
            <Route path="/admin/staff" element={<ManageStaffScreen />} />
            <Route path="/admin/staff/invite" element={<InviteStaffScreen />} />
            <Route path="/admin/staff/access" element={<RolesPermissionsScreen />} />
          </Route>

          {/* Dev screen index (temporary) */}
          <Route path="/menu" element={<RouteIndex />} />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
          </Suspense>
        </BrowserRouter>
      </ToastProvider>
    </SessionProvider>
  );
};

export default App;
