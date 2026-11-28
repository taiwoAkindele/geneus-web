import { useEffect, useMemo, useRef, useState } from 'react';
import type { StockItem } from '@shared';
import { useLiveQuery } from '@/data';
import { useBillingCatalogue } from '@/data/billingCatalogueSupport';
import { ConfigurationSaveError, saveConfiguration } from '@/data/configurationSave';
import { pharmacySupported } from '@/data/pharmacySupport';
import { getFacility } from '@/data/repos/facility';
import { listFeeItems } from '@/data/repos/billing';
import { userMessage } from '@/lib/api/userMessage';
import { downloadTable } from '@/lib/tabular/exportTable';
import { readTableFile } from '@/lib/tabular/readTable';
import { StaffVerification, useAuthorizationContext } from '@/session';
import { Button, Sheet, useToast } from '@/ui';
import { MedicineImportReview } from './MedicineImportReview';
import {
  eligibleMedicineFees,
  prepareMedicineImport,
  readMedicineRows,
  reviewMedicines,
  type MedicineChoice,
  type MedicineRow,
} from './stockImport';
import { MEDICINE_HEADERS, MEDICINE_INSTRUCTIONS, MEDICINE_LIMIT } from './stockImportTemplate';

type Attempt = ReturnType<typeof prepareMedicineImport>;
type Outcome = Pick<Attempt, 'added' | 'linked' | 'created' | 'skipped'> & { arrived: boolean };

const useOnline = () => {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);

    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
};

export const StockImportSheet = ({
  items,
  onClose,
  onSaved,
}: {
  items: readonly StockItem[];
  onClose: () => void;
  onSaved: () => void;
}) => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const online = useOnline();
  const billingReady = useBillingCatalogue(context);
  const facility = useLiveQuery(getFacility, ['facility']);
  const catalogue = useLiveQuery(listFeeItems, ['fee_item']);
  const currency = facility.data ? (facility.data.currency ?? 'NGN') : undefined;
  const canCreatePrice = context.permissions.includes('fee_item:manage');
  const [file, setFile] = useState<{ name: string; rows: MedicineRow[] }>();
  const [choices, setChoices] = useState<Record<number, MedicineChoice>>({});
  const [reviewKey, setReviewKey] = useState(0);
  const [reading, setReading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(false);
  const [error, setError] = useState('');
  const [outcome, setOutcome] = useState<Outcome>();
  const input = useRef<HTMLInputElement>(null);
  const attempt = useRef<Attempt>();
  const busy = useRef(false);
  const fees = catalogue.data;
  const supported = billingReady && pharmacySupported(context);

  const review = useMemo(() => {
    if (!file || !fees || !currency) {
      return [];
    }

    return reviewMedicines(file.rows, choices, { items, fees, currency, canCreatePrice });
  }, [file, fees, currency, choices, items, canCreatePrice]);

  const count = review.filter((row) => row.status === 'ready').length;
  const attention = review.filter((row) => row.status === 'fix' || row.status === 'match');
  const issues = review.filter((row) => row.status === 'fix' && !row.priceIssue);

  const reset = () => {
    setError('');
    setFile(undefined);
    setChoices({});
    setRetry(false);
    setOutcome(undefined);
    attempt.current = undefined;
  };

  const showError = (cause: unknown, fallback: string) => {
    const message = userMessage(cause, fallback);
    setError(message);
    toast(message, { tone: 'error' });
  };

  const chooseFile = async (selected: File) => {
    reset();
    setReading(true);

    try {
      const workbook = await readTableFile(selected);
      setFile({ name: selected.name, rows: readMedicineRows(workbook) });
      setReviewKey((key) => key + 1);
    } catch (cause) {
      showError(cause, 'The file could not be read.');
    } finally {
      setReading(false);
    }
  };

  const download = async (issuesOnly: boolean) => {
    setDownloading(true);
    setError('');

    try {
      if (issuesOnly) {
        const rows = issues.flatMap((row) =>
          row.status === 'fix' ? [[...row.cells, row.message]] : [],
        );
        await downloadTable('geneus-medicines-rows-to-fix', 'Stock', [
          [...MEDICINE_HEADERS, 'Issue'],
          ...rows,
        ]);
      } else {
        await downloadTable(
          'geneus-medicines-template',
          'Stock',
          [MEDICINE_HEADERS],
          'xlsx',
          MEDICINE_INSTRUCTIONS,
        );
      }
    } catch (cause) {
      showError(cause, 'The Excel file could not be downloaded.');
    } finally {
      setDownloading(false);
    }
  };

  const save = async () => {
    if (busy.current || !online || !currency || !supported) {
      return;
    }

    busy.current = true;
    setSaving(true);
    setError('');

    try {
      const prepared = attempt.current ?? prepareMedicineImport(review, context, currency);
      attempt.current = prepared;
      const { arrived } = await saveConfiguration(context, prepared.writes, {
        stockImport: prepared.amounts,
      });
      setOutcome({
        added: prepared.added,
        linked: prepared.linked,
        created: prepared.created,
        skipped: prepared.skipped,
        arrived,
      });
      setRetry(false);
      attempt.current = undefined;
      onSaved();
      toast(
        arrived ? 'Medicines imported.' : 'Import confirmed. Waiting for this device to update.',
      );
    } catch (cause) {
      if (cause instanceof ConfigurationSaveError && cause.code === 'refused') {
        attempt.current = undefined;
        setRetry(false);
        catalogue.reload();
        onSaved();
      } else if (attempt.current) {
        setRetry(true);
      }

      showError(cause, 'The import could not be confirmed.');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const disabledReason = () => {
    if (!online) {
      return 'You can review this file offline. Connect to import.';
    }
    if (!supported) {
      return 'Import becomes available when the facility enables the current Billing catalogue and this device syncs.';
    }
    if (retry) {
      return '';
    }
    if (attention.length) {
      return 'Resolve each row that needs attention before importing.';
    }
    if (!count) {
      return 'There are no new medicines to import.';
    }

    return '';
  };
  const reason = disabledReason();
  const priceLoadFailed = Boolean(catalogue.error || facility.error);
  const priceDataLoading = !fees || !currency;

  return (
    <Sheet
      title="Import medicines"
      eyebrow="Stock"
      placement="side"
      wide
      onClose={onClose}
      hasUnsavedChanges={Boolean(file && !outcome)}
      closeDisabled={saving || reading}
    >
      <div className="space-y-4">
        {error ? (
          <p role="alert" className="rounded-field bg-danger-bg p-3 text-danger">
            {error}
          </p>
        ) : null}
        {outcome ? (
          <section className="space-y-3" role="status">
            <h3 className="text-lg font-bold">
              {outcome.added} {outcome.added === 1 ? 'medicine' : 'medicines'} imported
            </h3>
            <p>
              {outcome.created} prices created · {outcome.linked} existing prices linked ·{' '}
              {outcome.skipped} rows skipped
            </p>
            {!outcome.arrived ? (
              <p className="rounded-field bg-slate-bg p-3 text-slate-text">
                Import confirmed. Waiting for this device to update.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button fullWidth={false} onClick={onClose}>
                View stock
              </Button>
              <Button fullWidth={false} variant="outlined" onClick={reset}>
                Import another file
              </Button>
            </div>
          </section>
        ) : (
          <>
            {!retry && !saving ? (
              <>
                <ol className="flex list-inside list-decimal flex-wrap gap-x-5 gap-y-1 text-sm font-semibold">
                  <li>Download the template</li>
                  <li>Fill it in</li>
                  <li>Upload the filled template</li>
                </ol>
                <Button
                  fullWidth={false}
                  variant="outlined"
                  loading={downloading}
                  onClick={() => void download(false)}
                >
                  Download template
                </Button>
                <p className="text-sm text-ink-soft">
                  Enter the selling price per stock unit or link a price during review. Excel or
                  CSV, up to 5 MB and {MEDICINE_LIMIT} rows.
                </p>
                <div className="flex flex-wrap items-center gap-2 rounded-field border border-dashed border-outline p-3">
                  <input
                    hidden
                    ref={input}
                    type="file"
                    accept=".xlsx,.csv"
                    onChange={(event) => {
                      const selected = event.currentTarget.files?.[0];
                      event.currentTarget.value = '';

                      if (selected) {
                        void chooseFile(selected);
                      }
                    }}
                  />
                  <Button
                    variant="outlined"
                    fullWidth={false}
                    loading={reading}
                    onClick={() => input.current?.click()}
                  >
                    {file ? 'Choose another file' : 'Choose file'}
                  </Button>
                  {file ? (
                    <>
                      <span className="break-all text-sm">{file.name}</span>
                      <Button variant="ghost" fullWidth={false} onClick={reset}>
                        Remove
                      </Button>
                    </>
                  ) : null}
                </div>
                {reading ? <p role="status">Checking the file…</p> : null}
              </>
            ) : null}
            {file && priceLoadFailed && !retry ? (
              <div role="alert" className="space-y-2">
                <p>The facility's stock prices could not be loaded.</p>
                <Button
                  variant="outlined"
                  fullWidth={false}
                  onClick={() => {
                    catalogue.reload();
                    facility.reload();
                  }}
                >
                  Try again
                </Button>
              </div>
            ) : null}
            {file && priceDataLoading && !priceLoadFailed && !retry ? (
              <p role="status">Loading facility prices…</p>
            ) : null}
            {file &&
            fees &&
            currency &&
            !catalogue.error &&
            !facility.error &&
            !retry &&
            !saving ? (
              <>
                <MedicineImportReview
                  key={reviewKey}
                  rows={review}
                  choices={choices}
                  fees={eligibleMedicineFees(fees, currency)}
                  currency={currency}
                  onChoice={(line, choice) =>
                    setChoices((current) => ({ ...current, [line]: choice }))
                  }
                />
                {issues.length ? (
                  <>
                    <Button
                      variant="outlined"
                      fullWidth={false}
                      loading={downloading}
                      onClick={() => void download(true)}
                    >
                      Download rows to fix
                    </Button>
                    <p className="text-sm text-ink-soft">
                      Correct and upload the full original file to include its ready rows too.
                    </p>
                  </>
                ) : null}
              </>
            ) : null}
            {file && currency ? (
              <div className="space-y-2 border-t border-outline-soft pt-4">
                {retry ? (
                  <p role="status" className="rounded-field bg-amber-bg p-3 text-amber-text">
                    Retry confirmation for this same batch. Geneus may already have saved it.
                  </p>
                ) : null}
                {reason ? <p className="text-sm text-ink-soft">{reason}</p> : null}
                {!reason && !saving ? (
                  <StaffVerification
                    requireServerSession
                    purpose="Importing medicines and their prices"
                  >
                    <Button
                      disabled={Boolean(catalogue.error || facility.error)}
                      onClick={() => void save()}
                    >
                      {retry
                        ? 'Retry confirmation'
                        : `Import ${count} ${count === 1 ? 'medicine' : 'medicines'}`}
                    </Button>
                  </StaffVerification>
                ) : null}
                {saving ? <p role="status">Waiting for the server to confirm the import…</p> : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </Sheet>
  );
};
