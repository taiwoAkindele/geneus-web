import { useState } from 'react';
import type { SyncRejection } from '@shared';
import { Button, Tag } from '@/ui';
import { CATEGORY_LABEL, kindOf, RECORD_LABEL, shownValue } from './describeRejection';

type Props = {
  rejection: SyncRejection;
  /** Records held back with this one, for a Patient ID clash. */
  heldCount: number;
  /** Whether the signed-in person may resolve rejections at all. */
  canResolve: boolean;
  busy: boolean;
  onKeepServer: () => void;
  onUseDevice: (columns: string[]) => void;
  onReRegister: () => void;
  onReviewed: () => void;
};

const formatWhen = (iso: string | undefined): string =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

/**
 * One refused upload in the reconcile queue, with the choice that fits it: a
 * field changed on two devices, a Patient ID another device took first, or
 * anything else to read and mark reviewed. Nothing here is decided for the
 * officer — the server never picks a winner for clinical data (SCHEMA.md §7).
 */
export const RejectionCard = ({ rejection, heldCount, canResolve, busy, onKeepServer, onUseDevice, onReRegister, onReviewed }: Props) => {
  const kind = kindOf(rejection);
  const [chosen, setChosen] = useState<string[]>([]);
  const refused = rejection.refusedRecord;

  const toggle = (column: string) =>
    setChosen((now) => (now.includes(column) ? now.filter((c) => c !== column) : [...now, column]));

  return (
    <div className="rounded-card border border-outline-soft bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[15px] font-bold text-ink">
            {RECORD_LABEL[rejection.entityType] ?? rejection.entityType}
            {rejection.entityType === 'patient' ? ` · ${rejection.entityId}` : ''}
          </div>
          <div className="text-[13px] text-ink-muted">
            {CATEGORY_LABEL[rejection.category]} · {formatWhen(rejection.occurredOn ?? rejection.createdOn)}
          </div>
        </div>
        <Tag tone={rejection.category === 'conflict' ? 'amber' : 'slate'}>{kind === 'held' ? 'Held' : 'Needs a decision'}</Tag>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{rejection.reason.replace(/^held: /, '')}</p>

      {kind === 'column_conflict' ? (
        <table className="mt-3 w-full text-left text-[13px]">
          <thead>
            <tr className="text-ink-muted">
              <th className="py-1 font-semibold" />
              <th className="py-1 font-semibold">This device</th>
              <th className="py-1 font-semibold">Already saved</th>
            </tr>
          </thead>
          <tbody>
            {(rejection.conflicts ?? []).map((conflict) => (
              <tr key={conflict.column} className="border-t border-outline-soft">
                <th className="py-1.5 pr-2 font-semibold text-ink-soft">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={chosen.includes(conflict.column)}
                      disabled={!canResolve}
                      onChange={() => toggle(conflict.column)}
                    />
                    {conflict.column}
                  </label>
                </th>
                <td className="py-1.5 pr-2">{shownValue(conflict.deviceValue)}</td>
                <td className="py-1.5">{shownValue(conflict.serverValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {kind === 'patient_id_clash' && refused ? (
        <div className="mt-3 rounded-[11px] bg-surface-muted p-3 text-[13px] leading-relaxed">
          <div className="font-bold text-ink">{shownValue(refused.fullName)}</div>
          <div className="text-ink-soft">
            {[refused.sex, refused.ageYears ?? refused.dateOfBirth, refused.phone, refused.address].map(shownValue).join(' · ')}
          </div>
          <div className="mt-1 text-ink-muted">
            Another device registered a different person as {rejection.entityId} first.
            {heldCount > 0
              ? ` ${heldCount} record${heldCount === 1 ? '' : 's'} for this patient ${heldCount === 1 ? 'is' : 'are'} held with it.`
              : ''}
          </div>
        </div>
      ) : null}

      {kind === 'held' ? (
        <p className="mt-2 text-[12px] text-ink-muted">Resolved together with its patient’s registration.</p>
      ) : canResolve ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {kind === 'column_conflict' ? (
            <>
              <Button variant="primary" fullWidth={false} className="px-4" disabled={busy} onClick={onKeepServer}>
                Keep what is saved
              </Button>
              <Button
                variant="outlined"
                fullWidth={false}
                className="px-4"
                disabled={busy || chosen.length === 0}
                onClick={() => onUseDevice(chosen)}
              >
                Use this device’s ticked values
              </Button>
            </>
          ) : kind === 'patient_id_clash' ? (
            <Button variant="primary" fullWidth={false} className="px-4" disabled={busy} loading={busy} onClick={onReRegister}>
              Register under a new Patient ID
            </Button>
          ) : (
            <Button variant="outlined" fullWidth={false} className="px-4" disabled={busy} onClick={onReviewed}>
              Mark as reviewed
            </Button>
          )}
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-ink-muted">A records officer or facility admin resolves this.</p>
      )}
    </div>
  );
};
