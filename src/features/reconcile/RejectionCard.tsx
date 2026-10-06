import { useState } from 'react';
import type { SyncRejection } from '@shared';
import { Button, Tag } from '@/ui';
import { CATEGORY_LABEL, keptRows, RECORD_LABEL, shownValue, type RejectionKind } from './describeRejection';

type Props = {
  rejection: SyncRejection;
  kind: RejectionKind;
  /** Records held back with this one, for a Patient ID clash. */
  heldCount: number;
  /** Whether the signed-in person may resolve rejections at all. */
  canResolve: boolean;
  /** Why this person cannot apply it again, when they cannot. */
  applyBlocker: string | undefined;
  /** Display names for staff ids, for who first recorded it. */
  nameOf: (staffId: string) => string;
  busy: boolean;
  onKeepServer: () => void;
  onUseDevice: (columns: string[]) => void;
  onReRegister: () => void;
  onApplyAgain: () => void;
  onDiscard: () => void;
};

const formatWhen = (iso: string | undefined): string =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

const Rows = ({ rows }: { rows: { label: string; value: string }[] }) => (
  <dl className="mt-3 space-y-1 rounded-[11px] bg-surface-muted p-3 text-[13px]">
    {rows.map((row) => (
      <div key={row.label} className="flex flex-wrap gap-x-3">
        <dt className="min-w-[110px] font-semibold text-ink-soft">{row.label}</dt>
        <dd className="flex-1 break-words text-ink">{row.value}</dd>
      </div>
    ))}
  </dl>
);

/**
 * One refused upload, presented as a decision (SCHEMA.md §7): nothing here is
 * dropped quietly. A field changed on two devices is a choice between values;
 * a Patient ID another device took is a re-registration; any other refused
 * write is applied again or discarded — and whoever decides is recorded.
 */
export const RejectionCard = ({
  rejection,
  kind,
  heldCount,
  canResolve,
  applyBlocker,
  nameOf,
  busy,
  onKeepServer,
  onUseDevice,
  onReRegister,
  onApplyAgain,
  onDiscard,
}: Props) => {
  const [chosen, setChosen] = useState<string[]>([]);
  const refused = rejection.refusedRecord;
  const toggle = (column: string) =>
    setChosen((now) => (now.includes(column) ? now.filter((c) => c !== column) : [...now, column]));
  const what = rejection.operation === 'patch' ? 'change' : rejection.operation === 'delete' ? 'removal' : 'new record';

  return (
    <div className="rounded-card border border-outline-soft bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[15px] font-bold text-ink">
            {RECORD_LABEL[rejection.entityType] ?? rejection.entityType} · {what}
            {rejection.entityType === 'patient' ? ` · ${rejection.entityId}` : ''}
          </div>
          <div className="text-[13px] text-ink-muted">
            {rejection.attributedTo ? `By ${nameOf(rejection.attributedTo)} · ` : ''}
            {formatWhen(rejection.occurredOn ?? rejection.createdOn)}
          </div>
        </div>
        <Tag tone="amber">{kind === 'held' ? 'Held with its patient' : 'Needs a decision'}</Tag>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
        <b className="text-ink">{CATEGORY_LABEL[rejection.category]}.</b> {rejection.reason.replace(/^held: /, '')}
      </p>

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
                    <input type="checkbox" checked={chosen.includes(conflict.column)} disabled={!canResolve} onChange={() => toggle(conflict.column)} />
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

      {kind === 'refused_write' || kind === 'held' ? <Rows rows={keptRows(rejection)} /> : null}

      {kind === 'held' ? (
        <p className="mt-2 text-[12px] text-ink-muted">Decided together with its patient’s registration.</p>
      ) : canResolve ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            {kind === 'column_conflict' ? (
              <>
                <Button variant="primary" fullWidth={false} className="px-4" disabled={busy} onClick={onKeepServer}>
                  Keep what is saved
                </Button>
                <Button variant="outlined" fullWidth={false} className="px-4" disabled={busy || chosen.length === 0} onClick={() => onUseDevice(chosen)}>
                  Use this device’s ticked values
                </Button>
              </>
            ) : kind === 'patient_id_clash' ? (
              <>
                <Button variant="primary" fullWidth={false} className="px-4" disabled={busy} loading={busy} onClick={onReRegister}>
                  Register under a new Patient ID
                </Button>
                <Button variant="ghost" fullWidth={false} className="px-4" disabled={busy} onClick={onDiscard}>
                  Discard
                </Button>
              </>
            ) : (
              <>
                {kind === 'refused_write' ? (
                  <Button variant="primary" fullWidth={false} className="px-4" disabled={busy || Boolean(applyBlocker)} loading={busy} onClick={onApplyAgain}>
                    Apply again
                  </Button>
                ) : null}
                <Button variant="outlined" fullWidth={false} className="px-4" disabled={busy} onClick={onDiscard}>
                  Discard
                </Button>
              </>
            )}
          </div>
          {kind === 'refused_write' && applyBlocker ? <p className="text-[12px] text-ink-muted">{applyBlocker}</p> : null}
          {kind === 'refused_write' && !applyBlocker ? (
            <p className="text-[12px] text-ink-muted">Applying it again saves it in your name; the original author and time stay on this record.</p>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-ink-muted">A records officer or facility admin decides this.</p>
      )}
    </div>
  );
};
