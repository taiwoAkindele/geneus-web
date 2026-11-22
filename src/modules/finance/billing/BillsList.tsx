import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, SelectField, TextField } from '@/ui';
import { calendarDate } from '@/lib/calendarDate';
import type { BillDocument } from './billDocuments';
import type { BillingQuestion } from './billingQuestions';
import type { BillingData } from './useBilling';
import {
  BillStatus,
  FilterChip,
  PageHeader,
  QuestionFlag,
  displayMoney,
  whenText,
} from './billingUi';

type Filter = 'due' | 'Unpaid' | 'Part paid' | 'Awaiting insurance' | 'Credit' | 'questions';

/** The patient's items in a few words: "Full blood count, Ceftriaxone +1". */
const itemSummary = (bill: BillDocument) => {
  const names = [...new Set(bill.rows.map((r) => r.charge.description))];
  return names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '');
};

/**
 * Bills with money still due. Paid bills leave this list (their payments are in Payment history)
 * but any bill, paid or not, is found by searching.
 */
export const BillsList = ({
  data,
  bills,
  questions,
  unplaced,
  canCreate,
  canSetUp,
  initialFilter,
  patientFilter,
  focusSearch,
  onNew,
  onOpen,
  onClearPatient,
  onReviewAll,
}: {
  data: BillingData;
  bills: readonly BillDocument[];
  questions: ReadonlyMap<string, BillingQuestion[]>;
  unplaced: number;
  canCreate: boolean;
  canSetUp: boolean;
  initialFilter?: Filter;
  patientFilter?: string;
  focusSearch?: boolean;
  onNew: () => void;
  onOpen: (id: string) => void;
  onClearPatient: () => void;
  onReviewAll: () => void;
}) => {
  const [filter, setFilter] = useState<Filter>(initialFilter ?? 'due');
  const [search, setSearch] = useState('');
  const [more, setMore] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [currencyChoice, setCurrency] = useState('');
  const searchBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusSearch) {
      searchBox.current?.querySelector('input')?.focus();
    }
  }, [focusSearch]);

  const name = (id: string) => data.patients.find((p) => p.patientId === id)?.fullName ?? id;
  const currencies = [...new Set(bills.map((b) => b.currency))].sort();
  const currency = currencies.includes(currencyChoice) ? currencyChoice : (currencies[0] ?? 'NGN');
  const term = search.trim().toLowerCase();
  const scoped = bills.filter(
    (b) =>
      b.currency === currency &&
      (!patientFilter || b.patientId === patientFilter) &&
      (!from || calendarDate(b.createdOn) >= from) &&
      (!to || calendarDate(b.createdOn) <= to),
  );
  const open = (b: BillDocument) => b.due > 0 || b.pending > 0 || b.credit > 0;
  const matches: Record<Filter, (b: BillDocument) => boolean> = {
    due: (b) => b.due > 0 || b.pending > 0,
    Unpaid: (b) => b.status === 'Unpaid',
    'Part paid': (b) => b.status === 'Part paid',
    'Awaiting insurance': (b) => b.status === 'Awaiting insurance',
    Credit: (b) => b.status === 'Credit',
    questions: (b) => questions.has(b.id),
  };
  const count = (f: Filter) =>
    scoped.filter((b) => (f === 'questions' || open(b)) && matches[f](b)).length;
  const visible = term
    ? scoped.filter((b) =>
        `${b.reference} ${name(b.patientId)} ${b.patientId} ${b.rows.map((r) => r.charge.description).join(' ')}`
          .toLowerCase()
          .includes(term),
      )
    : scoped.filter((b) => matches[filter](b));
  const totalDue = visible.reduce((n, b) => n + b.due, 0);
  const activeFees = data.fees.filter((f) => f.active).length;
  const chips: { value: Filter; label: string; always?: boolean }[] = [
    { value: 'due', label: 'All due', always: true },
    { value: 'Unpaid', label: 'Unpaid', always: true },
    { value: 'Part paid', label: 'Part paid', always: true },
    { value: 'Awaiting insurance', label: 'Awaiting insurance' },
    { value: 'Credit', label: 'Credit' },
    { value: 'questions', label: 'Needs a decision' },
  ];

  const renderEmptyMessage = () => {
    if (term) {
      return 'No bill matches that search.';
    }

    if (filter === 'due') {
      return 'No bills have money due.';
    }

    return 'No bills here.';
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Bills">
        {canCreate ? (
          <Button fullWidth={false} onClick={onNew}>
            New bill
          </Button>
        ) : null}
      </PageHeader>

      {canSetUp && !activeFees ? (
        <section className="overflow-hidden rounded-card border border-outline-soft bg-white">
          <div className="p-4">
            <h2 className="font-bold">Get ready to take payments</h2>
            <p className="text-sm text-ink-muted">Cash works as soon as the hospital has prices.</p>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-outline-soft px-4 py-3">
            <span>
              <strong className="block text-sm">Add prices</strong>
              <span className="text-xs text-ink-muted">
                Upload a price list or add items one at a time.
              </span>
            </span>
            <Link
              to="/billing/prices"
              className="inline-flex min-h-[40px] items-center rounded-field bg-brand px-4 text-sm font-bold text-white"
            >
              Add prices
            </Link>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-outline-soft px-4 py-3">
            <span>
              <strong className="block text-sm">
                Bank transfers <span className="font-normal text-ink-muted">(optional)</span>
              </strong>
              <span className="text-xs text-ink-muted">
                Connect a payment provider, then set up the hospital's account.
              </span>
            </span>
            <Link
              to="/settings/billing"
              className="inline-flex min-h-[40px] items-center rounded-field border-[1.5px] border-outline px-4 text-sm font-bold text-brand"
            >
              Set up
            </Link>
          </div>
        </section>
      ) : null}

      <div className="space-y-3">
        <div ref={searchBox} className="max-w-xl">
          <TextField
            label="Find a bill"
            type="search"
            placeholder="Patient name, ID, bill number or item"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {term ? (
          <p className="text-sm text-ink-muted">
            Showing every bill that matches, including paid ones.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {chips
              .filter((c) => c.always || count(c.value) > 0 || filter === c.value)
              .map((c) => (
                <FilterChip
                  key={c.value}
                  selected={filter === c.value}
                  count={count(c.value)}
                  onClick={() => setFilter(c.value)}
                >
                  {c.value === 'questions' ? <QuestionFlag>{c.label}</QuestionFlag> : c.label}
                </FilterChip>
              ))}
            <span className="flex-1" />
            <FilterChip selected={more || Boolean(from || to)} onClick={() => setMore((v) => !v)}>
              More filters
            </FilterChip>
          </div>
        )}
        {more ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField
              label="Raised from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <TextField
              label="Raised to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            {currencies.length > 1 ? (
              <SelectField
                label="Currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                options={currencies.map((c) => ({ value: c, label: c }))}
              />
            ) : null}
          </div>
        ) : null}
        {from && to && from > to ? (
          <p role="alert" className="text-sm text-danger">
            The end date must be after the start date.
          </p>
        ) : null}
        {patientFilter ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>
              Bills for <strong>{name(patientFilter)}</strong>
            </span>
            <Button
              variant="ghost"
              fullWidth={false}
              className="!px-0 !py-2"
              onClick={onClearPatient}
            >
              Show all patients
            </Button>
          </div>
        ) : null}
        {filter === 'questions' && unplaced ? (
          <div className="flex flex-wrap items-center gap-3 rounded-field border border-amber-border bg-amber-bg p-3 text-sm text-amber-text">
            <span className="flex-1">
              {unplaced} billing {unplaced === 1 ? "question isn't" : "questions aren't"} on any
              bill yet.
            </span>
            <Button variant="outlined" fullWidth={false} onClick={onReviewAll}>
              Review
            </Button>
          </div>
        ) : null}
      </div>

      <div className="hidden overflow-x-auto rounded-card border border-outline-soft bg-white lg:block">
        <table className="w-full text-left text-sm tabular-nums">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-ink-muted">
              {['Patient', 'Bill', 'Raised', 'Total', 'Due', 'Status'].map((h, i) => (
                <th
                  key={h}
                  className={`px-4 py-3 font-bold ${i === 3 || i === 4 ? 'text-right' : ''}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((b) => (
              <tr
                key={b.id}
                onClick={() => onOpen(b.id)}
                className="cursor-pointer border-t border-outline-soft align-top hover:bg-brand-wash"
              >
                <td className="px-4 py-3">
                  <button
                    type="button"
                    className="text-left font-bold hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(b.id);
                    }}
                  >
                    {name(b.patientId)}
                  </button>
                  <p className="text-xs text-ink-muted">{b.patientId}</p>
                </td>
                <td className="px-4 py-3">
                  <span>{itemSummary(b)}</span>
                  {questions.has(b.id) ? (
                    <span className="ml-2">
                      <QuestionFlag />
                    </span>
                  ) : null}
                  <p className="font-mono text-xs text-ink-muted">{b.reference}</p>
                </td>
                <td className="whitespace-nowrap px-4 py-3">{whenText(b.createdOn)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {displayMoney(b.original, b.currency)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-extrabold">
                  {displayMoney(b.due, b.currency)}
                </td>
                <td className="px-4 py-3">
                  <BillStatus status={b.status} />
                </td>
              </tr>
            ))}
            {!visible.length ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-ink-muted">
                  {renderEmptyMessage()}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="space-y-2 lg:hidden">
        {visible.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => onOpen(b.id)}
            className="block w-full space-y-1 rounded-card border border-outline-soft bg-white p-4 text-left"
          >
            <span className="flex items-start justify-between gap-2">
              <strong>{name(b.patientId)}</strong>
              <BillStatus status={b.status} />
            </span>
            <span className="block text-sm text-ink-soft">
              {itemSummary(b)}
              {questions.has(b.id) ? (
                <span className="ml-2">
                  <QuestionFlag />
                </span>
              ) : null}
            </span>
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-ink-muted">
                {whenText(b.createdOn)} · {b.patientId}
              </span>
              <span className="font-extrabold tabular-nums">{displayMoney(b.due, b.currency)}</span>
            </span>
          </button>
        ))}
        {!visible.length ? (
          <p className="rounded-card border border-dashed border-outline p-4 text-sm text-ink-muted">
            {term ? 'No bill matches that search.' : 'No bills have money due.'}
          </p>
        ) : null}
      </div>
      {visible.length ? (
        <p className="text-sm text-ink-muted">
          {visible.length} {visible.length === 1 ? 'bill' : 'bills'} ·{' '}
          {displayMoney(totalDue, currency)} due
        </p>
      ) : null}
    </div>
  );
};
