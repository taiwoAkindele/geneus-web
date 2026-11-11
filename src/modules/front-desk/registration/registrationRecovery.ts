import type { AuthorizationContext } from '@shared';
import { secureGet, secureSet } from '@/lib/secureStorage';
import { EMPTY_REGISTRATION, type RegistrationValues } from './registrationValues';
import { createRegistrationDraft, type RegistrationDraftSnapshot } from './registrationDraft';

type Owner = Pick<AuthorizationContext, 'facilityId' | 'deviceId' | 'userId'>;
type Archive = { version: 2; owners: Record<string, RegistrationDraftSnapshot[]> };
type Storage = { read: () => string | null; write: (value: string) => Promise<void> };
export type RecoveryStatus = { pending: boolean; error?: string; savedAt?: string; unreadable?: boolean };
const KEY = 'geneus.registrationDrafts';
const ownerKey = (owner: Owner) => JSON.stringify([owner.facilityId, owner.deviceId, owner.userId]);
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const parseDraft = (value: unknown): RegistrationDraftSnapshot => {
  if (!object(value) || typeof value.key !== 'string' || !object(value.values)) throw new Error('The saved registration draft could not be read. Keep this device and retry recovery.');
  const values = { ...EMPTY_REGISTRATION };
  for (const key of Object.keys(values) as (keyof RegistrationValues)[]) {
    const field = value.values[key];
    if (field === undefined) continue;
    if (typeof field !== typeof values[key]) throw new Error('The saved registration draft could not be read. Keep this device and retry recovery.');
    Object.assign(values, { [key]: field });
  }
  if (!['identified', 'provisional'].includes(values.identityStatus) || !['', 'F', 'M'].includes(values.sex) || !['', 'christianity', 'islam', 'other'].includes(values.religion) || !['reported', 'document_seen'].includes(values.identityEvidence)) throw new Error('The saved registration draft has unsupported values. Keep this device and retry recovery.');
  return { key: value.key, values, ...(typeof value.updatedOn === 'string' ? { updatedOn: value.updatedOn } : {}) };
};

const readArchive = (raw: string | null, owner: Owner): Archive => {
  if (!raw) return { version: 2, owners: {} };
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new Error('Registration recovery could not be read. Keep this device without clearing storage.'); }
  if (!object(value)) throw new Error('Registration recovery could not be read. Keep this page open and retry.');
  if (value.version === 2 && object(value.owners)) return value as Archive;
  if ('version' in value) throw new Error('This registration recovery format needs a compatible app. Keep this device without clearing storage.');
  // The legacy staff-only map lives in the active facility's encrypted slot.
  // Preserve colleagues' drafts when migrating to explicit enrollment scopes.
  return { version: 2, owners: Object.fromEntries(Object.entries(value).map(([userId, draft]) => [ownerKey({ ...owner, userId }), [parseDraft(draft)]])) };
};
const containsTyping = (draft: RegistrationDraftSnapshot) => (Object.keys(EMPTY_REGISTRATION) as (keyof RegistrationValues)[]).some((key) => draft.values[key] !== EMPTY_REGISTRATION[key]);

export const createRegistrationRecovery = (owner: Owner, storage: Storage = { read: () => secureGet(KEY), write: (value) => secureSet(KEY, value) }) => {
  let status: RecoveryStatus = { pending: false };
  let readError: Error | undefined;
  let seed: RegistrationDraftSnapshot[] = [];
  try {
    const saved = readArchive(storage.read(), owner).owners[ownerKey(owner)] ?? [];
    if (!Array.isArray(saved)) throw new Error('Registration recovery could not be read. Keep this page open and retry.');
    seed = saved.map(parseDraft).filter(containsTyping);
  } catch (cause) {
    readError = cause instanceof Error ? cause : new Error('Registration recovery could not be read. Keep this page open and retry.');
    status = { pending: false, error: readError.message, unreadable: true };
  }
  const recovered = new Set(seed.map((draft) => draft.key));
  const listeners = new Set<() => void>();
  let pending: Promise<void> = Promise.resolve();
  let generation = 0;
  const publish = (next: RecoveryStatus) => { status = next; listeners.forEach((listener) => listener()); };
  const persist = () => {
    const revision = ++generation;
    publish({ pending: true });
    try {
      // Do not replace an unreadable saved form with an empty in-memory store.
      if (readError) throw readError;
      const archive = readArchive(storage.read(), owner);
      archive.owners[ownerKey(owner)] = store.snapshot().filter(containsTyping);
      pending = storage.write(JSON.stringify(archive));
    } catch (cause) { pending = Promise.reject(cause); }
    void pending.then(() => {
      if (revision === generation) publish({ pending: false, savedAt: new Date().toISOString() });
    }, () => {
      if (revision === generation) publish({ pending: false, ...(readError ? { error: readError.message, unreadable: true } : { error: 'Your latest registration changes could not be saved for recovery. Keep this page open and retry.' }) });
    });
    return pending;
  };
  const store = createRegistrationDraft(() => { void persist(); }, seed);
  return {
    store,
    status: () => status,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    needsChoice: (key: string) => recovered.has(key),
    resume: (key: string) => recovered.delete(key),
    discard: (key: string) => { recovered.delete(key); store.clear(key); return pending; },
    clear: (key: string) => { recovered.delete(key); store.clear(key); return pending; },
    flush: () => readError ? Promise.reject(readError) : pending,
    retry: persist,
  };
};
