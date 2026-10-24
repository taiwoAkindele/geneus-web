import { useNavigate } from 'react-router-dom';
import { AppBar, useToast } from '@/ui';
import { SyncPill } from '@/app/SyncPill';
import { createStaff, type StaffDetails } from '@/data/repos/staff';
import { useAuthorizationContext } from '@/session';
import { StaffForm } from '@/features/staff/StaffForm';

export const InviteStaffScreen = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const context = useAuthorizationContext();
  const allowed = context.permissions.includes('staff:manage') && context.permissions.includes('staff:permission');
  const save = async (details: StaffDetails) => {
    await createStaff(details, context);
    toast(`${details.fullName} added — issue a PIN code from Staff so they can set their PIN`);
    navigate('/admin/staff');
  };
  return <div className="min-h-screen bg-surface">
    <AppBar title="Add staff" onBack={() => navigate(-1)} right={<SyncPill />} />
    <div className="mx-auto w-full max-w-xl px-5 py-4">
      {allowed ? <StaffForm canEditName canEditAccess submitLabel="Add staff member" onSave={save} /> : <p className="text-sm text-ink-muted">Adding staff needs permission to manage staff and assign access. Ask a facility admin.</p>}
    </div>
  </div>;
};
