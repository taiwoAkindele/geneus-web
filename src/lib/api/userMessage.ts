import { ApiError } from './client';

/**
 * Turns any error into a short sentence a member of staff can act on.
 *
 * Server and browser messages are shown only when they read as plain guidance.
 * Anything that looks like system detail (setting names, code, addresses, database
 * or network internals, stack traces) is replaced by the caller's fallback, so an
 * error never reveals how the system is built. Server faults (5xx) never pass through.
 */
const BY_CODE: Record<string, string> = {
  offline: "You're offline. Check the connection and try again.",
  staff_session_required: 'Confirm your PIN to continue.',
  forbidden: "Your account can't do this. Ask an administrator if you need access.",
  attribution_mismatch: 'Your sign-in changed. Sign in again, then try again.',
  not_configured: 'This needs server setup first. Ask your system administrator.',
  invalid_signature: 'The request could not be verified.',
  // Staff passwords: fixed wording, because a server message that mentions a password is never shown.
  wrong_password: 'That email or password is not right.',
  locked: 'Too many wrong attempts. Try again in a few minutes.',
  not_at_facility: "You're not set up at this facility. Ask its administrator to add you.",
  invalid_code: 'That code is not right, or has expired. Ask for a new one.',
  invalid_pin_grant: 'Your sign-in has expired. Sign in with your email and password again.',
  existing_account:
    'This email already has a Geneus password. Enter it, or use the code we email you.',
  no_existing_account: 'This email has no Geneus password yet. Choose one.',
  invalid_account_code: 'That email code is not right, or has expired.',
  invitation_email_mismatch:
    'Your password cannot be set from this invitation. Use "Forgot password" with the email your administrator has on file.',
  device_already_enrolled: 'This device is already set up. Sign in from its facility screen.',
  email_not_configured: "Geneus can't send email yet. Ask your system administrator.",
  no_email: 'Your account has no email yet. Ask your administrator to add one.',
};

const PROVIDER: Record<string, string> = {
  provider_refused:
    "The provider refused this operation. Check the account's access and settings with the provider.",
  provider_unavailable: 'The provider could not be reached. Try again in a moment.',
  provider_unexpected_reply:
    "The provider's reply wasn't in the expected form. Try again, or contact support.",
};

/** Signs of system detail that must never reach the screen. */
const INTERNAL = [
  /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/, // environment/setting names such as SOME_SECRET_KEY
  /https?:\/\/|www\.|\/\w+\/\w+/, // addresses and paths
  /\b(sql|postgres\w*|constraint|violates|duplicate key|syntax error|relation "|column ")|\bselect\b.+\bfrom\b|\binsert into\b|\bupdate\b.+\bset\b|\bdelete from\b/i,
  /\b(stack|trace|exception|undefined|null|NaN|TypeError|ReferenceError|SyntaxError|is not a function|cannot read propert)/i,
  /\b(ECONN\w*|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|socket|fetch failed|failed to fetch|network ?error|load failed)\b/i,
  /\.(ts|js|mjs|tsx)\b|\bat \w+ \(|[{}<>[\]`]|\\/,
  /\b(token|jwt|secret|password|credential|api key|private key)\b/i,
];

const causeText = (cause: unknown): string => {
  if (cause instanceof Error) {
    return cause.message;
  }

  return typeof cause === 'string' ? cause : '';
};

const safe = (message: string) =>
  message.trim().length > 0 &&
  message.length <= 200 &&
  !INTERNAL.some((pattern) => pattern.test(message));

const sentence = (message: string) => {
  const text = message.trim();

  return /[.!?]$/.test(text) ? text : `${text}.`;
};

export const userMessage = (cause: unknown, fallback: string): string => {
  if (cause instanceof ApiError) {
    if (BY_CODE[cause.code]) {
      return BY_CODE[cause.code];
    }

    if (cause.status === 401) {
      return 'This device needs to sign in again.';
    }

    // A payment provider's refusal: the server already made the message safe; it is filtered again here.
    // A refusal or "unavailable" carries the server's already-safe message (with the provider's reason); an unexpected reply uses fixed wording.
    if (PROVIDER[cause.code]) {
      return cause.code !== 'provider_unexpected_reply' && safe(cause.message)
        ? sentence(cause.message)
        : PROVIDER[cause.code];
    }

    if (cause.status !== undefined && cause.status >= 500) {
      return 'Something went wrong on the server. Try again in a moment.';
    }

    // A generic 400 says nothing useful; the caller knows what was being saved.
    if (cause.code === 'bad_request' || cause.code === 'invalid_request') {
      return sentence(fallback);
    }
  }

  const message = causeText(cause);

  return sentence(safe(message) ? message : fallback);
};
