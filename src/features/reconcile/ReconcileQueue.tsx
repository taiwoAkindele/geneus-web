import { useCallback, useState } from 'react';
import type { SyncRejection } from '@shared';
import { AuthorizationError, useLiveQuery } from '@/data';
import { listStaff } from '@/data/repos/staff';
import {
  applyAgain,
  applyAgainBlocker,
  applyDeviceValues,
  discardRejection,
  heldFor,
  listOpenRejections,
  reRegisterPatient,
  resolveRejection,
} from '@/data/repos/syncRejections';
import { useAuthorizationContext } from '@/session';
import { useToast } from '@/ui';
import { kindOf } from './describeRejection';
import { RejectionCard } from './RejectionCard';

/**
 * Every upload the server would not apply, until a person decides it (SCHEMA.md
 * §7): no refused write is lost. Shown to everyone — a refused write is never
 * hidden — and decided by those who hold `sync_rejection:resolve` (records
 * officers, facility admins). Each decision is recorded in their name.
 */
export const ReconcileQueue = () => {
  const toast = useToast();
  const context = useAuthorizationContext();
  const open = useLiveQuery(useCallback(() => listOpenRejections(), []));
  const staff = useLiveQuery(listStaff);
  const [busyId, setBusyId] = useState<string>();
  const canResolve = context.permissions.includes('sync_rejection:resolve');
  const rejections = open.data ?? [];
  const nameOf = (staffId: string) => staff.data?.find((member) => member.staffId === staffId)?.fullName ?? staffId;

  const act = async (rejection: SyncRejection, work: () => Promise<unknown>, done: string) => {
    setBusyId(rejection.id);
    try {
      await work();
      toast(done);
    } catch (cause) {
      if (!(cause instanceof AuthorizationError)) console.error('reconcile action failed', cause);
      toast(cause instanceof Error ? cause.message : 'Could not resolve this — please try again', { tone: 'error' });
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
        Nothing needs a decision — every change was accepted.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rejections.map((rejection) => (
        <RejectionCard
          key={rejection.id}
          rejection={rejection}
          kind={kindOf(rejection, rejections)}
          heldCount={heldFor(rejection, rejections).length}
          canResolve={canResolve}
          applyBlocker={applyAgainBlocker(rejection, context)}
          nameOf={nameOf}
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
          onApplyAgain={() => void act(rejection, () => applyAgain(rejection, context), 'Applied again in your name')}
          onDiscard={() => void act(rejection, () => discardRejection(rejection, context), 'Discarded — recorded in your name')}
        />
      ))}
    </div>
  );
};
