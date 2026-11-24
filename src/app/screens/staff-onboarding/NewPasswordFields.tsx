import { TextField } from '@/ui';

/** The contract's rule (`staffPassword`): checked here first so a typo is caught before the network. */
const MIN_LENGTH = 8;
const MAX_LENGTH = 128;

/** Why a new password cannot be used yet, or undefined when it can. */
export const newPasswordProblem = (password: string, confirmation: string): string | undefined => {
  if (password.length < MIN_LENGTH) {
    return `Use at least ${MIN_LENGTH} characters.`;
  }

  if (password.length > MAX_LENGTH) {
    return `Use at most ${MAX_LENGTH} characters.`;
  }

  if (password !== confirmation) {
    return 'The two passwords don’t match.';
  }

  return undefined;
};

type Props = {
  password: string;
  confirmation: string;
  onPassword: (value: string) => void;
  onConfirmation: (value: string) => void;
  error?: string;
  disabled?: boolean;
  label?: string;
};

/** Choosing a password: typed twice, so a slip of the finger doesn't lock someone out. */
export const NewPasswordFields = ({
  password,
  confirmation,
  onPassword,
  onConfirmation,
  error,
  disabled,
  label = 'New password',
}: Props) => (
  <>
    <TextField
      label={label}
      name="new_password"
      type="password"
      autoComplete="new-password"
      hint={`At least ${MIN_LENGTH} characters. A short sentence is easy to remember.`}
      value={password}
      onChange={(event) => onPassword(event.target.value)}
      disabled={disabled}
    />
    <TextField
      label="Type it again"
      name="confirm_password"
      type="password"
      autoComplete="new-password"
      value={confirmation}
      onChange={(event) => onConfirmation(event.target.value)}
      error={error}
      disabled={disabled}
    />
  </>
);
