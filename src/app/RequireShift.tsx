import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/session';

/**
 * No shift, no access — on any device (PRD §14.1). Screens inside this guard can
 * rely on `useSession()` having a signed-in member of staff.
 */
export const RequireShift = () => {
  const { signedIn, loading } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-surface text-ink-muted">Loading…</div>;
  }

  return signedIn ? <Outlet /> : <Navigate to="/login" replace />;
};
