import { TestBed } from '@angular/core/testing';
import { Meta } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { FavoritesComponent } from './favorites.component';
import { FavoritesService } from './favorites.service';
import { AccountSessionService } from './account-session.service';
import { LanguageService, routePath } from './language.service';
import { routes } from './app.routes';
import { favoritesCopy } from '../shared/favorites-copy';

const identity = {
  userId: 'favorite-owner',
  roles: ['customer'],
  garageMemberships: [],
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};
const garage = (id: string) => ({
  id,
  name: `Fiktive Werkstatt ${id} <b>Text</b>`,
  placeId: 'xk-peja',
  photoIds: [],
  serviceCategoryIds: ['bremsen'],
  verificationLabel: 'Unternehmensdaten geprüft',
});
let ids: string[],
  profileStatus: Record<string, number>,
  listStatus: number,
  removeStatus: number,
  guest: boolean;
let request: ReturnType<typeof vi.fn>;
beforeEach(() => {
  ids = ['one', 'two'];
  profileStatus = {};
  listStatus = 200;
  removeStatus = 204;
  guest = false;
  request = vi.fn(async (url: string, options?: RequestInit) => {
    if (url === '/api/me')
      return new Response(JSON.stringify(guest ? { loginAvailable: true } : identity), {
        status: guest ? 401 : 200,
      });
    if (url === '/api/me/favorites')
      return new Response(JSON.stringify({ garageIds: ids }), { status: listStatus });
    if (url.startsWith('/api/me/favorites/')) {
      if (removeStatus === 204)
        ids = ids.filter((id) => id !== decodeURIComponent(url.split('/').at(-1)!));
      expect(options?.method).toBe('DELETE');
      return new Response(removeStatus === 204 ? null : '{}', { status: removeStatus });
    }
    const id = decodeURIComponent(url.split('/').at(-1)!);
    return new Response(JSON.stringify(garage(id)), { status: profileStatus[id] ?? 200 });
  });
  vi.stubGlobal('fetch', request);
});
afterEach(() => vi.unstubAllGlobals());

const accountPanel = () => document.querySelector<HTMLElement>('[data-account-panel]');
async function render(locale: 'de' | 'sq' | 'en' = 'de') {
  await TestBed.configureTestingModule({
    imports: [FavoritesComponent],
    providers: [provideRouter(routes)],
  }).compileComponents();
  await TestBed.inject(Router).navigateByUrl(routePath(locale, 'favorites'));
  const fixture = TestBed.createComponent(FavoritesComponent);
  await fixture.whenStable();
  await vi.waitFor(() => expect(TestBed.inject(FavoritesService).state()).not.toBe('loading'));
  await fixture.whenStable();
  return { fixture, page: fixture.nativeElement as HTMLElement };
}
it.each(['de', 'sq', 'en'] as const)(
  'renders localized real profile fields, private navigation and metadata in %s',
  async (locale) => {
    const { fixture, page } = await render(locale);
    await vi.waitFor(() => expect(page.querySelectorAll('[data-favorite-profile]').length).toBe(2));
    expect(page.querySelector('h1')?.textContent?.trim()).toBe(favoritesCopy[locale].title);
    expect(page.querySelector('[data-favorite-card] b')).toBeNull();
    expect(page.querySelector('[data-favorite-profile]')?.getAttribute('href')).toBe(
      routePath(locale, 'garage', 'one'),
    );
    expect(page.querySelectorAll('[data-favorite-no-photo]')).toHaveLength(2);
    expect(page.querySelector('app-rating-stars')).toBeNull();
    expect(TestBed.inject(Meta).getTag("name='robots'")?.content).toBe('noindex, nofollow');
    const toggle = page.querySelector<HTMLButtonElement>('[data-account-trigger]')!;
    toggle.focus();
    toggle.click();
    await fixture.whenStable();
    await vi.waitFor(() =>
      expect(accountPanel()?.querySelector('[data-account-favorites]')).toBeTruthy(),
    );
    const overlayTrigger = page.querySelector<HTMLButtonElement>('button[brnOverlayTrigger]')!;
    const link = accountPanel()!.querySelector<HTMLAnchorElement>('[data-account-favorites]')!;
    expect(link.getAttribute('href')).toBe(routePath(locale, 'favorites'));
    expect(link.getAttribute('aria-current')).toBe('page');
    expect(link.classList.contains('bg-blue-50')).toBe(true);
    expect(page.querySelector('nav [data-account-favorites]')).toBeNull();
    overlayTrigger.focus();
    overlayTrigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(accountPanel()).toBeNull();
    expect(document.activeElement).toBe(overlayTrigger);
    expect(TestBed.inject(LanguageService).switchUrl('en')).toBe('/en/favorites');
  },
);
it('keeps failed removals and unavailable profiles, retries independently and shows the empty state only after DELETE', async () => {
  profileStatus = { one: 404, two: 503 };
  const { fixture, page } = await render();
  await vi.waitFor(() => expect(page.querySelectorAll('[data-favorite-remove]')).toHaveLength(2));
  expect(page.querySelector('[data-favorite-profile]')).toBeNull();
  expect(page.textContent).not.toContain('Fiktive Werkstatt');
  profileStatus['two'] = 200;
  page.querySelector<HTMLButtonElement>('[data-favorite-profile-retry]')!.click();
  await fixture.whenStable();
  await vi.waitFor(() => expect(page.querySelectorAll('[data-favorite-profile]')).toHaveLength(1));
  removeStatus = 503;
  page.querySelector<HTMLButtonElement>('[data-favorite-remove]')!.click();
  await fixture.whenStable();
  await vi.waitFor(() => expect(page.querySelector('[data-favorite-remove-error]')).toBeTruthy());
  expect(page.querySelectorAll('[data-favorite-card]')).toHaveLength(2);
  removeStatus = 204;
  page.querySelector<HTMLButtonElement>('[data-favorite-remove]')!.click();
  await fixture.whenStable();
  await vi.waitFor(() => expect(page.querySelectorAll('[data-favorite-card]')).toHaveLength(1));
  page.querySelector<HTMLButtonElement>('[data-favorite-remove]')!.click();
  await fixture.whenStable();
  await vi.waitFor(() => expect(page.querySelector('[data-favorites-empty]')).toBeTruthy());
  expect(TestBed.inject(FavoritesService).garageIds().size).toBe(0);
});
it('loads at most a page and retries a list error without losing account isolation', async () => {
  listStatus = 503;
  const { fixture, page } = await render();
  expect(page.querySelector('[data-favorites-retry]')).toBeTruthy();
  listStatus = 200;
  ids = Array.from({ length: 25 }, (_, i) => 'garage-' + i);
  page.querySelector<HTMLButtonElement>('[data-favorites-retry]')!.click();
  await fixture.whenStable();
  await vi.waitFor(() => expect(page.querySelectorAll('[data-favorite-profile]')).toHaveLength(12));
  expect(
    request.mock.calls.filter(([url]) => String(url).startsWith('/api/public/garages/')),
  ).toHaveLength(12);
  page.querySelector<HTMLButtonElement>('[data-favorites-more]')!.click();
  await fixture.whenStable();
  await vi.waitFor(() => expect(page.querySelectorAll('[data-favorite-profile]')).toHaveLength(24));
  TestBed.inject(AccountSessionService).invalidate();
  await fixture.whenStable();
  expect(page.querySelector('[data-favorite-card]')).toBeNull();
  expect(page.querySelector('[data-favorites-login]')?.getAttribute('href')).toBe(
    '/auth/login?returnTo=%2Ffavorites',
  );
});
it('never asks guests for private favorites and uses the localized login return', async () => {
  guest = true;
  const { page } = await render('sq');
  expect(request.mock.calls.some(([url]) => url === '/api/me/favorites')).toBe(false);
  expect(page.querySelector('[data-favorites-login]')?.getAttribute('href')).toBe(
    '/auth/login?returnTo=%2Fsq%2Ffavorites',
  );
  expect(page.querySelector('[data-favorite-card]')).toBeNull();
  expect(Object.keys(favoritesCopy.sq)).toEqual(Object.keys(favoritesCopy.de));
  expect(Object.keys(favoritesCopy.en)).toEqual(Object.keys(favoritesCopy.de));
});
