import type { Patient } from '@shared';
import { Avatar, Tag } from '@/ui';
import type { EncounterSummary } from '../encounterSummary';

const TONE: Record<EncounterSummary['status'], 'amber' | 'neutral' | 'slate'> = { Open: 'amber', Closed: 'neutral', Admitted: 'slate' };

const initialsOf = (fullName: string): string =>
  fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

/** One encounter in a list — the hub's and a patient's history alike. */
export const EncounterCard = ({ card, patient, onOpen }: { card: EncounterSummary; patient?: Patient; onOpen: () => void }) => (
  <button type="button" onClick={onOpen} className="w-full rounded-card border border-outline-soft bg-white p-4 text-left">
    <div className="flex items-center gap-3">
      <Avatar tone="green">{patient ? initialsOf(patient.fullName) : '??'}</Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-bold">{patient?.fullName ?? card.patientId}</div>
        <div className="text-[13px] text-ink-muted">{card.title}</div>
      </div>
      <Tag tone={TONE[card.status]}>{card.status}</Tag>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="font-mono text-[11px] text-ink-muted">{card.label}</span>
      <span className="text-[11px] text-ink-muted">· {card.when}</span>
      <span className="flex-1" />
      {card.chips.map((c) => (
        <span key={c} className="rounded-md bg-surface-muted px-2 py-1 font-mono text-[11px] text-ink-soft">{c}</span>
      ))}
    </div>
  </button>
);
