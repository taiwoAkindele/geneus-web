import { useCallback, useEffect, useState } from 'react';
import type { StaffEmailRequestView } from '@shared';
import { decideEmailRequest, listEmailRequests } from '@/lib/api/selfService';
import { VerificationRequired } from '@/lib/api/insurance';
import { StaffVerification } from '@/modules/insurance/StaffVerification';
import { useAuthorizationContext } from '@/session';
import { Button, useToast } from '@/ui';

/**
 * Email addresses waiting for an administrator's confirmation, read from the
 * server (online, staff:manage). `undefined` while unknown: offline, refused or
 * still loading — callers then simply show nothing.
 */
export const usePendingEmailRequests = () => {
  const context = useAuthorizationContext();
  const allowed = context.permissions.includes('staff:manage');
  const [requests, setRequests] = useState<StaffEmailRequestView[]>(); const [error, setError] = useState('');
  const load = useCallback(() => {
    if (!allowed) return;
    void listEmailRequests(context).then((r) => { setRequests(r.requests); setError(''); }, (cause) => setError(cause instanceof VerificationRequired ? 'Your session with the server ended. Confirm your PIN to continue.' : cause instanceof Error ? cause.message : 'Could not load'));
  }, [context, allowed]);
  useEffect(() => { load(); }, [load]);
  return { allowed, requests, error, reload: load };
};

/**
 * Addresses staff have proven they can read, waiting for an administrator to
 * confirm each belongs to that person — by seeing them, or calling a number
 * already on record. You cannot confirm your own. On a staff profile
 * (`staffId`), it shows only that person's requests and nothing when none wait.
 */
export const EmailConfirmationsCard = ({ staffId }: { staffId?: string }) => {
  const pending = usePendingEmailRequests();
  if (!pending.allowed) return null;
  const mine = staffId ? pending.requests?.filter((r) => r.staffId === staffId) : pending.requests;
  if (staffId && !mine?.length) return null;
  return <section id="email" aria-label="Staff email confirmations" className="space-y-3 rounded-card border border-outline-soft bg-white p-5">
    <h2 className="text-lg font-bold">{staffId ? 'Email address waiting for confirmation' : 'Staff email confirmations'}</h2>
    <p className="text-sm text-ink-muted">Confirm only after checking with the person that the address is theirs.</p>
    <StaffVerification purpose="Confirming staff email addresses"><Requests requests={mine} error={pending.error} reload={pending.reload} /></StaffVerification>
  </section>;
};

const Requests = ({ requests, error: loadError, reload }: { requests?: StaffEmailRequestView[]; error: string; reload: () => void }) => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const [error, setError] = useState('');
  const decide = (id: string, decision: 'approve' | 'reject') => decideEmailRequest(context, id, decision).then(() => { toast(decision === 'approve' ? 'Email confirmed.' : 'Request rejected.'); reload(); }, (cause) => setError(cause instanceof Error ? cause.message : 'Failed'));
  if (error || loadError) return <p role="alert" className="text-sm text-danger">{error || loadError}</p>;
  if (!requests) return <p role="status" className="text-sm">Loading…</p>;
  if (!requests.length) return <p className="text-sm">Nothing waiting.</p>;
  return <ul className="space-y-2">{requests.map((r) => <li key={r.id} data-request={r.staffName} className="flex flex-wrap items-center justify-between gap-2 rounded-field border border-outline-soft p-3 text-sm">
    <span><strong>{r.staffName}</strong> · {r.email}{r.replacing ? ` (replacing ${r.replacing})` : ''}<span className="block text-xs text-ink-soft">Proven {new Date(r.requestedOn).toLocaleString('en-GB')}</span></span>
    {r.staffId === context.userId ? <span className="text-xs text-ink-soft">Another administrator confirms yours</span> : <span className="flex gap-2">
      <Button fullWidth={false} variant="outlined" onClick={() => void decide(r.id, 'approve')}>Confirm it is theirs</Button><Button fullWidth={false} variant="ghost" onClick={() => void decide(r.id, 'reject')}>Reject</Button></span>}
  </li>)}</ul>;
};
