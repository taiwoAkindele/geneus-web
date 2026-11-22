import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { decide, type Device, type DeviceBlockReason } from '@shared';
import { useDeviceContext, useLiveQuery, useSyncStatus } from '@/data';
import { listDevices } from '@/data/repos/devices';
import { useAuthorizationContext } from '@/session';
import { revokeFacilityDevice } from '@/lib/api/devices';
import { ApiError } from '@/lib/api/client';
import { Button, DataTable, Sheet, Tag } from '@/ui';
import { deviceStatus, type DeviceStatus } from '@/lib/api/selfService';
import { DEVICE_REASONS } from '@/modules/finance/insurance';

/** Reports arrive once the server is reachable; until then, say why there is none. */
const missingReportText = (hasReports: boolean, isConnected: boolean): string => {
  if (hasReports) {
    return 'No report yet';
  }

  return isConnected ? 'Checking…' : 'Connect to check';
};

export const DevicesScreen = () => {
  const context = useAuthorizationContext();
  const { deviceId } = useDeviceContext();
  const query = useLiveQuery(listDevices);
  const sync = useSyncStatus();
  const [selected, setSelected] = useState<Device>();
  const [wipe, setWipe] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  // Set when the server reports this device last held unsent work; revoking then needs that loss accepted by name.
  const [unsent, setUnsent] = useState<number>();
  const [acceptUnsent, setAcceptUnsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const working = useRef(false);
  // Revoked devices are kept as records (past payments and care name the device), but hidden unless asked for.
  const [showRevoked, setShowRevoked] = useState(false);
  const revokedCount = (query.data ?? []).filter((d) => d.status !== 'active').length;
  const listed = (query.data ?? []).filter((d) => showRevoked || d.status === 'active');
  useEffect(() => {
    document.title = 'Facility devices · Geneus Health';
  }, []);

  // The server's view of each device: its app version, unsent work and last report — what readiness checks use.
  const [reports, setReports] = useState<Map<string, DeviceStatus>>();
  const [reportError, setReportError] = useState('');
  useEffect(() => {
    if (!sync.connected) {
      return;
    }

    deviceStatus(context).then(
      (r) => {
        setReports(new Map(r.devices.map((d) => [d.id, d])));
        setReportError('');
      },
      (cause) => setReportError(cause instanceof Error ? cause.message : 'Sync status unavailable'),
    );
  }, [context, sync.connected, notice]);

  const denial = decide(context, 'device:revoke');

  const allowed =
    context.permissions.includes('device:enroll') ||
    context.permissions.includes('device:revoke') ||
    context.roles?.includes('facility_admin') ||
    context.role === 'facility_admin';

  const revoke = async () => {
    if (!selected || working.current || !acknowledged || denial || !sync.connected) {
      return;
    }

    if (selected.id === deviceId && (sync.pending > 0 || sync.pendingKnown === false)) {
      setError('Upload and review this device’s pending work before revoking it.');

      return;
    }

    working.current = true;
    setBusy(true);
    setError('');

    try {
      await revokeFacilityDevice(selected.id, context.userId, wipe, acceptUnsent);
      setNotice('The server revoked access. Device status updates here after sync.');
      setSelected(undefined);
      query.reload();
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'unsent_work') {
        setUnsent((cause.details as { unsentChanges?: number } | undefined)?.unsentChanges ?? 1);
      }

      setError(cause instanceof Error ? cause.message : 'Device access could not be changed.');
    } finally {
      working.current = false;
      setBusy(false);
    }
  };

  const renderDeviceList = () => {
    if (!allowed) {
      return <p>Your account has not been assigned device administration.</p>;
    }

    if (query.loading) {
      return <p role="status">Reading device records…</p>;
    }

    if (query.error) {
      return (
        <div role="alert">
          <p>Devices could not be read from this replica.</p>
          <Button variant="ghost" onClick={query.reload}>
            Try again
          </Button>
        </div>
      );
    }

    if (!query.data?.length) {
      return (
        <p className="rounded-card border border-dashed border-outline bg-white p-5 text-sm text-ink-muted">
          No device records are available here yet. Check sync before drawing conclusions about
          enrollment.
        </p>
      );
    }

    return (
      <>
        <DataTable
          caption="Enrolled facility devices"
          rows={listed}
          rowKey={(row) => row.id}
          columns={[
            {
              key: 'device',
              label: 'Device',
              render: (row) => (
                <>
                  <p className="font-bold">
                    {row.label ?? 'Unnamed device'}
                    {row.id === deviceId ? ' · this device' : ''}
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-ink-muted">{row.id}</p>
                </>
              ),
            },
            {
              key: 'status',
              label: 'Access',
              render: (row) => (
                <Tag tone={row.status === 'active' ? 'green' : 'slate'}>
                  {row.status === 'active' ? 'Active' : 'Revoked'}
                </Tag>
              ),
            },
            {
              key: 'sync',
              label: 'Sync status',
              render: (row) => {
                const r = reports?.get(row.id);

                if (!r) {
                  return (
                    <span className="text-xs text-ink-muted">
                      {missingReportText(Boolean(reports), sync.connected)}
                    </span>
                  );
                }

                const renderPendingChanges = () => {
                  if (r.pendingChanges === undefined) {
                    return 'unsent work unknown';
                  }

                  if (r.pendingChanges) {
                    return `${r.pendingChanges} unsent change${r.pendingChanges === 1 ? '' : 's'}`;
                  }

                  return 'nothing unsent';
                };

                return (
                  <div data-device-status={row.id} className="space-y-1 text-sm">
                    <p>
                      {r.insuranceCapable ? 'Current app' : 'Older app version'} ·{' '}
                      {renderPendingChanges()}
                    </p>
                    {r.lastReportedOn ? (
                      <p className="text-xs text-ink-muted">
                        Last report {new Date(r.lastReportedOn).toLocaleString('en-GB')}
                      </p>
                    ) : null}
                    {row.status === 'active'
                      ? r.blocking.map((b) => (
                          <p key={b} className="text-xs text-amber-text">
                            This device {DEVICE_REASONS[b as DeviceBlockReason]?.problem}.{' '}
                            {DEVICE_REASONS[b as DeviceBlockReason]?.fix}
                          </p>
                        ))
                      : null}
                  </div>
                );
              },
            },
            {
              key: 'seen',
              label: 'Last server contact',
              render: (row) =>
                row.lastSeenOn
                  ? new Date(row.lastSeenOn).toLocaleString('en-GB')
                  : 'Not yet recorded',
            },
            {
              key: 'action',
              label: 'Action',
              render: (row) => {
                const canRevoke =
                  row.status === 'active' && context.permissions.includes('device:revoke');

                if (!canRevoke) {
                  return row.wipeRequested ? 'Local wipe requested' : '—';
                }

                return (
                  <Button
                    fullWidth={false}
                    variant="danger"
                    onClick={() => {
                      setSelected(row);
                      setWipe(false);
                      setAcknowledged(false);
                      setUnsent(undefined);
                      setAcceptUnsent(false);
                      setError('');
                    }}
                  >
                    Revoke access
                  </Button>
                );
              },
            },
          ]}
        />
        {!listed.length ? (
          <p className="rounded-card border border-dashed border-outline bg-white p-5 text-sm text-ink-muted">
            No active devices.
          </p>
        ) : null}
        {revokedCount ? (
          <Button
            variant="ghost"
            fullWidth={false}
            className="!px-0 !py-2"
            aria-expanded={showRevoked}
            onClick={() => setShowRevoked((v) => !v)}
          >
            {showRevoked
              ? 'Hide revoked devices'
              : `Show ${revokedCount} revoked device${revokedCount === 1 ? '' : 's'}`}
          </Button>
        ) : null}
      </>
    );
  };

  const renderSyncNotice = () => {
    if (!sync.connected) {
      return <p className="mt-3 text-sm text-amber-text">Connect before revoking access.</p>;
    }

    if (denial) {
      return (
        <p className="mt-3 text-sm text-amber-text">
          Your authorization must be refreshed before this action. Check sync or ask a facility
          administrator.
        </p>
      );
    }

    return null;
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-5 md:px-7">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-extrabold">Facility devices</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Enrolled devices, recent server contact and access status.
          </p>
        </div>
        {context.permissions.includes('device:enroll') ? (
          <Link
            to="/admin/devices/add"
            className="inline-flex min-h-[52px] items-center rounded-field bg-brand px-4 py-3 font-bold text-white"
          >
            Add device
          </Link>
        ) : null}
      </header>
      {renderDeviceList()}
      {notice ? (
        <p role="status" className="rounded-field bg-brand-wash p-4 text-sm">
          {notice}
        </p>
      ) : null}
      {reportError ? (
        <p role="alert" className="text-sm text-amber-text">
          {reportError}
        </p>
      ) : null}
      <p className="text-xs leading-relaxed text-ink-muted">
        Status is based on the records synced to this device. Adding or revoking access requires a
        connection and recent authorization.
      </p>
      {selected ? (
        <Sheet
          title={`Revoke ${selected.label ?? 'this device'}?`}
          onClose={() => setSelected(undefined)}
          closeDisabled={busy}
        >
          <p className="text-sm leading-relaxed">
            The server will stop accepting this device's sync requests. It may contain changes that
            have not uploaded; arrange a review before revoking access.
          </p>
          {selected.id === deviceId ? (
            <p className="mt-3 font-bold text-danger">
              You are using this device. Revoking it will block its future access.
            </p>
          ) : null}
          <label className="mt-4 flex min-h-[52px] items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={wipe}
              onChange={(event) => setWipe(event.target.checked)}
            />
            Also request removal of its local replica when it next contacts the server
          </label>
          <label className="mt-3 flex min-h-[52px] items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            I have checked the impact on work saved on that device
          </label>
          {unsent ? (
            <label className="mt-3 flex min-h-[52px] items-center gap-3 text-sm font-semibold text-danger">
              <input
                type="checkbox"
                checked={acceptUnsent}
                onChange={(event) => setAcceptUnsent(event.target.checked)}
              />
              I accept that {unsent} unsent change{unsent === 1 ? '' : 's'} on this device will
              never arrive
            </label>
          ) : null}
          {renderSyncNotice()}
          {error ? (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              fullWidth={false}
              variant="outlined"
              disabled={busy}
              onClick={() => setSelected(undefined)}
            >
              Keep access
            </Button>
            <Button
              fullWidth={false}
              variant="danger-outline"
              loading={busy}
              disabled={
                !acknowledged ||
                (Boolean(unsent) && !acceptUnsent) ||
                !sync.connected ||
                Boolean(denial)
              }
              onClick={() => void revoke()}
            >
              Confirm revocation
            </Button>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
};
