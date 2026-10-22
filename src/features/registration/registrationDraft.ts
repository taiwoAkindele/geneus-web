import { EMPTY_REGISTRATION, type RegistrationValues } from './registrationValues';

/** In memory only: one person's unfinished form must never become another person's record. */
export const createRegistrationDraft = () => {
  let draft: { key: string; values: RegistrationValues } | undefined;
  return {
    read: (key: string, seed: Partial<RegistrationValues> = {}): RegistrationValues => {
      if (draft?.key !== key) draft = { key, values: { ...EMPTY_REGISTRATION, ...seed } };
      return draft.values;
    },
    keep: (key: string, values: RegistrationValues) => { draft = { key, values }; },
    clear: () => { draft = undefined; },
  };
};
