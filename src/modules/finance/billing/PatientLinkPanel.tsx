import { useCallback, useState } from 'react';
import { availableChannels, type DocumentLinkRequest, type MessageChannel } from '@shared';
import { Button, useToast } from '@/ui';
import { useLiveQuery } from '@/data';
import { useAuthorizationContext } from '@/session';
import { getPatient } from '@/data/repos/patients';
import { currentContact, messageActivity, messagesFor, stoppedChannelsNote } from '@/data/repos/patientContacts';
import { patientDocumentLink, sendToPatient, stopPatientDocumentLinks } from '@/lib/api/billing';
import { userMessage } from '@/lib/api/userMessage';

/** The staff the server lets send to patients and make patient links (the same list as patient statements). */
export const canMakePatientLinks = (context: { permissions: readonly string[] }) =>
  ['payment:receive', 'payment:waive', 'coverage:confirm', 'charge:create'].some((p) => context.permissions.includes(p));

const LABEL: Record<MessageChannel, string> = { sms: 'SMS', email: 'Email' };

/**
 * Sending a bill or receipt to the patient: by SMS and/or email on the channels the patient can receive, or
 * as a link staff copy and send themselves. The patient opens it without signing in, sees the full document
 * and downloads the PDF. Needs the internet: the server sends and makes links. Sends appear in Activity.
 */
export const PatientLinkPanel = ({ request, label, patientId }: { request: DocumentLinkRequest; label: 'bill' | 'receipt'; patientId: string }) => {
  const context = useAuthorizationContext(), toast = useToast();
  const subject = request.kind === 'bill' ? request.billKey : request.paymentId;
  const reach = useLiveQuery(useCallback(async () => {
    const [patient, contact] = await Promise.all([getPatient(patientId), currentContact(patientId)]);
    return { channels: availableChannels(contact, patient?.phone), phone: patient?.phone, email: contact?.email, stopped: stoppedChannelsNote(contact) };
  }, [patientId]), ['patient', 'patient_contact']);
  const history = useLiveQuery(useCallback(() => messagesFor(subject), [subject]), ['patient_message']);
  const [chosen, setChosen] = useState<MessageChannel[]>(), [link, setLink] = useState<{ url: string; expiresOn: string }>();
  const [busy, setBusy] = useState<'send' | 'make' | 'stop'>(), [error, setError] = useState('');
  const channels = reach.data?.channels ?? [];
  const selected = chosen ?? channels;
  const fail = (cause: unknown, fallback: string) => { const message = userMessage(cause, fallback); setError(message); toast(message, { tone: 'error' }); };

  const send = async () => {
    if (!selected.length) return;
    setBusy('send'); setError('');
    try {
      const { messages } = await sendToPatient(context, { ...request, channels: selected });
      const queued = messages.filter((m) => m.status === 'queued'), refused = messages.filter((m) => m.status === 'refused');
      if (queued.length) toast(`Sending the ${label} by ${queued.map((m) => LABEL[m.channel].toLowerCase()).join(' and ')}. The result shows below.`);
      for (const m of refused) toast(`${LABEL[m.channel]} not sent: ${m.reason ?? 'not available'}`, { tone: 'error' });
    } catch (cause) { fail(cause, `The ${label} couldn't be sent. Check the internet connection and try again.`); }
    finally { setBusy(undefined); }
  };
  const make = async () => {
    setBusy('make'); setError('');
    try { setLink(await patientDocumentLink(context, request)); toast('Patient link ready'); }
    catch (cause) { fail(cause, `The ${label} link couldn't be made. Check the internet connection and try again.`); }
    finally { setBusy(undefined); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(link!.url); toast('Link copied'); }
    catch { toast('This browser blocked copying. Select the link and copy it.', { tone: 'error' }); }
  };
  const stop = async () => {
    setBusy('stop'); setError('');
    try { const { stopped } = await stopPatientDocumentLinks(context, request); setLink(undefined); toast(stopped ? `Stopped ${stopped === 1 ? 'the patient link' : `${stopped} patient links`}` : 'There were no open links to stop'); }
    catch (cause) { fail(cause, "The links couldn't be stopped. Check the internet connection and try again."); }
    finally { setBusy(undefined); }
  };
  const destination = (c: MessageChannel) => c === 'sms' ? reach.data?.phone : reach.data?.email;
  const until = link && new Date(link.expiresOn).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return <div className="space-y-4">
    <section className="space-y-3 rounded-card border border-outline-soft p-4" aria-label="Send to patient">
      <div><h3 className="font-bold">Send to patient</h3><p className="text-sm text-ink-muted">They get a link to the full {label} and, by email, the PDF.</p></div>
      {reach.loading && !reach.data ? <p role="status" className="text-sm text-ink-muted">Checking the patient's contact details…</p> : channels.length ? <>
        <fieldset className="space-y-2"><legend className="sr-only">Send by</legend>{channels.map((c) => <label key={c} className="flex min-h-[44px] items-center gap-3 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={selected.includes(c)} onChange={(e) => setChosen(e.target.checked ? [...new Set([...selected, c])] : selected.filter((x) => x !== c))} />
          <span><strong>{LABEL[c]}</strong> <span className="text-ink-muted">{destination(c)}</span></span></label>)}</fieldset>
        <Button fullWidth={false} loading={busy === 'send'} disabled={Boolean(busy) || !selected.length} onClick={() => void send()}>Send {label}</Button>
      </> : <p className="text-sm text-ink-muted">The patient has no phone number or email address that can receive it. Add one in their personal details, or copy a link below.</p>}
      {reach.data?.stopped ? <p className="text-sm text-amber-text">{reach.data.stopped}</p> : null}
      {history.data?.length ? <ol className="divide-y divide-outline-soft border-t border-outline-soft text-sm">{history.data.map((m) => { const a = messageActivity(m); return <li key={m.id} className={`py-2 ${a.failed ? 'text-danger' : ''}`}>{a.text}<span className="block text-xs text-ink-muted">{new Date(m.createdOn).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></li>; })}</ol> : null}
    </section>
    <section className="space-y-3 rounded-card border border-outline-soft p-4" aria-label="Patient link">
      <div><h3 className="font-bold">Patient link</h3><p className="text-sm text-ink-muted">Copy it to send another way. No sign-in; anyone with the link can see the {label}.</p></div>
      {link ? <>
        <input readOnly aria-label="Patient link" value={link.url} onFocus={(e) => e.currentTarget.select()} className="w-full rounded-field border border-outline px-3 py-2 font-mono text-xs" />
        <p className="text-xs text-ink-muted">Works until {until}.</p>
        <div className="flex flex-wrap gap-2"><Button fullWidth={false} onClick={() => void copy()}>Copy link</Button><a className="inline-flex min-h-[44px] items-center rounded-field border-[1.5px] border-outline px-4 font-bold text-brand" href={link.url} target="_blank" rel="noreferrer noopener">Open</a></div>
      </> : <Button variant="outlined" fullWidth={false} loading={busy === 'make'} disabled={Boolean(busy)} onClick={() => void make()}>Get patient link</Button>}
      <Button variant="ghost" fullWidth={false} className="!px-0" loading={busy === 'stop'} disabled={Boolean(busy)} onClick={() => void stop()}>Stop all links to this {label}</Button>
    </section>
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
  </div>;
};
