import { useEffect, useState, lazy, Suspense } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import type { IncomingTransfer, Payment } from '@shared';
import { useAuthorizationContext, useSession } from '@/session';
import { Button, Sheet, TextField } from '@/ui';
import { useBilling } from './useBilling';
import { billDocuments } from './billDocuments';
import { placeQuestions, useBillingQuestions } from './billingQuestions';
import { BillDetail } from './BillDetail';
import { BillsList } from './BillsList';
import { PaymentHistory } from './PaymentHistory';
import { ReportsView } from './ReportsView';
import { NewBill } from './NewBill';
import { Receipt } from './Receipt';
import { BillingReviewList } from './BillingReviewList';
import { displayMoney } from './billingUi';
const LegacyBillingWorkspace = lazy(() =>
  import('./LegacyBillingWorkspace').then((m) => ({ default: m.LegacyBillingWorkspace })),
);

const TITLES: Record<string, string> = {
  bills: 'Bills',
  payments: 'Payment history',
  reports: 'Reports',
};

/**
 * Finance → Bills, Payment history and Reports. The sidebar chooses the page (?tab=), so the page has no tabs of its own.
 * Earlier addresses (collections, transfers, review) open their current place.
 */
/** Older links used other tab names; they open the tab that replaced them. */
const currentTabFor = (rawTab: string): string => {
  if (rawTab === 'collections' || rawTab === 'review') {
    return 'bills';
  }

  if (rawTab === 'transfers') {
    return 'payments';
  }

  return rawTab;
};

export const BillingWorkspace = () => {
  const context = useAuthorizationContext();
  const { user } = useSession();
  const query = useBilling();
  const questions = useBillingQuestions();
  const [params, setParams] = useSearchParams();
  const [newBill, setNewBill] = useState(false);
  const [receipt, setReceipt] = useState<{ payment: Payment; fresh: boolean }>();
  const [linkSource, setLinkSource] = useState<IncomingTransfer>();
  const [source, setSource] = useState<IncomingTransfer>();
  const [linkSearch, setLinkSearch] = useState('');
  const [reviewAll, setReviewAll] = useState(false);
  const [focusSearch, setFocusSearch] = useState(false);
  const data = query.data;
  const rawTab = params.get('tab') ?? 'bills';
  const tab = currentTabFor(rawTab);
  const selectedId = params.get('bill');
  useEffect(() => {
    document.title = `${TITLES[tab] ?? 'Billing'} · Geneus Health`;
  }, [tab]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [selectedId, tab]);
  const allowed =
    user.roles.some((r) => ['cashier', 'facility_admin', 'supervisor'].includes(r)) ||
    context.permissions.some((p) =>
      ['charge:associate', 'fee_item:manage', 'payment:receive', 'payment:waive'].includes(p),
    );
  if (!allowed) {
    return <p className="p-5">Billing access has not been assigned to your account.</p>;
  }
  if (tab === 'fees') {
    return <Navigate to="/billing/prices" replace />;
  }
  if (tab === 'departments' || tab === 'categories') {
    return (
      <>
        <Link
          className="inline-flex min-h-[44px] items-center px-5 font-bold text-brand"
          to="/billing?tab=reports"
        >
          ← Reports
        </Link>
        <Suspense fallback={<p>Reading history…</p>}>
          <LegacyBillingWorkspace />
        </Suspense>
      </>
    );
  }
  const bills = data ? billDocuments(data) : [];
  const selected = bills.find((b) => b.id === selectedId);
  const placed = placeQuestions(bills, questions.questions);
  const name = (id: string) => data?.patients.find((p) => p.patientId === id)?.fullName ?? id;
  const openBill = (id: string, transfer?: IncomingTransfer) => {
    setSource(transfer);
    setLinkSource(undefined);
    setParams({ tab: 'bills', bill: id });
  };
  const toBills = (extra: Record<string, string> = {}) => {
    setSource(undefined);
    setParams({ tab: 'bills', ...extra });
  };
  const reload = () => {
    query.reload();
    questions.reload();
  };
  const renderSelectedBill = (billingData: NonNullable<typeof data>) => {
    if (!selected) {
      return (
        <div role="alert" className="space-y-3">
          <p>This bill isn't on this device yet. It appears once this device syncs.</p>
          <Button variant="outlined" fullWidth={false} onClick={() => toBills()}>
            ← Bills
          </Button>
        </div>
      );
    }

    return (
      <BillDetail
        key={`${selected.id}|${source?.id ?? ''}`}
        bill={selected}
        data={billingData}
        transfer={source}
        questions={placed.byBill.get(selected.id) ?? []}
        onBack={() => toBills()}
        onReceipt={(payment, fresh) => {
          setReceipt({ payment, fresh });
          setSource(undefined);
          reload();
        }}
        onSaved={reload}
        onOpenPatient={(id) => toBills({ patient: id })}
      />
    );
  };

  const renderBody = () => {
    if (query.loading) {
      return <p role="status">Reading billing records…</p>;
    }

    if (query.error || !data) {
      return (
        <div role="alert" className="space-y-3">
          <p>Billing records could not be read.</p>
          <Button fullWidth={false} onClick={query.reload}>
            Try again
          </Button>
        </div>
      );
    }

    if (selectedId) {
      return renderSelectedBill(data);
    }

    if (tab === 'payments') {
      return (
        <PaymentHistory
          data={data}
          bills={bills}
          onOpenBill={(id) => openBill(id)}
          onReceipt={(payment) => setReceipt({ payment, fresh: false })}
          onLink={(t) => {
            setLinkSearch('');
            setLinkSource(t);
          }}
          onChanged={reload}
        />
      );
    }

    if (tab === 'reports') {
      return <ReportsView data={data} />;
    }

    return (
      <BillsList
        key={params.get('patient') ?? ''}
        data={data}
        bills={bills}
        questions={placed.byBill}
        unplaced={placed.unplaced.length}
        canCreate={context.permissions.includes('charge:create')}
        canSetUp={context.permissions.includes('fee_item:manage')}
        initialFilter={rawTab === 'review' ? 'questions' : undefined}
        patientFilter={params.get('patient') ?? undefined}
        focusSearch={focusSearch}
        onNew={() => setNewBill(true)}
        onOpen={(id) => openBill(id)}
        onClearPatient={() => toBills()}
        onReviewAll={() => setReviewAll(true)}
      />
    );
  };

  return (
    <div className="min-h-screen bg-surface">
      <main className="mx-auto max-w-screen-xl space-y-5 px-4 pb-24 pt-5 md:px-8">
        {renderBody()}
      </main>
      {newBill && data ? (
        <NewBill
          data={data}
          onClose={() => setNewBill(false)}
          onCreated={(id) => {
            setNewBill(false);
            reload();
            openBill(id);
          }}
        />
      ) : null}
      {linkSource && data ? (
        <Sheet
          title="Link transfer to a bill"
          eyebrow={`${linkSource.payerName ?? 'Bank transfer'} · ${displayMoney(linkSource.amountMinor, linkSource.currency)}`}
          onClose={() => setLinkSource(undefined)}
        >
          <TextField
            label="Find the patient or bill"
            value={linkSearch}
            onChange={(e) => setLinkSearch(e.target.value)}
          />
          <div className="mt-4 max-h-96 space-y-2 overflow-auto">
            {bills
              .filter(
                (b) =>
                  b.currency === linkSource.currency &&
                  b.due > 0 &&
                  `${name(b.patientId)} ${b.patientId} ${b.reference}`
                    .toLowerCase()
                    .includes(linkSearch.trim().toLowerCase()),
              )
              .map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => openBill(b.id, linkSource)}
                  className="flex w-full items-center justify-between gap-3 rounded-field border-[1.5px] border-outline bg-white p-3 text-left text-sm hover:border-brand"
                >
                  <span>
                    <strong className="block">{name(b.patientId)}</strong>
                    <span className="font-mono text-xs text-ink-muted">{b.reference}</span>
                  </span>
                  <span className="font-semibold tabular-nums">
                    {displayMoney(b.due, b.currency)} due
                  </span>
                </button>
              ))}
          </div>
          <p className="mt-3 text-sm text-ink-muted">
            Choose the bill the patient paid for. You'll check the amount before anything is
            recorded; the server confirms it.
          </p>
        </Sheet>
      ) : null}
      {receipt && data ? (
        <Receipt
          payment={receipt.payment}
          data={data}
          fresh={receipt.fresh}
          onClose={() => setReceipt(undefined)}
          onNextPatient={() => {
            setReceipt(undefined);
            toBills();
            setFocusSearch(true);
            window.setTimeout(() => setFocusSearch(false), 0);
          }}
        />
      ) : null}
      {reviewAll && data ? (
        <Sheet placement="side" wide title="Billing questions" onClose={() => setReviewAll(false)}>
          <BillingReviewList
            data={data}
            onPatient={(id) => {
              setReviewAll(false);
              toBills({ patient: id });
            }}
          />
        </Sheet>
      ) : null}
    </div>
  );
};
