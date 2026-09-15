import { TestBed } from '@angular/core/testing';
import type { OwnAccount } from '../shared/account';
import type { SavedRepairRequest } from '../shared/saved-repair-request';
import { AccountSessionService } from './account-session.service';
import { FavoritesService } from './favorites.service';
import { FavoriteProfilesService } from './favorite-profiles.service';
import { SavedRepairRequestsService } from './saved-repair-requests.service';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
};
const inquiry: SavedRepairRequest = {
  id: 'fictional-request',
  active: true,
  revision: 1,
  createdAt: '2026-09-14T12:00:00Z',
  updatedAt: '2026-09-14T12:00:00Z',
  serviceCategoryId: 'bremsen',
  areas: [],
  attachmentIds: [],
  symptom: 'FIKTIVER TESTFALL',
  earliestDropoffOn: '2026-10-02',
  latestPickupOn: '2026-10-06',
};
let payload: OwnAccount;
let favoriteIds: string[];
let accountReply: () => Response | Promise<Response>;
let listReply: () => Response | Promise<Response>;
let writeReply: () => Response | Promise<Response>;
let request: ReturnType<typeof vi.fn>;
let receiveFavorites: () => void;
beforeEach(() => {
  payload = {
    userId: 'fictional-owner',
    displayName: 'Fiktives Konto',
    roles: ['customer', 'moderator'],
    garageMemberships: [],
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  };
  favoriteIds = Array.from({ length: 13 }, (_, i) => `fictional-garage-${i}`);
  accountReply = () => json(payload);
  listReply = () => json({ garageIds: favoriteIds });
  writeReply = () => new Response(null, { status: 204 });
  class Channel {
    constructor(private readonly name: string) {}
    set onmessage(value: () => void) {
      if (this.name === 'autokosova-favorites') receiveFavorites = value;
    }
    postMessage() {}
    close() {}
  }
  vi.stubGlobal('BroadcastChannel', Channel);
  request = vi.fn(async (url: string, options?: RequestInit) => {
    if (url === '/api/me') return accountReply();
    if (url === '/auth/logout') return new Response(null, { status: 204 });
    if (url === '/api/me/favorites') return listReply();
    if (url.startsWith('/api/me/favorites/')) return writeReply();
    if (url.startsWith('/api/public/garages/')) {
      const id = url.split('/').at(-1)!;
      return json({ id, name: `Fiktive Werkstatt ${id}`, placeId: 'xk-peja' });
    }
    if (url.startsWith('/api/me/repair-requests?')) {
      const cursor = new URL(url, 'http://localhost').searchParams.has('cursor');
      return json({
        requests: [{ ...inquiry, id: cursor ? 'fictional-second' : inquiry.id }],
        nextCursor: cursor ? null : inquiry.id,
      });
    }
    if (url.startsWith('/api/me/repair-requests/'))
      return options?.method ? writeReply() : json(inquiry);
    throw new Error('Unexpected fixture request');
  });
  vi.stubGlobal('fetch', request);
  TestBed.configureTestingModule({
    providers: [SavedRepairRequestsService, FavoriteProfilesService],
  });
});
afterEach(() => {
  TestBed.resetTestingModule();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
async function setup() {
  const account = TestBed.inject(AccountSessionService);
  const favorites = TestBed.inject(FavoritesService);
  const profiles = TestBed.inject(FavoriteProfilesService);
  const saved = TestBed.inject(SavedRepairRequestsService);
  await account.refresh();
  TestBed.tick();
  await vi.waitFor(() => {
    TestBed.tick();
    expect(saved.state()).toBe('ready');
    expect(profiles.cards()).toHaveLength(12);
    expect(profiles.loading()).toBe(false);
  });
  return { account, favorites, profiles, saved };
}
const privateReads = () =>
  request.mock.calls.filter(([url, init]) => url !== '/api/me' && !init?.method).length;

it('preserves both lists, pagination and detail before AND after same-context revalidation', async () => {
  const { account, favorites, profiles, saved } = await setup();
  saved.filter('active');
  await vi.waitFor(() => expect(saved.state()).toBe('ready'));
  saved.loadMore();
  await vi.waitFor(() => expect(saved.requests()).toHaveLength(2));
  await saved.openDetail(inquiry.id);
  profiles.loadMore();
  await vi.waitFor(() => {
    TestBed.tick();
    expect(profiles.cards()).toHaveLength(13);
    expect(profiles.loading()).toBe(false);
  });
  const rows = saved.requests(),
    cards = profiles.cards(),
    ids = favorites.garageIds();
  const count = privateReads();
  for (let i = 0; i < 3; i++) {
    const pending = deferred<Response>();
    accountReply = () => pending.promise;
    const refresh = account.refresh();
    window.dispatchEvent(new Event('focus'));
    expect(account.refresh()).toBe(refresh);
    TestBed.tick();
    expect(saved.requests()).toBe(rows);
    expect(favorites.garageIds()).toBe(ids);
    payload = {
      ...payload,
      displayName: `Aktueller Name ${i}`,
      email: 'fixture@example.invalid',
      expiresAt: new Date(Date.now() + 7200_000).toISOString(),
      roles: [...payload.roles].reverse(),
    };
    pending.resolve(json(payload));
    await refresh;
    TestBed.tick();
    expect(account.displayName()).toBe(payload.displayName);
    expect(saved.requests()).toBe(rows);
    expect(saved.activity()).toBe('active');
    expect(saved.nextCursor()).toBeNull();
    expect(saved.detail()?.id).toBe(inquiry.id);
    expect(profiles.cards()).toEqual(cards);
    expect(profiles.limit()).toBe(24);
    expect(favorites.garageIds()).toBe(ids);
    expect(privateReads()).toBe(count);
  }
});

it('revalidates a favorites change from another tab without clearing existing cards or duplicating reads', async () => {
  const { favorites, profiles } = await setup();
  const cards = profiles.cards();
  const pending = deferred<Response>();
  listReply = () => pending.promise;
  const before = request.mock.calls.filter(([url]) => url === '/api/me/favorites').length;
  receiveFavorites();
  receiveFavorites();
  await vi.waitFor(() =>
    expect(request.mock.calls.filter(([url]) => url === '/api/me/favorites')).toHaveLength(
      before + 1,
    ),
  );
  TestBed.tick();
  expect(favorites.state()).toBe('ready');
  expect(profiles.cards()).toEqual(cards);
  pending.resolve(json({ garageIds: favoriteIds.slice(1) }));
  await vi.waitFor(() => {
    TestBed.tick();
    expect(favorites.garageIds().has(favoriteIds[0])).toBe(false);
    expect(profiles.cards()[0].id).toBe(favoriteIds[1]);
  });
});

it.each(['favorite', 'inquiry'] as const)(
  'does not cancel a pending %s write on a metadata refresh',
  async (kind) => {
    const { account, favorites, saved } = await setup();
    const pending = deferred<Response>();
    writeReply = () => pending.promise;
    const task =
      kind === 'favorite'
        ? favorites.remove(favoriteIds[0])
        : saved.mutate(inquiry, { kind: 'delete' });
    const signal = request.mock.calls.at(-1)![1]!.signal!;
    payload = { ...payload, displayName: 'Neuer Anzeigename' };
    await account.refresh();
    TestBed.tick();
    expect(signal.aborted).toBe(false);
    if (kind === 'favorite') expect(favorites.pending().has(favoriteIds[0])).toBe(true);
    else expect(saved.writeState()).toBe('saving');
    pending.resolve(new Response(null, { status: 204 }));
    expect(await task).toBe(true);
    if (kind === 'favorite') expect(favorites.garageIds().has(favoriteIds[0])).toBe(false);
    else expect(saved.notice()).toBe('deleted');
  },
);

it.each([
  'user',
  'roles',
  'purpose',
  'membership',
  'logout',
  '401',
  'network',
  'hidden',
  'pagehide',
])(
  'invalidates old private data and late writes on %s, including the same subject after invalidation',
  async (kind) => {
    const { account, favorites, saved } = await setup();
    const pending = deferred<Response>();
    writeReply = () => pending.promise;
    const write = favorites.remove(favoriteIds[0]);
    const list = deferred<Response>();
    listReply = () => list.promise;
    if (kind === 'user') payload = { ...payload, userId: 'fictional-other' };
    else if (kind === 'roles') payload = { ...payload, roles: ['customer'] };
    else if (kind === 'purpose') payload = { ...payload, accountType: 'garage' };
    else if (kind === 'membership')
      payload = { ...payload, garageMemberships: [{ garageId: 'new', role: 'editor' }] };
    else if (kind === '401') accountReply = () => json({ loginAvailable: true }, 401);
    else if (kind === 'network') accountReply = () => Promise.reject(new Error('offline'));
    if (kind === 'logout') await account.logout();
    else if (kind === 'hidden') {
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
    } else if (kind === 'pagehide') window.dispatchEvent(new Event('pagehide'));
    else await account.refresh();
    // Guards must work synchronously, before effect cleanup.
    expect(favorites.garageIds().size).toBe(0);
    expect(saved.requests()).toEqual([]);
    if (['logout', '401', 'network', 'hidden', 'pagehide'].includes(kind)) {
      accountReply = () => json(payload);
      await account.refresh();
      expect(favorites.garageIds().size).toBe(0);
    }
    pending.resolve(new Response(null, { status: 204 }));
    expect(await write).toBe(false);
    TestBed.tick();
    list.resolve(json({ garageIds: [] }));
    await vi.waitFor(() => expect(favorites.state()).toBe('ready'));
    expect(favorites.garageIds().size).toBe(0);
    expect(favorites.message()).not.toBe('removed');
  },
);

it('ignores membership display names and ordering, but not changed membership permissions', async () => {
  payload = {
    ...payload,
    garageMemberships: [
      { garageId: 'a', role: 'owner', garageName: 'Alter Name' },
      { garageId: 'b', role: 'editor' },
    ],
  };
  const { account, saved, favorites } = await setup();
  const rows = saved.requests();
  const ids = favorites.garageIds();
  const count = privateReads();
  payload = {
    ...payload,
    garageMemberships: [
      { garageId: 'b', role: 'editor' },
      { garageId: 'a', role: 'owner', garageName: 'Aktueller Name' },
    ],
  };
  await account.refresh();
  TestBed.tick();
  expect(saved.requests()).toBe(rows);
  expect(favorites.garageIds()).toBe(ids);
  expect(privateReads()).toBe(count);
  expect(account.identity()?.garageMemberships[1].garageName).toBe('Aktueller Name');
  payload = { ...payload, garageMemberships: [{ garageId: 'a', role: 'editor' }] };
  await account.refresh();
  expect(saved.requests()).toEqual([]);
  expect(favorites.garageIds().size).toBe(0);
});

it('rejects an old write even if earlier rights return before effect cleanup', async () => {
  const { account, favorites } = await setup();
  const pending = deferred<Response>();
  writeReply = () => pending.promise;
  const write = favorites.remove(favoriteIds[0]);
  const original = payload;
  payload = { ...payload, roles: ['customer'] };
  await account.refresh();
  payload = original;
  await account.refresh();
  pending.resolve(new Response(null, { status: 204 }));
  expect(await write).toBe(false);
  expect(favorites.garageIds().size).toBe(0);
});

it('does not let a slow favorite snapshot overwrite a confirmed removal', async () => {
  const { favorites } = await setup();
  const pending = deferred<Response>();
  const snapshot = [...favoriteIds];
  listReply = () => pending.promise;
  const reload = favorites.load();
  await vi.waitFor(() =>
    expect(request.mock.calls.filter(([url]) => url === '/api/me/favorites')).toHaveLength(2),
  );
  expect(await favorites.remove(favoriteIds[0])).toBe(true);
  favoriteIds = favoriteIds.slice(1);
  listReply = () => json({ garageIds: favoriteIds });
  pending.resolve(json({ garageIds: snapshot }));
  expect(await reload).toBe(true);
  expect([...favorites.garageIds()]).toEqual(favoriteIds);
  expect(request.mock.calls.filter(([url]) => url === '/api/me/favorites')).toHaveLength(3);
});

it('keeps an in-flight public profile response through same-context revalidation', async () => {
  const { account, profiles } = await setup();
  const pending = deferred<Response>();
  const original = request.getMockImplementation() as (
    url: string,
    options?: RequestInit,
  ) => Promise<Response>;
  request.mockImplementation((url: string, options?: RequestInit) =>
    url === '/api/public/garages/fictional-garage-0' ? pending.promise : original(url, options),
  );
  profiles.retry('fictional-garage-0');
  TestBed.tick();
  const signal = request.mock.calls.at(-1)![1]!.signal!;
  payload = { ...payload, expiresAt: new Date(Date.now() + 7200_000).toISOString() };
  await account.refresh();
  TestBed.tick();
  expect(signal.aborted).toBe(false);
  pending.resolve(
    json({ id: 'fictional-garage-0', name: 'Aktuelles fiktives Profil', placeId: 'xk-peja' }),
  );
  await vi.waitFor(() =>
    expect(profiles.cards()[0].garage?.name).toBe('Aktuelles fiktives Profil'),
  );
});
