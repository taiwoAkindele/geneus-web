import { useCallback, useEffect, useState } from 'react';
import type { StaffEmailRequestView } from '@shared';
import { decideEmailRequest, listEmailRequests } from '@/lib/api/selfService';
import { VerificationRequired } from '@/lib/api/insurance';
import { StaffVerification } from '@/modules/insurance/StaffVerification';
import { useAuthorizationContext } from '@/session';
import { Button, useToast } from '@/ui';

/**
 * Addresses staff have proven they can read, waiting for an administrator to
 * confirm each belongs to that person — by seeing them, or calling a number
 * already on record. You cannot confirm your own.
 */
export const EmailConfirmationsCard = () => {
  const context = useAuthorizationContext();
  if (!context.permissions.includes('staff:manage')) return null;
  return <section id="email" aria-label="Staff email confirmations" className="space-y-3 rounded-card border border-outline-soft bg-white p-5">
    <h2 className="text-lg font-bold">Staff email confirmations</h2>
    <p className="text-sm text-ink-muted">Confirm only after checking with the person that the address is theirs.</p>
    <StaffVerification purpose="Confirming staff email addresses"><Requests /></StaffVerification>
  </section>;
};

const Requests = () => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const [requests, setRequests] = useState<StaffEmailRequestView[]>(); const [error, setError] = useState('');
  const load = useCallback(() => listEmailRequests(context).then((r) => { setRequests(r.requests); setError(''); }, (cause) => setError(cause instanceof VerificationRequired ? 'Your verification ended. Verify again.' : cause instanceof Error ? cause.message : 'Could not load')), [context]);
  useEffect(() => { void load(); }, [load]);
  const decide = (id: string, decision: 'approve' | 'reject') => decideEmailRequest(context, id, decision).then(() => { toast(decision === 'approve' ? 'Email confirmed.' : 'Request rejected.'); void load(); }, (cause) => setError(cause instanceof Error ? cause.message : 'Failed'));
  if (error) return <p role="alert" className="text-sm text-danger">{error}</p>;
  if (!requests) return <p role="status" className="text-sm">Loading…</p>;
  if (!requests.length) return <p className="text-sm">Nothing waiting.</p>;
  return <ul className="space-y-2">{requests.map((r) => <li key={r.id} data-request={r.staffName} className="flex flex-wrap items-center justify-between gap-2 rounded-field border border-outline-soft p-3 text-sm">
    <span><strong>{r.staffName}</strong> · {r.email}{r.replacing ? ` (replacing ${r.replacing})` : ''}<span className="block text-xs text-ink-soft">Proven {new Date(r.requestedOn).toLocaleString('en-GB')}</span></span>
    {r.staffId === context.userId ? <span className="text-xs text-ink-soft">Another administrator confirms yours</span> : <span className="flex gap-2">
      <Button fullWidth={false} variant="outlined" onClick={() => void decide(r.id, 'approve')}>Confirm it is theirs</Button><Button fullWidth={false} variant="ghost" onClick={() => void decide(r.id, 'reject')}>Reject</Button></span>}
  </li>)}</ul>;
};
