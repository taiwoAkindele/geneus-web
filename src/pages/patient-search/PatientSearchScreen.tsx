import { useNavigate } from 'react-router-dom';
import { Avatar, Button, Icon, PatientIdToken } from '@/ui';

type AvatarTone = 'green' | 'slate' | 'amber' | 'mint';
type PatientCard = {
  initials: string;
  tone: AvatarTone;
  name: string;
  sub: string;
  id: string;
  last: string;
  unknown?: boolean;
};

// Registered patients on the device. Registration lives in the front-desk flow;
// this screen picks up once a patient exists and links them to a new encounter.
const PATIENTS: PatientCard[] = [
  { initials: 'AO', tone: 'green', name: 'Amaka Okoro', sub: 'F · 32 · Odo-Ona area', id: 'OOE-PHC-000047-K2', last: 'Last: 12 Jun' },
  { initials: 'IM', tone: 'slate', name: 'Ibrahim Musa', sub: 'M · 34 · Ring Road', id: 'OOE-PHC-000231-T4', last: 'Last: 5 Jul' },
  { initials: '?', tone: 'amber', name: 'Unknown · brought in', sub: 'Est. 60s · M', id: 'OOE-PHC-000402-X9', last: 'Today', unknown: true },
  { initials: 'GE', tone: 'green', name: 'Grace Eze', sub: 'F · 28 · Alafia', id: 'OOE-PHC-000112-R7', last: 'Last: 3 May' },
];

/** Patients — find a registered patient, open their profile, or add an unknown one (PRD §9.8.1). */
export const PatientSearchScreen = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-surface">
      <div className="w-full px-5 py-4 md:px-8">
        {/* Header — title and actions share a line, wrapping on narrow phones. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Back"
              onClick={() => navigate('/home')}
              className="-ml-2 flex h-10 w-10 min-h-0 flex-none items-center justify-center text-ink-soft"
            >
              <Icon name="back" className="h-6 w-6" />
            </button>
            <div>
              <div className="font-mono text-[12px] uppercase tracking-[0.16em] text-brand-strong">Patients</div>
              <h1 className="text-[24px] font-extrabold tracking-[-0.02em] md:text-[28px]">Find a patient</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Button variant="primary" fullWidth={false} className="px-4" onClick={() => navigate('/patients/new')}>
              ＋ Add patient
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="mt-4 flex items-center gap-2.5 rounded-[14px] border-[1.5px] border-outline bg-white px-4 py-3.5">
          <Icon name="search" className="h-5 w-5 text-ink-muted" />
          <input
            className="min-h-0 flex-1 border-0 p-0 text-base text-ink outline-none placeholder:text-ink-muted"
            placeholder="Search by name, phone or Patient ID…"
            aria-label="Search patients"
          />
        </div>

        <div className="mt-5 text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">Registered patients</div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PATIENTS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => navigate('/patients/profile')}
              className="w-full rounded-card border border-outline-soft bg-white p-4 text-left"
            >
              <div className="flex items-center gap-3">
                <Avatar tone={p.tone}>{p.initials}</Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-bold">{p.name}</div>
                  <div className="text-[13px] text-ink-muted">{p.sub}</div>
                </div>
                {p.unknown ? (
                  <span className="rounded-full bg-amber-bg px-2 py-1 text-[10px] font-bold text-amber-text">Unconfirmed</span>
                ) : null}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <PatientIdToken id={p.id} variant="inline" />
                <span className="text-xs text-ink-muted">{p.last}</span>
              </div>
            </button>
          ))}
        </div>

        <p className="mt-5 max-w-[66ch] pb-24 text-xs leading-relaxed text-ink-muted">
          Tap a patient card to open their profile — full details and every encounter on record. This flow picks up
          once a patient exists and links them to a new encounter.
        </p>
      </div>
    </div>
  );
};
