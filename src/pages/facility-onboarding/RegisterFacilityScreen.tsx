import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { Facility, Staff } from '@shared';
import { Button, SegmentedControl, TextField, useToast } from '@/ui';
import { useDeviceContext } from '@/data';
import { suggestCode } from '@/data/repos/facility';
import { assignShift, today } from '@/data/repos/staff';
import { authorizationFor } from '@/auth/authorization';
import { registerFacility } from '@/lib/api/facilities';
import { SyncingFacility } from '@/app/SyncingFacility';

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
 * Enrolling swaps the provider tree and remounts this screen, and a slow first
 * sync may outlive it entirely — so what registration still owes (the admin's
 * first shift, the PIN step) is kept in sessionStorage until the facility has
 * actually arrived, and survives a reload.
 */
const PENDING_KEY = 'geneus.pendingRegistration';
type PendingRegistration = { facilityCode: string; facilityName: string; admin: Staff };

const readPending = (): PendingRegistration | undefined => {
  const raw = sessionStorage.getItem(PENDING_KEY);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as PendingRegistration;
  } catch {
    return undefined;
  }
};

/**
 * Registers the facility and its first account. This is the one online step:
 * the server has to create the facility, its first admin and this device's
 * credential before any record can exist. The credential is stored, sync is
 * started, and the facility and admin come down before the admin sets a PIN.
 */
export const RegisterFacilityScreen = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { deviceId, enroll, facility } = useDeviceContext();
  const { inviteToken } = (useLocation().state ?? {}) as { inviteToken?: string };
  const [pending, setPending] = useState<PendingRegistration | undefined>(() => readPending());
  // The facility record re-renders on every local change (it is a live query), so
  // this must fire once per registration, not once per render that sees a facility.
  const finishing = useRef(false);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [state, setState] = useState('');
  const [lga, setLga] = useState('');
  const [adminName, setAdminName] = useState('');
  const [level, setLevel] = useState<Level>('primary');
  const [saving, setSaving] = useState(false);

  const facilityCode = (code || suggestCode(name)).toUpperCase();
  const complete = Boolean(name.trim() && facilityCode && state.trim() && lga.trim() && adminName.trim());

  // The facility has landed: finish what registration owes, then on to the PIN.
  useEffect(() => {
    if (!pending || !facility || finishing.current) return;
    finishing.current = true;
    sessionStorage.removeItem(PENDING_KEY);
    (async () => {
      // Whoever registers the facility is on duty now, or nobody could get in.
      // The admin assigns their own first shift: they hold roster:assign.
      await assignShift(
        { staffId: pending.admin.staffId, day: today(), startsAt: new Date().toISOString(), endsAt: endOfToday() },
        authorizationFor({ staff: pending.admin, facilityId: pending.facilityCode, deviceId }),
      );
      navigate('/onboarding/accept', {
        state: { staffId: pending.admin.staffId, fullName: pending.admin.fullName, role: 'Facility Admin' },
      });
    })().catch((cause: unknown) => {
      finishing.current = false;
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
      toast(cause instanceof Error ? cause.message : 'Could not finish registration');
    });
  }, [pending, facility, deviceId, navigate, toast]);

  if (pending) return <SyncingFacility facilityName={pending.facilityName} />;

  // Registration is only reachable by spending an invite code.
  if (!inviteToken) return <Navigate to="/onboarding/start" replace />;

  const create = async () => {
    if (!complete || saving) return;
    setSaving(true);
    try {
      const { admin, device } = await registerFacility({
        code: facilityCode,
        name: name.trim(),
        state: state.trim(),
        lga: lga.trim(),
        level: LEVELS[level],
        adminFullName: adminName.trim(),
        deviceId,
        inviteToken,
      });
      // From here the facility exists on the server and this device is enrolled:
      // the rest waits for the facility to sync down (the effect above), however
      // long that takes, and survives the remount that enrolling causes.
      const registration: PendingRegistration = { facilityCode, facilityName: name.trim(), admin };
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(registration));
      setPending(registration);
      await enroll(device);
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
