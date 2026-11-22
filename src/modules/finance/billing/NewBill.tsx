import { useRef, useState } from 'react';
import type { FeeItem } from '@shared';
import { useAuthorizationContext } from '@/session';
import { Button, Sheet, TextField, useToast } from '@/ui';
import { userMessage } from '@/lib/api/userMessage';
import { createBill, patientBillingFacts } from '@/data/repos/billing';
import { formatMoney } from '@/lib/money';
import { CatalogueBrowser } from './CatalogueBrowser';
import type { BillingData } from './useBilling';
import { billKey } from './billDocuments';

export const NewBill = ({
  data,
  onClose,
  onCreated,
}: {
  data: BillingData;
  onClose: () => void;
  onCreated: (id: string) => void;
}) => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const [patientId, setPatient] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<{ fee: FeeItem; quantity: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const patient = data.patients.find((p) => p.patientId === patientId);

  const save = async () => {
    if (!patient || saving.current) {
      return;
    }

    saving.current = true;
    setBusy(true);
    setError('');

    try {
      const charges = await createBill(
        items.map((i) => ({
          feeId: i.fee.id,
          quantity: Number(i.quantity),
          priceVersion: i.fee.priceVersion,
          amountMinor: i.fee.amountMinor,
          currency: i.fee.currency,
        })),
        { patientId, facts: patientBillingFacts(patient) },
        context,
      );

      toast('Bill created');
      onCreated(billKey(charges[0]));
    } catch (e) {
      const message = userMessage(e, 'The bill was not created. Try again.');
      setError(message);
      toast(message, { tone: 'error' });
    } finally {
      setBusy(false);
      saving.current = false;
    }
  };

  return (
    <Sheet
      title="New bill"
      eyebrow="Billing"
      onClose={onClose}
      closeDisabled={busy}
      hasUnsavedChanges={Boolean(items.length)}
      placement="side"
    >
      <fieldset disabled={busy} className="space-y-4">
        {patient ? (
          <div className="rounded-card bg-brand-wash p-3">
            <strong>{patient.fullName}</strong>
            <p className="text-sm">{patient.patientId}</p>
            <Button variant="ghost" onClick={() => setPatient('')}>
              Change patient
            </Button>
          </div>
        ) : (
          <>
            <TextField
              label="Find patient"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="max-h-52 overflow-auto">
              {data.patients
                .filter((p) =>
                  `${p.fullName} ${p.patientId}`.toLowerCase().includes(search.toLowerCase()),
                )
                .slice(0, 25)
                .map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    className="block min-h-[44px] w-full border-b border-outline-soft p-2 text-left"
                    onClick={() => setPatient(p.patientId)}
                  >
                    {p.fullName} · {p.patientId}
                  </button>
                ))}
            </div>
          </>
        )}
        <CatalogueBrowser
          onSelect={(fee) =>
            setItems((old) =>
              old.some((i) => i.fee.id === fee.id) ? old : [...old, { fee, quantity: '1' }],
            )
          }
          canSelect={(fee) => !items.some((i) => i.fee.id === fee.id)}
        />
        {items.length ? (
          <section className="space-y-3">
            <h2 className="font-bold">Selected items</h2>
            {items.map((i) => (
              <div key={i.fee.id} className="rounded-card border border-outline-soft p-3">
                <strong>{i.fee.name}</strong>
                <p>{formatMoney(i.fee.amountMinor, i.fee.currency)} per unit</p>
                <TextField
                  label={`Quantity — ${i.fee.name}`}
                  type="number"
                  min="0.000001"
                  value={i.quantity}
                  onChange={(e) =>
                    setItems((old) =>
                      old.map((row) =>
                        row.fee.id === i.fee.id ? { ...row, quantity: e.target.value } : row,
                      ),
                    )
                  }
                />
                <Button
                  variant="ghost"
                  onClick={() => setItems((old) => old.filter((row) => row.fee.id !== i.fee.id))}
                >
                  Remove item
                </Button>
              </div>
            ))}
          </section>
        ) : null}
        <p className="text-sm text-ink-muted">
          Prices and applicable exemptions are captured when the bill is saved. Insurance is decided
          through the existing insurance workflow. Review existing bills before adding a service
          again.
        </p>
        {error ? (
          <p role="alert" className="text-danger">
            {error}
          </p>
        ) : null}
        <Button loading={busy} disabled={!patient || !items.length} onClick={() => void save()}>
          Create bill
        </Button>
      </fieldset>
    </Sheet>
  );
};
