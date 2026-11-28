import { useRef, useState } from 'react';
import type { FeeItem } from '@shared';
import { useAuthorizationContext, StaffVerification } from '@/session';
import { Button, Sheet, useToast } from '@/ui';
import { userMessage } from '@/lib/api/userMessage';
import { saveConfiguration, type ConfigurationWrite } from '@/data/configurationSave';
import { downloadExcel, readExcel } from '@/lib/excel';
import { previewPrices, preparePriceWrites, type PriceImportRow } from './priceImport';
import { CATEGORY_LABELS } from './feeForm';

export const PriceUpload = ({
  fees,
  currency,
  onClose,
  onSaved,
}: {
  fees: FeeItem[];
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const [rows, setRows] = useState<PriceImportRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const writes = useRef<ConfigurationWrite[]>();
  const saving = useRef(false);
  const picker = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');

  /** Clears the chosen file and its preview, so another (or the same, edited) file can be chosen. */
  const remove = () => {
    if (picker.current) {
      picker.current.value = '';
    }

    setFileName('');
    setRows([]);
    setError('');
    setNotice('');
    writes.current = undefined;
  };

  const read = async (file?: File) => {
    if (!file) {
      return;
    }

    setFileName(file.name);
    setError('');
    setNotice('');
    setRows([]);
    writes.current = undefined;
    setBusy(true);

    try {
      const result = previewPrices(await readExcel(file), fees, currency, {
        allowNewLaboratoryFees: false,
      });

      if (!result.length) {
        throw new Error('No items found');
      }

      setRows(result);
    } catch (e) {
      const message = userMessage(
        e,
        'The file could not be read. Check it is an Excel price list.',
      );

      setError(message);
      toast(message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (saving.current) {
      return;
    }

    saving.current = true;
    setBusy(true);
    setError('');

    try {
      writes.current ??= preparePriceWrites(rows, context, currency);
      const result = await saveConfiguration(context, writes.current, { billingImport: true });

      {
        const done = result.arrived
          ? 'Prices imported.'
          : 'Prices saved. They appear on this device after it syncs.';

        setNotice(done);
        toast(done);
      }

      setRows([]);
      onSaved();
    } catch (e) {
      const message = userMessage(e, 'The prices were not imported. Try again.');
      setError(message);
      toast(message, { tone: 'error' });
    } finally {
      setBusy(false);
      saving.current = false;
    }
  };

  return (
    <Sheet
      title="Upload prices"
      eyebrow="Price Catalogue"
      onClose={onClose}
      closeDisabled={busy}
      hasUnsavedChanges={Boolean(rows.length)}
      placement="side"
    >
      <div className="space-y-4">
        <p>
          Upload an Excel workbook. Three required columns: Name, Category, Price. Description is
          optional. Prices use {currency}.
        </p>
        <Button
          variant="outlined"
          disabled={busy}
          onClick={() =>
            void downloadExcel('billing-price-template.xlsx', 'Prices', [
              ['Name', 'Category', 'Price', 'Description', 'Item ID'],
              ['Medical certificate', 'General / Other', '5000', '', ''],
            ]).catch((cause: unknown) =>
              setError(userMessage(cause, 'Could not export the template')),
            )
          }
        >
          Download template
        </Button>
        <p className="text-sm text-ink-muted">
          Up to 500 items. New items charge only when selected. To update an existing price, include
          its exact Item ID, name and category. Automatic charging and exemptions stay unchanged.
        </p>
        <div className="space-y-2">
          <label htmlFor="price-file" className="block font-bold">
            Choose price file
          </label>
          {/* The input's value is cleared after each read, so choosing the same file again (after editing it) reads it again. */}
          <input
            ref={picker}
            id="price-file"
            className="sr-only"
            type="file"
            accept=".xlsx"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              void read(file);
            }}
          />
          <div className="flex flex-wrap items-center gap-3 rounded-field border border-outline p-3">
            <Button
              variant="outlined"
              fullWidth={false}
              disabled={busy}
              className="!px-4 !py-2.5 text-sm"
              onClick={() => picker.current?.click()}
            >
              {fileName ? 'Choose another file' : 'Choose file'}
            </Button>
            <span className="min-w-0 flex-1 truncate text-sm">{fileName || 'No file chosen'}</span>
            {fileName ? (
              <Button
                variant="ghost"
                fullWidth={false}
                disabled={busy}
                className="!px-3 !py-2.5 text-sm"
                aria-label={`Remove ${fileName}`}
                onClick={remove}
              >
                Remove
              </Button>
            ) : null}
          </div>
        </div>
        {rows.length ? (
          <>
            <h2 className="font-bold">
              Preview · {rows.length} items · {rows.filter((r) => r.error).length} errors
            </h2>
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Item / category</th>
                    <th>Price</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.line} className="border-t border-outline-soft">
                      <td className="p-2">{r.line}</td>
                      <td className="p-2">
                        {r.name}
                        <p>
                          {CATEGORY_LABELS[r.category as keyof typeof CATEGORY_LABELS] ??
                            r.category}
                        </p>
                        {r.error ? <p className="text-danger">{r.error}</p> : null}
                      </td>
                      <td className="p-2">{r.price}</td>
                      <td className="p-2">{r.fee ? 'Update price' : 'New item'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <StaffVerification requireServerSession purpose="Importing billing prices">
              <Button
                loading={busy}
                disabled={rows.some((r) => Boolean(r.error))}
                onClick={() => void save()}
              >
                Import {rows.length} prices
              </Button>
            </StaffVerification>
          </>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-field bg-danger-bg p-3 text-danger">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="rounded-field bg-brand-wash p-3">
            {notice}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
};
