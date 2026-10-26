import { useEffect } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AppBar, Button, useToast } from '@/ui';
import { editStaff, type StaffDetails } from '@/data/repos/staff';
import { useAuth, useAuthorizationContext } from '@/session';
import { StaffForm } from '@/features/staff/StaffForm';

export const RolesPermissionsScreen = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const state = useLocation().state as { staffId?: string } | null;
  const [params] = useSearchParams();
  const staffId = params.get('staff') ?? state?.staffId;
  useEffect(() => { document.title = 'Edit staff · Geneus Health'; }, []);
  const { roster, loading, error, reload } = useAuth();
  const context = useAuthorizationContext();
  if (!staffId) return <Navigate to="/admin/staff" replace />;
  const entry = roster.find((candidate) => candidate.staff.staffId === staffId);
  const save = async (details: StaffDetails) => {
    if (!entry) return;
    await editStaff(entry.staff, details, context);
    toast(`${details.fullName} updated`);
    navigate('/admin/staff');
  };
  return <div className="min-h-screen bg-surface">
    <AppBar title="Edit staff" onBack={() => navigate('/admin/staff')} />
    <div className="mx-auto w-full max-w-xl px-5 py-4">
      <h1 className="mb-4 text-2xl font-extrabold">Staff details &amp; access</h1>
      {loading ? <div role="status" aria-label="Loading staff member" className="h-32 animate-pulse rounded-card bg-surface-muted" />
        : error ? <div role="alert">Staff could not be read.<Button variant="ghost" onClick={reload}>Try again</Button></div>
        : !entry ? <p className="text-sm text-ink-muted">That staff member is no longer on the active roster.</p>
        : <StaffForm key={entry.staff.id} initial={entry.staff}
          canEditName={context.permissions.includes('staff:manage')}
          canEditAccess={context.permissions.includes('staff:permission')}
          submitLabel="Save staff changes" onSave={save} />}
    </div>
  </div>;
};
