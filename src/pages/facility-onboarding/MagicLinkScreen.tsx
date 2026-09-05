import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, TextField } from '@/ui';
import { useDeviceContext } from '@/data';
import { checkInvite } from '@/lib/api/facilities';

/**
 * The gate in front of facility registration. Registering creates a database
 * and hands this device a credential for it, so it cannot be open to whoever
 * finds the URL — an approved facility is given a code out of band and enters
 * it here.
 */
export const MagicLinkScreen = () => {
  const navigate = useNavigate();
  const { facility } = useDeviceContext();
  const [token, setToken] = useState('');
  const [error, setError] = useState<string>();
  const [checking, setChecking] = useState(false);

  const submit = async () => {
    const code = token.trim().toUpperCase();
    if (!code || checking) return;
    setChecking(true);
    setError(undefined);
    try {
      const invite = await checkInvite(code);
      navigate('/onboarding/register', { state: { inviteToken: code, label: invite.label } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not check that code');
      setChecking(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-brand px-7 pb-8 pt-12 text-white sm:min-h-0">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        {/* Logo — mint square with a green plus */}
        <div className="relative mb-7 h-14 w-14 flex-none rounded-2xl bg-brand-accent-soft">
          <div className="absolute left-1/2 top-1/2 h-[7px] w-6 -translate-x-1/2 -translate-y-1/2 rounded bg-brand" />
          <div className="absolute left-1/2 top-1/2 h-6 w-[7px] -translate-x-1/2 -translate-y-1/2 rounded bg-brand" />
        </div>

        <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.02em]">Set up your facility</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-brand-on-dark">
          Enter the invite code you were given. It can only be used once, and sets up this facility on this device.
        </p>

        <form
          className="mt-8 rounded-[22px] bg-white p-5 text-ink"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <TextField
            label="Invite code"
            name="invite_code"
            autoCapitalize="characters"
            placeholder="e.g. K7M2QX9RTB"
            value={token}
            onChange={(event) => setToken(event.target.value.toUpperCase())}
            error={error}
          />
          <div className="mt-4">
            <Button type="submit" variant="primary" disabled={!token.trim() || checking} loading={checking}>
              Continue
            </Button>
          </div>
        </form>

        {/* Only offered once this device has a facility — there is nothing to
            sign in to before that. */}
        {facility ? (
          <div className="mt-auto pt-8 text-center text-sm text-brand-on-dark">
            Already set up?{' '}
            <button type="button" onClick={() => navigate('/login')} className="min-h-0 font-bold text-white underline">
              Sign in
            </button>
          </div>
        ) : (
          <p className="mt-auto pt-8 text-center text-sm text-brand-on-dark">
            Don&rsquo;t have a code? Ask whoever approved your facility for one.
          </p>
        )}
      </div>
    </div>
  );
};
