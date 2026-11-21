import type { ReactNode } from 'react';
import { currencyDigits } from '@/lib/money';

/** Billing screens show money with the currency symbol (₦20,500.00); each amount keeps its own currency. */
export const displayMoney = (amountMinor: number, currency: string): string =>
  new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(amountMinor / 10 ** currencyDigits(currency));

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
/** "09:41" today, "Yesterday", then "21 Nov 2026". */
export const whenText = (iso: string, now = new Date()): string => {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  if (dayKey(at) === dayKey(now)) return at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (dayKey(at) === dayKey(yesterday)) return 'Yesterday';
  return at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const TONES: Record<string, string> = {
  Unpaid: 'bg-amber-bg text-amber-text',
  'Part paid': 'bg-slate-bg text-slate-text',
  Paid: 'bg-brand-tint text-brand',
  Credit: 'border border-outline bg-white text-ink-soft',
  'Awaiting insurance': 'border border-dashed border-outline bg-white text-slate-text',
};
/** One word per state, the same on every billing screen. */
export const statusLabel = (status: string) => status === 'Paid / settled' ? 'Paid' : status;
export const BillStatus = ({ status }: { status: string }) => {
  const label = statusLabel(status);
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${TONES[label] ?? 'bg-surface-muted text-ink-soft'}`}>{label}</span>;
};

/** A filter chip with an optional count. */
export const FilterChip = ({ selected, count, onClick, children }: { selected: boolean; count?: number; onClick: () => void; children: ReactNode }) =>
  <button type="button" aria-pressed={selected} onClick={onClick}
    className={`inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-sm font-semibold ${selected ? 'bg-brand-tint text-brand' : 'border-[1.5px] border-outline bg-white text-ink-soft hover:text-ink'}`}>
    {children}{count !== undefined ? <span className={`text-xs ${selected ? 'text-brand' : 'text-ink-muted'}`}>{count}</span> : null}
  </button>;

/** Amber marker for a bill that has a billing question. */
export const QuestionFlag = ({ children = 'Needs a decision' }: { children?: ReactNode }) =>
  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-text"><span aria-hidden className="h-2 w-2 rounded-full bg-amber" />{children}</span>;

/** The page title row used by every billing destination. */
export const PageHeader = ({ title, children }: { title: string; children?: ReactNode }) =>
  <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-extrabold">{title}</h1>{children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}</header>;
