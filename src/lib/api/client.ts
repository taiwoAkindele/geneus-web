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
    /** Structured detail some refusals carry, such as the devices that block an activation. */
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const OFFLINE_MESSAGE = 'Cannot reach the Geneus server — check the connection and try again';

/**
 * Reads a reply body as JSON. A body that is empty or not JSON (a proxy's HTML error
 * page, for example) reads as `undefined` on purpose: callers decide from the status
 * code, so an unreadable body is not itself the error to report.
 */
export const readJsonBody = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};

/** Binary documents use the same API origin/error boundary; bytes never enter JSON or logs. */
export const binaryRequest = async (path: string, init: RequestInit): Promise<Response> => {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, init);
  } catch (cause) {
    if (cause instanceof Error && cause.name === 'AbortError') {
      throw cause;
    }
    throw new ApiError('offline', OFFLINE_MESSAGE);
  }
  if (!response.ok) {
    const detail = (await readJsonBody(response)) as
      { error?: string; message?: string } | undefined;
    throw new ApiError(
      detail?.error ?? 'request_failed',
      detail?.message ?? `The document request was refused (${response.status})`,
      response.status,
    );
  }
  return response;
};

const request = async <T>(path: string, init: RequestInit): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, init);
  } catch {
    throw new ApiError('offline', OFFLINE_MESSAGE);
  }

  const payload = await readJsonBody(response);
  if (!response.ok) {
    const detail = payload as { error?: string; message?: string; details?: unknown } | undefined;
    throw new ApiError(
      detail?.error ?? 'request_failed',
      detail?.message ?? `The server rejected the request (${response.status})`,
      response.status,
      detail?.details,
    );
  }
  return payload as T;
};

/** Online-only private reads; tokens stay in the signed-in person's memory. */
export const workforceRequest = <T>(
  path: string,
  credential: string,
  token?: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
): Promise<T> =>
  request<T>(path, {
    method,
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${credential}`,
      ...(token ? { 'x-workforce-access': token } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** The full address of a server path, for a plain link the browser opens itself (e.g. a PDF download). */
export const apiUrl = (path: string): string => `${BASE_URL}${path}`;

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

export const isUnauthorized = (cause: unknown): boolean =>
  cause instanceof ApiError && cause.status === 401;

/** Who is acting: the person signed in on this enrolled device, and their server session when one is open. */
export const staffHeaders = (
  session: string | undefined,
  actor: string | undefined,
): Record<string, string> => ({
  'x-integrated-billing-version': '1',
  'x-billing-catalogue-version': '1',
  ...(session ? { 'x-staff-session': session } : {}),
  ...(actor ? { 'x-actor-staff-id': actor } : {}),
});
/** An online action by the signed-in person: the device credential plus who is acting. */
export const staffRequest = <T>(
  path: string,
  credential: string,
  session: string | undefined,
  body?: unknown,
  actor?: string,
): Promise<T> =>
  request<T>(path, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${credential}`,
      ...staffHeaders(session, actor),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  });
