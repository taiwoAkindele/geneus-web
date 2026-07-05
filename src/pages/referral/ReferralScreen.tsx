import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppBar, Button, Icon, StatusPill, Tag, useToast } from '@/ui';

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

// ---- Desktop inbox data ----
type Referral = {
  id: string;
  name: string;
  status: 'Arrived' | 'Seen' | 'Closed';
  summary: string;
  from: string;
  fromId: string;
  reason: string;
  allergy: string;
  meds: string;
  doneCount: number;
};

const REFERRALS: Referral[] = [
  {
    id: 'r1',
    name: 'Ibrahim Musa · 34 M',
    status: 'Arrived',
    summary: 'Suspected severe malaria',
    from: 'Alafia CHC · 12 min ago',
    fromId: 'ALF-CHC-000231-T4',
    reason: 'Suspected severe malaria — needs admission',
    allergy: 'Sulfa drugs',
    meds: 'Artemether-Lumefantrine (started today)',
    doneCount: 3,
  },
  {
    id: 'r2',
    name: 'Grace Eze · 28 F',
    status: 'Seen',
    summary: 'Obstructed labour — C-section',
    from: 'Alafia CHC · just now',
    fromId: 'ALF-CHC-000232-Q1',
    reason: 'Obstructed labour — referred for C-section',
    allergy: 'None known',
    meds: 'IV fluids started',
    doneCount: 2,
  },
  {
    id: 'r3',
    name: 'Yusuf Bala · 51 M',
    status: 'Closed',
    summary: 'Hypertensive crisis',
    from: 'Ojoo PHC · yesterday',
    fromId: 'OJO-PHC-000188-D8',
    reason: 'Hypertensive crisis — BP 210/130',
    allergy: 'None known',
    meds: 'Amlodipine, Lisinopril',
    doneCount: 4,
  },
];

const LIFECYCLE = [
  { title: 'Sent', sub: 'Alert delivered' },
  { title: 'Seen', sub: 'Opened here · 11:20' },
  { title: 'Arrived', sub: 'Matched by Patient ID' },
  { title: 'Closed', sub: 'Care handed over' },
];

const STATUS_TONE = { Arrived: 'green', Seen: 'amber', Closed: 'neutral' } as const;

/**
 * 4.9 Refer & track. Phone: a single referral's Tier-1 details + lifecycle.
 * Desktop (responsive pattern D): a triage inbox — the queue on the left, the
 * selected referral's details and lifecycle on the right (master–detail).
 */
export const ReferralScreen = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState('r1');
  const selected = REFERRALS.find((r) => r.id === selectedId) ?? REFERRALS[0];

  const refer = () => {
    toast('Referral sent · note printed');
    navigate('/home');
  };

  return (
    <>
      {/* ---- Phone / tablet: single referral tracker ---- */}
      <div className="flex min-h-screen flex-col bg-surface lg:hidden">
        <AppBar title="Referral" onBack={() => navigate(-1)} right={<StatusPill status="offline" />} />
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col md:max-w-lg">
          <div className="flex-1 space-y-4 px-5 py-3">
            <div className="rounded-card border border-outline-soft bg-white p-4">
              <div className="text-xs text-ink-muted">Refer Ibrahim Musa · 34 · M · to</div>
              <div className="mt-0.5 text-base font-bold">Adeoyo General Hospital</div>
              <div className="mt-0.5 text-[13px] font-semibold text-brand">
                Suspected severe malaria — needs admission
              </div>
            </div>

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

            <div className="rounded-card border border-outline-soft bg-white p-4 pb-1">
              {STEPS.map((s, i) => (
                <TimelineStep key={s.title} {...s} last={i === STEPS.length - 1} />
              ))}
            </div>
          </div>

          <footer className="flex gap-2.5 px-5 pb-6 pt-4">
            <button
              type="button"
              className="flex w-14 flex-none items-center justify-center rounded-field border-[1.5px] border-outline bg-white text-ink-soft"
              aria-label="Print referral note"
            >
              <Icon name="print" className="h-6 w-6" />
            </button>
            <Button variant="primary" onClick={refer}>
              Refer &amp; print note
            </Button>
          </footer>
        </div>
      </div>

      {/* ---- Desktop: referral inbox (master–detail) ---- */}
      <div className="hidden min-h-screen bg-surface lg:flex">
        {/* Master queue */}
        <div className="flex w-[320px] flex-none flex-col border-r border-outline-soft bg-[#fbfcfc]">
          <div className="flex items-center justify-between px-5 pb-3 pt-5">
            <span className="text-xl font-extrabold tracking-[-0.02em]">Incoming</span>
            <Tag tone="green">2 new</Tag>
          </div>
          <div className="flex flex-col gap-2 px-3">
            {REFERRALS.map((r) => {
              const active = r.id === selectedId;
              const closed = r.status === 'Closed';
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={`rounded-[14px] p-3.5 text-left ${
                    active
                      ? 'bg-slate text-white'
                      : `border border-outline-soft bg-white ${closed ? 'opacity-70' : ''}`
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[15px] font-bold">{r.name}</span>
                    <Tag tone={STATUS_TONE[r.status]}>{r.status}</Tag>
                  </div>
                  <div className={`mt-1.5 text-[13px] ${active ? 'text-white/80' : 'text-ink-muted'}`}>
                    {r.summary}
                  </div>
                  <div className={`mt-2 text-xs ${active ? 'text-white/60' : 'text-ink-muted'}`}>
                    {r.from}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Detail */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="bg-brand px-7 py-5 text-white">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="truncate text-[22px] font-extrabold tracking-[-0.02em]">
                  {selected.name}
                </div>
                <div className="mt-0.5 font-mono text-xs text-brand-accent-soft">
                  from {selected.from.split(' · ')[0]} · {selected.fromId}
                </div>
              </div>
              <button
                type="button"
                className="flex-none rounded-[11px] bg-brand-accent-soft px-4 py-2.5 text-sm font-bold text-brand"
              >
                Match &amp; admit
              </button>
            </div>
          </div>

          <div className="grid flex-1 grid-cols-[1.2fr_1fr] gap-5 p-7">
            {/* Tier-1 info */}
            <div>
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">
                Travels with the referral
              </div>
              <div className="overflow-hidden rounded-card border border-outline-soft bg-white">
                <div className="border-b border-outline-soft p-4">
                  <div className="text-xs text-ink-muted">Reason for referral</div>
                  <div className="mt-1 text-[15px] font-semibold text-brand">{selected.reason}</div>
                </div>
                <div className="border-b border-outline-soft p-4">
                  <div className="text-xs text-ink-muted">Known allergies</div>
                  <div className="mt-1">
                    <Tag tone="danger">{selected.allergy}</Tag>
                  </div>
                </div>
                <div className="p-4">
                  <div className="text-xs text-ink-muted">Current medications</div>
                  <div className="mt-1 text-[15px]">{selected.meds}</div>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-ink-muted">
                Full history &amp; sensitive categories are not shared automatically in V1 —
                request-based access is planned.
              </p>
            </div>

            {/* Lifecycle */}
            <div>
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">
                Lifecycle
              </div>
              <div className="rounded-card border border-outline-soft bg-white p-4 pb-1">
                {LIFECYCLE.map((s, i) => (
                  <TimelineStep
                    key={s.title}
                    title={s.title}
                    sub={s.sub}
                    done={i < selected.doneCount}
                    last={i === LIFECYCLE.length - 1}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
