import { useNavigate } from 'react-router-dom';
import { AppBar, Button, StatusPill } from '@/ui';

const TRAVELS = ['Name, age, sex', 'Allergies', 'Current meds', 'Reason'];

const STEPS = [
  { title: 'Sent', sub: 'Alert pending — will send once connected', done: true },
  { title: 'Seen', sub: 'Opened at receiving facility', done: true },
  { title: 'Arrived', sub: 'Auto-matched by Patient ID', done: false },
  { title: 'Closed', sub: '', done: false },
];

const TimelineStep = ({
  title,
  sub,
  done,
  last,
}: {
  title: string;
  sub: string;
  done: boolean;
  last: boolean;
}) => (
  <div className="flex gap-3">
    <div className="flex flex-col items-center">
      <span
        className={`flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-xs font-extrabold ${
          done ? 'bg-brand text-white' : 'border-2 border-outline'
        }`}
      >
        {done ? '✓' : ''}
      </span>
      {!last ? <span className={`w-0.5 flex-1 ${done ? 'bg-brand' : 'bg-outline'}`} /> : null}
    </div>
    <div className="pb-4">
      <div className={`text-[15px] font-bold ${done ? 'text-ink' : 'text-ink-muted'}`}>{title}</div>
      {sub ? <div className="text-xs text-ink-muted">{sub}</div> : null}
    </div>
  </div>
);

/** 4.9 Refer & track — a one-way message becomes a safety net with a lifecycle. */
export const ReferralScreen = () => {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <AppBar title="Referral" onBack={() => navigate(-1)} right={<StatusPill status="pending">Offline</StatusPill>} />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col md:max-w-lg">
        <div className="flex-1 space-y-4 px-5 py-3">
          {/* Destination */}
          <div className="rounded-card border border-outline-soft bg-white p-4">
            <div className="text-xs text-ink-muted">Refer Ibrahim Musa · 34 · M · to</div>
            <div className="mt-0.5 text-base font-bold">Adeoyo General Hospital</div>
            <div className="mt-0.5 text-[13px] font-semibold text-brand">
              Suspected severe malaria — needs admission
            </div>
          </div>

          {/* What travels */}
          <div>
            <div className="mb-2.5 text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">
              Travels automatically
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TRAVELS.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-brand-tint px-2.5 py-1.5 text-[13px] font-semibold text-brand"
                >
                  {t}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-muted">
              Full history &amp; sensitive categories are <b>not</b> shared automatically in V1.
            </p>
          </div>

          {/* Lifecycle */}
          <div className="rounded-card border border-outline-soft bg-white p-4 pb-1">
            {STEPS.map((s, i) => (
              <TimelineStep key={s.title} {...s} last={i === STEPS.length - 1} />
            ))}
          </div>
        </div>

        <footer className="flex gap-2.5 px-5 pb-6 pt-4">
          <button
            type="button"
            className="flex w-14 flex-none items-center justify-center rounded-field border-[1.5px] border-outline bg-white text-xl text-ink-soft"
            aria-label="Print referral note"
          >
            🖶
          </button>
          <Button variant="primary" onClick={() => navigate('/home')}>
            Refer &amp; print note
          </Button>
        </footer>
      </div>
    </div>
  );
};
