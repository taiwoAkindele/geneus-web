import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { StaffPermission } from '@shared';
import { AppBar, Avatar, Button, Card, Icon, StatusPill, ToggleSwitch, useToast } from '@/ui';
import { useWriteContext } from '@/data';
import { setPermission } from '@/data/repos/staff';
import { useAuth, useSession } from '@/session';

const ROLE_LABELS: Record<string, string> = {
  chew: 'CHEW',
  nurse: 'Nurse',
  doctor: 'Doctor',
  records_officer: 'Records',
  facility_admin: 'Facility Admin',
  supervisor: 'Supervisor',
};

/** What each role may reach, beyond recording care. Derived, not stored. */
const roleCapabilities = (role: string): { label: string; allowed: boolean }[] => [
  { label: 'View patient records', allowed: true },
  { label: 'Refer to other facilities', allowed: true },
  { label: 'Manage medicine stock', allowed: role === 'facility_admin' || role === 'records_officer' },
  { label: 'Invite & manage staff', allowed: role === 'facility_admin' },
];

export const RolesPermissionsScreen = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { staffId } = (useLocation().state ?? {}) as { staffId?: string };
  const { roster } = useAuth();
  const { user } = useSession();
  const context = useWriteContext(user.staffId, user.canWrite);
  const [saving, setSaving] = useState(false);
  const [permission, setLocalPermission] = useState<StaffPermission>();

  const entry = roster.find((candidate) => candidate.staff.staffId === staffId);
  if (!staffId) return <Navigate to="/admin/staff" replace />;
  if (!entry) {
    return (
      <div className="min-h-screen bg-surface">
        <AppBar title="Access" onBack={() => navigate(-1)} />
        <p className="px-5 py-6 text-ink-muted">That staff member is no longer on the roster.</p>
      </div>
    );
  }

  const { staff } = entry;
  const current = permission ?? staff.permission;
  const firstName = staff.fullName.split(' ')[0];

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await setPermission(staff, current, context);
      toast(
        current === 'read_write'
          ? `${firstName} can record and change records`
          : `${firstName} can view records only`,
      );
      navigate('/admin/staff');
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : 'Could not save that change');
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <AppBar title={`${firstName}'s access`} onBack={() => navigate(-1)} right={<StatusPill status="synced" />} />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col md:max-w-lg">
        <div className="flex-1 space-y-4 px-5 py-3">
          <Card className="flex items-center gap-3">
            <Avatar tone="green">
              {staff.fullName
                .split(' ')
                .slice(0, 2)
                .map((part) => part[0])
                .join('')}
            </Avatar>
            <div>
              <div className="text-base font-bold">{staff.fullName}</div>
              <div className="text-[13px] text-ink-muted">
                {ROLE_LABELS[staff.role] ?? staff.role} ·{' '}
                {staff.permission === 'read_write' ? 'Read & write' : 'Read only'}
              </div>
            </div>
          </Card>

          <div className="text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">Recording care</div>
          <Card className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[15px] font-semibold">Create &amp; edit records</div>
              <div className="mt-0.5 text-[13px] text-ink-muted">
                Turn off to let {firstName} view records without changing anything.
              </div>
            </div>
            <ToggleSwitch
              checked={current === 'read_write'}
              ariaLabel="Create and edit records"
              onChange={(on) => setLocalPermission(on ? 'read_write' : 'read_only')}
            />
          </Card>

          <div className="text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">
            Comes with the {ROLE_LABELS[staff.role] ?? staff.role} role
          </div>
          <Card padded={false} className="divide-y divide-outline-soft">
            {roleCapabilities(staff.role).map((capability) => (
              <div key={capability.label} className="flex items-center justify-between px-4 py-3.5">
                <span className={`text-[15px] ${capability.allowed ? 'font-semibold text-ink' : 'text-ink-muted'}`}>
                  {capability.label}
                </span>
                <Icon
                  name={capability.allowed ? 'check' : 'lock'}
                  className={`h-4 w-4 ${capability.allowed ? 'text-brand' : 'text-ink-muted'}`}
                />
              </div>
            ))}
          </Card>
          <p className="text-xs leading-relaxed text-ink-muted">
            These follow the role and cannot be set per person — change the role to change them.
          </p>
        </div>

        <footer className="px-5 pb-6 pt-4">
          <Button
            variant="primary"
            disabled={current === staff.permission || saving}
            loading={saving}
            onClick={save}
          >
            Save access
          </Button>
        </footer>
      </div>
    </div>
  );
};
