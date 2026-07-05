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
          <Route path="/" element={<RouteIndex />} />

          {/* Facility onboarding & admin */}
          <Route path="/onboarding/start" element={<MagicLinkScreen />} />
          <Route path="/onboarding/link-sent" element={<MagicLinkSentScreen />} />
          <Route path="/onboarding/register" element={<RegisterFacilityScreen />} />
          <Route path="/admin" element={<AdminDashboardScreen />} />
          <Route path="/admin/staff" element={<ManageStaffScreen />} />
          <Route path="/admin/staff/invite" element={<InviteStaffScreen />} />
          <Route path="/admin/staff/access" element={<RolesPermissionsScreen />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

export default App;
