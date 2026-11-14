import type { InsuranceActivationRequest, InsuranceSetupStatus, OperatorFacility, OperatorSession } from '@shared';
import { ApiError } from './client';

/**
 * The Geneus operator console's calls. Operators are Geneus staff, not
 * hospital staff: no device enrollment, a code to their registered email, and
 * a 30-minute session kept in memory only — closing the tab signs them out.
 */
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8080';
let session: OperatorSession | undefined;
export const operatorSession = () => (session && Date.parse(session.expiresOn) > Date.now() ? session : undefined);
export const OPERATOR_SESSION_EVENT = 'geneus:operatorSession';
const changed = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(OPERATOR_SESSION_EVENT)); };

const post = async <T>(path: string, body: unknown = {}): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json', ...(session ? { 'x-operator-session': session.token } : {}) }, body: JSON.stringify(body) });
  } catch { throw new ApiError('offline', 'Cannot reach the Geneus server — check the connection and try again'); }
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => undefined) as { error?: string; message?: string; details?: unknown } | undefined;
  if (response.status === 401) { session = undefined; changed(); }
  if (!response.ok) throw new ApiError(payload?.error ?? 'request_failed', payload?.message ?? `The server refused the request (${response.status})`, response.status, payload?.details);
  return payload as T;
};

export const requestOperatorCode = (email: string) => post<{ sentTo: string }>('/operator/login/code', { email });
export const operatorSignIn = async (email: string, code: string) => { session = await post<OperatorSession>('/operator/login', { email, code }); changed(); return session; };
export const operatorSignOut = async () => { try { await post('/operator/logout'); } finally { session = undefined; changed(); } };

export const operatorFacilities = () => post<{ facilities: OperatorFacility[] }>('/operator/facilities');
export const operatorFacilityInsurance = (facilityId: string) => post<{ status: InsuranceSetupStatus; requests: InsuranceActivationRequest[] }>(`/operator/facilities/${encodeURIComponent(facilityId)}/insurance`);
export const decideActivationRequest = (requestId: string, decision: 'approve' | 'reject', note: string) =>
  post<{ status: InsuranceSetupStatus }>(`/operator/insurance/requests/${encodeURIComponent(requestId)}/decide`, { decision, note });
export const setFacilityInsuranceState = (facilityId: string, state: 'off' | 'setup', reason: string) =>
  post<{ status: InsuranceSetupStatus }>(`/operator/facilities/${encodeURIComponent(facilityId)}/insurance-state`, { state, reason });
export type PlatformOperator = { id: string; email: string; name: string; active: boolean; addedBy: string; addedOn: string };
export const listOperators = () => post<{ operators: PlatformOperator[] }>('/operator/operators');
export const addOperator = (email: string, name: string) => post<{ ok: true }>('/operator/operators/add', { email, name });
export const removeOperator = (id: string) => post<{ ok: true }>(`/operator/operators/${encodeURIComponent(id)}/remove`);
export type OperatorEvent = { action: string; facilityId?: string; subject?: string; metadata: Record<string, unknown>; at: string; email: string };
export const operatorEvents = () => post<{ events: OperatorEvent[] }>('/operator/events');
