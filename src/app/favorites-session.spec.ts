import { computed, signal, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FavoritesService } from './favorites.service';
import { FavoriteProfilesService } from './favorite-profiles.service';
import { AccountSessionService } from './account-session.service';
import type { OwnAccount } from '../shared/account';
const owner = (id: string): OwnAccount => ({
  userId: id,
  roles: ['customer'],
  garageMemberships: [],
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
});
function setup(platform = 'browser') {
  const identity = signal<OwnAccount | null>(owner('a'));
  const account = {
    identity,
    signedIn: computed(() => !!identity()),
    state: computed(() => (identity() ? 'ready' : 'guest')),
    busy: signal(false),
    refresh: vi.fn(async () => {}),
    invalidate: () => identity.set(null),
  };
  TestBed.configureTestingModule({
    providers: [
      FavoritesService,
      FavoriteProfilesService,
      { provide: AccountSessionService, useValue: account },
      { provide: PLATFORM_ID, useValue: platform },
    ],
  });
  return { identity, account, service: TestBed.inject(FavoritesService) };
}
afterEach(() => vi.unstubAllGlobals());
it('deduplicates loads and discards late JSON from an old identity even before effects run', async () => {
  const { identity, service } = setup();
  let finish!: (v: unknown) => void;
  const request = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: () => new Promise((resolve) => (finish = resolve)),
  }));
  vi.stubGlobal('fetch', request);
  const first = service.load(),
    second = service.load();
  expect(first).toBe(second);
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  identity.set(owner('b'));
  finish({ garageIds: ['private-a'] });
  await first;
  expect(service.garageIds().size).toBe(0);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ garageIds: ['own-b'] }))),
  );
  await service.load();
  expect([...service.garageIds()]).toEqual(['own-b']);
});
it.each([204, 503])(
  'never restores old IDs or errors after an in-flight removal and account switch (%i)',
  async (status) => {
    const { identity, service } = setup();
    let finish!: (v: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ garageIds: ['private-a'] })))
        .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve))),
    );
    await service.load();
    const removing = service.remove('private-a');
    await service.remove('private-a');
    expect(service.pending().has('private-a')).toBe(true);
    identity.set(owner('b'));
    expect(service.garageIds().size).toBe(0);
    expect(service.pending().size).toBe(0);
    finish(new Response(status === 204 ? null : '{}', { status }));
    await removing;
    expect(service.failedIds().size).toBe(0);
    expect(service.message()).toBeNull();
  },
);
it('does no private fetch during SSR', async () => {
  const { service } = setup('server');
  const request = vi.fn();
  vi.stubGlobal('fetch', request);
  await service.load();
  await service.toggle('id');
  TestBed.tick();
  expect(request).not.toHaveBeenCalled();
});
it('bounds profile concurrency and cancels queued profile reads on logout', async () => {
  const { identity, service } = setup();
  let active = 0,
    max = 0;
  const finishes: (() => void)[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/me/favorites')
        return new Response(
          JSON.stringify({ garageIds: Array.from({ length: 30 }, (_, i) => 'g' + i) }),
        );
      active++;
      max = Math.max(max, active);
      return new Promise((resolve) =>
        finishes.push(() => {
          active--;
          resolve(new Response('{}', { status: 404 }));
        }),
      );
    }),
  );
  await service.load();
  const profiles = TestBed.inject(FavoriteProfilesService);
  TestBed.tick();
  expect(finishes).toHaveLength(3);
  expect(max).toBe(3);
  expect(profiles.cards()).toHaveLength(12);
  identity.set(null);
  TestBed.tick();
  for (const finish of finishes) finish();
  await Promise.resolve();
  await Promise.resolve();
  expect(finishes).toHaveLength(3);
  expect(profiles.cards()).toHaveLength(0);
});
