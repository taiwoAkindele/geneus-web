import { FACILITY_DOCUMENT_POLICY, type AnyDocument, type AuthorizationContext, type ConfigurationSaveResponse, type DocType, type UploadMutation } from '@shared';
import { ApiError, staffRequest } from '@/lib/api/client';
import { WORKFORCE_VERSIONS } from '@/lib/api/sync';
import { forgetStaffSession, staffSessionToken, touchStaffSession } from '@/lib/api/staffSession';
import { getDeviceCredential } from './deviceCredential';
import { decodeValues, toRow } from './rows';

/**
 * Configuration is saved online, by the person signed in, and only counts once
 * the server accepts it. Nothing is written to this device's offline queue: a
 * refused or interrupted save leaves no trace to upload later. Accepted
 * settings reach every device, this one included, through normal sync.
 */
export class ConfigurationSaveError extends Error {
  readonly code: 'offline' | 'needs_pin' | 'refused' | 'failed';
  constructor(code: ConfigurationSaveError['code'], message: string) { super(message); this.name = 'ConfigurationSaveError'; this.code = code; }
}
export const CONFIGURATION_SAVE_EVENT = 'geneus:configurationSave';
export type ConfigurationSaveState = { phase: 'saving' | 'confirmed' | 'arrived' | 'refused'; message?: string };
const announce = (state: ConfigurationSaveState) => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<ConfigurationSaveState>(CONFIGURATION_SAVE_EVENT, { detail: state })); };

const REVISIONED = ['unit', 'billing_department', 'location', 'service_definition', 'service_offering', 'practitioner_profile', 'result_template', 'result_part', 'answer_list'];
let sequence = 0;
// Far above PowerSync's own numbering, so an online save never collides with a queued write in the server's ledger.
const nextClientId = () => Date.now() * 1000 + (sequence++ % 1000);

export type ConfigurationWrite =
  | { op: 'put'; type: DocType; record: AnyDocument }
  | { op: 'patch'; type: DocType; id: string; changes: Record<string, unknown>; current: AnyDocument };

/** The same mutation the sync connector would build, so the server applies exactly its usual rules. */
const toMutation = (write: ConfigurationWrite): UploadMutation => {
  if (write.op === 'put') {
    const data = decodeValues(write.type, toRow(write.type, write.record as unknown as Record<string, unknown>));
    const policy = (FACILITY_DOCUMENT_POLICY as Record<string, { change: string }>)[write.type];
    return { clientId: nextClientId(), op: 'put', table: write.type, id: write.record.id, data,
      ...(policy && ['versioned', 'append_only'].includes(policy.change) ? { expectedPreviousId: typeof data.previousId === 'string' ? data.previousId : null } : {}) } as UploadMutation;
  }
  const data = decodeValues(write.type, toRow(write.type, write.changes));
  const current = write.current as unknown as Record<string, unknown>;
  const previous = Object.fromEntries(Object.keys(data).filter((k) => !['updatedBy', 'updatedOn'].includes(k)).map((k) => [k, current[k] ?? null]));
  return { clientId: nextClientId(), op: 'patch', table: write.type, id: write.id, data, previous,
    ...(REVISIONED.includes(write.type) && typeof data.revision === 'number' ? { expectedRevision: data.revision - 1 } : {}) } as UploadMutation;
};

/** Waits until sync has brought the accepted change to this device, so the screen shows what the server holds. */
const arrival = async (writes: readonly ConfigurationWrite[], timeoutMs = 20_000) => {
  const { findRecord } = await import('./db');
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const arrived = await Promise.all(writes.map(async (w) => {
      const local = await findRecord(w.type, w.op === 'put' ? w.record.id : w.id) as Record<string, unknown> | undefined;
      return w.op === 'put' ? Boolean(local) : Boolean(local) && local!.updatedOn === w.changes.updatedOn;
    }));
    if (arrived.every(Boolean)) return true;
    await new Promise((done) => setTimeout(done, 300));
  }
  return false;
};

export const saveConfiguration = async (context: AuthorizationContext, writes: readonly ConfigurationWrite[]): Promise<{ arrived: boolean }> => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new ConfigurationSaveError('offline', 'Settings are saved on the server and need an internet connection. Connect, then save again.');
  const device = getDeviceCredential();
  if (!device) throw new ConfigurationSaveError('failed', 'This device is not enrolled');
  const token = staffSessionToken(context);
  if (!token) throw new ConfigurationSaveError('needs_pin', 'Confirm your PIN to save settings.');
  announce({ phase: 'saving' });
  try {
    await staffRequest<ConfigurationSaveResponse>('/config/save', device.credential, token, { ...WORKFORCE_VERSIONS, transactionId: null, mutations: writes.map(toMutation) });
    touchStaffSession();
  } catch (cause) {
    if (cause instanceof ApiError && cause.code === 'staff_session_required') { forgetStaffSession(); announce({ phase: 'refused', message: 'Confirm your PIN to save settings.' }); throw new ConfigurationSaveError('needs_pin', 'Confirm your PIN to save settings.'); }
    if (cause instanceof ApiError && cause.code === 'offline') { announce({ phase: 'refused', message: cause.message }); throw new ConfigurationSaveError('offline', 'The server could not be reached, so nothing was saved. Connect, then save again.'); }
    const message = cause instanceof ApiError && cause.code === 'configuration_refused' ? `Not saved: ${cause.message}` : cause instanceof Error ? cause.message : 'The settings could not be saved';
    announce({ phase: 'refused', message });
    throw new ConfigurationSaveError(cause instanceof ApiError && cause.code === 'configuration_refused' ? 'refused' : 'failed', message);
  }
  announce({ phase: 'confirmed' });
  const arrived = await arrival(writes);
  announce({ phase: 'arrived', ...(arrived ? {} : { message: 'Saved on the server. This device will show it after its next sync.' }) });
  return { arrived };
};
