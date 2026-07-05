import { useNavigate } from 'react-router-dom';
import { AppBar, Avatar, PatientIdToken, StatusPill } from '@/ui';

const MATCHES = [
  { initials: 'AO', name: 'Amaka Okoro', detail: 'F · 32 · Odo-Ona area', id: 'OOE-PHC-000047-K2', last: 'Last: 12 Jun' },
  { initials: 'AE', name: 'Amaka Eze', detail: 'F · 29 · Ring Road', id: 'OOE-PHC-000112-R7', last: 'Last: 3 May' },
];

/** 4.2 Patient search — find a returning patient in seconds. */
export const PatientSearchScreen = () => {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <AppBar title="Find patient" onBack={() => navigate(-1)} right={<StatusPill status="synced" />} />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-2 md:max-w-lg">
        {/* Search */}
        <div className="flex items-center gap-2.5 rounded-[14px] border-2 border-brand bg-white px-4 py-3.5">
          <span className="text-ink-muted">⌕</span>
          <input
            className="min-h-0 flex-1 border-0 p-0 text-base text-ink outline-none placeholder:text-ink-muted"
            placeholder="Name, phone, or Patient ID"
            aria-label="Search patients"
          />
          <span className="font-mono text-xs font-semibold text-brand-strong">Scan ID</span>
        </div>
        <p className="mt-2.5 text-xs text-ink-muted">Search by name, phone, or Patient ID</p>

        <div className="mt-5 text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">
          2 matches
        </div>
        <div className="mt-3 space-y-2.5">
          {MATCHES.map((m) => (
            <button
              key={m.id}
              type="button"
              className="w-full rounded-card border border-outline-soft bg-white p-4 text-left"
            >
              <div className="flex items-center gap-3">
                <Avatar tone="green">{m.initials}</Avatar>
                <div className="flex-1">
                  <div className="text-base font-bold">{m.name}</div>
                  <div className="text-[13px] text-ink-muted">{m.detail}</div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <PatientIdToken id={m.id} variant="inline" />
                <span className="text-xs text-ink-muted">{m.last}</span>
              </div>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => navigate('/patients/new')}
          className="mt-auto rounded-[14px] border-[1.5px] border-dashed border-outline p-3.5 text-center text-[15px] font-bold text-brand"
        >
          + Not here — register new patient
        </button>
      </div>
    </div>
  );
};
