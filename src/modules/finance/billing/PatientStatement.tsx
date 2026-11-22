import { useEffect, useRef, useState } from 'react';
import type { PatientStatement as Statement, StatementTotals } from '@shared';
import { cachedPatientStatement, fetchPatientStatement } from '@/data/repos/patientStatements';
import { useAuthorizationContext, StaffVerification } from '@/session';
import { Button, SelectField, Sheet } from '@/ui';
import { formatMoney } from '@/lib/money';
import { userMessage } from '@/lib/api/userMessage';
import { downloadCsv } from '@/lib/csv';
import { CATEGORY_LABELS } from './feeForm';

export const statementFinancialRows = (s: Statement) =>
  [
    ['Original hospital charges', s.totals.originalMinor],
    ['Exemptions', -s.totals.exemptMinor],
    ['Contractual adjustments (signed; subtracted)', s.totals.contractAdjustmentMinor],
    ['Returned insured services', s.totals.returnAdjustmentMinor],
    ['Discounts, return credits and waivers', -s.totals.reductionsMinor],
    ['Net charges', s.totals.netMinor],
    ['Confirmed insurer responsibility', s.totals.payerMinor],
    ['Capitation-covered care', s.totals.capitationMinor],
    ['Confirmed patient responsibility before reductions', s.totals.patientMinor],
    ['Pending insurance or undetermined amount', s.totals.pendingMinor],
    ['Actual patient payments, net of reversals', s.totals.patientReceivedMinor],
    ['Patient refunds paid', s.totals.patientRefundedMinor],
    ['Actual insurer payments allocated to claims', s.totals.payerReceivedMinor],
    ['Insurer write-offs', s.totals.payerWrittenOffMinor],
    ['Outstanding insurer balance', s.totals.payerOutstandingMinor],
    ['Outstanding patient balance', s.totals.patientOutstandingMinor],
    ['Patient credit', s.totals.patientCreditMinor],
    [
      'Patient payments held pending responsibility confirmation',
      s.totals.heldPatientPaymentsMinor,
    ],
    ['Insurer settlement credit requiring review', s.totals.payerCreditMinor],
  ] as const;
export const statementCsvRows = (s: Statement) => [
  ['Hospital', s.facilityName],
  ['Patient', s.patientName, s.patientId],
  ['Currency', s.currency],
  ['Cutoff', s.cutoff],
  [
    'Category',
    'Item',
    'Quantity',
    'Unit',
    'Unit price (minor units)',
    'Original (minor units)',
    'Exemptions',
    'Contract adjustment (signed)',
    'Returned insured services',
    'Reductions',
    'Net',
    'Patient responsibility',
    'Insurer responsibility',
    'Capitation',
    'Pending insurance',
    'Patient payments',
    'Refunds',
    'Patient balance',
    'Charge ID',
  ],
  ...s.lines.map((l) => [
    CATEGORY_LABELS[l.category],
    l.description,
    l.quantity ?? '',
    l.unit ?? '',
    l.unitPriceMinor ?? '',
    l.originalMinor,
    l.exemptMinor,
    l.contractAdjustmentMinor,
    l.returnAdjustmentMinor,
    l.reductionsMinor,
    l.netMinor,
    l.patientMinor,
    l.payerMinor,
    l.capitationMinor,
    l.pendingMinor,
    l.patientReceivedMinor,
    l.patientRefundedMinor,
    l.patientBalanceMinor,
    l.chargeId,
  ]),
  ['Account totals (minor units)'],
  ...statementFinancialRows(s),
  ['Claim-level insurer settlements; no line-level payment allocation'],
  ['Claim', 'Payer', 'Expected', 'Paid', 'Written off', 'Outstanding'],
  ...s.claims.map((c) => [
    c.claimNumber,
    c.payerName,
    c.settlement.expectedMinor,
    c.settlement.paidMinor,
    c.settlement.writtenOffMinor,
    c.settlement.outstandingMinor,
  ]),
  ...s.limitations.map((l) => ['Note', l]),
];
const Totals = ({ totals, money }: { totals: StatementTotals; money: (n: number) => string }) => (
  <p className="text-sm">
    Original {money(totals.originalMinor)} · Net {money(totals.netMinor)} · Patient balance{' '}
    {money(totals.patientBalanceMinor)}
  </p>
);
export const PatientStatement = ({
  patientId,
  currencies,
  onClose,
}: {
  patientId: string;
  currencies: string[];
  onClose: () => void;
}) => {
  const context = useAuthorizationContext();
  const [currency, setCurrency] = useState(currencies[0] ?? 'NGN');
  const [statement, setStatement] = useState<Statement>();
  const [mode, setMode] = useState('itemized');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cached, setCached] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    setStatement(undefined);
    setError('');
    void cachedPatientStatement(context, patientId, currency).then(
      (s) => {
        if (active) {
          setStatement(s);
          setCached(Boolean(s));
        }
      },
      (e) => {
        if (active) {
          setError(userMessage(e, 'The saved statement could not be read.'));
        }
      },
    );
    return () => {
      active = false;
    };
  }, [patientId, currency]);
  const refresh = async () => {
    setBusy(true);
    setError('');
    try {
      setStatement(await fetchPatientStatement(context, patientId, currency));
      setCached(false);
    } catch (e) {
      setError(userMessage(e, 'The statement could not be generated. Try again.'));
    } finally {
      setBusy(false);
    }
  };
  const money = (n: number) => formatMoney(n, currency);
  const print = () => {
    if (!statement || !root.current) {
      return;
    }
    const popup = window.open('', '_blank', 'width=900,height=1000');
    if (!popup) {
      setError('Allow pop-ups to open the print preview.');
      return;
    }
    popup.document.title = `Patient statement ${patientId}`;
    const style = popup.document.createElement('style');
    style.textContent =
      'body{font:13px Arial,sans-serif;margin:32px;color:#17252b}h1{font-size:24px}h2{font-size:18px;margin-top:24px}h3{font-size:15px}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid #ddd;padding:7px}dl>div{display:flex;justify-content:space-between;gap:20px;padding:4px}dd{margin:0;font-weight:bold}article{break-inside:avoid;margin:12px 0}p{line-height:1.5} .print-hide{display:none}@page{size:A4;margin:15mm}';
    popup.document.head.append(style);
    popup.document.body.append(root.current.cloneNode(true));
    popup.focus();
    popup.print();
  };
  const renderTitle = () => {
    if (mode === 'itemized') {
      return 'Itemized patient bill';
    }

    if (mode === 'summary') {
      return 'Category summary statement';
    }

    return 'Patient account statement';
  };

  return (
    <Sheet title="Patient statement" onClose={onClose} eyebrow="Billing">
      <div className="space-y-3">
        <SelectField
          label="Statement currency"
          disabled={busy}
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          options={currencies.map((c) => ({ value: c, label: c }))}
        />
        <StaffVerification requireServerSession purpose="Generating a complete patient statement">
          <Button loading={busy} onClick={() => void refresh()}>
            Generate current statement
          </Button>
        </StaffVerification>
        {cached ? (
          <p role="status" className="rounded-field bg-amber-bg p-3 text-sm">
            Saved server-confirmed snapshot. Its cutoff is shown below; later activity and
            unsynchronized work are excluded. It remains available offline.
          </p>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
        {statement ? (
          <>
            <SelectField
              label="Statement presentation"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              options={[
                { value: 'itemized', label: 'Itemized bill' },
                { value: 'summary', label: 'Category summary' },
                { value: 'account', label: 'Account statement' },
              ]}
            />
            <div className="flex flex-wrap gap-2">
              <Button fullWidth={false} onClick={print}>
                Print statement
              </Button>
              <Button
                fullWidth={false}
                variant="outlined"
                onClick={() =>
                  downloadCsv(
                    `statement-${patientId}-${statement.cutoff.slice(0, 10)}.csv`,
                    statementCsvRows(statement),
                  )
                }
              >
                Export statement CSV
              </Button>
            </div>
            <div ref={root} className="space-y-4 bg-white p-3" data-statement-mode={mode}>
              <header>
                <h1 className="text-xl font-bold">{statement.facilityName}</h1>
                <h2 className="text-lg font-bold">{renderTitle()}</h2>
                <p>
                  {statement.patientName} · {patientId}
                </p>
                <p className="text-xs">
                  {currency} · Cutoff {new Date(statement.cutoff).toLocaleString('en-GB')} ·
                  Generated {new Date(statement.generatedOn).toLocaleString('en-GB')}
                </p>
              </header>
              {mode !== 'account' ? (
                statement.categories.map((group) => (
                  <section key={group.category}>
                    <h3 className="font-bold">
                      {CATEGORY_LABELS[group.category]} · {group.count} item
                      {group.count === 1 ? '' : 's'}
                    </h3>
                    <Totals totals={group.totals} money={money} />
                    {mode === 'itemized'
                      ? statement.lines
                          .filter((l) => l.category === group.category)
                          .map((l) => (
                            <article
                              key={l.chargeId}
                              className="border-b border-outline-soft py-2 text-sm"
                            >
                              <strong>{l.description}</strong>
                              <p>
                                {new Date(l.createdOn).toLocaleDateString('en-GB')}
                                {l.quantity !== undefined
                                  ? ` · ${l.quantity} ${l.unit ?? 'item'}${l.unitPriceMinor !== undefined ? ` × ${money(l.unitPriceMinor)}` : ''}`
                                  : ' · Historical quantity not recorded'}{' '}
                                · Original {money(l.originalMinor)} · Net {money(l.netMinor)}
                              </p>
                              <p>
                                Patient responsibility {money(l.patientMinor)} · Insurer{' '}
                                {money(l.payerMinor)} · Patient payments{' '}
                                {money(l.patientReceivedMinor)} · Patient balance{' '}
                                {money(l.patientBalanceMinor)}
                              </p>
                              {l.pendingMinor ? (
                                <p>
                                  Pending insurance {money(l.pendingMinor)} · excluded from patient
                                  debt
                                </p>
                              ) : null}
                              <p className="text-xs">{l.responsibility}</p>
                            </article>
                          ))
                      : null}
                  </section>
                ))
              ) : (
                <section>
                  <h3 className="font-bold">Account activity</h3>
                  {statement.transactions.map((t) => (
                    <article key={t.id} className="border-b border-outline-soft py-2 text-sm">
                      <p>
                        {new Date(t.on).toLocaleString('en-GB')} · {t.kind}
                      </p>
                      <p>
                        {t.reference} · {money(t.amountMinor)}
                      </p>
                    </article>
                  ))}
                </section>
              )}
              <section>
                <h2 className="font-bold">Financial breakdown</h2>
                <dl>
                  {statementFinancialRows(statement).map(([label, value]) => (
                    <div
                      className="flex justify-between gap-3 border-b border-outline-soft py-2 text-sm"
                      key={label}
                    >
                      <dt>{label}</dt>
                      <dd className="font-mono font-bold">{money(value)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              {statement.claims.length ? (
                <section>
                  <h2 className="font-bold">Insurer settlements by claim</h2>
                  {statement.claims.map((c) => (
                    <article key={c.id} className="border-b border-outline-soft py-2 text-sm">
                      <p>
                        {c.payerName} · {c.claimNumber}
                      </p>
                      <p>
                        Responsibility {money(c.settlement.expectedMinor)} · Received{' '}
                        {money(c.settlement.paidMinor)} · Outstanding{' '}
                        {money(c.settlement.outstandingMinor)}
                      </p>
                    </article>
                  ))}
                </section>
              ) : null}
              <footer className="space-y-1 text-xs">
                <p>
                  Net charges = original charges − exemptions − signed contractual adjustments −
                  returned insured services − discounts, patient return credits and waivers. A
                  negative contractual adjustment increases net charges.
                </p>
                <p>
                  Insurance deductions or denials do not automatically become patient debt. Patient
                  credits remain separate from unpaid charges.
                </p>
                {statement.limitations.map((l) => (
                  <p key={l}>{l}</p>
                ))}
              </footer>
            </div>
          </>
        ) : (
          <p className="text-sm">
            Generate a statement while connected. A confirmed copy can then be viewed, printed or
            exported offline.
          </p>
        )}
      </div>
    </Sheet>
  );
};
