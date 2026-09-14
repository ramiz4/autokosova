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
