import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { Facility } from '@shared';
import { Button, SegmentedControl, TextField, useToast } from '@/ui';
import { useDeviceContext } from '@/data';
import { suggestCode } from '@/data/repos/facility';
import { pullOnce, saveSyncCredential } from '@/data/sync';
import { assignShift, today } from '@/data/repos/staff';
import { registerFacility } from '@/lib/api/facilities';

type Level = 'primary' | 'secondary' | 'tertiary';

const LEVELS: Record<Level, Facility['level']> = {
  primary: 'phc',
  secondary: 'general_hospital',
  tertiary: 'teaching_hospital',
};

const endOfToday = (): string => {
  const end = new Date();
  end.setHours(23, 59, 0, 0);
  return end.toISOString();
};

/**
 * Registers the facility and its first account. This is the one online step:
 * the server has to create the facility's database, its validation guard and
 * this device's sync credential before any document can exist.
 */
export const RegisterFacilityScreen = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { deviceId } = useDeviceContext();
  const { inviteToken } = (useLocation().state ?? {}) as { inviteToken?: string };

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [state, setState] = useState('');
  const [lga, setLga] = useState('');
  const [adminName, setAdminName] = useState('');
  const [level, setLevel] = useState<Level>('primary');
  const [saving, setSaving] = useState(false);

  const facilityCode = (code || suggestCode(name)).toUpperCase();
  const complete = Boolean(name.trim() && facilityCode && state.trim() && lga.trim() && adminName.trim());

  // Registration is only reachable by spending an invite code.
  if (!inviteToken) return <Navigate to="/onboarding/start" replace />;

  const create = async () => {
    if (!complete || saving) return;
    setSaving(true);
    try {
      const { admin, sync } = await registerFacility({
        code: facilityCode,
        name: name.trim(),
        state: state.trim(),
        lga: lga.trim(),
        level: LEVELS[level],
        adminFullName: adminName.trim(),
        deviceId,
        inviteToken,
      });
      saveSyncCredential(sync);
      await pullOnce(sync);
      // Whoever registers the facility is on duty now, or nobody could get in.
      await assignShift(
        { staffId: admin.staffId, day: today(), startsAt: new Date().toISOString(), endsAt: endOfToday() },
        { facilityId: facilityCode, deviceId, staffId: 'system', canWrite: true },
      );
      navigate('/onboarding/accept', { state: { staffId: admin.staffId, fullName: admin.fullName, role: 'Facility Admin' } });
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : 'Could not create the facility');
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-surface sm:min-h-0">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col md:max-w-lg">
        <header className="px-5 pb-3 pt-5">
          <h1 className="text-[22px] font-extrabold tracking-[-0.02em]">Register your facility</h1>
          <p className="mt-1 text-[13px] text-ink-muted">This creates your facility code &amp; admin account.</p>
        </header>

        <div className="flex-1 space-y-4 px-5 py-2">
          <TextField
            label="Facility name"
            placeholder="e.g. Odo-Ona Elewe PHC"
            name="facility_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <TextField
            label="Facility code"
            hint="Used to build every Patient ID — short and permanent."
            placeholder="e.g. OOE-PHC"
            name="facility_code"
            value={code || suggestCode(name)}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <div className="flex gap-3">
            <div className="flex-1">
              <TextField
                label="State"
                placeholder="e.g. Oyo"
                name="facility_state"
                value={state}
                onChange={(e) => setState(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <TextField
                label="LGA"
                placeholder="e.g. Ibadan SW"
                name="facility_lga"
                value={lga}
                onChange={(e) => setLga(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="mb-2 text-[13px] font-semibold text-ink-soft">Level of care</div>
            <SegmentedControl
              ariaLabel="Level of care"
              value={level}
              onChange={setLevel}
              options={[
                { value: 'primary', label: 'Primary' },
                { value: 'secondary', label: 'Secondary' },
                { value: 'tertiary', label: 'Tertiary' },
              ]}
            />
          </div>

          <TextField
            label="Your full name"
            hint="You become the facility admin and set a PIN next."
            placeholder="e.g. Amaka Okoro"
            name="admin_name"
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
          />
        </div>

        <footer className="border-t border-outline-soft bg-surface px-5 pb-6 pt-4">
          <Button variant="primary" disabled={!complete || saving} loading={saving} onClick={create}>
            Create facility
          </Button>
        </footer>
      </div>
    </div>
  );
};
