import { TestBed } from '@angular/core/testing';
import { FavoritesService } from './favorites.service';

beforeEach(() => TestBed.configureTestingModule({ providers: [FavoritesService] }));
afterEach(() => vi.unstubAllGlobals());

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
