/**
 * The token an emailed link carries in its fragment (`#token=…`). Browsers
 * never send the fragment to a server, so the token stays out of access logs.
 */
export const tokenFromHash = (hash: string): string | undefined => {
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('token')?.trim();

  return token && /^[\w-]{20,200}$/.test(token) ? token : undefined;
};

/**
 * Keeps a link's token for this tab only, so its screen survives a remount or
 * reload after the fragment is cleared. Storage can be unavailable (private
 * mode); the token in hand still works then.
 */
export const keepLinkToken = (key: string, token: string | undefined): void => {
  try {
    if (token) {
      sessionStorage.setItem(key, token);
    } else {
      sessionStorage.removeItem(key);
    }
  } catch {
    /* the token in hand is enough */
  }
};

export const keptLinkToken = (key: string): string | undefined => {
  try {
    return sessionStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
};
