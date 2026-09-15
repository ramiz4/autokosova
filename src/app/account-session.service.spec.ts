import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AccountSessionService } from './account-session.service';
import type { OwnAccount } from '../shared/account';

const identity = (userId = 'fixture-a'): OwnAccount => ({
  userId,
  displayName: 'Fiktives Testkonto',
  roles: ['customer', 'moderator'],
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  garageMemberships: [],
});
const response = (userId = 'fixture-a') => new Response(JSON.stringify(identity(userId)));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('reads only its private account contract and clears identity even when logout fails', async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(response())
    .mockResolvedValueOnce(new Response(null, { status: 500 }))
    .mockResolvedValueOnce(response())
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', request);
  const session = TestBed.inject(AccountSessionService);
  await session.refresh();
  expect(session.state()).toBe('ready');
  expect(session.identity()?.roles).toEqual(['customer', 'moderator']);
  expect(request.mock.calls[0][0]).toBe('/api/me');
  expect(request.mock.calls[0][1]).toMatchObject({ cache: 'no-store', credentials: 'same-origin' });
  document.cookie = 'autokosova_csrf=fixture-csrf; path=/';
  expect(await session.logout()).toBe(false);
  expect(session.identity()).toBeNull();
  expect(session.state()).toBe('error');
  await session.refresh();
  expect(await session.logout()).toBe(true);
  expect(session.signedIn()).toBe(false);
  expect(session.state()).toBe('guest');
  expect(request.mock.calls[3][1]).toMatchObject({
    method: 'POST',
    headers: { 'x-csrf-token': 'fixture-csrf' },
  });
});

it('deduplicates reads and never lets a superseded response restore a previous account', async () => {
  let finish!: (value: Response) => void;
  const request = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce(response('fixture-b'));
  vi.stubGlobal('fetch', request);
  const session = TestBed.inject(AccountSessionService);
  const first = session.refresh();
  const concurrent = session.refresh();
  expect(request).toHaveBeenCalledTimes(1);
  session.invalidate();
  await session.refresh();
  finish(response('fixture-a'));
  await Promise.all([first, concurrent]);
  expect(session.identity()?.userId).toBe('fixture-b');
});

it('ignores reads overtaken by logout and does not refresh until logout finishes', async () => {
  let finish!: (value: Response) => void;
  let loggedOut!: (value: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            loggedOut = resolve;
          }),
      ),
  );
  const session = TestBed.inject(AccountSessionService);
  const read = session.refresh();
  const logout = session.logout();
  await session.refresh();
  finish(response());
  await read;
  expect(session.identity()).toBeNull();
  loggedOut(new Response(null, { status: 204 }));
  await logout;
  expect(session.state()).toBe('guest');
});

it('distinguishes guest, unavailable provider, network failure and invalid account payloads', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(new Response('{"loginAvailable":false}', { status: 401 }))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response('{"roles":["admin"]}')),
  );
  const session = TestBed.inject(AccountSessionService);
  await session.refresh();
  expect(session.state()).toBe('guest');
  expect(session.loginAvailable()).toBe(false);
  await session.refresh();
  expect(session.state()).toBe('error');
  await session.refresh();
  expect(session.state()).toBe('error');
  expect(session.identity()).toBeNull();
});

it('expires personal fields on time and clears a page entering browser history', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => response()),
  );
  const session = TestBed.inject(AccountSessionService);
  await session.refresh();
  await vi.advanceTimersByTimeAsync(3600_000);
  expect(session.state()).toBe('guest');
  expect(session.identity()).toBeNull();
  await session.refresh();
  window.dispatchEvent(new Event('pagehide'));
  expect(session.identity()).toBeNull();
  expect(session.state()).toBe('loading');
  window.dispatchEvent(new Event('focus'));
  await session.refresh();
  expect(session.state()).toBe('ready');
});

it('does not fetch or serialize an account in server rendering', async () => {
  TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }] });
  const request = vi.fn();
  vi.stubGlobal('fetch', request);
  const session = TestBed.inject(AccountSessionService);
  await session.refresh();
  expect(request).not.toHaveBeenCalled();
  expect(session.identity()).toBeNull();
  expect(await session.logout()).toBe(false);
});

it('uses a full browser navigation for the trusted logout handoff without an extra router/read race', async () => {
  const { AUTH_NAVIGATE } = await import('./account-session.service');
  const navigate = vi.fn();
  TestBed.configureTestingModule({ providers: [{ provide: AUTH_NAVIGATE, useValue: navigate }] });
  const request = vi
    .fn()
    .mockResolvedValueOnce(response())
    .mockResolvedValueOnce(new Response('{"redirectTo":"/auth/logout/provider"}'));
  vi.stubGlobal('fetch', request);
  const session = TestBed.inject(AccountSessionService);
  await session.refresh();
  expect(await session.logout('sq')).toBe('redirect');
  expect(navigate).toHaveBeenCalledExactlyOnceWith('/auth/logout/provider');
  expect(request.mock.calls[1][0]).toBe('/auth/logout?locale=sq');
  expect(request.mock.calls[1][1].headers.accept).toBe('application/json');
  expect(session.identity()).toBeNull();
  expect(session.busy()).toBe(true);
  await session.refresh();
  expect(request).toHaveBeenCalledTimes(2);
});

it('rejects attacker-controlled logout redirects and late JSON from a previous account', async () => {
  const { AUTH_NAVIGATE } = await import('./account-session.service');
  const navigate = vi.fn();
  TestBed.configureTestingModule({ providers: [{ provide: AUTH_NAVIGATE, useValue: navigate }] });
  const request = vi.fn().mockResolvedValue(new Response('{"redirectTo":"https://evil.invalid"}'));
  vi.stubGlobal('fetch', request);
  const session = TestBed.inject(AccountSessionService);
  expect(await session.logout()).toBe(false);
  expect(navigate).not.toHaveBeenCalled();
  expect(session.busy()).toBe(false);
  let finish!: (value: unknown) => void;
  request.mockResolvedValue({
    status: 200,
    ok: true,
    json: () => new Promise((resolve) => (finish = resolve)),
  });
  const task = session.logout();
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  session.invalidate();
  finish({ redirectTo: '/auth/logout/provider' });
  expect(await task).toBe(false);
  expect(navigate).not.toHaveBeenCalled();
  expect(session.identity()).toBeNull();
});

it('navigates to the explicit local-only logout notice without claiming provider logout', async () => {
  const { AUTH_NAVIGATE } = await import('./account-session.service');
  const navigate = vi.fn();
  TestBed.configureTestingModule({ providers: [{ provide: AUTH_NAVIGATE, useValue: navigate }] });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('{"redirectTo":"/auth/logged-out?locale=en"}')),
  );
  const session = TestBed.inject(AccountSessionService);
  expect(await session.logout('en')).toBe('redirect');
  expect(navigate).toHaveBeenCalledWith('/auth/logged-out?locale=en');
  expect(session.state()).toBe('guest');
});

it('clears a second tab immediately when it receives the logout invalidation', async () => {
  let receive!: () => void;
  class Channel {
    set onmessage(value: () => void) {
      receive = value;
    }
    close() {
      /* test channel has no resources */
    }
  }
  vi.stubGlobal('BroadcastChannel', Channel);
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(new Response('{}', { status: 401 })),
  );
  const session = TestBed.inject(AccountSessionService);
  await session.refresh();
  expect(session.signedIn()).toBe(true);
  receive();
  expect(session.identity()).toBeNull();
  expect(session.signedIn()).toBe(false);
  await session.refresh();
  expect(session.state()).toBe('guest');
});
