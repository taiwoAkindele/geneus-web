import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { decide, type EnrollmentCode } from '@shared';
import { AppBar, Banner, Button } from '@/ui';
import { SyncPill } from '@/app/SyncPill';
import { issueEnrollmentCode } from '@/lib/api/devices';
import { useAuthorizationContext } from '@/session';

const minutesLeft = (expiresOn: string, now: number): number => Math.max(0, Math.ceil((Date.parse(expiresOn) - now) / 60_000));

/** Shown in groups of four, the way it is read aloud. */
const spaced = (code: string): string => code.replace(/(.{4})(?=.)/g, '$1 ');

/**
 * Add a device (facility admin). Gets a one-time code from the server, valid
 * for 15 minutes, to type into the new phone's "Join an existing facility"
 * screen (root §4.3c). Enrolling is a high-risk action: this device must have
 * heard from the server in the last 24 hours, and the server checks again.
 */
export const AddDeviceScreen = () => {
  const navigate = useNavigate();
  const context = useAuthorizationContext();
  const [issued, setIssued] = useState<EnrollmentCode>();
  const [error, setError] = useState<string>();
  const [asking, setAsking] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!issued) return;
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [issued]);

  const denial = decide(context, 'device:enroll');
  const expired = issued ? minutesLeft(issued.expiresOn, now) === 0 : false;

  const ask = async () => {
    setAsking(true);
    setError(undefined);
    try {
      setIssued(await issueEnrollmentCode(context.userId));
      setNow(Date.now());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not get a code');
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface">
      <AppBar title="Add a device" onBack={() => navigate('/admin')} right={<SyncPill />} />
      <div className="mx-auto w-full max-w-md px-5 pb-24 pt-2 md:max-w-lg">
        <ol className="list-decimal space-y-1.5 pl-5 text-[14px] leading-relaxed text-ink-soft">
          <li>On the new phone, open Geneus and choose <b>Join an existing facility</b>.</li>
          <li>Get a code here and type it in there within 15 minutes. Both phones need a connection.</li>
          <li>Staff then sign in on the new phone as usual.</li>
        </ol>

        {denial?.kind === 'not_granted' ? (
          <Banner tone="amber" title="Admins only" className="mt-5">
            Only a facility admin can add a device.
          </Banner>
        ) : denial?.kind === 'stale_authorization' ? (
          <Banner tone="amber" title="Connect first" className="mt-5">
            This device has not reached the server in the last 24 hours. Connect and let it sync, then try again.
          </Banner>
        ) : (
          <div className="mt-6 rounded-card border border-outline-soft bg-white p-5 text-center">
            {issued && !expired ? (
              <>
                <div className="text-[13px] font-semibold text-ink-muted">Device code</div>
                <div className="mt-2 font-mono text-[34px] font-extrabold tracking-[0.12em] text-brand">{spaced(issued.code)}</div>
                <div className="mt-2 text-[13px] text-ink-muted">
                  Works once · expires in {minutesLeft(issued.expiresOn, now)} min
                </div>
              </>
            ) : (
              <p className="text-[14px] text-ink-soft">{expired ? 'That code has expired.' : 'No code yet.'}</p>
            )}
            {error ? <p className="mt-3 text-[13px] font-medium text-danger">{error}</p> : null}
            <div className="mt-5">
              <Button variant={issued && !expired ? 'outlined' : 'primary'} disabled={asking} loading={asking} onClick={() => void ask()}>
                {issued ? 'Get a new code' : 'Get a device code'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
