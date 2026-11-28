import { useState } from 'react';
import type { FeeItem } from '@shared';
import { Button, SelectField, TextField } from '@/ui';
import { formatMoney } from '@/lib/money';
import type { MedicineChoice, MedicineReview } from './stockImport';

const LABELS = {
  ready: 'Ready',
  existing: 'Already in Geneus',
  match: 'Possible match',
  fix: 'Needs fixing',
};
const PAGE_SIZE = 25;
type Filter = 'attention' | 'all' | 'ready' | 'existing';

const PriceEditor = ({
  row,
  choice,
  fees,
  currency,
  onChange,
}: {
  row: MedicineReview;
  choice: MedicineChoice;
  fees: readonly FeeItem[];
  currency: string;
  onChange: (choice: MedicineChoice) => void;
}) => {
  const [search, setSearch] = useState('');
  const [draftPrice, setDraftPrice] = useState(choice.price ?? row.price);
  const selected = fees.find((fee) => fee.id === choice.feeId);
  const term = search.trim().toLowerCase();
  const matches = term
    ? fees.filter((fee) => fee.name.toLowerCase().includes(term)).slice(0, 20)
    : [];
  const candidates = new Map<string, FeeItem>();

  for (const fee of [...(row.suggestedFees ?? []), ...matches]) {
    candidates.set(fee.id, fee);
  }

  if (selected) {
    candidates.set(selected.id, selected);
  }

  return (
    <div className="mt-3 space-y-3 rounded-field bg-surface-muted p-3">
      <TextField
        label={`Price per ${row.unit} (${currency})`}
        inputMode="decimal"
        value={draftPrice}
        onChange={(event) => setDraftPrice(event.target.value)}
      />
      <Button
        variant="outlined"
        fullWidth={false}
        onClick={() =>
          onChange({
            ...choice,
            price: draftPrice,
            feeId: '',
            reviewedAmount: undefined,
            keepCurrent: undefined,
          })
        }
      >
        Use entered amount for a new price
      </Button>
      <TextField
        label="Find an existing Pharmacy price"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <SelectField
        label="Billing price"
        value={choice.feeId || 'review'}
        options={[
          { value: 'review', label: 'Choose a price action' },
          ...Array.from(candidates.values(), (fee) => ({
            value: fee.id,
            label: `${fee.name} · ${formatMoney(fee.amountMinor, fee.currency)}`,
          })),
        ]}
        onChange={(event) => {
          const candidate = candidates.get(event.target.value);
          onChange({
            ...choice,
            feeId: candidate?.id,
            reviewedAmount: candidate?.amountMinor,
            keepCurrent: undefined,
          });
        }}
      />
      {selected ? (
        <p className="text-sm text-ink-soft">
          Confirm that the selected amount applies to one {row.unit}.
        </p>
      ) : null}
      {selected && row.status === 'fix' && row.priceIssue === 'conflict' ? (
        <Button
          variant="outlined"
          fullWidth={false}
          onClick={() =>
            onChange({
              ...choice,
              reviewedAmount: selected.amountMinor,
              keepCurrent: selected.amountMinor,
            })
          }
        >
          Use current price of {formatMoney(selected.amountMinor, selected.currency)}
        </Button>
      ) : null}
      {search && !matches.length ? (
        <p role="status" className="text-sm">
          No eligible prices found.
        </p>
      ) : null}
    </div>
  );
};

export const MedicineImportReview = ({
  rows,
  choices,
  fees,
  currency,
  onChoice,
}: {
  rows: readonly MedicineReview[];
  choices: Readonly<Record<number, MedicineChoice>>;
  fees: readonly FeeItem[];
  currency: string;
  onChoice: (line: number, choice: MedicineChoice) => void;
}) => {
  const [filter, setFilter] = useState<Filter>(() =>
    rows.some((row) => row.status === 'fix' || row.status === 'match') ? 'attention' : 'all',
  );
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<number>();
  const ready = rows.filter((row) => row.status === 'ready');
  const existing = rows.filter((row) => row.status === 'existing');
  const attention = rows.filter((row) => row.status === 'fix' || row.status === 'match');
  const lists = { all: [...attention, ...ready, ...existing], attention, ready, existing };
  const filtered = lists[filter];
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1));
  const start = currentPage * PAGE_SIZE;
  const filters: { value: Filter; label: string }[] = [
    { value: 'attention', label: 'Needs you' },
    { value: 'all', label: 'All' },
    { value: 'ready', label: 'Ready' },
    { value: 'existing', label: 'Already in Geneus' },
  ];

  return (
    <section className="space-y-3" aria-label="Medicine spreadsheet review">
      <p className="font-bold" role="status">
        {ready.length} ready · {existing.length} already in Geneus · {attention.length} need
        attention
      </p>
      <div
        aria-hidden="true"
        className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-surface-container"
      >
        {ready.length ? <span className="bg-brand" style={{ flex: ready.length }} /> : null}
        {existing.length ? <span className="bg-outline" style={{ flex: existing.length }} /> : null}
        {attention.length ? (
          <span className="bg-danger" style={{ flex: attention.length }} />
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Filter rows">
        {filters.map(({ value, label }) => (
          <Button
            key={value}
            variant={filter === value ? 'primary' : 'outlined'}
            fullWidth={false}
            aria-pressed={filter === value}
            onClick={() => {
              setFilter(value);
              setPage(0);
            }}
          >
            {label} {lists[value].length}
          </Button>
        ))}
      </div>
      {!filtered.length ? (
        <p className="text-sm text-ink-soft">
          No rows in this view. Choose All to review the file.
        </p>
      ) : null}
      {filtered.slice(start, start + PAGE_SIZE).map((row) => {
        const choice = choices[row.line] ?? {};
        const changing = (next: MedicineChoice) => onChoice(row.line, next);
        const price = row.status === 'ready' ? row.billing : undefined;

        return (
          <article className="space-y-2 border-t border-outline-soft py-3" key={row.line}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <strong>
                Row {row.line} · {row.name || 'Unnamed medicine'}
              </strong>
              <span className="rounded-field bg-surface-container px-2 py-1 text-xs font-bold">
                {LABELS[row.status]}
              </span>
            </div>
            <p className="text-sm text-ink-soft">
              {row.unit || 'Unit missing'} · Opening quantity {row.quantity || '0'} · Reorder level{' '}
              {row.reorderLevel || '0'}
            </p>
            {row.status === 'ready' ? null : <p className="text-sm">{row.message}</p>}
            {row.status === 'match' ? (
              <div className="space-y-2">
                <ul className="text-sm text-ink-soft">
                  {row.candidates.map((item) => (
                    <li key={item.id}>
                      {item.name} · {item.unitOfMeasure ?? 'No unit recorded'}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outlined"
                    fullWidth={false}
                    onClick={() => changing({ ...choice, stock: 'skip' })}
                  >
                    Same medicine, skip
                  </Button>
                  <Button
                    variant="outlined"
                    fullWidth={false}
                    disabled={!row.unit}
                    onClick={() => changing({ ...choice, stock: 'distinct' })}
                  >
                    Import as a different unit
                  </Button>
                </div>
              </div>
            ) : null}
            {choice.stock === 'skip' ? (
              <Button
                variant="ghost"
                fullWidth={false}
                onClick={() => changing({ ...choice, stock: undefined })}
              >
                Review match again
              </Button>
            ) : null}
            {price ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>
                  {price.kind === 'existing'
                    ? `Use ${price.fee.name} · ${formatMoney(price.fee.amountMinor, currency)}`
                    : `New price · ${formatMoney(price.amountMinor, currency)} per ${row.unit}`}
                </span>
                <Button
                  variant="ghost"
                  fullWidth={false}
                  onClick={() => setEditing(editing === row.line ? undefined : row.line)}
                >
                  {editing === row.line ? 'Close price options' : 'Change price choice'}
                </Button>
              </div>
            ) : null}
            {(row.status === 'fix' && row.priceIssue) ||
            (row.status === 'ready' && editing === row.line) ? (
              <PriceEditor
                row={row}
                choice={choice}
                fees={fees}
                currency={currency}
                onChange={changing}
              />
            ) : null}
          </article>
        );
      })}
      {filtered.length > PAGE_SIZE ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outlined"
            fullWidth={false}
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous
          </Button>
          <span className="text-sm">
            {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <Button
            variant="outlined"
            fullWidth={false}
            disabled={start + PAGE_SIZE >= filtered.length}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </section>
  );
};
