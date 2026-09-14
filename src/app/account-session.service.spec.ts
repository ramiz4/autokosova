import { TestBed } from '@angular/core/testing';
import { AccountSessionService } from './account-session.service';

afterEach(() => vi.unstubAllGlobals());
it('uses server session state and confirms logout before clearing it', async () => {
  const session = TestBed.inject(AccountSessionService);
  const request = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ authenticated: true })))
    .mockResolvedValueOnce(new Response(null, { status: 500 }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', request);
  await session.refresh();
  expect(session.signedIn()).toBe(true);
  expect(await session.logout()).toBe(false);
  expect(session.signedIn()).toBe(true);
  expect(await session.logout()).toBe(true);
  expect(session.signedIn()).toBe(false);
});

it('shares concurrent session reads and ignores a response invalidated by logout', async () => {
  let finish!: (response: Response) => void;
  const request = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal('fetch', request);
  const session = TestBed.inject(AccountSessionService);
  const header = session.refresh();
  const favorites = session.refresh();
  expect(request).toHaveBeenCalledTimes(1);
  session.invalidate();
  finish(new Response(JSON.stringify({ authenticated: true })));
  await Promise.all([header, favorites]);
  expect(session.signedIn()).toBe(false);
});
