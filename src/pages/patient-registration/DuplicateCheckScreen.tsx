import { useNavigate } from 'react-router-dom';
import { Avatar, Button, StatusPill } from '@/ui';

const MATCH_TAGS = ['✓ Name matches', '✓ Phone matches', '✓ Age matches'];

/**
 * 4.5 Duplicate check — one tap: "Is this the same person?". Shown as a bottom
 * sheet over the (blurred) registration form when a close match is found.
 */
export const DuplicateCheckScreen = () => {
  const navigate = useNavigate();
  return (
    <div className="relative flex min-h-screen flex-col bg-surface">
      <div className="flex justify-end px-5 pt-4">
        <StatusPill status="pending">Offline</StatusPill>
      </div>

      {/* Blurred form behind the sheet */}
      <div className="pointer-events-none flex-1 px-5 py-4 opacity-50 blur-[2px]" aria-hidden>
        <div className="mb-4 h-5 w-3/5 rounded bg-surface-high" />
        <div className="mb-3.5 h-[52px] rounded-field bg-surface-high" />
        <div className="mb-3.5 h-[52px] rounded-field bg-surface-high" />
        <div className="h-[52px] rounded-field bg-surface-high" />
      </div>

      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md rounded-t-[26px] bg-white px-5 pb-7 pt-6 shadow-sheet md:max-w-lg sm:inset-0 sm:h-fit sm:max-h-[92vh] sm:overflow-auto sm:rounded-[26px] sm:m-auto">
        <div className="mx-auto mb-5 h-1.5 w-10 rounded-full bg-outline-hair sm:hidden" />
        <div className="flex items-center gap-2.5">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-amber-bg font-extrabold text-amber-text">
            !
          </span>
          <h1 className="text-[19px] font-extrabold tracking-[-0.02em]">Is this the same person?</h1>
        </div>
        <p className="mb-4 mt-1.5 text-sm leading-relaxed text-ink-muted">
          We found someone already registered here who looks like a close match.
        </p>

        <div className="rounded-card bg-surface-muted p-4">
          <div className="flex items-center gap-3">
            <Avatar tone="green" size="lg">AO</Avatar>
            <div className="flex-1">
              <div className="text-[17px] font-bold">Amaka Okoro</div>
              <div className="text-[13px] text-ink-muted">F · 32 · 0803 555 0147</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {MATCH_TAGS.map((t) => (
              <span
                key={t}
                className="rounded-full bg-brand-tint px-2.5 py-1 text-xs font-bold text-brand"
              >
                {t}
              </span>
            ))}
          </div>
          <div className="mt-3 font-mono text-xs text-brand">OOE-PHC-000047-K2 · reg. 12 Jun</div>
        </div>

        <div className="mt-4">
          <Button variant="primary" onClick={() => navigate('/home')}>
            Yes — open this record
          </Button>
        </div>
        <div className="pt-1">
          <Button variant="ghost" onClick={() => navigate('/home')}>
            No — this is a different person
          </Button>
        </div>
      </div>
    </div>
  );
};
