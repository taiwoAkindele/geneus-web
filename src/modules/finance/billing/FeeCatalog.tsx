import { StaffVerification, useAuthorizationContext } from '@/session';
import { staffSessionToken } from '@/lib/api/staffSession';
import { useRef, useState } from 'react';
import type { FeeCategory, FeeItem } from '@shared';
import { setFeeItemActive } from '@/data/repos/billing';
import { ActionMenu, TextField, useToast } from '@/ui';
import { userMessage } from '@/lib/api/userMessage';
import { CATEGORY_LABELS } from './feeForm';
import { FilterChip, displayMoney } from './billingUi';

/** Short label for when a price is charged. */
const CHARGED: Record<FeeItem['chargeWhen'], string> = {
  when_ordered: 'When selected',
  every_visit: 'Every visit',
  first_visit: 'First visit',
};

type Status = 'active' | 'retired' | 'all';

const STATUS_LABELS: Record<Status, string> = {
  active: 'Active',
  retired: 'Retired',
  all: 'All',
};

/**
 * Finance → Prices: one line per item, matching the Bills and Payment history tables. Clicking a row edits it
 * (price managers); the ⋯ menu holds charging rules, copying the Item ID and retiring. Data and permissions are unchanged.
 */
export const FeeCatalog = ({
  fees,
  onEdit,
  onPolicy,
  onChanged,
}: {
  fees: readonly FeeItem[];
  onEdit: (fee: FeeItem) => void;
  onPolicy: (fee: FeeItem) => void;
  onChanged: () => void;
}) => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Status>('active');
  const [category, setCategory] = useState<FeeCategory | ''>('');
  const [busyId, setBusyId] = useState<string>();
  const [needsSession, setNeedsSession] = useState(false);
  const lock = useRef(false);
  const canManage = context.permissions.includes('fee_item:manage');

  const term = search.trim().toLowerCase();
  const matchesStatus = (fee: FeeItem, s: Status) => s === 'all' || fee.active === (s === 'active');

  const searched = fees.filter(
    (fee) =>
      !term ||
      `${fee.name} ${fee.description ?? ''} ${CATEGORY_LABELS[fee.category]}`
        .toLowerCase()
        .includes(term),
  );

  const inStatus = searched.filter((fee) => matchesStatus(fee, status));

  const rows = inStatus
    .filter((fee) => !category || fee.category === category)
    .sort((a, b) => a.name.localeCompare(b.name));

  const categories = [...new Set(inStatus.map((fee) => fee.category))].sort((a, b) =>
    CATEGORY_LABELS[a].localeCompare(CATEGORY_LABELS[b]),
  );

  const toggle = async (fee: FeeItem) => {
    if (!staffSessionToken(context)) {
      setNeedsSession(true);

      return;
    }

    if (lock.current) {
      return;
    }

    lock.current = true;
    setBusyId(fee.id);

    try {
      await setFeeItemActive(fee.id, !fee.active, context);
      toast(
        fee.active
          ? `${fee.name} retired. Existing bills keep their prices.`
          : `${fee.name} restored.`,
      );

      onChanged();
    } catch (cause) {
      toast(userMessage(cause, 'This price could not be changed. Try again.'), { tone: 'error' });
    } finally {
      lock.current = false;
      setBusyId(undefined);
    }
  };

  const copyId = (fee: FeeItem) => {
    void navigator.clipboard?.writeText(fee.id).then(
      () => toast('Item ID copied'),
      () => toast(`Couldn't copy. The Item ID is ${fee.id}`, { tone: 'error' }),
    );
  };

  const menu = (fee: FeeItem) => (
    <span onClick={(e) => e.stopPropagation()}>
      <ActionMenu
        compact
        label={`More actions for ${fee.name}`}
        title={fee.name}
        actions={[
          ...(canManage
            ? [
                { label: 'Edit', onSelect: () => onEdit(fee) },
                { label: 'Charging & exemptions', onSelect: () => onPolicy(fee) },
              ]
            : []),
          { label: 'Copy item ID', onSelect: () => copyId(fee) },
          ...(canManage && !busyId
            ? [{ label: fee.active ? 'Retire' : 'Restore', onSelect: () => void toggle(fee) }]
            : []),
        ]}
      />
    </span>
  );

  const charged = (fee: FeeItem) => (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span>{CHARGED[fee.chargeWhen]}</span>
      {fee.exemptions.length ? (
        <span
          title={`Free when: ${fee.exemptions.map((r) => r.reason).join('; ')}`}
          className="rounded-full bg-brand-tint px-2 py-0.5 text-xs font-bold text-brand"
        >
          Exemptions
        </span>
      ) : null}
    </span>
  );

  const retiredTag = (fee: FeeItem) =>
    fee.active ? null : (
      <span className="ml-2 rounded-full border border-outline px-2 py-0.5 text-xs font-bold text-ink-muted">
        Retired
      </span>
    );

  return (
    <section className="space-y-4" aria-label="Prices">
      {needsSession ? (
        <StaffVerification requireServerSession purpose="Retiring or restoring a price" />
      ) : null}
      <div className="space-y-3">
        <div className="max-w-xl">
          <TextField
            label="Find an item"
            type="search"
            placeholder="Name, description or category"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['active', 'retired', 'all'] as const).map((s) => (
            <FilterChip
              key={s}
              selected={status === s}
              count={searched.filter((fee) => matchesStatus(fee, s)).length}
              onClick={() => {
                setStatus(s);
                setCategory('');
              }}
            >
              {STATUS_LABELS[s]}
            </FilterChip>
          ))}
          {categories.length > 1 ? (
            <>
              <span aria-hidden className="mx-1 h-6 w-px bg-outline-soft" />
              <FilterChip selected={!category} onClick={() => setCategory('')}>
                All categories
              </FilterChip>
              {categories.map((c) => (
                <FilterChip
                  key={c}
                  selected={category === c}
                  count={inStatus.filter((fee) => fee.category === c).length}
                  onClick={() => setCategory(c)}
                >
                  {CATEGORY_LABELS[c]}
                </FilterChip>
              ))}
            </>
          ) : null}
        </div>
      </div>

      {!rows.length ? (
        <p className="rounded-card border border-dashed border-outline p-5 text-sm text-ink-soft">
          {fees.length
            ? 'No items match. Change the search or filters.'
            : 'No prices yet. Upload a price list or add items one at a time.'}
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-card border border-outline-soft bg-white lg:block">
            <table className="w-full text-left text-sm tabular-nums">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-ink-muted">
                  {['Item', 'Category', 'Price', 'Charged', ''].map((h, i) => (
                    <th key={i} className={`px-4 py-3 font-bold ${i === 2 ? 'text-right' : ''}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((fee) => (
                  <tr
                    key={fee.id}
                    onClick={canManage ? () => onEdit(fee) : undefined}
                    className={`border-t border-outline-soft align-middle ${canManage ? 'cursor-pointer hover:bg-brand-wash' : ''} ${fee.active ? '' : 'text-ink-muted'}`}
                  >
                    <td className="px-4 py-3">
                      {canManage ? (
                        <button
                          type="button"
                          className="text-left font-bold hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEdit(fee);
                          }}
                        >
                          {fee.name}
                        </button>
                      ) : (
                        <span className="font-bold">{fee.name}</span>
                      )}
                      {retiredTag(fee)}
                      {fee.description ? (
                        <p className="text-xs text-ink-muted">{fee.description}</p>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{CATEGORY_LABELS[fee.category]}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                      {displayMoney(fee.amountMinor, fee.currency)}
                    </td>
                    <td className="px-4 py-3">{charged(fee)}</td>
                    <td className="w-12 px-2 py-2 text-right">{menu(fee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-2 lg:hidden">
            {rows.map((fee) => (
              <article
                key={fee.id}
                onClick={canManage ? () => onEdit(fee) : undefined}
                className={`flex items-start gap-3 rounded-card border border-outline-soft bg-white p-4 ${canManage ? 'cursor-pointer' : ''} ${fee.active ? '' : 'text-ink-muted'}`}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <strong className="min-w-0">
                      {fee.name}
                      {retiredTag(fee)}
                    </strong>
                    <span className="font-extrabold tabular-nums">
                      {displayMoney(fee.amountMinor, fee.currency)}
                    </span>
                  </div>
                  {fee.description ? (
                    <p className="text-xs text-ink-muted">{fee.description}</p>
                  ) : null}
                  <p className="text-xs text-ink-muted">
                    {CATEGORY_LABELS[fee.category]} · {charged(fee)}
                  </p>
                </div>
                {menu(fee)}
              </article>
            ))}
          </div>
          <p className="text-sm text-ink-muted">
            {rows.length} {rows.length === 1 ? 'item' : 'items'}
          </p>
        </>
      )}
    </section>
  );
};
