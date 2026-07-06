import { useNavigate } from 'react-router-dom';
import { AppBar, StatusPill, Tag } from '@/ui';

const UNASSIGNED = [
  { name: 'Amaka Okoro', reason: 'Malaria recovery review', when: '1 week · 14 Jul', from: 'From today’s encounter', isNew: true },
  { name: 'Yusuf Bala', reason: 'Hypertension review', when: '14 Jul 2026', from: 'Booked 28 Jun', isNew: false },
];

const BOOKED = [
  { name: 'Ngozi Umeh', reason: 'ANC · 3rd visit', time: '11:00' },
  { name: 'Segun Adio', reason: 'BP check', time: '11:40' },
];

/**
 * Appointments (PRD §9.8). A follow-up booked when an encounter is closed drops
 * into the unassigned list for its day; whichever doctor is free picks it up.
 * Each doctor also keeps their own booked list.
 */
export const AppointmentsScreen = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-surface">
      <AppBar title="Appointments" onBack={() => navigate('/patients/search')} right={<StatusPill status="synced" />} />
      <div className="mx-auto max-w-2xl px-5 py-2 lg:max-w-4xl">
        <div className="pb-1 font-mono text-[12px] uppercase tracking-[0.14em] text-brand-strong">Monday · 14 Jul 2026</div>
        <h1 className="mb-4 text-[22px] font-extrabold tracking-[-0.02em]">Appointments today</h1>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* Unassigned follow-ups */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">Follow-ups — unassigned</span>
              <Tag tone="amber">Any free doctor</Tag>
            </div>
            <div className="space-y-2.5">
              {UNASSIGNED.map((a, i) => (
                <div key={i} className={`rounded-card border bg-white p-4 ${a.isNew ? 'border-brand-accent shadow-card' : 'border-outline-soft'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-base font-bold text-ink">{a.name}</div>
                      <div className="text-[13px] text-ink-muted">{a.reason}</div>
                    </div>
                    {a.isNew ? <Tag tone="green">Just booked</Tag> : null}
                  </div>
                  <div className="mt-2 font-mono text-[11px] text-ink-muted">{a.when} · {a.from}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Doctor's booked list */}
          <section>
            <div className="mb-3 text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">Dr. Tunde Bello · booked</div>
            <div className="space-y-2.5">
              {BOOKED.map((a, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded-card border border-outline-soft bg-white p-3.5">
                  <div>
                    <div className="text-[15px] font-bold text-ink">{a.name}</div>
                    <div className="text-[13px] text-ink-muted">{a.reason}</div>
                  </div>
                  <Tag tone="neutral">{a.time}</Tag>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-ink-muted">
              A follow-up booked when an encounter is closed drops into the unassigned list for the chosen day. Whichever
              doctor is free that day picks it up.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
