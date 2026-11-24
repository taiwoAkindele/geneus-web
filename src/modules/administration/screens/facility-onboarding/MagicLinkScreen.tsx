import { useNavigate } from 'react-router-dom';
import { Button } from '@/ui';
import { useDeviceContext } from '@/data';

/**
 * The start screen. Sign-in comes first: most people opening Geneus work at a
 * facility that already uses it. A new facility starts with "Create an
 * account" — a request Geneus approves, whose approval email carries the link
 * that registers the facility.
 */
export const MagicLinkScreen = () => {
  const navigate = useNavigate();
  const { facility } = useDeviceContext();

  // A facility device signs in with a PIN; a device set up nowhere, with email and password.
  const signInPath = facility ? '/login' : '/sign-in';

  return (
    <div className="flex min-h-screen flex-col bg-brand px-7 pb-8 pt-12 text-white sm:min-h-0">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        {/* Logo — mint square with a green plus */}
        <div className="relative mb-7 h-14 w-14 flex-none rounded-2xl bg-brand-accent-soft">
          <div className="absolute left-1/2 top-1/2 h-[7px] w-6 -translate-x-1/2 -translate-y-1/2 rounded bg-brand" />
          <div className="absolute left-1/2 top-1/2 h-6 w-[7px] -translate-x-1/2 -translate-y-1/2 rounded bg-brand" />
        </div>

        <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.02em]">
          Welcome to Geneus
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-brand-on-dark">
          Sign in if your facility already uses Geneus.
        </p>

        <div className="mt-8 rounded-[22px] bg-white p-5 text-ink">
          <Button variant="primary" onClick={() => navigate(signInPath)}>
            Sign in
          </Button>
        </div>

        <div className="mt-6 rounded-[22px] bg-white p-5 text-ink">
          <p className="text-[15px] font-bold">New to Geneus?</p>
          <p className="mt-1 text-[13px] text-ink-muted">
            Ask Geneus to set up your facility. We email you a link to register it once the request
            is approved.
          </p>
          <div className="mt-4">
            <Button variant="outlined" onClick={() => navigate('/onboarding/create-account')}>
              Create an account
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
