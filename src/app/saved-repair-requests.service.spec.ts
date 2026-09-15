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

it('sends only a confirmed, CSRF-protected revisioned write, then applies the confirmed result without reloading', async () => {
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
  const callsBeforeConfirmation = vi.mocked(fetch).mock.calls.length;
  pending.resolve(response({ ...detail, active: false, revision: 2 }));
  expect(await task).toBe(true);
  await vi.waitFor(() => expect(service.state()).toBe('ready'));
  expect(service.requests()[0].active).toBe(false);
  expect(service.notice()).toBe('deactivated');
  expect(fetch).toHaveBeenCalledTimes(callsBeforeConfirmation);
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

it('preserves unrelated objects, loaded pages and open detail through activation in both directions', async () => {
  const { service, signIn } = setup();
  const unrelated = { ...page.requests[0], id: 'unrelated' };
  vi.mocked(fetch).mockResolvedValueOnce(
    response({ requests: [...page.requests, unrelated], nextCursor: unrelated.id }),
  );
  signIn('owner');
  await vi.waitFor(() => expect(service.state()).toBe('ready'));
  const untouched = service.requests()[1];
  vi.mocked(fetch).mockResolvedValueOnce(response(detail));
  await service.openDetail(detail.id);
  for (const [active, revision] of [
    [false, 2],
    [true, 3],
  ] as const) {
    const updated = { ...detail, active, revision };
    vi.mocked(fetch).mockResolvedValueOnce(response(updated));
    const calls = vi.mocked(fetch).mock.calls.length;
    expect(
      await service.mutate({ id: detail.id, revision: revision - 1 }, { kind: 'activity', active }),
    ).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(calls + 1);
    expect(service.requests()).toHaveLength(2);
    expect(service.requests()[1]).toBe(untouched);
    expect(service.requests()[0].active).toBe(active);
    expect(service.requests()[0].revision).toBe(revision);
    expect(service.requests()[0].vehicle).not.toHaveProperty('engineDetails');
    expect(service.requests()[0]).not.toHaveProperty('attachmentIds');
    expect(service.detail()).toEqual(updated);
    expect(service.detailState()).toBe('ready');
    expect(service.selectedId()).toBe(detail.id);
    expect(service.nextCursor()).toBe(unrelated.id);
    expect(service.state()).toBe('ready');
  }
});

it.each([true, false])(
  'deletes only the confirmed %s record, including the last entry and its detail',
  async (active) => {
    const { service, signIn } = setup();
    vi.mocked(fetch).mockResolvedValueOnce(
      response({ requests: [{ ...page.requests[0], active }], nextCursor: null }),
    );
    signIn('owner');
    await vi.waitFor(() => expect(service.state()).toBe('ready'));
    vi.mocked(fetch).mockResolvedValueOnce(response({ ...detail, active }));
    await service.openDetail(detail.id);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await service.mutate(detail, { kind: 'delete' })).toBe(true);
    expect(service.requests()).toEqual([]);
    expect(service.detail()).toBeNull();
    expect(service.selectedId()).toBeNull();
    expect(service.state()).toBe('ready');
    expect(service.nextCursor()).toBeNull();
    expect(service.notice()).toBe('deleted');
  },
);

it('repairs a deleted pagination anchor without dropping previously loaded rows or skipping older entries', async () => {
  const { service, signIn } = setup();
  const anchor = { ...page.requests[0], id: 'anchor' };
  vi.mocked(fetch).mockResolvedValueOnce(
    response({ requests: [...page.requests, anchor], nextCursor: anchor.id }),
  );
  signIn('owner');
  await vi.waitFor(() => expect(service.state()).toBe('ready'));
  const untouched = service.requests()[0];
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
  expect(await service.mutate(anchor, { kind: 'delete' })).toBe(true);
  expect(service.requests()[0]).toBe(untouched);
  expect(service.nextCursor()).toBe(detail.id);
  vi.mocked(fetch).mockResolvedValueOnce(
    response({ requests: [{ ...anchor, id: 'older' }], nextCursor: null }),
  );
  service.loadMore();
  await vi.waitFor(() => expect(service.state()).toBe('ready'));
  expect(fetch).toHaveBeenLastCalledWith(
    `/api/me/repair-requests?limit=20&cursor=${detail.id}`,
    expect.anything(),
  );
  expect(service.requests().map((item) => item.id)).toEqual([detail.id, 'older']);
});

it.each(['delete', 'activity'] as const)(
  'refills an emptied filtered page after %s while more rows exist',
  async (kind) => {
    const { service, signIn } = setup();
    signIn('owner');
    await vi.waitFor(() => expect(service.state()).toBe('ready'));
    vi.mocked(fetch).mockResolvedValueOnce(response({ ...page, nextCursor: detail.id }));
    service.filter('active');
    await vi.waitFor(() => expect(service.state()).toBe('ready'));
    vi.mocked(fetch).mockResolvedValueOnce(
      kind === 'delete'
        ? new Response(null, { status: 204 })
        : response({ ...detail, revision: 2, active: false }),
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      response({ requests: [{ ...page.requests[0], id: 'older' }], nextCursor: null }),
    );
    expect(
      await service.mutate(detail, kind === 'delete' ? { kind } : { kind, active: false }),
    ).toBe(true);
    await vi.waitFor(() => expect(service.state()).toBe('ready'));
    expect(service.requests().map((item) => item.id)).toEqual(['older']);
    expect(service.activity()).toBe('active');
    expect(service.notice()).toBe(kind === 'delete' ? 'deleted' : 'deactivated');
  },
);

it('blocks reload, retries, filters and new detail reads during a write rather than discarding its confirmation', async () => {
  const { service, signIn } = setup();
  signIn('owner');
  await vi.waitFor(() => expect(service.state()).toBe('ready'));
  const pending = deferred<Response>();
  vi.mocked(fetch).mockReturnValueOnce(pending.promise);
  const task = service.mutate(detail, { kind: 'activity', active: false });
  const calls = vi.mocked(fetch).mock.calls.length;
  const signal = vi.mocked(fetch).mock.calls.at(-1)![1]!.signal!;
  service.reload();
  service.retry();
  service.filter('inactive');
  service.loadMore();
  service.toggleDetail(detail.id);
  await service.openDetail(detail.id);
  expect(fetch).toHaveBeenCalledTimes(calls);
  expect(signal.aborted).toBe(false);
  expect(service.activity()).toBe('all');
  pending.resolve(response({ ...detail, revision: 2, active: false }));
  expect(await task).toBe(true);
  expect(service.notice()).toBe('deactivated');
});

it.each([true, false])(
  'discards an aborted pagination response after a write (success=%s), without endless loading',
  async (success) => {
    const { service, signIn } = setup();
    vi.mocked(fetch).mockResolvedValueOnce(response({ ...page, nextCursor: detail.id }));
    signIn('owner');
    await vi.waitFor(() => expect(service.state()).toBe('ready'));
    const late = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(late.promise);
    service.loadMore();
    expect(service.state()).toBe('loading');
    vi.mocked(fetch).mockResolvedValueOnce(
      success ? new Response(null, { status: 204 }) : response({}, 503),
    );
    if (success)
      vi.mocked(fetch).mockResolvedValueOnce(response({ requests: [], nextCursor: null }));
    expect(await service.mutate(detail, { kind: 'delete' })).toBe(success);
    await vi.waitFor(() => expect(service.state()).toBe('ready'));
    late.resolve(response({ requests: [{ ...page.requests[0], id: 'late' }], nextCursor: null }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(service.requests().map((item) => item.id)).toEqual(success ? [] : [detail.id]);
    expect(service.writeState()).toBe(success ? 'idle' : 'error');
  },
);

it('does not acknowledge an activity response with the wrong target state', async () => {
  const { service, signIn } = setup();
  signIn('owner');
  await vi.waitFor(() => expect(service.state()).toBe('ready'));
  vi.mocked(fetch).mockResolvedValueOnce(response({ ...detail, revision: 2, active: true }));
  expect(await service.mutate(detail, { kind: 'activity', active: false })).toBe(false);
  expect(service.requests()[0].active).toBe(true);
  expect(service.writeState()).toBe('error');
  expect(service.notice()).toBeNull();
});
