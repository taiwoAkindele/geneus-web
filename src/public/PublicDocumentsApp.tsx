import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { BillView, DocumentHospital, PublicDocument, PublicMessageChoices, ReceiptView } from '@shared';
import { ApiError, apiUrl, get, post } from '@/lib/api/client';
import { BillCheckout } from './BillCheckout';

/**
 * The pages a patient opens from a link, without signing in: their bill (/p/b/:token), a receipt (/p/r/:token)
 * and their message choices (…/messages). A small app of its own: it never starts the staff app, its secure
 * storage or its offline database. Responsive: one column on a phone, the document beside a summary on a
 * wider screen. The data and the PDF come from the server's public document API.
 */
type Route = { kind: 'bill' | 'receipt'; token: string; messages: boolean } | undefined;
export const publicRoute = (pathname: string): Route => {
  const match = /^\/p\/(b|r)\/([A-Za-z0-9_-]{20,100})(\/messages)?\/?$/.exec(pathname);
  return match ? { kind: match[1] === 'b' ? 'bill' : 'receipt', token: match[2], messages: Boolean(match[3]) } : undefined;
};

const money = (minor: number, currency: string) => {
  try { return new Intl.NumberFormat('en-NG', { style: 'currency', currency, minimumFractionDigits: 2 }).format(minor / 100); }
  catch { return `${currency} ${(minor / 100).toFixed(2)}`; }
};
const date = (iso: string, timeZone: string, time = false) => new Date(iso).toLocaleString('en-GB', { timeZone, day: 'numeric', month: 'short', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) });
const failure = (cause: unknown) => cause instanceof ApiError && cause.code === 'link_unavailable' ? 'unavailable' : cause instanceof ApiError && cause.code === 'offline' ? 'offline' : 'error';

const Shell = ({ hospital, children, footer }: { hospital?: DocumentHospital | string; children: ReactNode; footer?: ReactNode }) => {
  const h = typeof hospital === 'string' ? { name: hospital } as DocumentHospital : hospital;
  return <div className="min-h-screen bg-surface text-ink">
    <header className="border-b border-outline-soft bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-4 md:px-8">
        <div className="min-w-0"><p className="truncate text-lg font-extrabold text-brand">{h?.name ?? 'Your hospital'}</p>
          {h && (h.address || h.phone || h.email) ? <p className="text-sm text-ink-muted">{[h.address, h.phone, h.email].filter(Boolean).join(' · ')}</p> : null}</div>
      </div>
    </header>
    <main className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">{children}</main>
    <footer className="mx-auto max-w-5xl px-4 pb-10 text-center text-sm text-ink-muted md:px-8">{footer}<p className="mt-2">Sent by the hospital using Geneus</p></footer>
  </div>;
};
const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => <section className={`rounded-card border border-outline-soft bg-white p-5 md:p-6 ${className}`}>{children}</section>;
const Row = ({ label, value, strong = false }: { label: ReactNode; value: ReactNode; strong?: boolean }) =>
  <div className={`flex justify-between gap-4 py-2 ${strong ? 'text-base font-bold' : 'text-sm'}`}><span className={strong ? '' : 'text-ink-soft'}>{label}</span><span className="text-right tabular-nums">{value}</span></div>;
const Pill = ({ paid, children }: { paid: boolean; children: ReactNode }) =>
  <span className={`inline-flex rounded-full px-3 py-1 text-sm font-bold ${paid ? 'bg-brand-tint text-brand' : 'bg-amber-bg text-amber-text'}`}>{children}</span>;
const PdfButton = ({ href }: { href: string }) =>
  <a href={href} className="flex min-h-[48px] items-center justify-center rounded-field border-[1.5px] border-brand px-4 font-bold text-brand hover:bg-brand-wash">Download PDF</a>;
const Status = ({ title, body }: { title: string; body: string }) => <Shell><Card className="mx-auto max-w-lg text-center"><h1 className="text-xl font-extrabold">{title}</h1><p className="mt-2 text-ink-soft">{body}</p></Card></Shell>;

const BillScreen = ({ bill, pdf, messages, checkout }: {
  bill: BillView;
  pdf: string;
  messages: string;
  checkout: ReactNode;
}) => {
  const m = (minor: number) => money(minor, bill.currency), t = bill.totals, paid = bill.status === 'Paid';
  const categories = [...new Set(bill.lines.map((l) => l.category))];
  return <Shell hospital={bill.hospital} footer={<a className="font-semibold text-brand underline" href={messages}>Stop or restart bills and receipts by SMS or email</a>}>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <div className="space-y-5">
        <Card>
          <p className="text-sm font-bold uppercase tracking-wide text-ink-muted">Invoice</p>
          <h1 className="mt-1 text-2xl font-extrabold md:text-3xl">{bill.reference}</h1>
          <p className="mt-2 text-ink-soft">For <strong className="text-ink">{bill.patient.name}</strong> · {bill.patient.patientId}</p>
          <p className="text-sm text-ink-muted">Issued {date(bill.issuedOn, bill.hospital.timeZone)}</p>
        </Card>
        <Card>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-muted">Items</h2>
          {/* A table on wider screens; stacked rows on a phone. */}
          <table className="hidden w-full text-left text-sm md:table">
            <thead className="border-b border-outline text-xs text-ink-muted"><tr><th className="py-2 font-bold">Description</th><th className="py-2 text-right font-bold">Qty</th><th className="py-2 text-right font-bold">Unit price</th><th className="py-2 text-right font-bold">Amount</th></tr></thead>
            {categories.map((category) => <tbody key={category} className="divide-y divide-outline-soft">
              <tr><td colSpan={4} className="pb-1 pt-4 font-bold">{category}</td></tr>
              {bill.lines.filter((l) => l.category === category).map((l, i) => <tr key={i}><td className="py-2 pr-4">{l.description}{l.exempt ? <span className="text-ink-muted"> (exempt)</span> : null}</td><td className="py-2 text-right tabular-nums">{l.quantity}</td><td className="py-2 text-right tabular-nums">{m(l.unitMinor)}</td><td className="py-2 text-right tabular-nums">{m(l.amountMinor)}</td></tr>)}
            </tbody>)}
          </table>
          <div className="md:hidden">{categories.map((category) => <div key={category} className="divide-y divide-outline-soft"><p className="pb-1 pt-3 font-bold">{category}</p>
            {bill.lines.filter((l) => l.category === category).map((l, i) => <Row key={i} label={<>{l.description}{l.quantity !== 1 ? ` × ${l.quantity}` : ''}{l.exempt ? ' (exempt)' : ''}</>} value={m(l.amountMinor)} />)}</div>)}</div>
        </Card>
      </div>
      <Card className="space-y-4 lg:sticky lg:top-6">
        <Pill paid={paid}>{bill.status}</Pill>
        <div><p className="text-sm text-ink-muted">{paid ? 'Nothing to pay' : 'Balance due'}</p><p className="text-3xl font-extrabold tabular-nums">{m(t.dueMinor)}</p></div>
        {checkout}
        <PdfButton href={pdf} />
        <div className="divide-y divide-outline-soft border-t border-outline-soft pt-2">
          <Row label="Subtotal" value={m(t.subtotalMinor)} />
          {t.exemptMinor ? <Row label="Exemptions" value={`− ${m(t.exemptMinor)}`} /> : null}
          {t.reducedMinor ? <Row label="Discounts and waivers" value={`− ${m(t.reducedMinor)}`} /> : null}
          {t.insuranceMinor ? <Row label="Insurance pays" value={`− ${m(t.insuranceMinor)}`} /> : null}
          {t.undecidedMinor ? <Row label="Awaiting insurance decision" value={`− ${m(t.undecidedMinor)}`} /> : null}
          <Row label="Total" value={m(t.totalMinor)} strong />
          <Row label="Amount paid" value={m(t.paidMinor)} />
          <Row label="Balance due" value={m(t.dueMinor)} strong />
          {t.creditMinor ? <Row label="Credit held for you" value={m(t.creditMinor)} /> : null}
        </div>
        {t.undecidedMinor ? <p className="text-sm text-ink-soft">Part of this bill is waiting for your insurer's decision. It isn't in the balance due; the hospital will tell you if you need to pay any of it.</p> : null}
      </Card>
    </div>
  </Shell>;
};

const ReceiptScreen = ({ receipt, pdf, messages }: { receipt: ReceiptView; pdf: string; messages: string }) => {
  const m = (minor: number) => money(minor, receipt.currency);
  return <Shell hospital={receipt.hospital} footer={<a className="font-semibold text-brand underline" href={messages}>Stop or restart bills and receipts by SMS or email</a>}>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <div className="space-y-5">
        <Card>
          <p className="text-sm font-bold uppercase tracking-wide text-ink-muted">Payment receipt</p>
          <h1 className="mt-1 break-all text-2xl font-extrabold md:text-3xl">{receipt.number}</h1>
          {receipt.reversal ? <p className="mt-3 rounded-field bg-danger-bg p-3 font-bold text-danger">REVERSAL · not a new payment</p> : null}
          <p className="mt-2 text-ink-soft">From <strong className="text-ink">{receipt.patient.name}</strong> · {receipt.patient.patientId}</p>
          <p className="text-sm text-ink-muted">{date(receipt.receivedOn, receipt.hospital.timeZone, true)} · {receipt.method}{receipt.reference ? ` · ${receipt.reference}` : ''}</p>
        </Card>
        <Card>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-muted">Applied to</h2>
          <div className="divide-y divide-outline-soft">{receipt.applied.map((a, i) => <Row key={i} label={<><span className="text-ink">{a.item}</span><br /><span className="text-xs">{a.bill}</span></>} value={m(a.amountMinor)} />)}</div>
        </Card>
      </div>
      <Card className="space-y-4 lg:sticky lg:top-6">
        {receipt.reversal ? null : <Pill paid>Paid</Pill>}
        <div><p className="text-sm text-ink-muted">{receipt.reversal ? 'Amount reversed' : 'Amount received'}</p><p className="text-3xl font-extrabold tabular-nums">{m(receipt.amountMinor)}</p></div>
        <PdfButton href={pdf} />
        {receipt.stillDue.length ? <div className="divide-y divide-outline-soft border-t border-outline-soft pt-2">{receipt.stillDue.map((b) => <Row key={b.bill} label={`Still due on ${b.bill}`} value={m(b.dueMinor)} />)}</div> : null}
        <p className="text-sm text-ink-muted">Received by {receipt.receivedBy}</p>
      </Card>
    </div>
  </Shell>;
};

const MessagesScreen = ({ api, back }: { api: string; back: string }) => {
  const [choices, setChoices] = useState<PublicMessageChoices>(), [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'offline' | 'error'>('loading');
  const [busy, setBusy] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => { get<PublicMessageChoices>(api).then((c) => { setChoices(c); setState('ready'); }, (cause) => setState(failure(cause))); }, [api]);
  const choose = async (channel: 'sms' | 'email', choice: 'stop' | 'start') => {
    setBusy(channel); setNotice('');
    try {
      const next = await post<PublicMessageChoices>(api, { channel, choice });
      setChoices(next);
      setNotice(next.changed ? `${channel === 'sms' ? 'SMS' : 'Email'} ${choice === 'stop' ? 'stopped' : 'started again'}.` : 'No change was needed.');
    } catch (cause) { setNotice(failure(cause) === 'offline' ? "Your choice wasn't saved: no internet connection. Try again." : "Your choice wasn't saved. Try again."); }
    finally { setBusy(''); }
  };
  if (state !== 'ready' || !choices) return <Unavailable state={state} />;
  const channel = (key: 'sms' | 'email', label: string) => {
    const c = choices[key];
    return c ? <Card key={key} className="space-y-3"><h2 className="font-bold">{label}</h2>
      <p className="text-ink-soft">{c.stopped ? `Stopped. Bills and receipts aren't sent to ${c.to}.` : `Bills and receipts are sent to ${c.to}.`}</p>
      <button type="button" disabled={Boolean(busy)} onClick={() => void choose(key, c.stopped ? 'start' : 'stop')}
        className={`min-h-[48px] w-full rounded-field px-4 font-bold disabled:opacity-60 sm:w-auto ${c.stopped ? 'bg-brand text-white' : 'border-[1.5px] border-brand text-brand'}`}>
        {busy === key ? 'Saving…' : c.stopped ? `Start ${label.toLowerCase()} again` : `Stop ${label.toLowerCase()}`}</button></Card> : null;
  };
  return <Shell hospital={choices.hospital} footer={<a className="font-semibold text-brand underline" href={back}>Back</a>}>
    <div className="mx-auto max-w-2xl space-y-5">
      <Card><h1 className="text-2xl font-extrabold">Bills and receipts</h1><p className="mt-2 text-ink-soft">Choose how {choices.hospital} sends you bills and receipts. You can change this at any time from any message.</p>
        {notice ? <p role="status" className="mt-3 rounded-field bg-brand-wash p-3 font-semibold text-brand">{notice}</p> : null}</Card>
      {channel('sms', 'SMS')}{channel('email', 'Email')}
      {!choices.sms && !choices.email ? <Card><p>The hospital has no phone number or email address for you, so nothing is sent.</p></Card> : null}
    </div>
  </Shell>;
};

const Unavailable = ({ state }: { state: 'loading' | 'ready' | 'unavailable' | 'offline' | 'error' }) => state === 'loading'
  ? <Shell><p role="status" className="text-center text-ink-muted">Opening…</p></Shell>
  : state === 'unavailable' ? <Status title="This link isn't available" body="It may have expired, or the hospital stopped it. Ask the hospital to send you a new one." />
  : state === 'offline' ? <Status title="No internet connection" body="Check your connection and open the link again." />
  : <Status title="Something went wrong" body="The page couldn't be opened. Try again in a minute." />;

export const PublicDocumentsApp = () => {
  const route = publicRoute(window.location.pathname);
  const [revision, setRevision] = useState(0);
  const paymentConfirmed = useCallback(() => setRevision((value) => value + 1), []);
  const [doc, setDoc] = useState<PublicDocument>(), [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'offline' | 'error'>('loading');
  useEffect(() => {
    // Never indexed, and the token never leaves in a Referer header.
    for (const [name, content] of [['robots', 'noindex,nofollow'], ['referrer', 'no-referrer']]) { const meta = document.createElement('meta'); meta.name = name; meta.content = content; document.head.append(meta); }
  }, []);
  useEffect(() => {
    if (!route || route.messages) return;
    get<PublicDocument>(`/public/documents/${route.kind}/${route.token}`).then((d) => {
      setDoc(d); setState('ready');
      document.title = d.kind === 'bill' ? `Invoice ${d.bill.reference} · ${d.bill.hospital.name}` : `Receipt ${d.receipt.number} · ${d.receipt.hospital.name}`;
    }, (cause) => setState(failure(cause)));
  }, [route?.kind, route?.token, route?.messages, revision]);
  if (!route) return <Status title="Page not found" body="Check the link the hospital sent you." />;
  const api = `/public/documents/${route.kind}/${route.token}`, page = `/p/${route.kind === 'bill' ? 'b' : 'r'}/${route.token}`;
  if (route.messages) return <MessagesScreen api={`${api}/messages`} back={page} />;
  if (state !== 'ready' || !doc) return <Unavailable state={state} />;
  return doc.kind === 'bill'
    ? <BillScreen
        bill={doc.bill}
        pdf={apiUrl(`${api}/pdf`)}
        messages={`${page}/messages`}
        checkout={<BillCheckout api={api} payable={doc.bill.payable} onConfirmed={paymentConfirmed} />}
      />
    : <ReceiptScreen receipt={doc.receipt} pdf={apiUrl(`${api}/pdf`)} messages={`${page}/messages`} />;
};
