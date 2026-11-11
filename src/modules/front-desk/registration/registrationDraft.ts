import { EMPTY_REGISTRATION, type RegistrationValues } from './registrationValues';

/** Form state is separate from a saved patient and belongs to one signed-in person. */
export type RegistrationDraftSnapshot = { key: string; values: RegistrationValues; updatedOn?: string };
export const createRegistrationDraft = (onChange?: () => void, seed: readonly RegistrationDraftSnapshot[] = []) => {
  const drafts = new Map(seed.map((draft) => [draft.key, draft]));
  let activeKey = 'new';
  return {
    read: (key: string, seed: Partial<RegistrationValues> = {}): RegistrationValues => {
      activeKey = key;
      if (!drafts.has(key)) drafts.set(key, { key, values: { ...EMPTY_REGISTRATION, ...seed } });
      return drafts.get(key)!.values;
    },
    snapshot: () => [...drafts.values()],
    peek: (key: string) => drafts.get(key),
    keep: (key: string, values: RegistrationValues) => {
      activeKey = key;
      drafts.set(key, { key, values: { ...values }, updatedOn: new Date().toISOString() });
      onChange?.();
    },
    clear: (key = activeKey) => { drafts.delete(key); onChange?.(); },
  };
};
