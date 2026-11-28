import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { LaboratoryPriceInput } from '@shared';
import { useLiveQuery } from '@/data';
import { loadLaboratoryPriceDrafts } from '@/data/repos/investigations';
import { billingRequest } from '@/lib/api/billing';
import { downloadExcel, readExcel } from '@/lib/excel';
import { formatMoney, parseAmount } from '@/lib/money';
import { StaffVerification, useAuthorizationContext } from '@/session';
import { Button, Sheet, SheetCancelButton, TextField, useToast } from '@/ui';
import { LAB_PRICE_HEADERS, previewLaboratoryPrices } from './laboratoryPriceWorkbook';

export const LaboratoryPendingPrices = ({
  currency,
  onChanged,
}: {
  currency: string;
  onChanged: () => void;
}) => {
  const context = useAuthorizationContext();
  const query = useLiveQuery(loadLaboratoryPriceDrafts, ['service_definition']);
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<unknown[][]>();
  const [filename, setFilename] = useState('');
  const [upload, setUpload] = useState(false);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const drafts = query.data ?? [];
  const selected = drafts.find((test) => test.id === params.get('test'));
  const preview = useMemo(
    () => (rows ? previewLaboratoryPrices(rows, query.data ?? [], currency) : []),
    [rows, query.data, currency],
  );
  const ready = preview.flatMap((row) => (row.status === 'ready' ? [row.input] : []));
  const errors = preview.filter((row) => row.status === 'error').length;
  const blank = preview.filter((row) => row.status === 'blank').length;

  const select = (id?: string) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (id) {
          next.set('test', id);
        } else {
          next.delete('test');
        }
        return next;
      },
      { replace: true },
    );
    setAmount('');
    setError('');
  };

  const reportError = (cause: unknown) =>
    setError(cause instanceof Error ? cause.message : 'Could not save Laboratory prices');

  const read = async (file: File) => {
    setRows(undefined);
    setFilename(file.name);
    setBusy(true);
    setError('');

    try {
      const workbook = await readExcel(file);
      previewLaboratoryPrices(workbook, drafts, currency);
      setRows(workbook);
    } catch (cause) {
      reportError(cause);
    } finally {
      setBusy(false);
    }
  };

  const publish = async (prices: LaboratoryPriceInput[]) => {
    setBusy(true);
    setError('');

    try {
      const result = await billingRequest<{ activated: number; alreadyActivated: number }>(
        context,
        'catalogue/laboratory-prices',
        { prices },
      );
      const message = `${result.activated} activated · ${result.alreadyActivated} already active. Changes appear after sync.`;
      toast(message);
      setNotice(message);
      setRows(undefined);
      setUpload(false);
      select();
      query.reload();
      onChanged();
    } catch (cause) {
      reportError(cause);
    } finally {
      setBusy(false);
    }
  };

  const saveOne = () => {
    if (!selected) {
      return;
    }

    try {
      const amountMinor = parseAmount(amount, currency);
      void publish([
        { definitionId: selected.id, revision: selected.revision, currency, amountMinor },
      ]);
    } catch (cause) {
      reportError(cause);
    }
  };

  return (
    <section className="space-y-4" aria-label="Laboratory tests needing prices">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold">Needs pricing</h2>
          <p className="text-sm text-ink-soft">
            Publish a standard price to make these tests available for ordering.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outlined"
            fullWidth={false}
            disabled={!drafts.length}
            onClick={() =>
              void downloadExcel('geneus-items-needing-pricing.xlsx', 'Needs pricing', [
                LAB_PRICE_HEADERS,
                ...drafts
                  .slice(0, 500)
                  .map((test) => [test.id, test.name, 'Per test', currency, test.revision, '']),
              ]).catch(reportError)
            }
          >
            {drafts.length > 500 ? 'Export first 500 in Excel' : 'Export Excel'}
          </Button>
          <Button
            fullWidth={false}
            disabled={!drafts.length}
            onClick={() => {
              select();
              setRows(undefined);
              setFilename('');
              setUpload(true);
            }}
          >
            Upload prices
          </Button>
        </div>
      </div>
      {notice ? (
        <p role="status" className="text-sm text-brand">
          {notice}
        </p>
      ) : null}
      {query.loading && !query.data ? <p role="status">Reading drafts…</p> : null}
      {query.error ? (
        <p role="alert" className="text-danger-strong">
          {query.error.message}
        </p>
      ) : null}
      {error && !selected && !upload ? (
        <p role="alert" className="text-danger-strong">
          {error}
        </p>
      ) : null}
      {query.data?.length === 0 ? (
        <p className="rounded-card border border-outline-soft p-4">
          No Laboratory tests are waiting for a price.
        </p>
      ) : null}
      {drafts.length ? (
        <ul className="divide-y divide-outline-soft rounded-card border border-outline-soft">
          {drafts.map((test) => (
            <li key={test.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div>
                <p className="font-bold">{test.name}</p>
                <p className="text-sm text-ink-soft">Laboratory · Per test</p>
              </div>
              <Button variant="outlined" fullWidth={false} onClick={() => select(test.id)}>
                Set price
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {selected ? (
        <Sheet
          title={`Set price for ${selected.name}`}
          onClose={() => select()}
          placement="side"
          hasUnsavedChanges={Boolean(amount)}
        >
          <div className="space-y-4">
            <TextField
              label={`Standard price (${currency} per test)`}
              inputMode="decimal"
              value={amount}
              required
              onChange={(event) => setAmount(event.target.value)}
            />
            {error ? (
              <p role="alert" className="text-danger-strong">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <SheetCancelButton />
              <StaffVerification
                requireServerSession
                purpose="Publishing the first Laboratory price"
              >
                <Button
                  fullWidth={false}
                  loading={busy}
                  disabled={busy || !amount.trim()}
                  onClick={saveOne}
                >
                  Publish price and activate
                </Button>
              </StaffVerification>
            </div>
          </div>
        </Sheet>
      ) : null}
      {upload ? (
        <Sheet
          title="Upload Laboratory prices"
          placement="side"
          onClose={() => setUpload(false)}
          hasUnsavedChanges={Boolean(rows)}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInput}
                aria-label="Completed Excel workbook"
                type="file"
                accept=".xlsx"
                disabled={busy}
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void read(file);
                  }
                  event.target.value = '';
                }}
              />
              <Button
                variant="outlined"
                fullWidth={false}
                disabled={busy}
                onClick={() => fileInput.current?.click()}
              >
                {filename ? 'Choose another workbook' : 'Choose completed Excel workbook'}
              </Button>
              {filename ? <p className="break-all text-sm text-ink-soft">{filename}</p> : null}
            </div>
            {rows ? (
              <>
                <p role="status" className="text-sm font-bold">
                  {ready.length} ready to activate · {blank} blank · {errors} to correct
                </p>
                <ul className="max-h-72 divide-y divide-outline-soft overflow-auto rounded-field border border-outline-soft">
                  {preview.map((row) => (
                    <li key={row.line} className="p-3 text-sm">
                      <p className="font-bold">
                        Row {row.line} · {row.name}
                      </p>
                      {row.status === 'ready' ? (
                        <p>{formatMoney(row.input.amountMinor, currency)}</p>
                      ) : null}
                      {row.status === 'blank' ? <p>Price blank · Skipped</p> : null}
                      {row.status === 'error' ? <p>{row.issue}</p> : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {error ? (
              <p role="alert" className="text-danger-strong">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <SheetCancelButton />
              <StaffVerification requireServerSession purpose="Publishing Laboratory prices">
                <Button
                  fullWidth={false}
                  loading={busy}
                  disabled={busy || !ready.length || errors > 0}
                  onClick={() => void publish(ready)}
                >
                  Publish prices and activate
                </Button>
              </StaffVerification>
            </div>
          </div>
        </Sheet>
      ) : null}
    </section>
  );
};
