import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CLAIM_EXPORT_FIELDS, DEFAULT_CLAIM_COLUMNS, SubmissionChannel,
  type ClaimAuthorization, type ClaimExportField, type ClaimState, type ClaimView, type FeeCategory, type ImportTemplate, type InsuranceDocument, type Payer,
} from '@shared';
import { useLiveQuery } from '@/data';
import { listPayers } from '@/data/repos/insurance';
import {
  CLAIM_ISSUE_LABELS, acknowledgeClaims, createClaimBatch, exportClaims, generateClaims, listAuthorizations, listClaimBatches, listClaimSubmissions, listClaims,
  listImportTemplates, listInsuranceDocuments, markClaimsReady, reviseClaim, saveAuthorization, saveImportTemplate, setClaimAttachment, submitClaims, VerificationRequired,
  type ClaimBatch, type ClaimExport, type ClaimSubmission,
} from '@/lib/api/insurance';
import { downloadTable } from '@/lib/tabular/exportTable';
import { formatMoney } from '@/lib/money';
import { useAuthorizationContext } from '@/session';
import { Button, SelectField, TextField, useToast } from '@/ui';
import { StaffVerification } from './StaffVerification';
import { useDeviceInsurance } from './CoverCard';

const describeError = (cause: unknown) => cause instanceof VerificationRequired ? 'Your verification ended. Verify again to continue.' : cause instanceof Error ? cause.message : 'The request failed';
const STATE_LABELS: Record<ClaimState, string> = { draft: 'Draft', ready: 'Ready', exported: 'Exported', submitted: 'Submitted', acknowledged: 'Acknowledged' };
const FIELD_LABELS: Record<ClaimExportField, string> = {
  claimNumber: 'Claim number', claimRevision: 'Revision', claimStatus: 'Claim status', batchReference: 'Batch', facilityName: 'Hospital', patientName: 'Patient name', hospitalNumber: 'Hospital number',
  enrolleeNumber: 'Enrollee number', planCode: 'Plan', serviceDate: 'Date of service', admissionDate: 'Admission date', dischargeDate: 'Discharge date', diagnosis: 'Diagnosis', diagnosisCode: 'Diagnosis code',
  authorizationCode: 'Authorization code', referralNumber: 'Referral number', payerServiceCode: "Payer's service code", serviceName: 'Service', category: 'Category', quantity: 'Quantity',
  unitPrice: 'Unit price', amountClaimed: 'Amount claimed', patientShare: 'Patient share', listPrice: 'Hospital price', fulfilledOn: 'Date performed',
};
const EVIDENCE: Record<string, string> = { administrative: 'Administrative', result: 'Result recorded', dispense: 'Supplied', visit: 'Seen by a clinician', completion: 'Recorded as done', not_done: 'Not done', missing: 'No record it was done' };
const today = () => new Date().toISOString().slice(0, 10);
const escapeHtml = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/**
 * Claims to payers, prepared from confirmed insurance splits. Each state is a
 * separate fact recorded by a person: ready (every check passed), exported (a
 * file was made), submitted (sent, with a reference), acknowledged (the payer
 * confirmed receipt). None of them is the payer's approval.
 */
export const ClaimsScreen = () => {
  const insurance = useDeviceInsurance();
  useEffect(() => { document.title = 'Claims · Geneus Health'; }, []);
  if (insurance !== 'active' && insurance !== 'history') return <main className="p-4"><h1 className="text-xl font-bold">Claims</h1><p className="mt-2 text-sm">Claims start once insurance billing is active.</p></main>;
  return <main className="mx-auto max-w-6xl space-y-6 p-4">
    <header><h1 className="text-2xl font-extrabold">Claims</h1><p className="text-sm text-ink-soft">Prepare, export and record claims through each payer's own channel. Exporting is not submitting, and submitting is not approval.</p></header>
    <StaffVerification purpose="Preparing claims"><ClaimsBody /></StaffVerification>
  </main>;
};

const ClaimsBody = () => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const payers = useLiveQuery(useCallback(() => listPayers(), []), ['payer']).data ?? [];
  const [tab, setTab] = useState<'claims' | 'batches' | 'layouts'>('claims');
  const [claims, setClaims] = useState<ClaimView[]>(); const [error, setError] = useState(''); const [busy, setBusy] = useState('');
  const [payerId, setPayerId] = useState(''); const [state, setState] = useState<ClaimState | ''>(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set()); const [open, setOpen] = useState('');
  const [templates, setTemplates] = useState<ImportTemplate[]>([]);
  const load = useCallback(async () => {
    try {
      setClaims((await listClaims(context, { ...(payerId ? { payerId } : {}), ...(state ? { state } : {}) })).claims);
      setTemplates((await listImportTemplates(context, 'claim_export')).templates); setError('');
    } catch (cause) { setError(describeError(cause)); }
  }, [context, payerId, state]);
  useEffect(() => { void load(); }, [load]);
  const payerName = (id: string) => payers.find((p) => p.id === id)?.name ?? id;
  const run = async (label: string, action: () => Promise<void>) => { setBusy(label); setError(''); try { await action(); await load(); } catch (cause) { setError(describeError(cause)); } finally { setBusy(''); } };
  const chosen = (claims ?? []).filter((c) => selected.has(c.id));

  return <div className="space-y-5">
    {error ? <p role="alert" className="rounded-field border border-danger bg-danger-bg p-3 text-sm text-danger">{error}</p> : null}
    <div role="tablist" className="flex flex-wrap gap-2">{([['claims', 'Claims'], ['batches', 'Batches & submissions'], ['layouts', 'Export layouts']] as const).map(([key, label]) =>
      <Button key={key} role="tab" aria-selected={tab === key} variant={tab === key ? 'secondary' : 'ghost'} fullWidth={false} onClick={() => setTab(key)}>{label}</Button>)}</div>

    {tab === 'claims' ? <>
      <section aria-label="Generate claims" className="grid gap-2 rounded-card border border-outline-soft bg-white p-4 sm:grid-cols-4">
        <SelectField label="Payer" value={payerId} options={[{ value: '', label: 'All payers' }, ...payers.map((p) => ({ value: p.id, label: p.name }))]} onChange={(e) => setPayerId(e.target.value)} />
        <TextField label="Services from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextField label="Services to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <div className="flex items-end"><Button fullWidth loading={busy === 'generate'} onClick={() => void run('generate', async () => {
          const r = await generateClaims(context, { ...(payerId ? { payerId } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) });
          toast(r.lines ? `${r.lines} service${r.lines === 1 ? '' : 's'} added: ${r.created} new claim${r.created === 1 ? '' : 's'}, ${r.extended} extended.` : 'No new confirmed services to claim.');
        })}>Generate claims</Button></div>
        <p className="text-xs text-ink-soft sm:col-span-4">Only confirmed insurance splits the payer owes, paid per service, become claim lines. Capitation and patient-paid charges never do, and no service is claimed twice.</p>
      </section>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-48"><SelectField label="State" value={state} options={[{ value: '', label: 'All states' }, ...Object.entries(STATE_LABELS).map(([value, label]) => ({ value, label }))]} onChange={(e) => setState(e.target.value as ClaimState | '')} /></div>
        <Button variant="outlined" fullWidth={false} disabled={!chosen.length} loading={busy === 'ready'} onClick={() => void run('ready', async () => {
          const r = await markClaimsReady(context, chosen.map((c) => c.id));
          const ok = r.outcomes.filter((o) => o.outcome === 'ready').length;
          toast(`${ok} claim${ok === 1 ? '' : 's'} ready${r.outcomes.length > ok ? `; ${r.outcomes.length - ok} still blocked` : ''}.`);
        })}>Mark ready ({chosen.length})</Button>
        <ExportControls claims={chosen} templates={templates} payerName={payerName} onDone={load} onError={setError} />
      </div>
      {!claims ? <p role="status">Loading…</p> : claims.length === 0 ? <p className="text-sm">No claims yet. Generate them from confirmed insurance splits.</p> :
        <div className="overflow-x-auto"><table className="min-w-full text-left text-sm">
          <thead><tr className="border-b border-outline-soft"><th className="p-2"><input type="checkbox" aria-label="Select all claims" checked={selected.size === claims.length} onChange={(e) => setSelected(new Set(e.target.checked ? claims.map((c) => c.id) : []))} /></th>
            <th className="p-2">Claim</th><th className="p-2">Patient</th><th className="p-2">Payer</th><th className="p-2">Services</th><th className="p-2">Claimed</th><th className="p-2">State</th><th className="p-2">Checks</th><th /></tr></thead>
          <tbody>{claims.map((c) => { const blocking = c.issues.filter((i) => i.blocking).length; return <tr key={c.id} data-claim={c.claimNumber} data-state={c.state} className="border-b border-outline-soft align-top">
            <td className="p-2"><input type="checkbox" aria-label={`Select ${c.claimNumber}`} checked={selected.has(c.id)} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })} /></td>
            <td className="p-2 font-semibold">{c.claimNumber}{c.revision > 1 ? ` r${c.revision}` : ''}</td><td className="p-2">{c.patientName}<span className="block text-xs text-ink-soft">{c.enrolleeNumber}</span></td>
            <td className="p-2">{payerName(c.payerId)}</td><td className="p-2">{c.serviceFrom}{c.serviceTo !== c.serviceFrom ? ` – ${c.serviceTo}` : ''} · {c.lines.length}</td>
            <td className="p-2">{formatMoney(c.payerShareMinor, c.currency)}</td><td className="p-2">{STATE_LABELS[c.state]}</td>
            <td className={`p-2 ${blocking ? 'text-danger' : 'text-success'}`}>{blocking ? `${blocking} blocking` : 'Pass'}</td>
            <td className="p-2"><Button variant="ghost" fullWidth={false} onClick={() => setOpen(open === c.id ? '' : c.id)}>{open === c.id ? 'Close' : 'Open'}</Button></td>
          </tr>; })}</tbody></table></div>}
      {claims?.find((c) => c.id === open) ? <ClaimDetail claim={claims.find((c) => c.id === open)!} payerName={payerName} onChanged={load} onError={setError} /> : null}
    </> : null}
    {tab === 'batches' ? <BatchesPanel payers={payers} claims={claims ?? []} templates={templates} payerName={payerName} onChanged={load} onError={setError} /> : null}
    {tab === 'layouts' ? <LayoutEditor payers={payers} templates={templates} onSaved={load} onError={setError} /> : null}
  </div>;
};

/** Writes or prints an export. A draft export is marked on every row and changes no claim. */
const ExportControls = ({ claims, batchId, templates, payerName, onDone, onError }: { claims: ClaimView[]; batchId?: string; templates: ImportTemplate[]; payerName: (id: string) => string; onDone: () => void; onError: (m: string) => void }) => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const payerId = claims[0]?.payerId;
  const layouts = templates.filter((t) => !t.payerId || t.payerId === payerId);
  const [format, setFormat] = useState<'xlsx' | 'csv' | 'pdf'>('xlsx'); const [layout, setLayout] = useState(''); const [busy, setBusy] = useState(false);
  const draft = claims.some((c) => c.state === 'draft');
  const mixed = new Set(claims.map((c) => c.payerId)).size > 1;
  const go = async () => {
    // A print window must open on the click itself, before the server answers, or browsers block it.
    const printWindow = format === 'pdf' ? window.open('', '_blank') : null;
    setBusy(true);
    try {
      const result = await exportClaims(context, { ...(batchId ? { batchId } : { claimIds: claims.map((c) => c.id) }), draft, format, ...(layout ? { templateId: layout } : {}) });
      const name = `${payerName(payerId ?? 'claims').replace(/[^\w-]+/g, '-')}-claims-${today()}${result.draft ? '-DRAFT' : ''}`;
      if (format === 'pdf') printClaims(printWindow, result, payerName(payerId ?? ''));
      else await downloadTable(`${name}.xlsx`, result.draft ? 'DRAFT claims' : 'Claims', [result.headers, ...result.rows], format);
      toast(result.draft ? 'Draft exported: marked on every row, no claim changed.' : `${result.claims.length} claim${result.claims.length === 1 ? '' : 's'} exported. Record the submission when you send them.`);
      onDone();
    } catch (cause) { printWindow?.close(); onError(describeError(cause)); } finally { setBusy(false); }
  };
  return <div className="flex flex-wrap items-end gap-2">
    <div className="w-32"><SelectField label="Format" value={format} options={[{ value: 'xlsx', label: 'Excel' }, { value: 'csv', label: 'CSV' }, { value: 'pdf', label: 'Print / PDF' }]} onChange={(e) => setFormat(e.target.value as typeof format)} /></div>
    <div className="w-56"><SelectField label="Layout" value={layout} options={[{ value: '', label: 'Geneus standard columns' }, ...layouts.map((t) => ({ value: t.id, label: t.name }))]} onChange={(e) => setLayout(e.target.value)} /></div>
    <Button fullWidth={false} disabled={(!claims.length && !batchId) || mixed} loading={busy} onClick={() => void go()}>{draft ? 'Export as draft' : 'Export'}{batchId ? ' batch' : ` (${claims.length})`}</Button>
    {mixed ? <span className="text-xs text-danger">Export one payer at a time</span> : null}
  </div>;
};

/** A printable claim document; the browser's print dialog saves it as PDF. Every value is escaped. */
const printClaims = (target: Window | null, result: ClaimExport, payer: string) => {
  if (!target) throw new Error('Allow pop-ups for Geneus to print claims');
  const groups = new Map<string, (string | number)[][]>();
  const numberAt = result.headers.findIndex((h, i) => h === 'claimNumber' || i === 0);
  for (const row of result.rows) groups.set(String(row[numberAt]), [...(groups.get(String(row[numberAt])) ?? []), row]);
  const body = [...groups.entries()].map(([claim, rows]) => `<section><h2>${escapeHtml(claim)}</h2><table><thead><tr>${result.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${escapeHtml(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`).join('');
  target.document.open();
  target.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(payer)} claims</title><style>
    body{font:12px system-ui,sans-serif;margin:24px;color:#111} h1{font-size:18px} h2{font-size:14px;margin:18px 0 6px} table{border-collapse:collapse;width:100%}
    th,td{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top} .draft{color:#b00020;font-weight:700;font-size:16px;border:2px solid #b00020;padding:6px;margin:8px 0}
    @media print{button{display:none}}</style></head><body><h1>${escapeHtml(payer)} — claims</h1>
    ${result.draft ? '<p class="draft">DRAFT — NOT FOR SUBMISSION</p>' : ''}<p>Export ${escapeHtml(result.exportId)} · checksum ${escapeHtml(result.payloadSha256.slice(0, 16))}</p>${body}
    <p><button onclick="window.print()">Print / Save as PDF</button></p></body></html>`);
  target.document.close();
};

const ClaimDetail = ({ claim, payerName, onChanged, onError }: { claim: ClaimView; payerName: (id: string) => string; onChanged: () => void; onError: (m: string) => void }) => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const [documents, setDocuments] = useState<InsuranceDocument[]>([]); const [auths, setAuths] = useState<ClaimAuthorization[]>([]);
  const [reason, setReason] = useState(''); const [addingAuth, setAddingAuth] = useState(false);
  const loadAux = useCallback(async () => {
    try {
      setDocuments((await listInsuranceDocuments(context, claim.payerId)).documents.filter((d) => d.verification !== 'rejected'));
      setAuths((await listAuthorizations(context, claim.patientId)).authorizations.filter((a) => a.payerId === claim.payerId));
    } catch (cause) { onError(describeError(cause)); }
  }, [context, claim.payerId, claim.patientId, onError]);
  useEffect(() => { void loadAux(); }, [loadAux]);
  const attach = async (documentId: string, remove: boolean) => { try { await setClaimAttachment(context, claim.id, documentId, remove); onChanged(); } catch (cause) { onError(describeError(cause)); } };
  return <section aria-label={`Claim ${claim.claimNumber}`} className="space-y-4 rounded-card border border-outline-soft bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div>
      <h2 className="text-lg font-bold">{claim.claimNumber}{claim.revision > 1 ? ` · revision ${claim.revision}` : ''} · {STATE_LABELS[claim.state]}</h2>
      <p className="text-sm text-ink-soft">{claim.patientName} · {claim.enrolleeNumber} · {claim.planCode} · {payerName(claim.payerId)} · {claim.episode.kind === 'admission' ? 'Admission' : claim.episode.kind === 'encounter' ? 'Visit' : claim.episode.kind === 'appointment' ? 'Booking' : 'Day'} {claim.serviceFrom}{claim.serviceTo !== claim.serviceFrom ? ` – ${claim.serviceTo}` : ''}</p>
    </div><p className="text-lg font-bold">{formatMoney(claim.payerShareMinor, claim.currency)}</p></div>
    {claim.issues.length ? <ul aria-label="Checks" className="space-y-1 text-sm">{claim.issues.map((i, n) => <li key={n} className={i.blocking ? 'text-danger' : 'text-amber-text'}><strong>{CLAIM_ISSUE_LABELS[i.code]}{i.blocking ? '' : ' (warning)'}:</strong> {i.message}</li>)}</ul>
      : <p className="text-sm text-success">Every check passes.</p>}
    <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-outline-soft"><th className="p-2">Service</th><th className="p-2">Date</th><th className="p-2">Qty</th><th className="p-2">Payer pays</th><th className="p-2">Shown as done by</th><th className="p-2">Authorization</th><th className="p-2">Contract</th></tr></thead>
      <tbody>{claim.lines.map((l) => <tr key={l.chargeId} className="border-b border-outline-soft align-top"><td className="p-2">{l.description}{l.payerCode ? <span className="block text-xs text-ink-soft">{l.payerCode}</span> : null}</td>
        <td className="p-2">{l.serviceDate}</td><td className="p-2">{l.units}</td><td className="p-2">{formatMoney(l.payerShareMinor, claim.currency)}</td>
        <td className={`p-2 ${l.fulfillment.kind === 'missing' || l.fulfillment.kind === 'not_done' ? 'text-danger' : ''}`}>{EVIDENCE[l.fulfillment.kind]}{'on' in l.fulfillment ? <span className="block text-xs text-ink-soft">{new Date(l.fulfillment.on).toLocaleString('en-GB')}</span> : null}</td>
        <td className="p-2">{l.authorization?.reference ?? '—'}</td><td className="p-2 text-xs">{l.contractVersionId.split(':').pop()}</td></tr>)}</tbody></table></div>
    <p className="text-sm"><strong>Diagnosis:</strong> {claim.diagnoses.length ? claim.diagnoses.map((d) => `${d.label}${d.code ? ` (${d.codingSystem ?? ''} ${d.code})` : ''}`).join('; ') : 'none recorded by a clinician'}</p>
    <div className="grid gap-4 lg:grid-cols-2">
      <section aria-label="Authorizations" className="space-y-2">
        <div className="flex items-center justify-between"><h3 className="font-bold">Authorizations and referrals</h3><Button variant="ghost" fullWidth={false} onClick={() => setAddingAuth(!addingAuth)}>{addingAuth ? 'Cancel' : 'Record'}</Button></div>
        {auths.filter((a) => !a.replacedBy).map((a) => <p key={a.id} className="text-sm">{a.kind === 'referral' ? 'Referral' : 'Authorization'} · {a.status}{a.reference ? ` · ${a.reference}` : ''} · {a.validFrom} to {a.validTo}</p>)}
        {addingAuth ? <AuthorizationForm claim={claim} existing={auths.filter((a) => !a.replacedBy)} documents={documents} onSaved={() => { setAddingAuth(false); toast('Recorded.'); void loadAux(); onChanged(); }} onError={onError} /> : null}
      </section>
      <section aria-label="Attachments" className="space-y-2">
        <h3 className="font-bold">Supporting documents</h3>
        {documents.length === 0 ? <p className="text-sm text-ink-soft">No documents stored for this payer. Upload them under Payers &amp; contracts.</p> : documents.map((d) => {
          const on = claim.attachments.some((a) => a.documentId === d.id);
          return <label key={d.id} className="flex min-h-[40px] items-center gap-2 text-sm"><input type="checkbox" checked={on} disabled={claim.state !== 'draft'} onChange={(e) => void attach(d.id, !e.target.checked)} />{d.title} <span className="text-xs text-ink-soft">({d.documentType.replace(/_/g, ' ')})</span></label>;
        })}
      </section>
    </div>
    {claim.state !== 'draft' ? <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); reviseClaim(context, claim.id, reason).then((r) => { toast(`Revision ${r.revision} started; the earlier claim and its history are kept.`); setReason(''); onChanged(); }, (cause) => onError(describeError(cause))); }}>
      <div className="min-w-[260px] flex-1"><TextField label="Reason for a corrected claim" value={reason} onChange={(e) => setReason(e.target.value)} /></div><Button type="submit" variant="outlined" fullWidth={false} disabled={reason.trim().length < 3}>Revise claim</Button>
    </form> : null}
    <details><summary className="cursor-pointer text-sm font-semibold">History</summary><ul className="mt-1 space-y-1 text-sm">{claim.events.map((e, i) => <li key={i}>{new Date(e.at).toLocaleString('en-GB')} · {STATE_LABELS[e.state]}{e.note ? ` · ${e.note}` : ''}</li>)}</ul></details>
  </section>;
};

const AuthorizationForm = ({ claim, existing, documents, onSaved, onError }: { claim: ClaimView; existing: ClaimAuthorization[]; documents: InsuranceDocument[]; onSaved: () => void; onError: (m: string) => void }) => {
  const context = useAuthorizationContext();
  const [kind, setKind] = useState<'pre_authorization' | 'referral'>('pre_authorization'); const [status, setStatus] = useState<'requested' | 'approved' | 'denied'>('approved');
  const [reference, setReference] = useState(''); const [validFrom, setValidFrom] = useState(claim.serviceFrom); const [validTo, setValidTo] = useState(claim.serviceTo);
  const [feeItemIds, setFeeItemIds] = useState<string[]>([]); const [via, setVia] = useState<'portal' | 'phone' | 'email' | 'letter' | 'other'>('phone');
  const [replaces, setReplaces] = useState(''); const [evidence, setEvidence] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await saveAuthorization(context, { patientId: claim.patientId, payerId: claim.payerId, kind, status, ...(reference.trim() ? { reference: reference.trim() } : {}), validFrom, validTo, feeItemIds,
        categories: [] as FeeCategory[], ...(kind === 'pre_authorization' && !feeItemIds.length && claim.episode.kind === 'encounter' ? { encounterId: claim.episode.key } : {}),
        obtainedVia: via, ...(replaces ? { replaces } : {}), ...(evidence ? { evidenceDocumentId: evidence } : {}) });
      onSaved();
    } catch (cause) { onError(describeError(cause)); } finally { setBusy(false); }
  };
  return <form aria-label="Record authorization" className="space-y-2 rounded-field border border-outline-soft p-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
    <SelectField label="Kind" value={kind} options={[{ value: 'pre_authorization', label: 'Prior authorization' }, { value: 'referral', label: 'Referral' }]} onChange={(e) => setKind(e.target.value as typeof kind)} />
    <SelectField label="Status" value={status} options={[{ value: 'requested', label: 'Requested' }, { value: 'approved', label: 'Approved' }, { value: 'denied', label: 'Denied' }]} onChange={(e) => setStatus(e.target.value as typeof status)} />
    <TextField label={kind === 'referral' ? 'Referral number' : "Payer's authorization code"} value={reference} onChange={(e) => setReference(e.target.value)} />
    <div className="grid grid-cols-2 gap-2"><TextField label="Valid from" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} /><TextField label="Valid to" type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} /></div>
    {kind === 'pre_authorization' ? <fieldset className="space-y-1"><legend className="text-sm font-semibold">Services covered (none: the whole visit)</legend>{[...new Map(claim.lines.map((l) => [l.feeItemId, l.description])).entries()].map(([id, name]) =>
      <label key={id} className="flex min-h-[40px] items-center gap-2 text-sm"><input type="checkbox" checked={feeItemIds.includes(id)} onChange={(e) => setFeeItemIds(e.target.checked ? [...feeItemIds, id] : feeItemIds.filter((x) => x !== id))} />{name}</label>)}</fieldset> : null}
    <SelectField label="Obtained by" value={via} options={['phone', 'portal', 'email', 'letter', 'other'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} onChange={(e) => setVia(e.target.value as typeof via)} />
    {existing.length ? <SelectField label="Replaces (an update to an earlier record)" value={replaces} options={[{ value: '', label: 'Nothing — a new record' }, ...existing.map((a) => ({ value: a.id, label: `${a.kind === 'referral' ? 'Referral' : 'Authorization'} · ${a.status}${a.reference ? ` · ${a.reference}` : ''}` }))]} onChange={(e) => setReplaces(e.target.value)} /> : null}
    <SelectField label="Evidence document (optional)" value={evidence} options={[{ value: '', label: 'None' }, ...documents.map((d) => ({ value: d.id, label: d.title }))]} onChange={(e) => setEvidence(e.target.value)} />
    <Button type="submit" fullWidth={false} loading={busy}>Save</Button>
  </form>;
};

const BatchesPanel = ({ payers, claims, templates, payerName, onChanged, onError }: { payers: Payer[]; claims: ClaimView[]; templates: ImportTemplate[]; payerName: (id: string) => string; onChanged: () => void; onError: (m: string) => void }) => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const [batches, setBatches] = useState<ClaimBatch[]>([]); const [submissions, setSubmissions] = useState<ClaimSubmission[]>([]);
  const [payerId, setPayerId] = useState(payers[0]?.id ?? ''); const [periodFrom, setPeriodFrom] = useState(''); const [periodTo, setPeriodTo] = useState(today()); const [reference, setReference] = useState('');
  const load = useCallback(async () => {
    try { setBatches((await listClaimBatches(context)).batches); setSubmissions((await listClaimSubmissions(context)).submissions); } catch (cause) { onError(describeError(cause)); }
  }, [context, onError]);
  useEffect(() => { void load(); }, [load]);
  const exported = claims.filter((c) => c.state === 'exported');
  return <div className="space-y-6">
    <section aria-label="New batch" className="grid gap-2 rounded-card border border-outline-soft bg-white p-4 sm:grid-cols-5">
      <SelectField label="Payer" value={payerId} options={payers.map((p) => ({ value: p.id, label: p.name }))} onChange={(e) => setPayerId(e.target.value)} />
      <TextField label="Period from" type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
      <TextField label="Period to" type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
      <TextField label="Reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} />
      <div className="flex items-end"><Button fullWidth disabled={!payerId || !periodFrom} onClick={() => createClaimBatch(context, { payerId, periodFrom, periodTo, ...(reference.trim() ? { reference: reference.trim() } : {}) })
        .then((r) => { toast(`${r.reference}: ${r.claims} ready claim${r.claims === 1 ? '' : 's'}.`); void load(); onChanged(); }, (cause) => onError(describeError(cause)))}>Create batch</Button></div>
      <p className="text-xs text-ink-soft sm:col-span-5">A batch holds ready claims for one payer and any period the payer asks for — a month, a fortnight or a single admission.</p>
    </section>
    <section aria-label="Batches" className="space-y-2"><h2 className="text-lg font-bold">Batches</h2>
      {batches.length === 0 ? <p className="text-sm">No batches yet.</p> : batches.map((b) => <div key={b.id} className="flex flex-wrap items-end justify-between gap-2 rounded-field border border-outline-soft bg-white p-3 text-sm">
        <span><strong>{b.reference}</strong> · {payerName(b.payerId)} · {b.periodFrom} to {b.periodTo} · {b.claims} claim{b.claims === 1 ? '' : 's'}</span>
        <ExportControls claims={claims.filter((c) => c.batchId === b.id)} batchId={b.id} templates={templates} payerName={payerName} onDone={onChanged} onError={onError} />
      </div>)}</section>
    <SubmissionForm exported={exported} payerName={payerName} onSaved={() => { void load(); onChanged(); }} onError={onError} />
    <section aria-label="Submissions" className="space-y-2"><h2 className="text-lg font-bold">Submission history</h2>
      {submissions.length === 0 ? <p className="text-sm">Nothing submitted yet.</p> : submissions.map((s) => <AcknowledgeRow key={s.id} submission={s} payerName={payerName} onSaved={() => { void load(); onChanged(); }} onError={onError} />)}</section>
  </div>;
};

const SubmissionForm = ({ exported, payerName, onSaved, onError }: { exported: ClaimView[]; payerName: (id: string) => string; onSaved: () => void; onError: (m: string) => void }) => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const [ids, setIds] = useState<string[]>([]); const [channel, setChannel] = useState<'portal' | 'email' | 'physical' | 'other'>('portal'); const [reference, setReference] = useState(''); const [submittedOn, setSubmittedOn] = useState(today());
  const chosen = useMemo(() => exported.filter((c) => ids.includes(c.id)), [exported, ids]);
  return <section aria-label="Record submission" className="space-y-2 rounded-card border border-outline-soft bg-white p-4">
    <h2 className="text-lg font-bold">Record a submission</h2>
    <p className="text-sm text-ink-soft">After sending exported claims through the payer's channel, record it here with the payer's reference. This does not mean the payer approved them.</p>
    {exported.length === 0 ? <p className="text-sm">No exported claims waiting to be recorded as sent.</p> : <>
      {exported.map((c) => <label key={c.id} className="flex min-h-[40px] items-center gap-2 text-sm"><input type="checkbox" checked={ids.includes(c.id)} onChange={(e) => setIds(e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id))} />{c.claimNumber}{c.revision > 1 ? ` r${c.revision}` : ''} · {c.patientName} · {payerName(c.payerId)}</label>)}
      <div className="grid gap-2 sm:grid-cols-3">
        <SelectField label="Sent by" value={channel} options={SubmissionChannel.options.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} onChange={(e) => setChannel(e.target.value as typeof channel)} />
        <TextField label="Payer's reference" value={reference} onChange={(e) => setReference(e.target.value)} />
        <TextField label="Sent on" type="date" value={submittedOn} onChange={(e) => setSubmittedOn(e.target.value)} />
      </div>
      <Button fullWidth={false} disabled={!chosen.length || !reference.trim() || new Set(chosen.map((c) => c.payerId)).size > 1} onClick={() => submitClaims(context, { claimIds: chosen.map((c) => c.id), channel, reference: reference.trim(), submittedOn })
        .then((r) => { toast(`${r.claims} claim${r.claims === 1 ? '' : 's'} recorded as submitted.`); setIds([]); setReference(''); onSaved(); }, (cause) => onError(describeError(cause)))}>Record submission</Button>
    </>}
  </section>;
};

const AcknowledgeRow = ({ submission, payerName, onSaved, onError }: { submission: ClaimSubmission; payerName: (id: string) => string; onSaved: () => void; onError: (m: string) => void }) => {
  const context = useAuthorizationContext();
  const [reference, setReference] = useState(''); const [on, setOn] = useState(today());
  return <div data-submission={submission.reference} className="space-y-2 rounded-field border border-outline-soft bg-white p-3 text-sm">
    <p><strong>{submission.reference}</strong> · {payerName(submission.payerId)} · {submission.channel} · sent {submission.submittedOn} · {submission.claimIds.length} claim{submission.claimIds.length === 1 ? '' : 's'}</p>
    {submission.acknowledgement ? <p className="text-success">Acknowledged {submission.acknowledgement.acknowledgedOn}{submission.acknowledgement.reference ? ` · ${submission.acknowledgement.reference}` : ''} (receipt only, not approval)</p>
      : <div className="flex flex-wrap items-end gap-2"><div className="w-56"><TextField label="Acknowledgement reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} /></div>
        <div className="w-40"><TextField label="Acknowledged on" type="date" value={on} onChange={(e) => setOn(e.target.value)} /></div>
        <Button variant="outlined" fullWidth={false} onClick={() => acknowledgeClaims(context, { submissionId: submission.id, acknowledgedOn: on, ...(reference.trim() ? { reference: reference.trim() } : {}) }).then(onSaved, (cause) => onError(describeError(cause)))}>Record acknowledgement</Button></div>}
  </div>;
};

/** A payer's claim sheet: which fields, in what order, under what headers and formats. Reuses the saved-mapping store. */
const LayoutEditor = ({ payers, templates, onSaved, onError }: { payers: Payer[]; templates: ImportTemplate[]; onSaved: () => void; onError: (m: string) => void }) => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const [payerId, setPayerId] = useState(payers[0]?.id ?? ''); const [name, setName] = useState('');
  const [columns, setColumns] = useState<{ field: ClaimExportField; header: string }[]>(DEFAULT_CLAIM_COLUMNS.map((f) => ({ field: f, header: FIELD_LABELS[f] })));
  const [dateFormat, setDateFormat] = useState<'date_iso' | 'date_dmy'>('date_dmy'); const [amountFormat, setAmountFormat] = useState<'amount_major' | 'amount_minor'>('amount_major');
  const [editing, setEditing] = useState<ImportTemplate>();
  const open = (t: ImportTemplate) => {
    setEditing(t); setName(t.name); setPayerId(t.payerId ?? '');
    setColumns(Object.entries(t.mapping).sort((a, b) => a[1] - b[1]).map(([field, column]) => ({ field: field as ClaimExportField, header: t.headers[column] ?? '' })));
    const formats = Object.values(t.formats ?? {});
    setDateFormat(formats.includes('date_iso') ? 'date_iso' : 'date_dmy'); setAmountFormat(formats.includes('amount_minor') ? 'amount_minor' : 'amount_major');
  };
  const move = (i: number, by: number) => setColumns((c) => { const n = [...c]; const [x] = n.splice(i, 1); n.splice(Math.max(0, Math.min(n.length, i + by)), 0, x); return n; });
  const unused = CLAIM_EXPORT_FIELDS.filter((f) => !columns.some((c) => c.field === f));
  const save = async () => {
    try {
      const formats: Record<string, typeof dateFormat | typeof amountFormat> = {};
      for (const c of columns) { if (/date|Date/.test(c.field) || c.field === 'fulfilledOn') formats[c.field] = dateFormat; if (['unitPrice', 'amountClaimed', 'patientShare', 'listPrice'].includes(c.field)) formats[c.field] = amountFormat; }
      await saveImportTemplate(context, { kind: 'claim_export', ...(payerId ? { payerId } : {}), name: name.trim(), headerRow: 0, headers: columns.map((c) => c.header.trim()), mapping: Object.fromEntries(columns.map((c, i) => [c.field, i])), formats,
        ...(editing && editing.name.toLowerCase() === name.trim().toLowerCase() && (editing.payerId ?? '') === payerId ? { expectedRevision: editing.revision } : {}) });
      toast(`Layout "${name.trim()}" saved.`); onSaved();
    } catch (cause) { onError(describeError(cause)); }
  };
  return <section aria-label="Export layout" className="space-y-3 rounded-card border border-outline-soft bg-white p-4">
    <h2 className="text-lg font-bold">Export layouts</h2>
    <p className="text-sm text-ink-soft">Match each payer's claim sheet: the same column names, order and formats. Saved layouts appear when exporting.</p>
    {templates.length ? <div className="flex flex-wrap gap-2">{templates.map((t) => <Button key={t.id} variant="ghost" fullWidth={false} onClick={() => open(t)}>Edit “{t.name}”</Button>)}</div> : null}
    <div className="grid gap-2 sm:grid-cols-2">
      <SelectField label="Payer" value={payerId} options={[{ value: '', label: 'Any payer' }, ...payers.map((p) => ({ value: p.id, label: p.name }))]} onChange={(e) => setPayerId(e.target.value)} />
      <TextField label="Layout name" value={name} onChange={(e) => setName(e.target.value)} />
      <SelectField label="Dates" value={dateFormat} options={[{ value: 'date_dmy', label: 'Day/month/year (31/12/2026)' }, { value: 'date_iso', label: 'Year-month-day (2026-12-31)' }]} onChange={(e) => setDateFormat(e.target.value as typeof dateFormat)} />
      <SelectField label="Amounts" value={amountFormat} options={[{ value: 'amount_major', label: 'Naira (1500.00)' }, { value: 'amount_minor', label: 'Kobo (150000)' }]} onChange={(e) => setAmountFormat(e.target.value as typeof amountFormat)} />
    </div>
    <ol className="space-y-1">{columns.map((c, i) => <li key={c.field} className="flex flex-wrap items-end gap-2">
      <span className="w-40 text-sm">{i + 1}. {FIELD_LABELS[c.field]}</span>
      <div className="min-w-[200px] flex-1"><TextField label={`Header for ${FIELD_LABELS[c.field]}`} value={c.header} onChange={(e) => setColumns((all) => all.map((x, n) => n === i ? { ...x, header: e.target.value } : x))} /></div>
      <Button variant="ghost" fullWidth={false} aria-label={`Move ${FIELD_LABELS[c.field]} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</Button>
      <Button variant="ghost" fullWidth={false} aria-label={`Move ${FIELD_LABELS[c.field]} down`} disabled={i === columns.length - 1} onClick={() => move(i, 1)}>↓</Button>
      <Button variant="ghost" fullWidth={false} onClick={() => setColumns((all) => all.filter((_, n) => n !== i))}>Remove</Button>
    </li>)}</ol>
    {unused.length ? <SelectField label="Add a column" value="" options={[{ value: '', label: 'Choose a field…' }, ...unused.map((f) => ({ value: f, label: FIELD_LABELS[f] }))]} onChange={(e) => e.target.value && setColumns((c) => [...c, { field: e.target.value as ClaimExportField, header: FIELD_LABELS[e.target.value as ClaimExportField] }])} /> : null}
    <Button fullWidth={false} disabled={!name.trim() || !columns.length || columns.some((c) => !c.header.trim())} onClick={() => void save()}>Save layout</Button>
  </section>;
};
