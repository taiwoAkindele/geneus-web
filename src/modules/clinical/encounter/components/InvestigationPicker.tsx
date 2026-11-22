import { useCallback, useId, useRef, useState } from 'react';
import { manualBillCandidates, type FeeItem, type InvestigationItem } from '@shared';
import { useLiveQuery } from '@/data';
import { useAuthorizationContext } from '@/session';
import { loadInvestigationCatalogue, selectInvestigation } from '@/data/repos/investigations';
import { cataloguePage, chargesForPatient } from '@/data/repos/billing';
import { useBillingCatalogue } from '@/data/billingCatalogueSupport';
import { SelectField, TextField } from '@/ui';

type Option = { key: string; name: string; detail?: string; added: boolean; pick: () => void };

/**
 * Choosing laboratory tests, for clinicians: type in one search box, pick from the dropdown. Added tests are
 * compact chips. Which tests can be ordered, unlisted requests, specimen notes and the billing-review choice
 * for tests a manual bill may already cover are unchanged. Signing creates the orders and their charges.
 */
export const InvestigationPicker = ({
  items,
  onChange,
  patientId,
  encounterId,
}: {
  items: InvestigationItem[];
  onChange: (items: InvestigationItem[]) => void;
  patientId?: string;
  encounterId?: string;
}) => {
  const context = useAuthorizationContext();
  const expanded = useBillingCatalogue(context);
  const catalogue = useLiveQuery(useCallback(() => loadInvestigationCatalogue(), [expanded]));
  const bills = useLiveQuery(
    useCallback(
      () => (patientId ? chargesForPatient(patientId) : Promise.resolve([])),
      [patientId],
    ),
    ['charge'],
  );
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [noteFor, setNoteFor] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const tests = useLiveQuery(
    useCallback(
      () =>
        expanded
          ? cataloguePage({
              search: query,
              category: 'laboratory',
              page: 0,
              pageSize: 200,
              facilityId: context.facilityId,
            })
          : Promise.resolve(undefined),
      [expanded, query, context.facilityId],
    ),
    ['fee_item'],
  );
  const addFee = (fee: FeeItem) => {
    const configured = catalogue.data?.items.find((row) => row.central && row.fee.id === fee.id);
    const item = selectInvestigation(
      configured ?? { fee, central: true, definition: undefined, offering: undefined },
    );
    if (
      patientId &&
      manualBillCandidates(bills.data ?? [], patientId, fee.id, encounterId).length
    ) {
      item.billingReviewReason =
        'An existing manual bill may cover this investigation; billing review required';
    }
    return item;
  };
  const update = (id: string, patch: Partial<InvestigationItem>) =>
    onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const term = query.trim().toLowerCase();
  const done = (item: InvestigationItem) => {
    onChange([...items, item]);
    setQuery('');
    setActive(0);
    input.current?.focus();
  };
  const options: Option[] = [
    ...(catalogue.data?.items ?? [])
      .filter(
        (r) => !r.central && r.offering && (!term || r.offering.name.toLowerCase().includes(term)),
      )
      .map((r) => ({
        key: r.offering!.id,
        name: r.offering!.name,
        added: items.some((i) => i.offeringId === r.offering!.id),
        pick: () => done(selectInvestigation(r)),
      })),
    ...(tests.data?.items ?? [])
      .filter((f) => f.priceEvidenceVersion === 1)
      .map((f) => ({
        key: f.id,
        name: f.name,
        detail: f.description,
        added: items.some((i) => i.feeItemId === f.id),
        pick: () => done(addFee(f)),
      })),
  ];
  // Nothing matches: offer to send the typed name to the laboratory as an unlisted request.
  const custom: Option | undefined =
    term && !options.some((o) => o.name.toLowerCase() === term)
      ? {
          key: 'custom',
          name: `Request "${query.trim()}" by name`,
          detail: 'Not in the list; billing prices it separately',
          added: false,
          pick: () =>
            done({
              id: `order_item:${crypto.randomUUID()}`,
              name: query.trim(),
              custom: true,
              priority: 'routine',
            }),
        }
      : undefined;
  const shown = [...options, ...(custom ? [custom] : [])];
  const choose = (o?: Option) => {
    if (o && !o.added) {
      o.pick();
    }
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(shown.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      choose(shown[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };
  return (
    <div className="space-y-3">
      {!expanded && !(catalogue.data?.items ?? []).some((r) => !r.central) ? (
        <p className="rounded-field border border-amber-border bg-amber-bg p-3 text-sm text-amber-text">
          <strong>Tests can't be ordered from the price list yet.</strong> An administrator can
          check Settings → Devices. You can still request a test by typing its name.
        </p>
      ) : null}

      <div className="relative">
        <TextField
          ref={input}
          label="Add a test"
          type="search"
          placeholder="Search tests, e.g. culture, glucose, FBC"
          value={query}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && shown[active] ? `${listId}-${active}` : undefined}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKey}
        />
        {open ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute inset-x-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-field border border-outline-soft bg-white py-1 shadow-sheet"
          >
            {shown.map((o, i) => (
              <li
                key={o.key}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                aria-disabled={o.added}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(o);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 ${i === active ? 'bg-brand-wash' : ''} ${o.added ? 'cursor-default text-ink-muted' : ''}`}
              >
                <span className="min-w-0">
                  <span
                    className={`block ${o.key === 'custom' ? 'font-semibold text-brand' : 'font-semibold'}`}
                  >
                    {o.name}
                  </span>
                  {o.detail ? (
                    <span className="block text-xs text-ink-muted">{o.detail}</span>
                  ) : null}
                </span>
                {o.added ? <span className="text-xs font-bold text-brand">Added ✓</span> : null}
              </li>
            ))}
            {expanded && tests.loading && !tests.data ? (
              <li className="px-3 py-2 text-sm text-ink-muted">Reading tests…</li>
            ) : null}
            {!shown.length && !(expanded && tests.loading) ? (
              <li className="px-3 py-2 text-sm text-ink-muted">Type a test name to search.</li>
            ) : null}
          </ul>
        ) : null}
      </div>
      {catalogue.error || tests.error ? (
        <p role="alert" className="text-sm text-danger">
          The test list could not be read. Try again.
        </p>
      ) : null}

      {items.length ? (
        <div className="space-y-2" aria-label="Tests in this order">
          <div className="flex flex-wrap gap-2">
            {items.map((item) => (
              <span
                key={item.id}
                className="inline-flex items-center gap-1 rounded-full bg-brand-tint py-1 pl-3 pr-1 text-sm font-semibold text-brand"
              >
                {item.name}
                {item.specimen ? <span className="font-normal"> · {item.specimen}</span> : null}
                {item.catalogueSource === 'billing' ? (
                  <button
                    type="button"
                    className="rounded-full px-2 text-xs font-bold hover:bg-white"
                    onClick={() => setNoteFor(noteFor === item.id ? undefined : item.id)}
                  >
                    {item.specimen ? 'Edit note' : 'Add note'}
                  </button>
                ) : null}
                <button
                  type="button"
                  aria-label={`Remove ${item.name}`}
                  className="grid h-6 w-6 place-items-center rounded-full hover:bg-white"
                  onClick={() => onChange(items.filter((i) => i.id !== item.id))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          {noteFor && items.some((i) => i.id === noteFor) ? (
            <TextField
              label={`Specimen or collection note · ${items.find((i) => i.id === noteFor)!.name}`}
              value={items.find((i) => i.id === noteFor)!.specimen ?? ''}
              onChange={(e) => update(noteFor, { specimen: e.target.value || undefined })}
            />
          ) : null}
          {items
            .filter((item) => item.billingReviewReason || item.additionalChargeReason !== undefined)
            .map((item) => (
              <div
                key={item.id}
                className="space-y-2 rounded-field border border-amber-border bg-amber-bg p-3 text-sm text-amber-text"
              >
                <p>
                  <strong>{item.name}</strong> may already have been paid for at the cashier.
                </p>
                <SelectField
                  label="Is this the same test?"
                  value={item.additionalChargeReason !== undefined ? 'additional' : 'review'}
                  options={[
                    {
                      value: 'review',
                      label: 'Possibly the same: let billing check (no second charge)',
                    },
                    { value: 'additional', label: 'No, this is a separate, additional test' },
                  ]}
                  onChange={(e) =>
                    update(
                      item.id,
                      e.target.value === 'additional'
                        ? { billingReviewReason: undefined, additionalChargeReason: '' }
                        : {
                            billingReviewReason: 'Review the existing manual bill before charging',
                            additionalChargeReason: undefined,
                          },
                    )
                  }
                />
                {item.additionalChargeReason !== undefined ? (
                  <TextField
                    label="Why it's needed again"
                    required
                    value={item.additionalChargeReason}
                    onChange={(e) => update(item.id, { additionalChargeReason: e.target.value })}
                  />
                ) : null}
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
};
