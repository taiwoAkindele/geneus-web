import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, TextField } from '@/ui';
import { useDeviceContext } from '@/data';
import { ApiError } from '@/lib/api/client';
import { joinFacility, normalizeEnrollmentCode } from '@/lib/api/devices';

/** What went wrong, in words the person holding the new phone can act on. */
const explain = (cause: unknown): string => {
  if (cause instanceof ApiError && cause.code === 'invalid_code') {
    return 'That code is not valid — it may have expired (codes last 15 minutes) or been used. Ask for a new one.';
  }
  if (cause instanceof ApiError && cause.code === 'device_already_enrolled') {
    return 'This device is already enrolled. Sign in instead, or ask your admin to remove it first.';
  }
  return cause instanceof Error ? cause.message : 'Could not join the facility';
};

/**
 * A second (or tenth) device joins a facility that already uses Geneus (root
 * §4.3c). A facility admin gets a one-time code on an enrolled device; this
 * device spends it, receives its own credential, syncs the facility down and
 * is ready for staff to sign in. Online only — a device the server has never
 * heard of cannot be trusted with the facility's records.
 */
export const JoinFacilityScreen = () => {
  const navigate = useNavigate();
  const { deviceId, enroll, enrolled } = useDeviceContext();
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string>();
  const [joining, setJoining] = useState(false);

  const ready = normalizeEnrollmentCode(code).length >= 8;

  const submit = async () => {
    if (!ready || joining) return;
    setJoining(true);
    setError(undefined);
    try {
      const device = await joinFacility(code, deviceId, label);
      // Waits (bounded) for the facility's records; sign-in shows the rest syncing if it is slow.
      await enroll(device);
      navigate('/login', { replace: true });
    } catch (cause) {
      setError(explain(cause));
      setJoining(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-brand px-7 pb-8 pt-12 text-white sm:min-h-0">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="relative mb-7 h-14 w-14 flex-none rounded-2xl bg-brand-accent-soft">
          <div className="absolute left-1/2 top-1/2 h-[7px] w-6 -translate-x-1/2 -translate-y-1/2 rounded bg-brand" />
          <div className="absolute left-1/2 top-1/2 h-6 w-[7px] -translate-x-1/2 -translate-y-1/2 rounded bg-brand" />
        </div>

        <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.02em]">Add this device to your facility</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-brand-on-dark">
          A facility admin gets a device code from Admin → Add a device on a phone that is already set up. Enter it here
          while you are connected.
        </p>

        {enrolled ? (
          <div className="mt-8 rounded-[22px] bg-white p-5 text-[15px] text-ink">
            This device is already set up for a facility.
            <div className="mt-4">
              <Button variant="primary" onClick={() => navigate('/login')}>
                Sign in
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="mt-8 space-y-4 rounded-[22px] bg-white p-5 text-ink"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <TextField
              label="Device code"
              name="device_code"
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="e.g. K7M2QX9R"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              error={error}
            />
            <TextField
              label="Name for this device (optional)"
              name="device_label"
              placeholder="e.g. Injection room phone"
              hint="Helps the admin tell devices apart"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
            <Button type="submit" variant="primary" disabled={!ready || joining} loading={joining}>
              {joining ? 'Joining and syncing…' : 'Join facility'}
            </Button>
          </form>
        )}

        <div className="mt-auto pt-8 text-center text-sm text-brand-on-dark">
          Setting up a new facility instead?{' '}
          <button type="button" onClick={() => navigate('/onboarding/start')} className="min-h-0 font-bold text-white underline">
            Use an invite code
          </button>
        </div>
      </div>
    </div>
  );
};
