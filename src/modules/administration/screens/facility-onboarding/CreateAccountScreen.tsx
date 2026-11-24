import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FacilityDetails } from '@shared';
import { Button, TextField, useToast } from '@/ui';
import { suggestCode } from '@/data/repos/facility';
import { requestFacility, sendSignupEmailCode } from '@/lib/api/facilities';
import { userMessage } from '@/lib/api/userMessage';
import { FacilityDetailsFields } from './FacilityDetailsFields';

const EMPTY_DETAILS: FacilityDetails = { name: '', code: '', state: '', lga: '', level: 'phc' };

const isEmailCode = (code: string) => /^\d{6}$/.test(code.trim());

/**
 * "Create an account": asks Geneus to set up a facility. The email is proven
 * with a code first, since the approval — and the link that registers the
 * facility — is sent there. Nothing is created until Geneus approves.
 */
export const CreateAccountScreen = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [details, setDetails] = useState<FacilityDetails>(EMPTY_DETAILS);
  const [adminName, setAdminName] = useState('');
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  /** Where the code went; the code field appears once it has. */
  const [codeSentTo, setCodeSentTo] = useState<string>();
  const [sendingCode, setSendingCode] = useState(false);
  const [sending, setSending] = useState(false);
  /** Where Geneus will email its decision, once the request is in. */
  const [requestSentTo, setRequestSentTo] = useState<string>();

  const facilityCode = (details.code || suggestCode(details.name)).toUpperCase();

  const complete = Boolean(
    details.name.trim() &&
    facilityCode &&
    details.state.trim() &&
    details.lga.trim() &&
    adminName.trim() &&
    codeSentTo &&
    isEmailCode(emailCode),
  );

  const sendCode = async () => {
    if (!email.trim() || sendingCode) {
      return;
    }

    setSendingCode(true);

    try {
      const sent = await sendSignupEmailCode(email.trim());

      setCodeSentTo(sent.sentTo);
      setEmailCode('');
      toast(`Code sent to ${sent.sentTo}.`, { tone: 'success' });
    } catch (cause) {
      toast(userMessage(cause, 'Could not send the code. Try again.'), { tone: 'error' });
    } finally {
      setSendingCode(false);
    }
  };

  const submit = async () => {
    if (!complete || sending) {
      return;
    }

    setSending(true);

    try {
      const sent = await requestFacility({
        code: facilityCode,
        name: details.name.trim(),
        state: details.state.trim(),
        lga: details.lga.trim(),
        level: details.level,
        adminFullName: adminName.trim(),
        adminEmail: email.trim(),
        emailCode: emailCode.trim(),
      });

      setRequestSentTo(sent.sentTo);
      toast('Request sent to Geneus.', { tone: 'success' });
    } catch (cause) {
      toast(userMessage(cause, 'Could not send the request. Try again.'), { tone: 'error' });
    } finally {
      setSending(false);
    }
  };

  if (requestSentTo) {
    return (
      <div className="flex min-h-screen flex-col bg-brand px-7 pb-8 pt-12 text-white sm:min-h-0">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
          <div className="rounded-[22px] bg-white p-6 text-ink">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-tint text-2xl font-extrabold text-brand">
              ✓
            </div>
            <h1 className="mt-5 text-2xl font-extrabold tracking-[-0.02em]">Request sent</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
              Geneus will review your request for <b className="text-ink">{details.name.trim()}</b>{' '}
              and email <b className="text-ink">{requestSentTo}</b> with the decision.
            </p>
            <p className="mt-3 text-[13px] text-ink-muted">
              If it is approved, the email has a link to register your facility. Open it on the
              device you will use there.
            </p>
            <div className="mt-6">
              <Button variant="outlined" onClick={() => navigate('/sign-in')}>
                Done
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface sm:min-h-0">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col md:max-w-lg">
        <header className="px-5 pb-3 pt-5">
          <h1 className="text-[22px] font-extrabold tracking-[-0.02em]">Create an account</h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            Tell us about your facility. Geneus reviews every request and emails you the decision.
          </p>
        </header>

        <div className="flex-1 space-y-4 px-5 py-2">
          <FacilityDetailsFields
            value={{ ...details, code: details.code || suggestCode(details.name) }}
            onChange={(patch) => setDetails((current) => ({ ...current, ...patch }))}
          />

          <TextField
            label="Your full name"
            hint="You become the facility admin."
            placeholder="e.g. Amaka Okoro"
            name="admin_name"
            value={adminName}
            onChange={(event) => setAdminName(event.target.value)}
          />

          <div className="space-y-2">
            <TextField
              label="Your email"
              hint="Your account belongs to this email: the decision, and later password resets, are sent here. We send a code now to check it."
              placeholder="e.g. amaka@example.org"
              name="admin_email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setCodeSentTo(undefined);
              }}
            />
            <Button
              variant="secondary"
              disabled={!email.trim()}
              loading={sendingCode}
              onClick={sendCode}
            >
              {codeSentTo ? 'Send a new code' : 'Send code'}
            </Button>
          </div>

          {codeSentTo ? (
            <TextField
              label="Code from the email"
              hint={`Sent to ${codeSentTo}. It lasts 15 minutes.`}
              placeholder="6 digits"
              name="admin_email_code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={emailCode}
              onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, ''))}
            />
          ) : null}
        </div>

        <footer className="space-y-3 border-t border-outline-soft bg-surface px-5 pb-6 pt-4">
          <Button
            variant="primary"
            disabled={!complete || sending}
            loading={sending}
            onClick={submit}
          >
            Send request
          </Button>
          <Button variant="outlined" onClick={() => navigate('/sign-in')}>
            Back
          </Button>
        </footer>
      </div>
    </div>
  );
};
