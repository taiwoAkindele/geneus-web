import { EMPTY_REGISTRATION, type RegistrationValues } from './registrationValues';

/** In memory only: one person's unfinished form must never become another person's record. */
export type RegistrationDraftSnapshot = { key: string; values: RegistrationValues };
export const createRegistrationDraft = (onChange?: (draft: RegistrationDraftSnapshot | undefined) => void, seed?: RegistrationDraftSnapshot) => {
  let draft = seed;
  return {
    read: (key: string, seed: Partial<RegistrationValues> = {}): RegistrationValues => {
      if (draft?.key !== key) draft = { key, values: { ...EMPTY_REGISTRATION, ...seed } };
      return draft.values;
    },
    snapshot: () => draft,
    keep: (key: string, values: RegistrationValues) => { draft = { key, values }; onChange?.(draft); },
    clear: () => { draft = undefined; onChange?.(undefined); },
  };
};
