import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/ui';

type SentState = { contact?: string };

/**
 * 3.3b Reset link sent — confirmation after "Send reset link" (same pattern as
 * the facility magic-link). The emailed/texted link is what opens Reset PIN.
 */
export const ResetLinkSentScreen = () => {
  const navigate = useNavigate();
  const { state } = useLocation() as { state: SentState | null };
  const contact = state?.contact?.trim();
  const isEmail = !!contact?.includes('@');
  const target = contact || 'your email or phone';

  return (
    <div className="flex min-h-screen flex-col bg-brand px-7 pb-8 pt-12 text-white">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="rounded-[22px] bg-white p-6 text-ink">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-tint text-2xl font-extrabold text-brand">
            ✓
          </div>
          <h1 className="mt-5 text-2xl font-extrabold tracking-[-0.02em]">
            {isEmail ? 'Check your email' : 'Check your messages'}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            We sent a link to reset your PIN to <b className="text-ink">{target}</b>. Open it on this
            device to set a new PIN.
          </p>
          <p className="mt-3 text-[13px] text-ink-muted">The link expires in 15 minutes.</p>

          <div className="mt-6">
            <Button variant="outlined" onClick={() => navigate('/forgot-pin')}>
              Resend link
            </Button>
          </div>
        </div>

        <div className="mt-auto pt-8 text-center text-sm text-brand-on-dark">
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="min-h-0 font-bold text-white underline"
          >
            Back to sign in
          </button>
        </div>
      </div>
    </div>
  );
};
