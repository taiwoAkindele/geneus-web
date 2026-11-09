import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { dischargeHeads, dispensingDetails, prescriptionLines, supplyState, supplyPrice, supplyCharge, unreturnedQuantity, returnCredit, type DispensingDetails, type EncounterEntry, type PharmacyPrescription, type PharmacyRecords } from '@shared';
import { useAuthorizationContext } from '@/session';
import { useLiveQuery } from '@/data';
import { loadPharmacy, saveDispensing } from '@/data/repos/pharmacy';
import { listStaff } from '@/data/repos/staff';
import { writeDraft, readDrafts, discardDraft } from '@/data/repos/drafts';
import { Button, SelectField, Sheet, Tag, TextAreaField, TextField, useToast } from '@/ui';
import { RequestHeader } from '@/features/encounter/components/RequestHeader';
import { formatMoney } from '@/lib/money';

type Line = ReturnType<typeof prescriptionLines>[number];
type Action = { source: PharmacyPrescription; line: Line; kind: DispensingDetails['action']; original?: EncounterEntry };
export const QuantityDispenseScreen = () => {
  const [params] = useSearchParams(), context = useAuthorizationContext(), toast = useToast();
  const patientId = params.get('patient') ?? '', encounterId = params.get('visit') ?? '';
  const query = useLiveQuery(useCallback(async () => {
    const [data, staff] = await Promise.all([loadPharmacy(patientId, encounterId, context), listStaff()]);
    return { ...data, staff };
  }, [patientId, encounterId, context.userId, context.permissions.join('|')]));
  const [action, setAction] = useState<Action>();
  useEffect(() => { document.title = 'Supply medicines · Geneus Health'; }, []);
  if (query.loading && !query.data) return <p role="status" className="p-6">Opening the prescription…</p>;
  if (query.error || !query.data?.patient) return <div role="alert" className="space-y-3 p-6"><p>{query.error?.message ?? 'Open a prescription from Pharmacy.'}</p><Button variant="outlined" onClick={query.reload}>Try again</Button><Link to="/pharmacy">Back to Pharmacy</Link></div>;
  const data = query.data;
  const sources = [...data.entries].sort((a, b) => b.createdOn.localeCompare(a.createdOn));
  const summaries = data.wardEvents?.filter((e) => e.encounterId === encounterId && e.values.kind === 'discharge') ?? [];
  const requested = params.get('prescription');
  const source = requested ? [...sources, ...summaries].find((e) => e.id === requested) : sources.find((e) => e.step === 'prescription') ?? sources.find((e) => e.step === 'diagnosis') ?? dischargeHeads(summaries)[0];
  const revised = source?.type === 'ward_care_event' && !dischargeHeads(data.wardEvents?.filter((e) => e.admissionId === source.admissionId) ?? []).some((e) => e.id === source.id);
  const lines = source ? prescriptionLines(source) : [];
  const canWrite = context.permissions.includes('encounter:record') && context.permissions.includes('clinical:dispense');
  const who = (id: string) => data.staff.find((s) => s.staffId === id)?.fullName ?? 'Recorded staff member';
  return <div className="min-h-screen space-y-5 bg-white px-4 py-5 md:px-8">
    <RequestHeader patient={data.patient!} back={{ to: '/pharmacy', label: 'Back to Pharmacy' }} />
    <div><h2 className="text-xl font-extrabold">Supply medicines</h2><p className="mt-1 text-sm text-ink-soft">Record what was actually handed over. You can supply part now and the rest later.</p></div>
    {revised ? <p role="status" className="rounded-field bg-amber-50 p-3">This discharge prescription was revised. Open the current prescription from Pharmacy for new supplies. Earlier returns and price follow-up stay here.</p> : null}
    {!lines.length ? <p>No medicines are prescribed on this visit.</p> : lines.map((line) => {
      const state = supplyState(source!, line.lineId, data.entries);
      const refused = data.refusedSupplies.some((entry) => { const d = dispensingDetails(entry); return d?.prescriptionEntryId === source!.id && d.lineId === line.lineId; });
      return <section key={line.lineId} className="min-w-0 space-y-3 rounded-card border border-outline p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-lg font-bold">{line.drug}</h3><p className="text-sm">{[line.dose, line.frequency, line.duration, line.route].filter(Boolean).join(' · ')}</p></div><Tag tone={state.conflict ? 'danger' : state.complete ? 'green' : 'amber'}>{state.conflict ? 'Needs review' : state.complete ? 'Complete' : state.supplied ? 'Part supplied' : 'Still needed'}</Tag></div>
        <p className="text-sm">{state.legacy ? 'Earlier dispensing is recorded; its quantity was not tracked.' : `Supplied so far: ${state.supplied} ${line.unitOfMeasure ?? state.events.map(dispensingDetails).find((d) => d?.unit)?.unit ?? ''}`}{line.quantity !== undefined ? ` · Prescribed: ${line.quantity} ${line.unitOfMeasure ?? ''} · ${state.complete && state.supplied < line.quantity ? 'No further supply planned' : `Still needed: ${Math.max(0, line.quantity - state.supplied)}`}` : ''}</p>
        {refused ? <p role="alert" className="text-sm">A supply for this medicine was refused during sync. Check what was actually handed over in <Link to="/sync" className="font-bold underline">Sync &amp; review</Link> before recording another supply or return.</p> : canWrite && !state.conflict ? <div className="flex flex-wrap gap-2">{!state.complete && !revised ? <Button fullWidth={false} onClick={() => setAction({ source: source!, line, kind: 'supply' })}>Supply medicine</Button> : null}<Button variant="outlined" fullWidth={false} onClick={() => setAction({ source: source!, line, kind: 'note' })}>{state.complete ? 'Reopen / add a note' : 'Not supplied / add a note'}</Button></div> : !canWrite ? <p className="text-sm text-ink-soft">View access. Pharmacy staff record supplies.</p> : <p role="alert">Review the competing updates in Sync &amp; review before another supply.</p>}
        {state.events.length ? <details><summary className="min-h-[44px] cursor-pointer py-2 text-sm font-bold text-brand">Supply and return history · {state.events.length}</summary><ol className="space-y-3">{[...state.events].sort((a, b) => b.createdOn.localeCompare(a.createdOn)).map((event) => {
          const d = dispensingDetails(event)!;
          const remaining = d.action === 'supply' ? unreturnedQuantity(event, state.events) : 0;
          const unpriced = d.action === 'supply' && d.billing === 'unpriced' && !supplyCharge(event.id, data) && remaining > 0;
          return <li key={event.id} className="space-y-1 border-t border-outline-soft pt-3 text-sm"><p className="font-bold">{d.action === 'supply' ? `Supplied ${d.quantity} ${d.unit}` : d.action === 'return' ? `Returned ${d.quantity} ${d.unit}` : d.action === 'price' ? 'Selling price added' : d.complete ? 'Marked complete' : 'Pending / reopened'}</p><p className="text-xs text-ink-soft">{new Date(event.createdOn).toLocaleString('en-GB')} · {who(event.createdBy)}</p>{d.billing === 'charge' ? <p>Bill: {formatMoney(d.chargedMinor!, d.currency!)}</p> : d.billing === 'outside' ? <p>Supplied outside this hospital · no hospital stock or bill</p> : null}{d.action === 'return' ? <p>{d.restock ? 'Returned to recorded stock' : 'Not added back to usable stock'}{d.creditMinor ? ' · Patient credit recorded; money refunds are handled separately' : ''}</p> : null}{d.reason ? <p className="whitespace-pre-wrap">{d.reason}</p> : null}{unpriced ? <p className="text-amber-text">Selling price not set · needs billing follow-up</p> : null}{canWrite && !state.conflict && !refused ? <div className="flex flex-wrap gap-2">{remaining > 0 ? <Button variant="ghost" fullWidth={false} onClick={() => setAction({ source: source!, line, kind: 'return', original: event })}>Record a return</Button> : null}{unpriced ? <Button variant="outlined" fullWidth={false} onClick={() => setAction({ source: source!, line, kind: 'price', original: event })}>Set price &amp; bill this supply</Button> : null}</div> : null}</li>;
        })}</ol></details> : null}
      </section>;
    })}
    <p className="text-xs text-ink-soft">Stock balances are recorded counts, not a live physical count. Supplies save on this device first; refused updates remain in <Link to="/sync" className="underline">Sync &amp; review</Link>. Giving a medicine to a patient on the ward is recorded separately.</p>
    {action ? <SupplySheet key={`${action.line.lineId}:${action.kind}:${action.original?.id ?? ''}`} action={action} data={data} onClose={() => setAction(undefined)} onSaved={() => { query.reload(); toast('Pharmacy record saved on this device'); }} /> : null}
  </div>;
};

const SupplySheet = ({ action, data, onClose, onSaved }: { action: Action; data: PharmacyRecords; onClose: () => void; onSaved: () => void }) => {
  const context = useAuthorizationContext(), { source, line, kind, original } = action;
  const state = supplyState(source, line.lineId, data.entries), priorSupply = original && dispensingDetails(original);
  const stock = data.items.filter((s) => ['drug','vaccine','fp_commodity'].includes(s.category));
  const [form, setForm] = useState(() => ({ source: stock.length ? 'stock' : 'untracked', stockItemId: '', stockSearch: '', checkedExistingBill: false, quantity: kind === 'price' && original ? String(unreturnedQuantity(original, state.events)) : '', unit: priorSupply?.unit ?? line.unitOfMeasure ?? '', feeItemId: '', complete: kind === 'price' || kind === 'return' ? String(state.complete) : '', reason: '', restock: false, previousEntryId: state.heads[0]?.id }));
  const [ready, setReady] = useState(false), [reviewing, setReviewing] = useState<DispensingDetails>(), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const busy = useRef(false), completed = useRef(false), requestId = useRef(`encounter_entry:${crypto.randomUUID()}`), latest = useRef(form); latest.current = form;
  const owner = { staffId: context.userId!, patientId: source.patientId, encounterKey: `pharmacy:${source.id}:${line.lineId}:${kind}:${original?.id ?? ''}` };
  useEffect(() => { let active = true; readDrafts(owner).then((drafts) => { const saved = drafts.find((d) => d.step === 'pharmacy_supply')?.data as { form?: typeof form; requestId?: string } | undefined; if (active) { if (saved?.form) setForm(saved.form); if (saved?.requestId) requestId.current = saved.requestId; setReady(true); } }).catch(() => setError('The private draft could not be restored. Close and retry.')); return () => { active = false; }; }, []);
  useEffect(() => { if (!ready) return; const timer = window.setTimeout(() => { if (!completed.current) void writeDraft(owner, 'pharmacy_supply', { form: latest.current, requestId: requestId.current }).catch(() => setError('The draft could not be saved. Keep this form open and retry.')); }, 250); return () => window.clearTimeout(timer); }, [form, ready]);
  const set = (changes: Partial<typeof form>) => { setForm((f) => ({ ...f, ...changes })); setError(''); setReviewing(undefined); };
  const item = data.items.find((s) => s.id === form.stockItemId), fee = data.fees.find((f) => f.id === form.feeItemId && f.active);
  const existingMedicineBill = Boolean(fee && data.charges.some((c) => !c.dispenseEntryId && c.feeItemId === fee.id && c.encounterId === source.encounterId));
  const quantity = Number(form.quantity), unit = kind === 'return' || kind === 'price' ? priorSupply?.unit ?? '' : form.source === 'stock' ? item?.unitOfMeasure ?? '' : form.unit;
  const price = fee && quantity > 0 && Number.isSafeInteger(Math.round(fee.amountMinor * quantity)) ? supplyPrice(fee, quantity, data.patient!, new Date().toISOString(), data.visitType) : undefined;
  const remaining = line.quantity === undefined ? undefined : Math.max(0, line.quantity - state.supplied - (Number.isFinite(quantity) ? quantity : 0));
  const close = async () => { try { if (ready) await writeDraft(owner, 'pharmacy_supply', { form: latest.current, requestId: requestId.current }); onClose(); } catch { setError('Your draft could not be saved. Keep this form open.'); } };
  const build = (): DispensingDetails => {
    const base = { prescriptionEntryId: source.id, lineId: line.lineId, previousEntryId: form.previousEntryId };
    const complete = kind === 'supply' && line.quantity !== undefined ? remaining === 0 : form.complete === 'true';
    if ((kind === 'supply' && line.quantity === undefined || kind === 'note' || kind === 'return') && !form.complete) throw new Error('Choose whether more of this medicine is still needed');
    if (kind === 'note') return { ...base, action: kind, complete, reason: form.reason };
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) throw new Error('Enter a quantity greater than zero, up to 1,000,000');
    if (kind === 'supply' && existingMedicineBill && !form.checkedExistingBill) throw new Error('This medicine already has a bill on this visit. Check it before adding another charge, or leave the price unset for billing follow-up');
    if (kind === 'supply' && line.quantity !== undefined && quantity > line.quantity - state.supplied + 1e-6) throw new Error('Giving now exceeds the quantity still needed');
    if (kind === 'supply' && form.source === 'stock' && item && quantity > item.quantityOnHand + data.movements.filter((m) => m.itemId === item.id).reduce((n, m) => n + m.change, 0) + 1e-6) throw new Error('This exceeds recorded stock. Check the stock item and physical count');
    if (kind === 'return' && original && quantity > unreturnedQuantity(original, state.events) + 1e-6) throw new Error('The returned quantity exceeds this original supply');
    if (fee && !price) throw new Error('The bill total is too large. Check the quantity and price');
    if (kind === 'return') return { ...base, action: kind, complete, quantity, unit, returnOf: original!.id, restock: form.restock, creditMinor: returnCredit(original!, quantity, data), reason: form.reason };
    if (kind === 'price' && !fee) throw new Error('Select the configured selling price');
    const billing = kind === 'supply' && form.source === 'outside' ? 'outside' : fee ? 'charge' : 'unpriced';
    return { ...base, action: kind, complete, quantity, unit,
      ...(kind === 'price' ? { priceFor: original!.id } : { source: form.source as 'stock' | 'untracked' | 'outside', ...(form.source === 'stock' ? { stockItemId: form.stockItemId } : {}) }),
      billing, ...(fee && billing === 'charge' ? { feeItemId: fee.id, feePriceVersion: fee.priceVersion, unitPriceMinor: fee.amountMinor, currency: fee.currency, chargedMinor: price!.amount } : {}), reason: form.reason.trim() || (billing === 'unpriced' ? 'Selling price not set; billing follow-up required' : undefined) };
  };
  const save = async () => {
    if (busy.current || !ready) return; setError('');
    try {
      if (!reviewing) { const details = build(); const { DispensingDetails } = await import('@shared'); setReviewing(DispensingDetails.parse(details)); return; }
      busy.current = true; setSaving(true);
      await saveDispensing(source.patientId, source.encounterId, reviewing, context, requestId.current);
      completed.current = true;
      await discardDraft(owner, 'pharmacy_supply').catch(() => undefined); onSaved(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'This supply could not be saved. Your form remains available.'); }
    finally { busy.current = false; setSaving(false); }
  };
  const title = kind === 'return' ? 'Record a medicine return' : kind === 'note' ? 'Update this medicine' : kind === 'price' ? 'Bill a saved supply' : 'Supply medicine';
  return <Sheet title={reviewing ? 'Review pharmacy record' : title} eyebrow={line.drug} onClose={() => void close()} closeDisabled={saving} hasUnsavedChanges={Boolean(form.quantity || form.reason || form.stockItemId)}><div className="space-y-4">
    {!ready ? <p role="status">Restoring private draft…</p> : reviewing ? <div className="space-y-3"><p className="font-bold">{line.drug}</p>{reviewing.quantity ? <p>{kind === 'return' ? 'Returned' : kind === 'price' ? 'Quantity to bill' : 'Giving now'}: {reviewing.quantity} {reviewing.unit}</p> : null}<p>{reviewing.complete ? 'This medicine is complete' : 'More of this medicine is still needed'}</p>{reviewing.billing === 'charge' ? <p className="font-bold">Bill added: {formatMoney(reviewing.chargedMinor!, reviewing.currency!)}</p> : reviewing.billing === 'unpriced' ? <p className="text-amber-text">No price set. This supply will be flagged for billing follow-up; it is not recorded as free.</p> : reviewing.billing === 'outside' ? <p>Outside supply · no hospital stock or medicine bill</p> : null}{kind === 'return' ? <><p>{reviewing.restock ? 'Add returned quantity back to stock' : 'Do not add this return to usable stock'}</p><p>{reviewing.creditMinor && original && supplyCharge(original.id, data) ? `Patient credit: ${formatMoney(reviewing.creditMinor, supplyCharge(original.id, data)!.currency)}` : 'No bill reduction for this return'}. Any cash refund is handled separately by the cashier.</p></> : null}{reviewing.reason ? <p className="whitespace-pre-wrap">{reviewing.reason}</p> : null}</div> : <>
      <p className="text-sm">{[line.dose, line.frequency, line.duration].filter(Boolean).join(' · ')}</p>
      <p className="text-sm font-bold">Supplied so far: {state.supplied} {line.unitOfMeasure ?? unit}{line.quantity === undefined ? '' : ` · Prescribed: ${line.quantity} ${line.unitOfMeasure ?? unit}`}</p>
      {kind === 'supply' ? <><SelectField label="Where is this medicine supplied from?" value={form.source} onChange={(e) => set({ source: e.target.value, stockItemId: '', feeItemId: '' })} options={[{ value: 'stock', label: 'Hospital stock' }, { value: 'untracked', label: 'Hospital supply — stock not tracked here' }, { value: 'outside', label: 'Supplied outside this hospital' }]} />{form.source === 'stock' ? <><TextField label="Find medicine in stock" value={form.stockSearch} placeholder="Type the medicine name" onChange={(e) => set({ stockSearch: e.target.value })} /><SelectField label="Medicine in stock" value={form.stockItemId} onChange={(e) => { const selected = data.items.find((s) => s.id === e.target.value); set({ stockItemId: e.target.value, feeItemId: selected?.feeItemId ?? '' }); }} options={[{ value: '', label: 'Choose the actual stock item' }, ...stock.filter((s) => s.id === form.stockItemId || s.name.toLowerCase().includes((form.stockSearch ?? '').trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({ value: s.id, label: `${s.name} · ${s.unitOfMeasure ?? 'unit not set'}` }))]} />{item ? <p className="text-sm">Recorded stock: {item.quantityOnHand + data.movements.filter((m) => m.itemId === item.id).reduce((n, m) => n + m.change, 0)} {item.unitOfMeasure}. Check the physical quantity before handing over.</p> : <p className="text-sm text-ink-soft">Choose the exact medicine and strength. Pack conversions are not assumed.</p>}</> : <TextField label="Quantity unit" value={form.unit} placeholder="e.g. tablets, bottles or mL" onChange={(e) => set({ unit: e.target.value })} />}</> : null}
      {kind !== 'note' ? <TextField label={kind === 'return' ? 'Quantity returned' : kind === 'price' ? 'Quantity waiting for a price' : 'Giving now'} type="number" min="0" step="any" disabled={kind === 'price'} value={form.quantity} onChange={(e) => set({ quantity: e.target.value })} hint={unit ? `Enter the number of ${unit}.` : 'Use the same quantity unit as the prescription.'} /> : null}
      {(kind === 'price' || kind === 'supply' && form.source !== 'outside') ? <><SelectField label="Selling price per unit" value={form.feeItemId} onChange={(e) => set({ feeItemId: e.target.value })} options={[{ value: '', label: kind === 'price' ? 'Choose a selling price' : 'Price not set — billing follow-up needed' }, ...data.fees.filter((f) => f.active).map((f) => ({ value: f.id, label: `${f.name} · ${formatMoney(f.amountMinor, f.currency)} per ${unit || 'unit'}` }))]} />{existingMedicineBill && kind === 'supply' ? <><p className="text-sm text-amber-text">This medicine already has a bill on this visit. Check Billing to avoid charging twice.</p><SelectField label="Have you checked the existing bill?" value={String(form.checkedExistingBill)} onChange={(e) => set({ checkedExistingBill: e.target.value === 'true' })} options={[{ value: 'false', label: 'Check before adding another charge' }, { value: 'true', label: 'Yes — this is an additional supply to bill' }]} /></> : null}{price ? <p className="font-bold">Bill for this supply: {formatMoney(price.amount, fee!.currency)}{price.exemptionReason ? ` · ${price.exemptionReason}` : ''}</p> : <p className="text-sm text-amber-text">An administrator can configure selling prices in Billing. You can record the physical supply now and add its price later.</p>}</> : null}
      {kind === 'supply' && line.quantity !== undefined ? <p className="font-bold">Still needed after this supply: {remaining} {line.unitOfMeasure ?? unit}</p> : kind !== 'price' ? <SelectField label="Is more of this medicine still needed?" value={form.complete} onChange={(e) => set({ complete: e.target.value })} options={[{ value: '', label: 'Choose one' }, { value: 'false', label: 'Yes — keep this medicine pending' }, { value: 'true', label: 'No — mark this medicine complete' }]} /> : null}
      {kind === 'return' ? <SelectField label="Add the return back to recorded stock?" value={String(form.restock)} onChange={(e) => set({ restock: e.target.value === 'true' })} options={[{ value: 'false', label: 'No — do not add to usable stock' }, ...(priorSupply?.stockItemId ? [{ value: 'true', label: 'Yes — confirmed suitable for return to stock' }] : [])]} /> : null}
      <TextAreaField label={kind === 'note' || kind === 'return' ? 'Reason' : 'Note (optional)'} value={form.reason} onChange={(e) => set({ reason: e.target.value })} />
    </>}
    {error ? <p role="alert" className="whitespace-pre-wrap text-sm text-danger">{error}</p> : null}
    {error ? <Button variant="outlined" disabled={saving} onClick={() => { setForm((f) => ({ ...f, previousEntryId: state.heads[0]?.id, ...(kind === 'price' && original ? { quantity: String(unreturnedQuantity(original, state.events)) } : {}) })); setReviewing(undefined); requestId.current = `encounter_entry:${crypto.randomUUID()}`; setError(''); }}>Use the latest supply history and keep my form</Button> : null}
    <Button disabled={!ready || saving} onClick={() => void save()}>{saving ? 'Saving…' : reviewing ? 'Confirm & save pharmacy record' : 'Review & save'}</Button>
    {reviewing ? <Button variant="outlined" disabled={saving} onClick={() => setReviewing(undefined)}>Keep editing</Button> : null}
    <Button variant="ghost" disabled={saving} onClick={() => void close()}>Save draft & close</Button>
  </div></Sheet>;
};
