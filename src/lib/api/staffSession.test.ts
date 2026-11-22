import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();

const sessionStorageStub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

const requests: { path: string; session?: string }[] = [];
vi.mock('@/data/deviceCredential', () => ({
  getDeviceCredential: () => ({ credential: 'device-credential' }),
}));

vi.mock('./client', () => ({
  ApiError: class extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
  staffRequest: vi.fn(async (path: string, _credential: string, session?: string) => {
    requests.push({ path, session });

    return path === '/staff/session'
      ? {
          token: 'server-token',
          staffId: 'staff:ada',
          expiresOn: new Date(Date.now() + 8 * 3600_000).toISOString(),
          idleMinutes: 30,
        }
      : undefined;
  }),
}));

const ada = { userId: 'staff:ada', deviceId: 'device:1' };

/** A page reload: the module starts again and finds only what this tab kept. */
const reload = async () => {
  vi.resetModules();

  return import('./staffSession');
};

describe('staff session lifecycle', () => {
  beforeEach(() => {
    store.clear();
    requests.length = 0;
    vi.stubGlobal('sessionStorage', sessionStorageStub);
    vi.stubGlobal('window', { dispatchEvent: () => true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('survives an ordinary reload of this tab without asking for the PIN again', async () => {
    const first = await reload();
    await first.openStaffSession(ada, '123456');
    expect(first.staffSessionToken(ada)).toBe('server-token');
    const second = await reload();
    expect(second.staffSessionToken(ada)).toBe('server-token');
  });

  it('is used only for the person and device it was opened for', async () => {
    const session = await reload();
    await session.openStaffSession(ada, '123456');
    expect(
      session.staffSessionToken({ userId: 'staff:bola', deviceId: 'device:1' }),
    ).toBeUndefined();

    expect(
      session.staffSessionToken({ userId: 'staff:ada', deviceId: 'device:2' }),
    ).toBeUndefined();
  });

  it('ends at sign-out, on the server and in this tab, and when the next person signs in', async () => {
    const session = await reload();
    await session.openStaffSession(ada, '123456');
    await session.endStaffSession();
    expect(requests[requests.length - 1]).toEqual({
      path: '/staff/session/end',
      session: 'server-token',
    });

    expect((await reload()).staffSessionToken(ada)).toBeUndefined();
    const again = await reload();
    await again.openStaffSession(ada, '123456');
    again.forgetStaffSession();
    expect((await reload()).staffSessionToken(ada)).toBeUndefined();
  });

  it('expires after its idle time even if the tab kept it', async () => {
    const session = await reload();
    await session.openStaffSession(ada, '123456');
    vi.useFakeTimers({ now: Date.now() + 31 * 60_000 });
    const later = await reload();
    expect(later.staffSessionToken(ada)).toBeUndefined();
    expect(store.size).toBe(0);
  });

  it('ignores anything in the tab that is not a session it wrote', async () => {
    store.set('geneus.staffSession', '{"token":5}');
    expect((await reload()).staffSessionToken(ada)).toBeUndefined();
    store.set('geneus.staffSession', 'not json');
    expect((await reload()).staffSessionToken(ada)).toBeUndefined();
  });
});
