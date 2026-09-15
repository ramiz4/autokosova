import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AccountSessionService } from './account-session.service';
import { SavedRepairRequestsService } from './saved-repair-requests.service';
import type { OwnAccount } from '../shared/account';
import type { RepairRequestPage, SavedRepairRequest } from '../shared/saved-repair-request';

const identity = (userId: string): OwnAccount => ({
  userId,
  roles: ['customer'],
  garageMemberships: [],
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
});
const detail: SavedRepairRequest = {
  active: true,
  revision: 1,
  updatedAt: '2026-09-14T12:00:00Z',
  id: 'fixture-request',
  serviceCategoryId: 'bremsen',
  createdAt: '2026-09-14T12:00:00Z',
  areas: [],
  attachmentIds: ['private-attachment'],
  earliestDropoffOn: '2026-10-02',
  latestPickupOn: '2026-10-06',
  symptom: 'PRIVATE-TEXT',
  vehicle: { makeId: 'skoda', engineDetails: 'PRIVATE-ENGINE' },
};
const page: RepairRequestPage = {
  requests: [
    {
      active: detail.active,
      revision: detail.revision,
      updatedAt: detail.updatedAt,
      id: detail.id,
      serviceCategoryId: 'bremsen',
      createdAt: detail.createdAt,
      areas: [],
      symptomPreview: detail.symptom,
    },
  ],
  nextCursor: null,
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

function setup(browser = true) {
  TestBed.configureTestingModule({
    providers: [
      SavedRepairRequestsService,
      { provide: PLATFORM_ID, useValue: browser ? 'browser' : 'server' },
    ],
  });
  const account = TestBed.inject(AccountSessionService);
  const service = TestBed.inject(SavedRepairRequestsService);
  const signIn = (id: string) => {
    account.identity.set(identity(id));
    account.state.set('ready');
    account.signedIn.set(true);
    TestBed.tick();
  };
  return { account, service, signIn };
}
beforeEach(() =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => response(page)),
  ),
);
afterEach(() => {
  TestBed.resetTestingModule();
  vi.unstubAllGlobals();
});

it('never fetches during SSR or as a guest; an empty signed-in account is not a local draft', async () => {
  const { account, service, signIn } = setup(false);
  signIn('owner');
  expect(fetch).not.toHaveBeenCalled();
  account.invalidate();
  TestBed.tick();
  expect(service.requests()).toEqual([]);
  TestBed.resetTestingModule();
  const browser = setup();
  browser.account.invalidate();
  TestBed.tick();
  expect(fetch).not.toHaveBeenCalled();
  vi.mocked(fetch).mockResolvedValue(response({ requests: [], nextCursor: null }));
  sessionStorage.setItem('autokosova.repair-request-draft.v1', 'UNSAVED-DRAFT');
  browser.signIn('owner');
  await vi.waitFor(() => expect(browser.service.state()).toBe('ready'));
  expect(browser.service.requests()).toEqual([]);
  expect(sessionStorage.getItem('autokosova.repair-request-draft.v1')).toBe('UNSAVED-DRAFT');
  sessionStorage.removeItem('autokosova.repair-request-draft.v1');
});

it('uses private credentialed requests, handles pagination and retries without duplicating rows', async () => {
  const { service, signIn } = setup();
  vi.mocked(fetch).mockResolvedValueOnce(response({ ...page, nextCursor: detail.id }));
  signIn('owner');
  await vi.waitFor(() => expect(service.state()).toBe('ready'));
  expect(fetch).toHaveBeenCalledWith(
    '/api/me/repair-requests?limit=20',
    expect.objectContaining({
      cache: 'no-store',
      credentials: 'same-origin',
      signal: expect.any(AbortSignal),
    }),
  );
  vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
  service.loadMore();
  await vi.waitFor(() => expect(service.state()).toBe('error'));
  expect(service.requests()).toHaveLength(1);
  vi.mocked(fetch).mockResolvedValueOnce(
    response({
      requests: [...page.requests, { ...page.requests[0], id: 'second' }],
      nextCursor: null,
    }),
  );
  service.retry();
  await vi.waitFor(() => expect(service.state()).toBe('ready'));
  expect(service.requests().map((item) => item.id)).toEqual([detail.id, 'second']);
  expect(fetch).toHaveBeenLastCalledWith(
    `/api/me/repair-requests?limit=20&cursor=${detail.id}`,
    expect.anything(),
  );
});

it('shows detail failure/missing/retry and aborts an old selection', async () => {
  const { service, signIn } = setup();
  signIn('owner');
  await vi.waitFor(() => expect(service.state()).toBe('ready'));
  vi.mocked(fetch).mockResolvedValueOnce(response({}, 404));
  await service.openDetail(detail.id);
  expect(service.detailState()).toBe('missing');
  vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
  await service.openDetail(detail.id);
  expect(service.detailState()).toBe('error');
  vi.mocked(fetch).mockResolvedValueOnce(response(detail));
  await service.openDetail(detail.id);
  expect(service.detail()).toEqual(detail);
  const late = deferred<Response>();
  vi.mocked(fetch).mockReturnValueOnce(late.promise);
  const old = service.openDetail(detail.id);
  const signal = vi.mocked(fetch).mock.calls.at(-1)![1]!.signal!;
  vi.mocked(fetch).mockResolvedValueOnce(response({ ...detail, id: 'second' }));
  await service.openDetail('second');
  expect(signal.aborted).toBe(true);
  late.resolve(response(detail));
  await old;
  expect(service.detail()?.id).toBe('second');
});

it('clears data on 401 and discards account-A responses even before the account effect has run', async () => {
  const { account, service, signIn } = setup();
  const late = deferred<Response>();
  vi.mocked(fetch).mockReturnValueOnce(late.promise);
  signIn('account-a');
  vi.mocked(fetch).mockResolvedValue(response({ requests: [], nextCursor: null }));
  account.identity.set(identity('account-b'));
  late.resolve(response(page));
  await Promise.resolve();
  await Promise.resolve();
  expect(service.requests()).toEqual([]);
  vi.mocked(fetch).mockResolvedValue(response({ requests: [], nextCursor: null }));
  TestBed.tick();
  await vi.waitFor(() => expect(service.state()).toBe('ready'));
  expect(service.requests()).toEqual([]);
  vi.mocked(fetch).mockResolvedValueOnce(response({}, 401));
  await service.openDetail(detail.id);
  expect(account.state()).toBe('guest');
  expect(service.requests()).toEqual([]);
  expect(service.detail()).toBeNull();
  expect(service.expired()).toBe(true);
});

it('rejects late JSON parsing after logout, clears already visible details immediately, and cleans up on destruction', async () => {
  const { account, service, signIn } = setup();
  signIn('owner');
  await vi.waitFor(() => expect(service.state()).toBe('ready'));
  vi.mocked(fetch).mockResolvedValueOnce(response(detail));
  await service.openDetail(detail.id);
  expect(service.detail()?.symptom).toBe('PRIVATE-TEXT');
  const json = deferred<unknown>();
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => json.promise,
  } as Response);
  const pending = service.openDetail(detail.id);
  await Promise.resolve();
  account.invalidate();
  expect(service.requests()).toEqual([]);
  expect(service.detail()).toBeNull();
  json.resolve(detail);
  await pending;
  expect(service.detail()).toBeNull();
  TestBed.tick();
  vi.mocked(fetch).mockResolvedValue(response(page));
  signIn('next-owner');
  await vi.waitFor(() => expect(service.state()).toBe('ready'));
  TestBed.resetTestingModule();
  expect(service.requests()).toEqual([]);
  expect(service.detail()).toBeNull();
});

it('distinguishes an unavailable cursor and rejects malformed payloads without displaying private objects', async () => {
  const { service, signIn } = setup();
  vi.mocked(fetch).mockResolvedValueOnce(response({ ...page, nextCursor: detail.id }));
  signIn('owner');
  await vi.waitFor(() => expect(service.state()).toBe('ready'));
  vi.mocked(fetch).mockResolvedValueOnce(response({}, 404));
  service.loadMore();
  await vi.waitFor(() => expect(service.cursorUnavailable()).toBe(true));
  vi.mocked(fetch).mockResolvedValueOnce(response({ requests: [], nextCursor: null }));
  service.retry();
  await vi.waitFor(() => expect(service.state()).toBe('ready'));
  expect(service.requests()).toEqual([]);
  vi.mocked(fetch).mockResolvedValueOnce(
    response({ requests: [{ private: 'unexpected' }], nextCursor: null }),
  );
  service.reload();
  await vi.waitFor(() => expect(service.state()).toBe('error'));
  expect(service.requests()).toEqual([]);
});

it('sends only a confirmed, CSRF-protected revisioned write, then reloads from the API', async () => {
  const { service, signIn } = setup();
  signIn('owner');
  await vi.waitFor(() => expect(service.state()).toBe('ready'));
  document.cookie = 'autokosova_csrf=fixture-csrf';
  const pending = deferred<Response>();
  vi.mocked(fetch).mockReturnValueOnce(pending.promise);
  const task = service.mutate(detail, { kind: 'activity', active: false });
  expect(service.writeState()).toBe('saving');
  expect(service.notice()).toBeNull();
  expect(service.requests()[0].active).toBe(true);
  expect(await service.mutate(detail, { kind: 'delete' })).toBe(false);
  expect(fetch).toHaveBeenLastCalledWith(
    `/api/me/repair-requests/${detail.id}`,
    expect.objectContaining({
      method: 'PATCH',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: expect.objectContaining({ 'x-csrf-token': 'fixture-csrf', 'if-match': '"1"' }),
      body: JSON.stringify({ active: false }),
    }),
  );
  vi.mocked(fetch).mockResolvedValueOnce(
    response({ requests: [{ ...page.requests[0], active: false, revision: 2 }], nextCursor: null }),
  );
  pending.resolve(response({ ...detail, active: false, revision: 2 }));
  expect(await task).toBe(true);
  await vi.waitFor(() => expect(service.state()).toBe('ready'));
  expect(service.requests()[0].active).toBe(false);
  expect(service.notice()).toBe('deactivated');
  document.cookie = 'autokosova_csrf=; max-age=0';
});

it.each([
  [409, 'conflict'],
  [404, 'missing'],
  [503, 'error'],
] as const)('retains data and never confirms a failed %s write', async (status, state) => {
  const { service, signIn } = setup();
  signIn('owner');
  await vi.waitFor(() => expect(service.state()).toBe('ready'));
  vi.mocked(fetch).mockResolvedValueOnce(response({}, status));
  expect(await service.mutate(detail, { kind: 'delete' })).toBe(false);
  expect(service.writeState()).toBe(state);
  expect(service.notice()).toBeNull();
  expect(service.requests()).toEqual(page.requests);
});

it('ignores late mutation JSON after logout even when abort does not stop the response', async () => {
  const { service, account, signIn } = setup();
  signIn('owner');
  await vi.waitFor(() => expect(service.state()).toBe('ready'));
  const body = deferred<unknown>();
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => body.promise,
  } as Response);
  const task = service.mutate(detail, { kind: 'activity', active: false });
  await Promise.resolve();
  account.invalidate();
  TestBed.tick();
  body.resolve({ ...detail, active: false, revision: 2 });
  expect(await task).toBe(false);
  expect(service.requests()).toEqual([]);
  expect(service.detail()).toBeNull();
  expect(service.notice()).toBeNull();
});

it('invalidates an expired mutation and sends activity filters to the API rather than filtering a partial page', async () => {
  const { service, account, signIn } = setup();
  signIn('owner');
  await vi.waitFor(() => expect(service.state()).toBe('ready'));
  service.filter('inactive');
  await vi.waitFor(() => expect(service.state()).toBe('ready'));
  expect(fetch).toHaveBeenLastCalledWith(
    '/api/me/repair-requests?limit=20&activity=inactive',
    expect.anything(),
  );
  vi.mocked(fetch).mockResolvedValueOnce(response({}, 401));
  expect(await service.mutate(detail, { kind: 'delete' })).toBe(false);
  expect(account.state()).toBe('guest');
  expect(service.requests()).toEqual([]);
});

it('rejects an invalid mutation result instead of falsely acknowledging a save', async () => {
  const { service, signIn } = setup();
  signIn('owner');
  await vi.waitFor(() => expect(service.state()).toBe('ready'));
  vi.mocked(fetch).mockResolvedValueOnce(response({ ...detail, id: 'wrong-id', revision: 2 }));
  expect(await service.mutate(detail, { kind: 'activity', active: false })).toBe(false);
  expect(service.notice()).toBeNull();
  expect(service.writeState()).toBe('error');
});

it.each([
  [{}, 'forbidden', 'forbidden'],
  [{ code: 'csrf_invalid' }, 'csrf', 'csrfError'],
  [null, 'forbidden', 'forbidden'],
] as const)(
  'distinguishes permission and CSRF failures without logging out or claiming success: %j',
  async (body, state, key) => {
    const { account, service, signIn } = setup();
    signIn('owner');
    await vi.waitFor(() => expect(service.state()).toBe('ready'));
    vi.mocked(fetch).mockResolvedValueOnce(response(body, 403));
    expect(await service.mutate(detail, { kind: 'delete' })).toBe(false);
    expect(service.writeState()).toBe(state);
    expect(service.writeErrorKey()).toBe(key);
    expect(service.notice()).toBeNull();
    expect(service.requests()).toEqual(page.requests);
    expect(account.state()).toBe('ready');
  },
);
