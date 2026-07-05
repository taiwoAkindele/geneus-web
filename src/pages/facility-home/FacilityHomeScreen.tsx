import { useNavigate } from 'react-router-dom';
import { Stat, StatusPill, Tag } from '@/ui';

const ReferralRow = ({
  name,
  reason,
  from,
  status,
  arrived,
  onClick,
}: {
  name: string;
  reason: string;
  from: string;
  status: string;
  arrived?: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full rounded-[13px] bg-white/10 p-3.5 text-left"
  >
    <div className="flex items-start justify-between gap-2">
      <div className="text-[15px] font-bold">{name}</div>
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
          arrived ? 'bg-brand-accent text-brand' : 'bg-white/20 text-white'
        }`}
      >
        {status}
      </span>
    </div>
    <div className="mt-1.5 text-[13px] text-white/80">{reason}</div>
    <div className="mt-2 text-xs text-white/60">{from}</div>
  </button>
);

const QuickAction = ({
  label,
  icon,
  primary,
  tall,
  onClick,
}: {
  label: string;
  icon: string;
  primary?: boolean;
  tall?: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex flex-col justify-between rounded-[18px] p-4 text-left ${
      tall ? 'h-[104px]' : ''
    } ${primary ? 'bg-brand text-white' : 'border border-outline-soft bg-white text-ink'}`}
  >
    <span
      className={`flex h-[34px] w-[34px] items-center justify-center rounded-[10px] text-xl ${
        primary ? 'bg-white/15 text-white' : 'bg-surface-container text-ink-soft'
      }`}
    >
      {icon}
    </span>
    <span className="text-[15px] font-bold md:text-base">{label}</span>
  </button>
);

/**
 * 4.1 Facility home — the CHC's daily hub. Incoming referrals sit at the top,
 * impossible to miss; quick actions and today's counts follow.
 */
export const FacilityHomeScreen = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto flex min-h-screen max-w-md flex-col md:max-w-2xl lg:max-w-5xl">
        <div className="flex justify-end px-5 pt-4">
          <StatusPill status="synced" />
        </div>
        <header className="flex items-center justify-between px-5 pb-3 pt-2">
          <div>
            <div className="text-[13px] text-ink-muted">Good morning,</div>
            <div className="text-[22px] font-extrabold tracking-[-0.02em]">Amaka</div>
          </div>
          <Tag tone="amber">Shift ends 15:00</Tag>
        </header>

        <main className="flex-1 space-y-4 px-5 pb-24 lg:grid lg:grid-cols-[1.4fr_1fr] lg:items-start lg:gap-5 lg:space-y-0">
          {/* Incoming referrals */}
          <div className="rounded-[20px] bg-slate p-4 text-white">
            <div className="mb-3 flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-sm font-bold">
                <span className="h-2.5 w-2.5 rounded-full bg-brand-accent" />
                Incoming referrals
              </span>
              <span className="rounded-full bg-brand-accent px-2.5 py-0.5 font-mono text-xs font-bold text-brand">
                2
              </span>
            </div>
            <div className="space-y-2.5">
              <ReferralRow
                name="Ibrahim Musa · 34 · M"
                reason="Suspected severe malaria — needs admission"
                from="From Alafia CHC · 12 min ago"
                status="Arrived"
                arrived
                onClick={() => navigate('/referrals/track')}
              />
              <ReferralRow
                name="Grace Eze · 28 · F"
                reason="Obstructed labour — referred for C-section"
                from="From Alafia CHC · just now"
                status="New · Seen"
                onClick={() => navigate('/referrals/track')}
              />
            </div>
          </div>

          <div className="space-y-4">
          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-3">
            <QuickAction
              label="New patient"
              icon="+"
              primary
              tall
              onClick={() => navigate('/patients/new')}
            />
            <QuickAction
              label="Find patient"
              icon="⌕"
              tall
              onClick={() => navigate('/patients/search')}
            />
            <QuickAction
              label="Register books"
              icon="▤"
              onClick={() => navigate('/registers/malaria')}
            />
            <QuickAction
              label="This month"
              icon="▧"
              onClick={() => navigate('/reports/month')}
            />
          </div>

          {/* Today */}
          <div className="flex gap-6 px-1 pt-1">
            <Stat value="18" label="Seen today" />
            <Stat value="5" label="Waiting" />
            <Stat value="4" label="To sync" tone="amber" />
          </div>
          </div>
        </main>
      </div>
    </div>
  );
};
