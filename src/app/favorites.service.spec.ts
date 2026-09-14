import { signal } from '@angular/core';
import { AccountSessionService } from './account-session.service';
import { TestBed } from '@angular/core/testing';
import { FavoritesService } from './favorites.service';

let signedIn: ReturnType<typeof signal<boolean>>;
beforeEach(() => {
  signedIn = signal(true);
  TestBed.configureTestingModule({
    providers: [
      FavoritesService,
      {
        provide: AccountSessionService,
        useValue: {
          signedIn,
          refresh: vi.fn(async () => {}),
          invalidate: () => signedIn.set(false),
        },
      },
    ],
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('updates the saved state only after a successful account write and can remove it', async () => {
  const service = TestBed.inject(FavoritesService);
  let finish!: (response: Response) => void;
  const request = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ garageIds: [] })))
    .mockImplementationOnce(() => new Promise<Response>((resolve) => (finish = resolve)))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', request);
  await service.load();
  const saving = service.toggle('demo-garage');
  expect(service.garageIds().has('demo-garage')).toBe(false);
  expect(service.pending().has('demo-garage')).toBe(true);
  await service.toggle('demo-garage');
  expect(request).toHaveBeenCalledTimes(2);
  finish(new Response(null, { status: 204 }));
  await saving;
  expect(service.garageIds().has('demo-garage')).toBe(true);
  expect(service.message()).toBe('saved');
  await service.toggle('demo-garage');
  expect(request.mock.calls[2][1].method).toBe('DELETE');
  expect(service.garageIds().has('demo-garage')).toBe(false);
});

it('does not claim a favorite on a failed write and asks guests to sign in', async () => {
  const service = TestBed.inject(FavoritesService);
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ garageIds: [] })))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(new Response('{}', { status: 401 })),
  );
  await service.load();
  await service.toggle('demo-garage');
  expect(service.garageIds().size).toBe(0);
  expect(service.message()).toBe('error');
  await service.toggle('demo-garage');
  expect(service.state()).toBe('guest');
  expect(service.message()).toBe('signIn');
});

it('does not request private favorites when the confirmed session is a guest', async () => {
  signedIn.set(false);
  const request = vi.fn();
  vi.stubGlobal('fetch', request);
  const service = TestBed.inject(FavoritesService);
  expect(await service.load()).toBe(false);
  await service.toggle('demo-garage');
  expect(request).not.toHaveBeenCalled();
  expect(service.state()).toBe('guest');
  expect(service.message()).toBe('signIn');
});

it('dismisses notifications automatically and gives each new message its full duration', async () => {
  vi.useFakeTimers();
  const service = TestBed.inject(FavoritesService);
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ garageIds: [] })))
      .mockResolvedValue(new Response(null, { status: 204 })),
  );
  await service.load();
  await service.toggle('demo-garage');
  await vi.advanceTimersByTimeAsync(4000);
  expect(service.message()).toBe('saved');
  await service.toggle('demo-garage');
  await vi.advanceTimersByTimeAsync(1000);
  expect(service.message()).toBe('removed');
  await vi.advanceTimersByTimeAsync(4000);
  expect(service.message()).toBeNull();
  signedIn.set(false);
  await service.load();
  await service.toggle('demo-garage');
  await vi.advanceTimersByTimeAsync(7999);
  expect(service.message()).toBe('signIn');
  await vi.advanceTimersByTimeAsync(1);
  expect(service.message()).toBeNull();
  await service.toggle('demo-garage');
  service.dismiss();
  expect(service.message()).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});
