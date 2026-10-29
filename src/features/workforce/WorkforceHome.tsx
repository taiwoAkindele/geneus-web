import { Link } from 'react-router-dom';
import { currentFacilityRevisions, intervalContains } from '@shared';
import { useAuthorizationContext } from '@/session';
import { eventHeads } from '@/data/repos/workforce';
import { useWorkforce } from './useWorkforce';
export const WorkforceHome = () => {
  const query = useWorkforce(), context = useAuthorizationContext();
  if (query.loading)
    return <div role="status" aria-label="Reading service work" className="my-4 h-20 animate-pulse rounded-card bg-surface-muted" />;
  if (query.error)
    return <p role="alert" className="my-4 rounded-card bg-white p-4 text-sm">Service work could not be read. <button className="font-bold text-brand underline" onClick={query.reload}>Retry</button></p>;
  const data = query.data;
  if (!data?.offerings.length)
    return null;
  const assignments = currentFacilityRevisions(data.assignments).filter((a) => a.staffId === context.userId && a.status === 'active' && intervalContains(a, Date.now()));
  const offers = eventHeads(data.ownership.filter((e) => !data.pending.has(e.id) && !data.receipts.some((r) => r.id === e.id && r.outcome === 'rejected'))).filter((e) => e.action === 'offer_transfer' && e.recipientStaffId === context.userId && data.handoffs.some((h) => h.id === e.sourceId && h.status !== 'done'));
  return <section aria-label="My service work" className="my-5 grid gap-3 sm:grid-cols-3">{[{ label: 'My work assignments', value: assignments.length, to: `/admin/staff/${encodeURIComponent(context.userId)}?view=work` }, { label: 'Handovers awaiting me', value: offers.length, to: '/units' }, { label: 'Coverage and intake', value: 'View plan', to: '/admin/staff?view=coverage' }].map((item) => <Link key={item.label} to={item.to} className="min-h-24 rounded-card border border-outline-soft bg-white p-4"><span className="block text-sm text-ink-muted">{item.label}</span><strong className="mt-2 block text-xl text-brand">{item.value}</strong></Link>)}</section>;
};
