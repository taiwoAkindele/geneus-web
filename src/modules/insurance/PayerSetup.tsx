import { useCallback, useEffect, useState } from 'react';
import {
  ClaimFormat, InsuranceDocumentType, SubmissionChannel, SubmissionProfile,
  type InsuranceDocument, type Payer, type StoredSubmissionProfile,
} from '@shared';
import {
  DOCUMENT_MAX_BYTES, downloadInsuranceDocument, listInsuranceDocuments, listSubmissionProfiles, saveSubmissionProfile, uploadInsuranceDocument, verifyInsuranceDocument, VerificationRequired,
} from '@/lib/api/insurance';
import { useAuthorizationContext } from '@/session';
type SubmissionChannel = (typeof SubmissionChannel.options)[number];
type ClaimFormat = (typeof ClaimFormat.options)[number];
import { Button, SelectField, TextAreaField, TextField, useToast } from '@/ui';

export const DOCUMENT_LABELS: Record<InsuranceDocumentType, string> = {
  contract: 'Contract', tariff_schedule: 'Tariff schedule', benefit_schedule: 'Benefit schedule', authorization_policy: 'Authorization policy', claim_template: 'Claim template',
  referral_form: 'Referral form', remittance_advice: 'Remittance advice', enrollee_roster: 'Enrollee list', other: 'Other',
  authorization_evidence: 'Authorization evidence', referral_letter: 'Referral letter', submission_evidence: 'Submission evidence', acknowledgement: 'Payer acknowledgement', payer_decision: 'Payer decision', dispute_correspondence: 'Dispute correspondence',
};
export const DIAGNOSIS_REQUIREMENT_LABELS: Record<SubmissionProfile['diagnosisRequirement'], string> = {
  codes_verified: 'Codes checked against your licensed code list', codes_as_entered: 'Codes accepted as the clinician recorded them (format checked)',
  free_text: 'Written diagnosis accepted', not_required: 'Not required',
};
const CHANNEL_LABELS: Record<SubmissionChannel, string> = { portal: 'HMO portal', email: 'Email', physical: 'Physical delivery', other: 'Other' };
const FORMAT_LABELS: Record<ClaimFormat, string> = { csv: 'CSV', xlsx: 'Excel', pdf: 'Printed / PDF' };
const ACCEPT = 'application/pdf,image/png,image/jpeg';
const describeError = (cause: unknown) => cause instanceof VerificationRequired ? 'Your session with the server ended. Confirm your PIN to continue.' : cause instanceof Error ? cause.message : 'The request failed';
const size = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * A payer's supporting documents and claim submission method. Documents are
 * evidence kept on the server (PDF or image, never spreadsheets), versioned,
 * reviewed once by name, and downloaded rather than rendered in the browser.
 */
export const PayerSetup = ({ payer }: { payer: Payer }) => {
  const context = useAuthorizationContext();
  if (!context.permissions.includes('insurance_contract:read')) return null;
  const canManage = context.permissions.includes('insurance_contract:manage');
  return <div className="grid gap-4 lg:grid-cols-2">
    <Documents payer={payer} canManage={canManage} />
    <Submission payer={payer} canManage={canManage} />
  </div>;
};

const Documents = ({ payer, canManage }: { payer: Payer; canManage: boolean }) => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const [documents, setDocuments] = useState<InsuranceDocument[]>(); const [error, setError] = useState('');
  const [adding, setAdding] = useState<{ replaces?: InsuranceDocument }>();
  const [rejecting, setRejecting] = useState<InsuranceDocument>(); const [reason, setReason] = useState('');
  const load = useCallback(async () => { try { setDocuments((await listInsuranceDocuments(context, payer.id)).documents); setError(''); } catch (cause) { setError(describeError(cause)); } }, [context, payer.id]);
  useEffect(() => { void load(); }, [load]);
  const replaced = new Set((documents ?? []).map((d) => d.replaces).filter(Boolean));
  const current = (documents ?? []).filter((d) => !replaced.has(d.id)).sort((a, b) => a.documentType.localeCompare(b.documentType));
  const review = async (d: InsuranceDocument, verification: 'verified' | 'rejected', note?: string) => {
    try {
      await verifyInsuranceDocument(context, d.id, verification, note);
      toast(verification === 'verified' ? 'Document marked verified.' : 'Document rejected.');
      setRejecting(undefined); setReason(''); await load();
    } catch (cause) { setError(describeError(cause)); }
  };
  return <section aria-label="Documents" className="space-y-3 rounded-card border border-outline-soft bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Documents</h3>{canManage && !adding ? <Button variant="outlined" fullWidth={false} onClick={() => setAdding({})}>Upload</Button> : null}</div>
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    {!documents ? <p role="status" className="text-sm">Loading…</p> : current.length === 0 ? <p className="text-sm">No documents yet. Upload the signed contract and tariff so others can check terms against them.</p>
      : <ul className="space-y-2">{current.map((d) => <li key={d.id} className="rounded-field border border-outline-soft p-2 text-sm">
        <p><strong>{d.title}</strong> · {DOCUMENT_LABELS[d.documentType]} · v{d.version}</p>
        <p className="text-ink-soft">{d.fileName} · {size(d.byteSize)} · uploaded {d.uploadedOn.slice(0, 10)}{d.effectiveFrom ? ` · effective ${d.effectiveFrom}` : ''}</p>
        <p className={d.verification === 'verified' ? 'text-success' : d.verification === 'rejected' ? 'text-danger' : 'text-ink-soft'}>{d.verification === 'verified' ? 'Verified' : d.verification === 'rejected' ? 'Rejected' : 'Not reviewed'}{d.verificationNote ? `: ${d.verificationNote}` : ''}</p>
        <div className="mt-1 flex flex-wrap gap-2">
          <Button variant="ghost" fullWidth={false} onClick={() => { downloadInsuranceDocument(context, d).catch((cause) => setError(describeError(cause))); }}>Download</Button>
          {canManage && d.verification === 'unverified' ? <><Button variant="ghost" fullWidth={false} onClick={() => void review(d, 'verified')}>Mark verified</Button><Button variant="ghost" fullWidth={false} onClick={() => setRejecting(d)}>Reject</Button></> : null}
          {canManage ? <Button variant="ghost" fullWidth={false} onClick={() => setAdding({ replaces: d })}>Upload new version</Button> : null}
        </div>
        {rejecting?.id === d.id ? <form className="mt-2 space-y-2" onSubmit={(e) => { e.preventDefault(); if (reason.trim()) void review(d, 'rejected', reason); }}>
          <TextField label="Why is it rejected?" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2"><Button type="submit" fullWidth={false} disabled={!reason.trim()}>Reject document</Button><Button type="button" variant="ghost" fullWidth={false} onClick={() => setRejecting(undefined)}>Cancel</Button></div>
        </form> : null}
      </li>)}</ul>}
    {adding ? <UploadForm payer={payer} replaces={adding.replaces} onDone={(saved) => { setAdding(undefined); if (saved) { toast(`${saved.title} uploaded.`); void load(); } }} /> : null}
  </section>;
};

const UploadForm = ({ payer, replaces, onDone }: { payer: Payer; replaces?: InsuranceDocument; onDone: (saved?: InsuranceDocument) => void }) => {
  const context = useAuthorizationContext();
  const [type, setType] = useState<InsuranceDocumentType>(replaces?.documentType ?? 'contract'); const [title, setTitle] = useState(replaces?.title ?? '');
  const [effectiveFrom, setEffectiveFrom] = useState(''); const [notes, setNotes] = useState(''); const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async () => {
    if (!title.trim()) { setError('Give the document a title'); return; }
    if (!file) { setError('Choose a file'); return; }
    if (file.size > DOCUMENT_MAX_BYTES) { setError('Choose a PDF or image up to 10 MB'); return; }
    setBusy(true); setError('');
    try {
      onDone(await uploadInsuranceDocument(context, file, {
        payerId: payer.id, documentType: type, title: title.trim(), fileName: file.name,
        ...(replaces ? { replaces: replaces.id } : {}), ...(effectiveFrom ? { effectiveFrom } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}),
      }));
    } catch (cause) { setError(describeError(cause)); } finally { setBusy(false); }
  };
  return <form aria-label="Upload document" className="space-y-3 rounded-field border border-outline-soft p-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
    <p className="text-sm font-semibold">{replaces ? `New version of ${replaces.title}` : 'Upload a document'}</p>
    {!replaces ? <SelectField label="Document type" value={type} options={InsuranceDocumentType.options.map((t) => ({ value: t, label: DOCUMENT_LABELS[t] }))} onChange={(e) => setType(e.target.value as InsuranceDocumentType)} /> : null}
    <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
    <TextField label="Effective from (optional)" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
    <TextAreaField label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
    <label className="block text-sm"><span className="font-semibold">File (PDF, PNG or JPEG, up to 10 MB)</span>
      <input className="mt-1 block w-full text-sm" type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0])} /></label>
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    <div className="flex gap-2"><Button type="submit" fullWidth={false} loading={busy}>Upload</Button><Button type="button" variant="ghost" fullWidth={false} onClick={() => onDone()}>Cancel</Button></div>
  </form>;
};

const Submission = ({ payer, canManage }: { payer: Payer; canManage: boolean }) => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const [stored, setStored] = useState<StoredSubmissionProfile | null>(); const [error, setError] = useState(''); const [editing, setEditing] = useState(false);
  const load = useCallback(async () => { try { setStored((await listSubmissionProfiles(context)).profiles.find((p) => p.payerId === payer.id) ?? null); setError(''); } catch (cause) { setError(describeError(cause)); } }, [context, payer.id]);
  useEffect(() => { void load(); }, [load]);
  const p = stored?.profile;
  return <section aria-label="Claim submission" className="space-y-3 rounded-card border border-outline-soft bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Claim submission</h3>{canManage && stored !== undefined && !editing ? <Button variant="outlined" fullWidth={false} onClick={() => setEditing(true)}>{p ? 'Change' : 'Set method'}</Button> : null}</div>
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    {stored === undefined ? <p role="status" className="text-sm">Loading…</p> : !p ? <p className="text-sm">Not set. Record how this payer receives claims.</p>
      : <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-ink-soft">Method</dt><dd>Manual · {CHANNEL_LABELS[p.channel]}</dd>
        {p.portalUrl ? <><dt className="text-ink-soft">Portal</dt><dd className="break-all">{p.portalUrl}</dd></> : null}
        {p.recipient ? <><dt className="text-ink-soft">Send to</dt><dd className="break-all">{p.recipient}</dd></> : null}
        {p.claimFormat ? <><dt className="text-ink-soft">Format</dt><dd>{FORMAT_LABELS[p.claimFormat]}</dd></> : null}
        {p.deadlineDays ? <><dt className="text-ink-soft">Deadline</dt><dd>{p.deadlineDays} days after service</dd></> : null}
        {p.requiredAttachments.length ? <><dt className="text-ink-soft">Attach</dt><dd>{p.requiredAttachments.map((a) => DOCUMENT_LABELS[a as InsuranceDocumentType] ?? a).join(', ')}</dd></> : null}
        <dt className="text-ink-soft">Diagnosis</dt><dd>{DIAGNOSIS_REQUIREMENT_LABELS[p.diagnosisRequirement]}{p.diagnosisRequirement.startsWith('codes') ? ` · ${p.diagnosisCodeSystem}` : ''}</dd>
        {p.paymentDueDays ? <><dt className="text-ink-soft">Payment due</dt><dd>{p.paymentDueDays} days after submission</dd></> : null}
        {p.referralRequired ? <><dt className="text-ink-soft">Referral</dt><dd>Required on every claim</dd></> : null}
        {p.instructions ? <><dt className="text-ink-soft">Notes</dt><dd>{p.instructions}</dd></> : null}
      </dl>}
    <p className="text-xs text-ink-soft">Direct submission to HMO systems is not available yet.</p>
    {editing ? <SubmissionForm payer={payer} stored={stored ?? undefined} onDone={(saved) => { setEditing(false); if (saved) { toast('Submission method saved.'); void load(); } }} /> : null}
  </section>;
};

const SubmissionForm = ({ payer, stored, onDone }: { payer: Payer; stored?: StoredSubmissionProfile; onDone: (saved?: boolean) => void }) => {
  const context = useAuthorizationContext();
  const p = stored?.profile;
  const [channel, setChannel] = useState<SubmissionChannel>(p?.channel ?? 'portal'); const [portalUrl, setPortalUrl] = useState(p?.portalUrl ?? ''); const [recipient, setRecipient] = useState(p?.recipient ?? '');
  const [claimFormat, setClaimFormat] = useState<ClaimFormat | ''>(p?.claimFormat ?? ''); const [deadlineDays, setDeadlineDays] = useState(p?.deadlineDays ? String(p.deadlineDays) : '');
  const [instructions, setInstructions] = useState(p?.instructions ?? ''); const [attachments, setAttachments] = useState<string[]>(p?.requiredAttachments ?? []);
  const [diagnosis, setDiagnosis] = useState<SubmissionProfile['diagnosisRequirement']>(p?.diagnosisRequirement ?? 'codes_verified'); const [codeSystem, setCodeSystem] = useState(p?.diagnosisCodeSystem ?? 'ICD-10');
  const [paymentDueDays, setPaymentDueDays] = useState(p?.paymentDueDays ? String(p.paymentDueDays) : ''); const [referral, setReferral] = useState(p?.referralRequired ?? false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async () => {
    const parsed = SubmissionProfile.safeParse({
      method: 'manual', channel, ...(channel === 'portal' && portalUrl.trim() ? { portalUrl: portalUrl.trim() } : {}), ...(channel !== 'portal' && recipient.trim() ? { recipient: recipient.trim() } : {}),
      ...(claimFormat ? { claimFormat } : {}), ...(deadlineDays ? { deadlineDays: Number(deadlineDays) } : {}), ...(instructions.trim() ? { instructions: instructions.trim() } : {}), requiredAttachments: attachments,
      diagnosisRequirement: diagnosis, diagnosisCodeSystem: codeSystem.trim() || 'ICD-10', referralRequired: referral, ...(paymentDueDays ? { paymentDueDays: Number(paymentDueDays) } : {}),
    });
    if (!parsed.success) { setError(parsed.error.issues.map((i) => i.message).join('; ')); return; }
    setBusy(true); setError('');
    try { await saveSubmissionProfile(context, payer.id, parsed.data, stored?.revision); onDone(true); } catch (cause) { setError(describeError(cause)); } finally { setBusy(false); }
  };
  return <form aria-label="Submission method" className="space-y-3 rounded-field border border-outline-soft p-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
    <SelectField label="Sent by" value={channel} options={SubmissionChannel.options.map((c) => ({ value: c, label: CHANNEL_LABELS[c] }))} onChange={(e) => setChannel(e.target.value as SubmissionChannel)} />
    {channel === 'portal' ? <TextField label="Portal address" type="url" value={portalUrl} onChange={(e) => setPortalUrl(e.target.value)} />
      : <TextField label={channel === 'email' ? 'Email address' : 'Recipient (optional)'} value={recipient} onChange={(e) => setRecipient(e.target.value)} />}
    <SelectField label="Claim format" value={claimFormat} options={[{ value: '', label: 'Not specified' }, ...ClaimFormat.options.map((f) => ({ value: f, label: FORMAT_LABELS[f] }))]} onChange={(e) => setClaimFormat(e.target.value as ClaimFormat | '')} />
    <TextField label="Days allowed to submit (optional)" inputMode="numeric" value={deadlineDays} onChange={(e) => setDeadlineDays(e.target.value.replace(/\D/g, ''))} />
    <fieldset className="space-y-1"><legend className="text-sm font-semibold">Required attachments</legend>
      {(['referral_form', 'authorization_policy', 'claim_template', 'other'] as const).map((a) => <label key={a} className="flex min-h-[40px] items-center gap-2 text-sm"><input type="checkbox" checked={attachments.includes(a)} onChange={(e) => setAttachments(e.target.checked ? [...attachments, a] : attachments.filter((x) => x !== a))} />{DOCUMENT_LABELS[a]}</label>)}
    </fieldset>
    <SelectField label="Diagnosis on claims, as the payer requires it" value={diagnosis} options={(['codes_verified', 'codes_as_entered', 'free_text', 'not_required'] as const).map((v) => ({ value: v, label: DIAGNOSIS_REQUIREMENT_LABELS[v] }))} onChange={(e) => setDiagnosis(e.target.value as typeof diagnosis)} />
    {diagnosis.startsWith('codes') ? <TextField label="Code system" value={codeSystem} onChange={(e) => setCodeSystem(e.target.value)} /> : null}
    {diagnosis === 'codes_verified' ? <p className="text-xs text-ink-soft">Claims stay blocked until your hospital imports a licensed code list under Insurance settings. Choose “as the clinician recorded them” only where the payer has said it accepts that.</p> : null}
    <TextField label="Days the payer has to pay after submission (optional)" inputMode="numeric" value={paymentDueDays} onChange={(e) => setPaymentDueDays(e.target.value.replace(/\D/g, ''))} />
    <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={referral} onChange={(e) => setReferral(e.target.checked)} />Every claim needs an approved referral</label>
    <TextAreaField label="Instructions (optional)" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    <div className="flex gap-2"><Button type="submit" fullWidth={false} loading={busy}>Save</Button><Button type="button" variant="ghost" fullWidth={false} onClick={() => onDone()}>Cancel</Button></div>
  </form>;
};
