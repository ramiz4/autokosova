import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Meta } from '@angular/platform-browser';
import { AccountProfileComponent } from './account-profile.component';
import { AccountSessionService } from './account-session.service';
import { LanguageService, routePath } from './language.service';
import { accountCopy } from '../shared/account-copy';
import { accountName, type OwnAccount } from '../shared/account';
import { routes } from './app.routes';

const identity: OwnAccount = {
  userId: 'fixture-account',
  displayName: '<b>Fiktives Konto</b>',
  username: 'fixture-user',
  email: 'fixture@example.invalid',
  roles: ['customer', 'moderator', 'admin'],
  garageMemberships: [{ garageId: 'fixture-garage', garageName: 'Fiktive Garage', role: 'editor' }],
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};
beforeEach(() =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => new Response(JSON.stringify(identity))),
  ),
);
afterEach(() => vi.unstubAllGlobals());
async function render(path = '/profile') {
  await TestBed.configureTestingModule({
    imports: [AccountProfileComponent],
    providers: [provideRouter(routes)],
  }).compileComponents();
  await TestBed.inject(Router).navigateByUrl(path);
  const fixture = TestBed.createComponent(AccountProfileComponent);
  await fixture.whenStable();
  return { fixture, page: fixture.nativeElement as HTMLElement };
}

it.each(['de', 'sq', 'en'] as const)(
  'renders real account fields and all roles in %s, with safe localized navigation',
  async (locale) => {
    const path = routePath(locale, 'profile');
    const { fixture, page } = await render(path);
    expect(page.querySelector('h1')?.textContent).toContain(
      accountCopy[locale]['account.profileTitle'],
    );
    expect(page.querySelector('[data-account-id]')?.textContent).toContain(identity.userId);
    expect(page.querySelector('[data-account-display-name] b')).toBeNull();
    expect(page.querySelector('[data-account-display-name]')?.textContent).toContain(
      '<b>Fiktives Konto</b>',
    );
    for (const role of identity.roles) {
      expect(page.querySelector('[data-account-roles]')?.textContent).toContain(
        accountCopy[locale][`account.role.${role}`],
      );
    }
    expect(page.querySelector('[data-account-memberships]')?.textContent).toContain(
      'Fiktive Garage',
    );
    expect(page.querySelector('main input, main textarea, main select')).toBeNull();
    expect(TestBed.inject(Meta).getTag("name='robots'")?.content).toBe('noindex, nofollow');
    expect(page.querySelector('main app-language-switcher a[href="/en/profile"]')).toBeTruthy();
    const toggle = page.querySelector<HTMLButtonElement>('[aria-controls="account-menu"]')!;
    toggle.click();
    await fixture.whenStable();
    expect(page.querySelector('[data-account-name]')?.textContent).toContain(identity.displayName);
    expect(page.querySelector('[data-account-menu-roles]')?.children).toHaveLength(3);
    expect(page.querySelector('[data-account-profile]')?.getAttribute('href')).toBe(path);
    toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(page.querySelector('#account-menu')).toBeNull();
    expect(document.activeElement).toBe(toggle);
  },
);

it('provides an ID fallback, honest missing fields, no invented membership and complete translations', async () => {
  const minimal = {
    userId: identity.userId,
    roles: ['customer'],
    garageMemberships: [],
    expiresAt: identity.expiresAt,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => new Response(JSON.stringify(minimal))),
  );
  const { page } = await render();
  expect(page.textContent).toContain(accountCopy.de['account.missing']);
  expect(page.querySelector('[data-account-memberships]')?.textContent).toContain(
    accountCopy.de['account.noMemberships'],
  );
  expect(accountName(minimal as OwnAccount)).toBe(identity.userId);
  for (const locale of ['sq', 'en'] as const) {
    expect(Object.keys(accountCopy[locale]).sort()).toEqual(Object.keys(accountCopy.de).sort());
    expect(Object.values(accountCopy[locale]).every((text) => text.trim())).toBe(true);
  }
});

it('clears private UI on expiry, offers a local login return and distinguishes missing OIDC', async () => {
  const { fixture, page } = await render('/sq/profile');
  const account = TestBed.inject(AccountSessionService);
  account.invalidate();
  await fixture.whenStable();
  expect(page.querySelector('[data-account-id]')).toBeNull();
  expect(page.textContent).not.toContain(identity.email);
  expect(page.querySelector('main a[href^="/auth/login"]')?.getAttribute('href')).toBe(
    '/auth/login?returnTo=%2Fsq%2Fprofile',
  );
  account.loginAvailable.set(false);
  await fixture.whenStable();
  expect(page.querySelector('main a[href^="/auth/login"]')).toBeNull();
  expect(page.textContent).toContain(accountCopy.sq['account.loginUnavailable']);
});

it('retries a failed read without retaining the previous identity and logs out through the shared service', async () => {
  const { fixture, page } = await render();
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  await TestBed.inject(AccountSessionService).refresh();
  await fixture.whenStable();
  expect(page.querySelector('[role="alert"]')?.textContent).toContain(
    accountCopy.de['account.loadError'],
  );
  expect(page.textContent).not.toContain(identity.email);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => new Response(JSON.stringify(identity))),
  );
  page.querySelector<HTMLButtonElement>('main button')!.click();
  await fixture.whenStable();
  const logout = vi.spyOn(TestBed.inject(AccountSessionService), 'logout').mockResolvedValue(true);
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  page.querySelector<HTMLButtonElement>('[data-account-logout]')!.click();
  await fixture.whenStable();
  expect(logout).toHaveBeenCalledOnce();
  expect(navigate).toHaveBeenCalledWith('/');
});

it('retains /profile and optional navigation context during language changes', async () => {
  await render('/sq/profile?view=settings#account-settings-title');
  expect(TestBed.inject(LanguageService).switchUrl('en')).toBe(
    '/en/profile?view=settings#account-settings-title',
  );
});
