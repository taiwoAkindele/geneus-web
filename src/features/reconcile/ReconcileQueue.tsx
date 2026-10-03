import { useCallback, useState } from 'react';
import type { SyncRejection } from '@shared';
import { AuthorizationError, useLiveQuery } from '@/data';
import { applyDeviceValues, heldFor, listOpenRejections, reRegisterPatient, resolveRejection } from '@/data/repos/syncRejections';
import { useAuthorizationContext } from '@/session';
import { useToast } from '@/ui';
import { RejectionCard } from './RejectionCard';

/**
 * Every upload the server would not apply, until someone resolves it. Shown to
 * everyone — a refused write is never hidden — and acted on by those who hold
 * `sync_rejection:resolve` (records officers, facility admins).
 */
export const ReconcileQueue = () => {
  const toast = useToast();
  const context = useAuthorizationContext();
  const open = useLiveQuery(useCallback(() => listOpenRejections(), []));
  const [busyId, setBusyId] = useState<string>();
  const canResolve = context.permissions.includes('sync_rejection:resolve');
  const rejections = open.data ?? [];

  const act = async (rejection: SyncRejection, work: () => Promise<unknown>, done: string) => {
    setBusyId(rejection.id);
    try {
      await work();
      toast(done);
    } catch (cause) {
      toast(cause instanceof AuthorizationError ? cause.message : 'Could not resolve this — please try again', { tone: 'error' });
    } finally {
      setBusyId(undefined);
    }
  };

  if (open.loading) return <div className="h-[80px] animate-pulse rounded-card bg-surface-muted" />;
  if (open.error) {
    return (
      <div className="rounded-card bg-white p-4 text-[13px] text-danger-strong">
        The queue could not be read from this device.{' '}
        <button type="button" className="font-bold text-brand" onClick={open.reload}>
          Try again
        </button>
      </div>
    );
  }
  if (rejections.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-outline p-4 text-center text-[13px] text-ink-muted">
        Nothing needs reconciling — every change was accepted.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rejections.map((rejection) => (
        <RejectionCard
          key={rejection.id}
          rejection={rejection}
          heldCount={heldFor(rejection, rejections).length}
          canResolve={canResolve}
          busy={busyId === rejection.id}
          onKeepServer={() => void act(rejection, () => resolveRejection(rejection, 'Kept the saved values', context), 'Kept what is saved')}
          onUseDevice={(columns) =>
            void act(rejection, () => applyDeviceValues(rejection, columns, context), 'This device’s values applied')
          }
          onReRegister={() =>
            void act(
              rejection,
              async () => {
                const patient = await reRegisterPatient(rejection, rejections, context);
                toast(`Registered as ${patient.patientId}`);
              },
              'Held records restored',
            )
          }
          onReviewed={() => void act(rejection, () => resolveRejection(rejection, 'Reviewed', context), 'Marked as reviewed')}
        />
      ))}
    </div>
  );
};
