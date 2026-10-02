import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Button, PinDots, PinKeypad, TextField } from '@/ui';
import { useDeviceContext } from '@/data';
import { AuthorizationError, claimingFor } from '@/auth/authorization';
import { findMatchingCode, markCodeUsed } from '@/data/repos/pinSetupCodes';
import { emailPinSetupCode } from '@/lib/api/staff';
import { approvePinSetup, checkPin, hasPin, pinLength, useAuth, type RosterEntry } from '@/session';

type ApprovalState = { staffId?: string; fullName?: string; role?: string; reset?: boolean };

/**
 * Who may approve a PIN in person (SCHEMA.md §10). Whoever approves stands
 * beside the phone while the new PIN is chosen, so they could choose it
 * themselves: approving is as good as becoming that person here. A supervisor
 * may therefore approve clinical staff, but only a facility admin may approve
 * a facility admin — otherwise a supervisor could take over admin rights.
 */
const approverRolesFor = (role: string): ReadonlySet<string> =>
  role === 'facility_admin' ? new Set(['facility_admin']) : new Set(['facility_admin', 'supervisor']);

const initials = (fullName: string) =>
  fullName
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('');

/**
 * Before anyone sets or resets a PIN on this phone, someone with authority
 * approves it — never whoever happens to be holding the phone. Either a code
 * the admin issued from their own phone and read out (works when the admin is
 * elsewhere), or an admin or supervisor here entering their own PIN (works with
 * no signal).
 */
export const PinApprovalScreen = () => {
  const navigate = useNavigate();
  const state = (useLocation().state ?? {}) as ApprovalState;
  const { facility, deviceId } = useDeviceContext();
  const { roster, loading } = useAuth();
  const [mode, setMode] = useState<'choose' | 'code' | 'approver'>('choose');
  const [code, setCode] = useState('');
  const [approver, setApprover] = useState<RosterEntry | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string>();
  const [checking, setChecking] = useState(false);
  /** Where an emailed PIN code went (facility admins only). */
  const [emailedTo, setEmailedTo] = useState<string>();
  const [emailing, setEmailing] = useState(false);

  const person = roster.find((entry) => entry.staff.staffId === state.staffId);
  if (loading) return null;
  if (!state.staffId || !person) return <Navigate to="/login" replace />;

  const approverRoles = approverRolesFor(person.staff.role);
  const approvers = roster.filter(
    (entry) =>
      approverRoles.has(entry.staff.role) && entry.staff.staffId !== person.staff.staffId && hasPin(entry.staff.staffId),
  );

  const approved = () => {
    approvePinSetup(person.staff.staffId);
    navigate('/onboarding/accept', {
      replace: true,
      state: { staffId: person.staff.staffId, fullName: state.fullName, role: state.role },
    });
  };

  const useCode = async () => {
    if (!code.trim() || checking) return;
    setChecking(true);
    setError(undefined);
    try {
      const match = await findMatchingCode(person.staff.staffId, code);
      if (!match) {
        setError(
          'That code isn’t valid. Codes last 24 hours and only the newest one works. If your admin has just made it, connect this phone so it can sync, then try again.',
        );
        return;
      }
      await markCodeUsed(match, claimingFor({ staff: person.staff, facilityId: facility?.code ?? '', deviceId }));
      approved();
    } catch (cause) {
      setError(
        cause instanceof AuthorizationError
          ? 'This phone hasn’t synced in a while — connect to the internet and try again'
          : cause instanceof Error
            ? cause.message
            : 'Could not check the code',
      );
    } finally {
      setChecking(false);
    }
  };

  /** A facility admin with no one to approve them: the server emails their own PIN code (SCHEMA.md §10). */
  const emailMeACode = async () => {
    if (emailing) return;
    setEmailing(true);
    setError(undefined);
    try {
      const sent = await emailPinSetupCode(person.staff.staffId);
      setEmailedTo(sent.sentTo);
      setCode('');
      setMode('code');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not email a code');
    } finally {
      setEmailing(false);
    }
  };

  const onDigit = async (digit: string) => {
    if (!approver) return;
    const digits = pinLength(approver.staff.staffId);
    if (pin.length >= digits || checking) return;
    setError(undefined);
    const next = pin + digit;
    setPin(next);
    if (next.length < digits) return;

    setChecking(true);
    const result = await checkPin(approver.staff.staffId, next);
    setChecking(false);
    if (result.ok) {
      approved();
      return;
    }
    setPin('');
    setError(
      result.reason === 'locked'
        ? `Too many wrong PINs for ${approver.staff.fullName} — try again in ${Math.max(1, Math.ceil((result.retryAt - Date.now()) / 60_000))} min`
        : 'Wrong PIN — try again',
    );
  };

  const firstName = state.fullName?.split(' ')[0] ?? 'there';

  return (
    <div className="flex min-h-screen flex-col bg-surface px-7 pb-8 pt-12 sm:min-h-0">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <h1 className="text-center text-[22px] font-extrabold tracking-[-0.02em]">
          {state.reset ? `Reset your PIN, ${firstName}` : `Welcome, ${firstName}`}
        </h1>
        <p className="mt-2 text-center text-sm leading-relaxed text-ink-muted">
          To keep patient records safe, a PIN can only be set with an admin&rsquo;s approval.
        </p>

        {mode === 'choose' ? (
          <div className="mt-8 flex flex-col gap-3">
            <Button variant="primary" onClick={() => setMode('code')}>
              I have a code from my admin
            </Button>
            <Button variant="outlined" onClick={() => setMode('approver')}>
              {person.staff.role === 'facility_admin' ? 'Another facility admin is here' : 'An admin or supervisor is here'}
            </Button>
            {person.staff.role === 'facility_admin' ? (
              <Button variant="ghost" loading={emailing} onClick={emailMeACode}>
                Email me a code
              </Button>
            ) : null}
            {error ? <p className="text-center text-[13px] font-semibold text-danger">{error}</p> : null}
            <p className="mt-2 text-center text-[13px] leading-relaxed text-ink-muted">
              {person.staff.role === 'facility_admin'
                ? 'No other admin to ask? We can email a code to the address you registered with. This phone needs an internet connection.'
                : 'No code? Ask your facility admin to create one for you under Staff. They can do it from their own phone and read it to you.'}
            </p>
          </div>
        ) : null}

        {mode === 'code' ? (
          <div className="mt-8 space-y-4">
            {emailedTo ? (
              <p className="text-[13px] leading-relaxed text-ink-muted">
                We emailed a code to <b className="text-ink">{emailedTo}</b>. It can take a minute to arrive, and this
                phone needs to stay online until it has synced.
              </p>
            ) : null}
            <TextField
              label={emailedTo ? 'Code from the email' : 'Code from your admin'}
              name="pin_setup_code"
              placeholder="e.g. K7QM2XPA"
              autoCapitalize="characters"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
            {error ? <p className="text-[13px] font-semibold text-danger">{error}</p> : null}
            <Button variant="primary" loading={checking} disabled={!code.trim()} onClick={useCode}>
              Continue
            </Button>
          </div>
        ) : null}

        {mode === 'approver' && !approver ? (
          <div className="mt-8">
            <div className="mb-3 text-[13px] font-semibold text-ink-soft">Who is approving?</div>
            <div className="flex flex-col gap-2">
              {approvers.map((entry) => (
                <button
                  key={entry.staff.staffId}
                  type="button"
                  onClick={() => {
                    setApprover(entry);
                    setError(undefined);
                  }}
                  className="flex items-center gap-3 rounded-[14px] border-[1.5px] border-outline-soft bg-white p-3 text-left"
                >
                  <Avatar tone="mint">{initials(entry.staff.fullName)}</Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-bold">{entry.staff.fullName}</div>
                    <div className="text-[12px] text-ink-muted">
                      {entry.staff.role === 'facility_admin' ? 'Facility Admin' : 'Supervisor'}
                    </div>
                  </div>
                </button>
              ))}
              {approvers.length === 0 ? (
                <p className="py-4 text-center text-[13px] leading-relaxed text-ink-muted">
                  {person.staff.role === 'facility_admin'
                    ? 'Only another facility admin can approve an admin’s PIN, and none has a PIN on this phone. Ask another admin for a code instead.'
                    : 'No admin or supervisor has a PIN on this phone yet. Ask your admin for a code instead.'}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {mode === 'approver' && approver ? (
          <div className="mt-8 flex flex-col items-center">
            <div className="text-[13px] font-semibold text-ink-soft">{approver.staff.fullName}, enter your PIN</div>
            <PinDots
              length={pinLength(approver.staff.staffId)}
              filled={pin.length}
              className={`mt-4 ${error ? 'animate-shake' : ''}`}
            />
            {error ? <p className="mt-3 text-center text-[13px] font-semibold text-danger">{error}</p> : null}
            <div className="mt-6 w-full max-w-[300px]">
              <PinKeypad
                onDigit={onDigit}
                action={{ label: 'Delete', onPress: () => setPin((current) => current.slice(0, -1)) }}
                tone="light"
              />
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => {
            if (mode === 'approver' && approver) {
              setApprover(null);
              setPin('');
            } else if (mode !== 'choose') {
              setMode('choose');
            } else {
              navigate('/login', { replace: true });
            }
            setError(undefined);
          }}
          className="mx-auto mt-auto min-h-0 pt-6 text-[13px] font-bold text-brand"
        >
          {mode === 'choose' ? 'Back to sign-in' : 'Back'}
        </button>
      </div>
    </div>
  );
};
