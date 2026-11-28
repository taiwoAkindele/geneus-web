import { CatalogueBrowser } from '@/modules/finance/billing';
import { StaffVerification, useAuthorizationContext } from '@/session';
import {
  LaboratoryPricingCategory,
  laboratorySpecimenLabel,
  type FeeItem,
  type ResultTemplate,
} from '@shared';
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from '@/data';
import {
  loadCataloguePage,
  loadStandardTests,
  linkInvestigationDefinition,
  type AddedTests,
  type CatalogueRow,
} from '@/data/repos/investigations';
import { allOfType } from '@/data/db';
import { retireLaboratoryTest, saveLaboratoryTests } from '@/lib/api/investigations';
import {
  LaboratoryTestSheet,
  pricingCategoryOptions,
} from '@/modules/operations/investigations/LaboratoryTestSheet';
import { LaboratoryUploadSheet } from '@/modules/operations/investigations/LaboratoryUploadSheet';
import {
  ActionMenu,
  Button,
  DataTable,
  Icon,
  SelectField,
  SelectAllCheckbox,
  Sheet,
  SheetCancelButton,
  Tag,
  TextField,
  useToast,
  type TableColumn,
} from '@/ui';
import { formatMoney } from '@/lib/money';

type Panel = 'single' | 'upload' | 'standard' | { edit: CatalogueRow } | { retire: CatalogueRow };
const errorText = (cause: unknown) => (cause instanceof Error ? cause.message : 'Could not save');
const plural = (count: number) => `${count} ${count === 1 ? 'test' : 'tests'}`;

const AddedMessage = ({ added, skipped }: AddedTests) => (
  <div
    role="status"
    className="space-y-1 rounded-field border border-outline-soft bg-brand-wash p-3 text-sm"
  >
    <p className="font-bold">
      {added.length
        ? `Added ${plural(added.length)}. They appear after sync.`
        : 'No new tests were added.'}
    </p>
    {skipped.length ? (
      <p>Skipped because they are already in the catalogue: {skipped.join(', ')}</p>
    ) : null}
  </div>
);

const StandardTestsSheet = ({ onClose }: { onClose: () => void }) => {
  const context = useAuthorizationContext();
  const standards = useLiveQuery(useCallback(() => loadStandardTests(), [context.facilityId]));
  const tests = standards.data;
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AddedTests>();
  const [query, setQuery] = useState('');
  const [pricingCategory, setPricingCategory] = useState('');
  const needle = query.trim().toLowerCase();

  // Searches names, other names and specimens; ticks are kept while the list is filtered.
  const shown = (tests ?? []).filter(
    (test) =>
      !needle ||
      [test.name, test.specimen, ...test.aliases].some((text) =>
        text.toLowerCase().includes(needle),
      ),
  );

  const groups = [...new Set(shown.map((test) => test.classification))];

  const toggle = (key: string) =>
    setPicked((current) => {
      const next = new Set(current);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });

  const add = async () => {
    const category = LaboratoryPricingCategory.safeParse(pricingCategory);

    if (!category.success) {
      return;
    }

    setBusy(true);
    setError('');

    try {
      setResult(
        await saveLaboratoryTests(
          context,
          (tests ?? [])
            .filter((test) => picked.has(test.key))
            .map((test) => ({
              name: test.name,
              department: test.classification,
              aliases: test.aliases,
              standardKey: test.key,
              catalogue: { pricingCategory: category.data, specimenTypes: [test.specimen] },
            })),
        ),
      );
      setPicked(new Set());
      standards.reload();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  const renderStandardTests = () => {
    if (standards.error) {
      return (
        <div role="alert" className="space-y-2">
          <p className="text-danger-strong">{standards.error.message}</p>
          <Button variant="outlined" fullWidth={false} onClick={standards.reload}>
            Try again
          </Button>
        </div>
      );
    }

    if (!tests) {
      return <p role="status">Reading standard tests…</p>;
    }

    if (!tests.length) {
      return (
        <p role="status" className="rounded-field border border-dashed border-outline p-4 text-sm">
          The standard list hasn't reached this device yet. It arrives with the device's first sync
          after the update; until then you can upload or add your own tests.
        </p>
      );
    }

    return (
      <>
        <TextField
          label="Search standard tests"
          type="search"
          value={query}
          placeholder="Test name, other name or specimen"
          onChange={(e) => setQuery(e.target.value)}
        />
        {shown.length ? null : (
          <p role="status" className="text-sm">
            No standard tests match this search.
          </p>
        )}
        <SelectAllCheckbox
          keys={shown.filter((test) => !test.added).map((test) => test.key)}
          picked={picked}
          onChange={setPicked}
        />
        {groups.map((group) => (
          <fieldset key={group} className="space-y-1">
            <legend className="text-xs font-bold uppercase tracking-wider text-brand-strong">
              {group}
            </legend>
            {shown
              .filter((test) => test.classification === group)
              .map((test) => (
                <label
                  key={test.key}
                  className={`flex min-h-[44px] items-start gap-3 rounded-field px-2 py-2 ${test.added ? 'text-ink-muted' : 'hover:bg-surface'}`}
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 min-h-0 accent-brand"
                    checked={picked.has(test.key)}
                    disabled={test.added}
                    onChange={() => toggle(test.key)}
                  />
                  <span className="text-sm">
                    <b>{test.name}</b>
                    {test.added ? <Tag className="ml-2">Already added</Tag> : null}
                    <span className="block text-xs text-ink-soft">
                      {test.specimen} · Also: {test.aliases.join(', ')}
                    </span>
                  </span>
                </label>
              ))}
          </fieldset>
        ))}
      </>
    );
  };

  return (
    <Sheet
      title="Choose from standard tests"
      placement="side"
      onClose={onClose}
      hasUnsavedChanges={picked.size > 0}
    >
      <div className="space-y-4">
        <p className="text-sm">
          Commonly used tests based on the WHO Essential Diagnostics List. Tick the ones this
          facility performs. Tests already in your catalogue are marked and can't be added twice.
        </p>
        {renderStandardTests()}
        <SelectField
          label="Pricing category for selected tests"
          options={pricingCategoryOptions}
          required
          value={pricingCategory}
          onChange={(event) => setPricingCategory(event.target.value)}
        />
        {result ? <AddedMessage {...result} /> : null}
        {error ? (
          <p role="alert" className="text-danger-strong">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <SheetCancelButton>{result ? 'Done' : 'Cancel'}</SheetCancelButton>
          <StaffVerification requireServerSession purpose="Adopting laboratory tests">
            <Button
              fullWidth={false}
              loading={busy}
              disabled={busy || !picked.size || !pricingCategory}
              onClick={() => void add()}
            >
              Add {picked.size} selected {picked.size === 1 ? 'test' : 'tests'}
            </Button>
          </StaffVerification>
        </div>
      </div>
    </Sheet>
  );
};

const EditSheet = ({ row, onClose }: { row: CatalogueRow; onClose: () => void }) => {
  const context = useAuthorizationContext();
  const [chosen, setChosen] = useState<FeeItem>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!chosen || busy) {
      return;
    }

    setBusy(true);

    try {
      await linkInvestigationDefinition(row.definition, chosen.id, context);
      onClose();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={row.definition.name}
      eyebrow="Clinical configuration"
      placement="side"
      onClose={onClose}
    >
      <p>
        Specimen: {row.definition.investigation?.specimen}. Classification:{' '}
        {row.definition.investigation?.department}.
      </p>
      <p className="my-3 text-sm">
        Standard prices are managed exclusively in Billing. Linking an item adds no price
        definition.
      </p>
      {context.permissions.includes('fee_item:manage') ? (
        <Link className="font-bold text-brand" to="/billing/prices">
          Manage price in Billing
        </Link>
      ) : null}
      <CatalogueBrowser
        initialCategory="laboratory"
        canSelect={(f) => f.category === 'laboratory'}
        onSelect={setChosen}
      />
      {chosen ? (
        <p>
          Link to {chosen.name} · {formatMoney(chosen.amountMinor, chosen.currency)}
        </p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      <StaffVerification requireServerSession purpose="Linking a central Billing item">
        <Button disabled={!chosen || busy} loading={busy} onClick={() => void save()}>
          Link Billing Item
        </Button>
      </StaffVerification>
      {row.offering ? (
        <Link
          className="block py-3 font-bold text-brand"
          to={'/facility/services/' + encodeURIComponent(row.offering.id)}
        >
          Operational availability and other settings
        </Link>
      ) : null}
      <SheetCancelButton />
    </Sheet>
  );
};

const RetireTestSheet = ({ row, onClose }: { row: CatalogueRow; onClose: () => void }) => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const retire = async () => {
    setBusy(true);
    try {
      await retireLaboratoryTest(context, row.definition.id, row.definition.revision);
      toast('Test retired. It will disappear from new selections after sync.');
      onClose();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      title={`Retire ${row.definition.name}?`}
      placement="side"
      onClose={onClose}
      closeDisabled={busy}
    >
      <p className="mb-3 text-sm">
        Retiring stops new orders and charges. Existing orders, results and bills stay in the
        patient record.
      </p>
      {error ? (
        <p role="alert" className="mb-3 text-danger-strong">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <SheetCancelButton />
        <StaffVerification requireServerSession purpose="Retiring a laboratory investigation">
          <Button fullWidth={false} loading={busy} disabled={busy} onClick={() => void retire()}>
            Retire test
          </Button>
        </StaffVerification>
      </div>
    </Sheet>
  );
};

export const InvestigationCatalogueScreen = () => {
  const context = useAuthorizationContext();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const page = Math.max(0, Number(params.get('page')) || 0);
  const descending = params.get('descending') === '1';
  const status = params.get('status') ?? '';
  const canLinkTemplate = context.permissions.includes('result_template:manage');
  const templates = useLiveQuery(
    useCallback(
      async () =>
        canLinkTemplate
          ? (await allOfType<ResultTemplate>('result_template')).filter(
              (template) => template.status === 'active',
            )
          : [],
      [canLinkTemplate],
    ),
    ['result_template'],
  );

  const data = useLiveQuery(
    useCallback(
      () => loadCataloguePage(context, { query, page, descending, status }),
      [context, query, page, descending, status],
    ),
  );

  const [panel, setPanel] = useState<Panel>();
  const canManage = context.permissions.includes('service:manage');
  useEffect(() => {
    document.title = 'Investigation catalogue · Geneus Health';
  }, []);

  const set = (changes: Record<string, string>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);

        for (const [key, value] of Object.entries(changes)) {
          if (value) {
            next.set(key, value);
          } else {
            next.delete(key);
          }
        }

        return next;
      },
      { replace: true },
    );

  const close = () => {
    setPanel(undefined);
    data.reload();
  };

  const empty = data.data?.total === 0 && !query && !status;
  const specimen = ({ definition }: CatalogueRow) =>
    definition.laboratoryCatalogue
      ? laboratorySpecimenLabel(definition.laboratoryCatalogue)
      : definition.investigation?.specimen;

  const columns: TableColumn<CatalogueRow>[] = [
    {
      key: 'name',
      label: 'Test',
      sortValue: (row) => row.definition.name,
      render: (row) => (
        <div className="min-w-0">
          <p className="font-bold text-brand">{row.definition.name}</p>
          {row.definition.investigation?.aliases.length ? (
            <p className="text-xs text-ink-soft">
              Also: {row.definition.investigation.aliases.join(', ')}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-ink-soft md:hidden">
            {row.definition.investigation?.department} · {specimen(row)}
          </p>
        </div>
      ),
    },
    {
      key: 'specimen',
      label: 'Specimen',
      className: 'hidden md:table-cell',
      render: specimen,
    },
    {
      key: 'classification',
      label: 'Lab section',
      className: 'hidden md:table-cell',
      render: (row) => row.definition.investigation?.department,
    },
    {
      key: 'template',
      label: 'Result template',
      className: 'hidden lg:table-cell',
      render: (row) =>
        row.template ? (
          <div>
            {canLinkTemplate && row.template.id ? (
              <Link
                className="font-bold text-brand"
                to={`/laboratory/settings/templates/${encodeURIComponent(row.template.id)}`}
              >
                {row.template.name}
              </Link>
            ) : (
              <p>{row.template.name}</p>
            )}
            <p className="text-xs text-ink-soft">
              {row.template.parts} {row.template.parts === 1 ? 'part' : 'parts'}
            </p>
          </div>
        ) : (
          <Tag tone="amber">Text result only</Tag>
        ),
    },
    {
      key: 'availability',
      label: 'Order availability',
      render: ({ definition }) => {
        if (definition.active && definition.orderable) {
          return <Tag tone="green">Active</Tag>;
        }

        if (
          definition.active &&
          !definition.feeItemId &&
          definition.laboratoryCatalogue?.pricingCategory === 'billable'
        ) {
          return <Tag tone="amber">Draft · Needs pricing</Tag>;
        }

        return <Tag>Inactive</Tag>;
      },
    },
    {
      key: 'price',
      label: 'Pricing',
      render: (row) => {
        if (row.definition.laboratoryCatalogue?.pricingCategory === 'non_billable') {
          return (
            <div>
              Non-billable<p className="text-xs text-ink-soft">No charge</p>
            </div>
          );
        }

        if (row.fee) {
          return (
            <div>
              Billable
              <p className="text-xs text-ink-soft">
                {formatMoney(row.fee.amountMinor, row.fee.currency)}
              </p>
            </div>
          );
        }

        return (
          <span className="text-ink-soft">
            {row.definition.laboratoryCatalogue ? 'Billable' : 'Legacy setup'}
          </span>
        );
      },
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            label: 'Action',
            render: (row: CatalogueRow) => {
              if (row.definition.laboratoryCatalogue) {
                if (!row.definition.active) {
                  return null;
                }

                return (
                  <div className="flex flex-wrap items-center gap-2">
                    {!row.definition.orderable &&
                    !row.definition.feeItemId &&
                    context.permissions.includes('fee_item:manage') ? (
                      <Link
                        className="inline-flex min-h-[44px] items-center text-sm font-bold text-brand"
                        to={`/billing/prices?tab=needs-pricing&test=${encodeURIComponent(row.definition.id)}`}
                      >
                        Set price
                      </Link>
                    ) : null}
                    <Button
                      variant="ghost"
                      fullWidth={false}
                      onClick={() => setPanel({ retire: row })}
                    >
                      Retire
                    </Button>
                  </div>
                );
              }

              return (
                <Button
                  variant="outlined"
                  fullWidth={false}
                  className="px-3 text-sm"
                  onClick={() => setPanel({ edit: row })}
                >
                  Edit
                </Button>
              );
            },
          },
        ]
      : []),
  ];

  const addActions = [
    { label: 'Choose from standard tests', onSelect: () => setPanel('standard') },
  ];

  const renderTests = () => {
    if (data.loading && !data.data) {
      return <p role="status">Reading tests…</p>;
    }

    if (data.error) {
      return (
        <div role="alert">
          <p>{data.error.message}</p>
          <Button fullWidth={false} onClick={data.reload}>
            Try again
          </Button>
        </div>
      );
    }

    if (data.data?.items.length) {
      return (
        <DataTable
          caption="Lab tests"
          uniformHeaders
          rows={data.data.items}
          total={data.data.total}
          rowKey={(row) => row.definition.id}
          page={page}
          onPageChange={(value) => set({ page: String(value) })}
          sort={{ key: 'name', descending }}
          onSortChange={(value) => set({ descending: value.descending ? '1' : '', page: '' })}
          columns={columns}
        />
      );
    }

    return (
      <p className="rounded-field border border-dashed border-outline p-6">
        No tests match this search.
      </p>
    );
  };

  const renderPanel = () => {
    if (panel === 'single') {
      return <LaboratoryTestSheet templates={templates.data ?? []} onClose={close} />;
    }

    if (panel === 'upload') {
      return <LaboratoryUploadSheet templates={templates.data ?? []} onClose={close} />;
    }

    if (panel === 'standard') {
      return <StandardTestsSheet onClose={close} />;
    }

    if (panel && 'retire' in panel) {
      return <RetireTestSheet row={panel.retire} onClose={close} />;
    }

    if (panel) {
      return <EditSheet row={panel.edit} onClose={close} />;
    }

    return null;
  };

  return (
    <div className="min-h-screen space-y-5 bg-white px-4 py-5 md:px-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-[28px] font-extrabold">Test catalogue</h1>
        <div className="flex flex-wrap gap-2">
          {canManage ? (
            <>
              <Button fullWidth={false} onClick={() => setPanel('single')}>
                Add test
              </Button>
              <Button variant="outlined" fullWidth={false} onClick={() => setPanel('upload')}>
                Bulk upload
              </Button>
              <ActionMenu label="Standard tests" title="Standard tests" actions={addActions} />
            </>
          ) : null}
        </div>
      </header>
      {empty ? (
        <section
          aria-label="No tests yet"
          className="flex flex-col items-center gap-3 rounded-card border border-dashed border-outline px-6 py-10 text-center"
        >
          <h2 className="text-xl font-extrabold">This facility has no lab tests yet</h2>
          <p className="max-w-xl text-ink-soft">
            Start with standard tests used in most facilities, with specimens and other names
            already filled in. Prices are configured in Billing. Clinical definitions and templates
            remain separate.
          </p>
          {!canManage ? (
            <p className="text-sm">
              Ask a facility administrator to add the tests this facility performs.
            </p>
          ) : null}
        </section>
      ) : (
        <>
          <div className="grid items-end gap-3 md:grid-cols-[1fr_230px]">
            <div>
              <label htmlFor="test-search" className="mb-2 block text-sm font-bold">
                Search tests
              </label>
              <div className="flex min-h-[52px] items-center gap-3 rounded-field border border-outline px-4">
                <Icon name="search" className="h-5 w-5 shrink-0 text-ink-soft" />
                <input
                  id="test-search"
                  type="search"
                  value={query}
                  onChange={(e) => set({ q: e.target.value, page: '' })}
                  placeholder="Test name, other name or specimen"
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 outline-none"
                  autoComplete="off"
                />
              </div>
            </div>
            <SelectField
              label="Order availability"
              value={status}
              onChange={(event) => set({ status: event.target.value, page: '' })}
              options={[
                { value: '', label: 'All tests' },
                { value: 'active', label: 'Active' },
                { value: 'draft', label: 'Needs pricing' },
                { value: 'inactive', label: 'Inactive' },
              ]}
            />
          </div>
          {renderTests()}
        </>
      )}
      {renderPanel()}
    </div>
  );
};
