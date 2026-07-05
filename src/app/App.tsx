import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
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

const ScreenFallback = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface text-ink-muted">
      Loading…
    </div>
  );
}

const App = () => {
  return (
    <BrowserRouter>
      <Suspense fallback={<ScreenFallback />}>
        <Routes>
          {/* Default screen is the staff shift-login. */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<ShiftLoginScreen />} />

          {/* Staff onboarding & access */}
          <Route path="/onboarding/accept" element={<CreatePinScreen />} />
          <Route path="/forgot-pin" element={<ForgotPinScreen />} />
          <Route path="/forgot-pin/sent" element={<ResetLinkSentScreen />} />
          <Route path="/reset-pin" element={<ResetPinScreen />} />

          {/* Facility onboarding & admin */}
          <Route path="/onboarding/start" element={<MagicLinkScreen />} />
          <Route path="/onboarding/link-sent" element={<MagicLinkSentScreen />} />
          <Route path="/onboarding/register" element={<RegisterFacilityScreen />} />
          <Route path="/admin" element={<AdminDashboardScreen />} />
          <Route path="/admin/staff" element={<ManageStaffScreen />} />
          <Route path="/admin/staff/invite" element={<InviteStaffScreen />} />
          <Route path="/admin/staff/access" element={<RolesPermissionsScreen />} />

          {/* Dev screen index (temporary) */}
          <Route path="/menu" element={<RouteIndex />} />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

export default App;
