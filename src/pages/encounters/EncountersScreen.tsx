import { useNavigate } from 'react-router-dom';
import { Avatar, Button, Icon, Tag, useToast } from '@/ui';
import type { EncounterInit } from '@/features/encounter';

type EncPatient = { id: string; name: string; initials: string; allergy: string; unknown?: boolean };
type EncCard = {
  patient: EncPatient;
  encId: string;
  when: string;
  status: 'Open' | 'Closed' | 'Admitted';
  summary: string;
  chips: string[];
  init: EncounterInit;
};

// In-progress encounters anyone on shift can pick up and continue.
const IN_PROGRESS: EncCard[] = [
  {
    patient: { id: 'OOE-PHC-000047-K2', name: 'Amaka Okoro', initials: 'AO', allergy: 'Penicillin' },
    encId: 'OOE-ENC-000318', when: 'Started 09:08', status: 'Open', summary: 'Malaria — awaiting lab results',
    chips: ['38.9°C', '2 tests'], init: { encId: 'OOE-ENC-000318' },
  },
  {
    patient: { id: 'OOE-PHC-000051-B7', name: 'Ibrahim Musa', initials: 'IM', allergy: 'Sulfa drugs' },
    encId: 'OOE-ENC-000321', when: 'Started 10:24', status: 'Open', summary: 'Vitals taken — with the doctor',
    chips: ['37.2°C', '120/80'], init: { encId: 'OOE-ENC-000321' },
  },
];

const RECENT: EncCard[] = [
  {
    patient: { id: 'OOE-PHC-000052-Q4', name: 'Grace Eze', initials: 'GE', allergy: 'None on record' },
    encId: 'OOE-ENC-000309', when: '10 Jul 2026', status: 'Closed', summary: 'ANC 3rd visit — normal',
    chips: ['BP 110/70', 'Follow-up'], init: { encId: 'OOE-ENC-000309', date: '10 Jul 2026', closed: true },
  },
];

const TONE: Record<EncCard['status'], 'amber' | 'neutral' | 'slate'> = { Open: 'amber', Closed: 'neutral', Admitted: 'slate' };

const EncounterCard = ({ card, onOpen }: { card: EncCard; onOpen: () => void }) => (
  <button type="button" onClick={onOpen} className="w-full rounded-card border border-outline-soft bg-white p-4 text-left">
    <div className="flex items-center gap-3">
      <Avatar tone="green">{card.patient.initials}</Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-bold">{card.patient.name}</div>
        <div className="text-[13px] text-ink-muted">{card.summary}</div>
      </div>
      <Tag tone={TONE[card.status]}>{card.status}</Tag>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="font-mono text-[11px] text-ink-muted">{card.encId}</span>
      <span className="text-[11px] text-ink-muted">· {card.when}</span>
      <span className="flex-1" />
      {card.chips.map((c) => (
        <span key={c} className="rounded-md bg-surface-muted px-2 py-1 font-mono text-[11px] text-ink-soft">{c}</span>
      ))}
    </div>
  </button>
);

/** Encounters hub — resume an in-progress encounter or start a new one (PRD §9.8). */
export const EncountersScreen = () => {
  const navigate = useNavigate();
  const toast = useToast();

  const open = (card: EncCard) =>
    navigate('/encounters/record', { state: { patient: card.patient, init: card.init } });

  const createUnknown = () => {
    const patient: EncPatient = {
      id: 'OOE-PHC-000402-U9', name: 'Unknown patient', initials: '??', allergy: 'Unknown', unknown: true,
    };
    toast('Encounter opened for an unknown patient — details can be confirmed later');
    navigate('/encounters/record', { state: { patient } });
  };

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
              <div className="font-mono text-[12px] uppercase tracking-[0.16em] text-brand-strong">Encounters</div>
              <h1 className="text-[24px] font-extrabold tracking-[-0.02em] md:text-[28px]">Encounters</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Button variant="outlined" fullWidth={false} className="px-4" onClick={() => navigate('/appointments')}>
              Today's appointments
            </Button>
            <Button variant="primary" fullWidth={false} className="px-4" onClick={createUnknown}>
              ＋ Create unknown encounter
            </Button>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">In progress</span>
          <span className="font-mono text-xs text-ink-muted">{IN_PROGRESS.length} open</span>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {IN_PROGRESS.map((c) => (
            <EncounterCard key={c.encId} card={c} onOpen={() => open(c)} />
          ))}
        </div>

        <div className="mt-6 text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">Recently closed</div>
        <div className="mt-3 grid grid-cols-1 gap-3 pb-24 sm:grid-cols-2 lg:grid-cols-3">
          {RECENT.map((c) => (
            <EncounterCard key={c.encId} card={c} onOpen={() => open(c)} />
          ))}
        </div>
      </div>
    </div>
  );
};
