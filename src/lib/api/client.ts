/**
 * The only place the app talks to geneus-server. Errors are normalized here so
 * screens never have to interpret a status code, and so the handful of online
 * operations stay visible in one file (docs/ENGINEERING.md).
 */
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8080';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const OFFLINE_MESSAGE = 'Cannot reach the Geneus server — check the connection and try again';

const request = async <T>(path: string, init: RequestInit): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, init);
  } catch {
    throw new ApiError('offline', OFFLINE_MESSAGE);
  }

  const payload = await response.json().catch(() => undefined);
  if (!response.ok) {
    const detail = payload as { error?: string; message?: string } | undefined;
    throw new ApiError(
      detail?.error ?? 'request_failed',
      detail?.message ?? `The server rejected the request (${response.status})`,
      response.status,
    );
  }
  return payload as T;
};

export const get = <T>(path: string): Promise<T> => request<T>(path, { method: 'GET' });

export const post = <T>(path: string, body: unknown): Promise<T> =>
  request<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

/**
 * A call made as the enrolled device: the device credential rides as a Bearer
 * token. A 401 here means the device is no longer enrolled, whatever it holds.
 */
export const postAsDevice = <T>(path: string, credential: string, body?: unknown): Promise<T> =>
  request<T>(path, {
    method: 'POST',
    // A JSON content-type with no body is a 400 at the server, so the header
    // goes only with a body; the token call sends none.
    headers:
      body === undefined
        ? { authorization: `Bearer ${credential}` }
        : { 'content-type': 'application/json', authorization: `Bearer ${credential}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export const isUnauthorized = (cause: unknown): boolean => cause instanceof ApiError && cause.status === 401;
