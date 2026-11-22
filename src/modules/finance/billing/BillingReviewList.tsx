import { AssociationEditor, ServiceReturnReviews } from './ServiceAssociations';
import { useLiveQuery } from '@/data';
import { allOfType } from '@/data/db';
import type { SyncRejection } from '@shared';
import { Link } from 'react-router-dom';
import { useRequestQueues } from '@/modules/clinical/encounter/useEncounterLists';
import { useAuthorizationContext } from '@/session';
import { Button } from '@/ui';
import type { BillingData } from './useBilling';

const readAssociationRefusals = () => allOfType<SyncRejection>('sync_rejection');

/**
 * Billing questions: existing review records, shown for one patient (from their bill) or for everyone.
 * Resolves exact financial associations; clinical authorization remains separate.
 */
export const BillingReviewList = ({
  data,
  onPatient,
  patientId,
}: {
  data: BillingData;
  onPatient?: (id: string) => void;
  patientId?: string;
}) => {
  const query = useRequestQueues();
  const context = useAuthorizationContext();
  const refusals = useLiveQuery(readAssociationRefusals, ['sync_rejection']);
  const name = (id: string) => data.patients.find((p) => p.patientId === id)?.fullName ?? id;

  const requests = query.data
    ? Object.entries(query.data).flatMap(([station, queue]) =>
        [...queue.open, ...queue.completed]
          .filter((r) => r.billingPending && (!patientId || r.patientId === patientId))
          .map((request) => ({ station, request })),
      )
    : [];

  const openRefusals = (refusals.data ?? []).filter(
    (r) =>
      r.entityType === 'service_charge_allocation' &&
      !r.resolvedOn &&
      (!patientId || r.refusedRecord?.patientId === patientId),
  );

  const renderQuestions = () => {
    if (query.loading && !query.data) {
      return <p role="status">Reading billing questions…</p>;
    }

    if (query.error) {
      return (
        <div role="alert">
          Billing questions could not be read.<Button onClick={query.reload}>Try again</Button>
        </div>
      );
    }

    if (!requests.length && !openRefusals.length) {
      return (
        <p className="rounded-card border border-outline-soft bg-white p-4 text-sm">
          No open billing questions{patientId ? ' for this patient' : ''}.
        </p>
      );
    }

    return requests.map(({ station, request }) => (
      <article
        key={request.id}
        className="space-y-3 rounded-card border border-outline-soft bg-white p-4"
      >
        {patientId ? null : <strong>{name(request.patientId)}</strong>}
        <p className="text-xs text-ink-muted">
          {station === 'lab' ? 'Laboratory' : 'Pharmacy'} request
          {request.superseded ? ' · earlier version' : ''}
        </p>
        {request.billingReviews?.map((item) => (
          <div key={item.id} className="space-y-2 border-t border-outline-soft pt-3 text-sm">
            <p className="text-base font-bold">
              {item.name}
              {item.quantity !== undefined ? ` · ${item.quantity} ${item.unit ?? ''}` : ''}
            </p>
            <p>{item.reason}</p>
            <p className="text-ink-muted">
              Ordered by{' '}
              {data.staff.find((s) => s.staffId === item.recordedBy)?.fullName ?? item.recordedBy} ·{' '}
              {new Date(item.recordedOn).toLocaleString('en-GB')}
            </p>
            <AssociationEditor
              patientId={request.patientId}
              sourceKind={station === 'lab' ? 'laboratory' : 'pharmacy'}
              sourceEntryId={station === 'lab' ? request.id : item.id}
              sourceItemId={item.id}
              quantity={item.quantity ?? 1}
              unit={item.unit ?? 'item'}
              charges={data.charges}
              onSaved={query.reload}
            />
            <details className="text-xs text-ink-muted">
              <summary className="cursor-pointer py-2">Technical details</summary>
              <p className="break-all font-mono">
                Source {request.id} · item {item.id}
              </p>
            </details>
          </div>
        ))}
        <div className="flex flex-wrap gap-3">
          {onPatient && !patientId ? (
            <Button
              fullWidth={false}
              variant="outlined"
              onClick={() => onPatient(request.patientId)}
            >
              Open patient's bills
            </Button>
          ) : null}
          {context.permissions.includes('patient_chart:read') ? (
            <Link
              className="inline-flex min-h-[44px] items-center font-bold text-brand"
              to={
                station === 'lab'
                  ? `${request.superseded ? '/encounters/record' : '/laboratory/request'}?${new URLSearchParams({ patient: request.patientId, visit: request.encounterId })}`
                  : `/pharmacy/request?${new URLSearchParams({ patient: request.patientId, visit: request.encounterId, prescription: request.id })}`
              }
            >
              Open the order
            </Link>
          ) : null}
        </div>
        {station === 'pharmacy' ? (
          <p className="text-xs text-ink-muted">
            Pharmacy staff can also review this supply in Supply and return history.
          </p>
        ) : null}
      </article>
    ));
  };

  return (
    <section aria-label="Billing questions" className="space-y-4">
      <p className="text-sm text-ink-soft">
        A clinical order or supply may already be covered by a charge raised by hand, or has no
        price yet. Check the charge, then link it or confirm it's separate. Nothing is charged or
        marked paid until this is decided.
      </p>
      {renderQuestions()}
      {openRefusals.map((r) => (
        <article
          key={r.id}
          role="alert"
          className="space-y-2 rounded-card border border-amber-border bg-amber-bg p-3"
        >
          <strong>A charge link was refused</strong>
          <p>{r.reason}</p>
          <p className="text-sm">
            The clinical record and payments are unchanged. Check the quantities and submit a
            corrected link.
          </p>
          <details className="text-xs">
            <summary className="cursor-pointer py-2">Technical details</summary>
            <p className="break-all">
              {r.entityId} · submitted by {r.attributedTo} · {r.occurredOn}
            </p>
          </details>
          {onPatient && !patientId && typeof r.refusedRecord?.patientId === 'string' ? (
            <Button
              fullWidth={false}
              variant="outlined"
              onClick={() => onPatient(String(r.refusedRecord?.patientId))}
            >
              Open patient's bills
            </Button>
          ) : null}
        </article>
      ))}
      <ServiceReturnReviews
        charges={data.charges}
        patientId={patientId}
        onPatient={onPatient ?? (() => undefined)}
      />
    </section>
  );
};
