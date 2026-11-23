import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSyncStatus } from '@/data';
import { ownPasswordStatus, type OwnPasswordStatus } from '@/lib/api/staffPassword';
import { useAuthorizationContext, useStaffVerification } from '@/session';

/** Asked once per person per tab: the answer only changes when they set a password. */
const known = new Map<string, OwnPasswordStatus>();
const DISMISSED_KEY = 'geneus.passwordPromptDismissed';

const dismissedFor = (staffId: string): boolean => {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === staffId;
  } catch {
    return false;
  }
};

/** After setting a password, the prompt must not come back from an old answer. */
export const forgetPasswordStatus = (staffId: string) => known.delete(staffId);

/**
 * Home's reminder for staff without a password yet (they signed in before
 * passwords existed, or registered the facility). Without one they cannot set
 * up a new device or recover a forgotten PIN on their own. Shown only online
 * with a server session, because the answer is kept on the server; quiet
 * otherwise, and "Not now" hides it for the rest of this tab.
 */
export const SetPasswordPrompt = () => {
  const context = useAuthorizationContext();
  const { hasServerSession } = useStaffVerification();
  const sync = useSyncStatus();
  const [status, setStatus] = useState(() => known.get(context.userId));
  const [dismissed, setDismissed] = useState(() => dismissedFor(context.userId));

  useEffect(() => {
    if (status || dismissed || !hasServerSession || !sync.connected) {
      return;
    }

    let alive = true;

    ownPasswordStatus(context).then(
      (found) => {
        known.set(context.userId, found);

        if (alive) {
          setStatus(found);
        }
      },
      () => undefined,
    );

    return () => {
      alive = false;
    };
  }, [context, status, dismissed, hasServerSession, sync.connected]);

  if (!status || status.hasPassword || dismissed) {
    return null;
  }

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISSED_KEY, context.userId);
    } catch {
      /* hidden for this page only */
    }

    setDismissed(true);
  };

  return (
    <section
      aria-label="Set a password"
      className="mx-4 mt-4 rounded-card border border-amber-border bg-amber-bg p-4 text-amber-text"
    >
      <h2 className="text-[15px] font-bold">Set a password</h2>
      <p className="mt-1 text-sm">
        {status.email
          ? 'You’ll need it to sign in on a new device or if you forget your PIN. It takes a minute.'
          : 'You’ll need one to sign in on a new device or if you forget your PIN. Ask your administrator to add your email first.'}
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        {status.email ? (
          <Link
            to="/account/password/set"
            className="inline-flex min-h-[44px] items-center rounded-field bg-brand px-4 text-sm font-bold text-white"
          >
            Set my password
          </Link>
        ) : null}
        <button
          type="button"
          onClick={dismiss}
          className="min-h-[44px] text-sm font-bold underline"
        >
          Not now
        </button>
      </div>
    </section>
  );
};
