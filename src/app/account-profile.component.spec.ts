import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Meta } from '@angular/platform-browser';
import { AccountProfileComponent } from './account-profile.component';
import { AccountSessionService } from './account-session.service';
import { LanguageService, routePath } from './language.service';
import { accountProfileCopy as accountCopy } from '../shared/account-profile-copy';
import { accountName, type OwnAccount } from '../shared/account';
import { routes } from './app.routes';

const identity: OwnAccount = {
  userId: 'fixture-account',
  displayName: '<b>Fiktives Konto</b>',
  username: 'fixture-user',
  email: 'fixture@example.invalid',
  accountType: 'garage',
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

const accountPanel = () => document.querySelector<HTMLElement>('[data-account-panel]');
const accountTrigger = (page: HTMLElement) =>
  page.querySelector<HTMLButtonElement>('[data-account-trigger]')!;

async function render(path = '/profile') {
  await TestBed.configureTestingModule({
    imports: [AccountProfileComponent],
    providers: [provideRouter(routes)],
  }).compileComponents();
  await TestBed.inject(Router).navigateByUrl(path);
  const fixture = TestBed.createComponent(AccountProfileComponent);
  await fixture.whenStable();
  await vi.waitFor(() => expect(TestBed.inject(AccountSessionService).state()).not.toBe('loading'));
  await fixture.whenStable();
  return { fixture, page: fixture.nativeElement as HTMLElement };
}

it.each(['de', 'sq', 'en'] as const)(
  'renders the account dashboard, roles and localized navigation in %s',
  async (locale) => {
    const path = routePath(locale, 'profile');
    const { fixture, page } = await render(path);
    expect(page.querySelector('h1')?.textContent).toContain(
      accountCopy[locale]['account.profileTitle'],
    );
    expect(page.querySelector('[data-account-summary]')).not.toBeNull();
    expect(page.querySelector('[data-account-details]')).not.toBeNull();
    expect(page.querySelector('[data-account-roles-card]')).not.toBeNull();
    expect(page.querySelector('[data-account-id]')?.textContent).toContain(identity.userId);
    expect(page.querySelector('[data-account-type]')?.textContent).toContain(
      accountCopy[locale]['account.type.garage'],
    );
    expect(page.querySelector('[data-account-display-name] b')).toBeNull();
    expect(page.querySelector('[data-account-display-name]')?.textContent).toContain(
      '<b>Fiktives Konto</b>',
    );
    for (const role of identity.roles) {
      expect(page.querySelector('[data-account-roles]')?.textContent).toContain(
        accountCopy[locale][`account.role.${role}` as const],
      );
    }
    expect(page.querySelector('[data-account-memberships]')?.textContent).toContain(
      'Fiktive Garage',
    );
    expect(page.querySelector('[data-copy-username]')).not.toBeNull();
    expect(page.querySelector('[data-copy-user-id]')).not.toBeNull();
    expect(page.querySelector('[data-account-garages]')?.getAttribute('href')).toBe(
      routePath(locale, 'onboarding'),
    );
    expect(page.querySelector('[data-account-inquiries]')).toBeNull();
    expect(page.querySelector('main input, main textarea, main select')).toBeNull();
    expect(TestBed.inject(Meta).getTag("name='robots'")?.content).toBe('noindex, nofollow');
    const languageLinks = page.querySelectorAll('main app-language-switcher a');
    expect(languageLinks).toHaveLength(3);
    expect(page.querySelector('main app-language-switcher a[href="/en/profile"]')).toBeTruthy();
    expect(page.querySelector('main [role="tab"]')).toBeNull();
    const toggle = accountTrigger(page);
    toggle.focus();
    toggle.click();
    await vi.waitFor(() => expect(TestBed.inject(AccountSessionService).state()).toBe('ready'));
    await fixture.whenStable();
    const panel = accountPanel()!;
    expect(panel.querySelector('[data-account-profile]')?.getAttribute('href')).toBe(path);
    const overlayTrigger = accountTrigger(page);
    overlayTrigger.focus();
    overlayTrigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(accountPanel()).toBeNull();
    expect(document.activeElement).toBe(overlayTrigger);
  },
);

it('shows honest customer fallbacks without inventing memberships or copy actions', async () => {
  const minimal: OwnAccount = {
    userId: identity.userId,
    accountType: 'customer',
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
  expect(page.querySelector('[data-account-memberships]')).toBeNull();
  expect(page.querySelector('[data-copy-username]')).toBeNull();
  expect(page.querySelector('[data-copy-user-id]')).not.toBeNull();
  expect(page.querySelector('[data-account-garages]')).toBeNull();
  expect(page.querySelector('[data-account-inquiries]')?.getAttribute('href')).toBe('/inquiries');
  expect(accountName(minimal)).toBe(identity.userId);
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

it('reports confirmed clipboard copies and keeps values selectable when copying fails', async () => {
  const { fixture, page } = await render();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  page.querySelector<HTMLButtonElement>('[data-copy-username]')!.click();
  await vi.waitFor(() => {
    expect(writeText).toHaveBeenCalledWith(identity.username);
    expect(page.querySelector('[data-copy-username-status]')?.textContent).toContain(
      accountCopy.de['account.copied'],
    );
  });
  writeText.mockRejectedValueOnce(new Error('denied'));
  page.querySelector<HTMLButtonElement>('[data-copy-user-id]')!.click();
  await vi.waitFor(() =>
    expect(page.querySelector('[data-copy-user-id-status]')?.textContent).toContain(
      accountCopy.de['account.copyError'],
    ),
  );
  await fixture.whenStable();
  expect(page.querySelector('[data-account-id]')?.classList.contains('select-text')).toBe(true);
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
  await vi.waitFor(() => expect(TestBed.inject(AccountSessionService).state()).toBe('ready'));
  await fixture.whenStable();
  const logout = vi.spyOn(TestBed.inject(AccountSessionService), 'logout').mockResolvedValue(true);
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  page.querySelector<HTMLButtonElement>('[data-account-logout]')!.click();
  await fixture.whenStable();
  expect(logout).toHaveBeenCalledOnce();
  expect(navigate).toHaveBeenCalledWith('/');
});

it('keeps the profile in place and shows an error when logout fails', async () => {
  const { fixture, page } = await render('/en/profile');
  vi.spyOn(TestBed.inject(AccountSessionService), 'logout').mockResolvedValue(false);
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  page.querySelector<HTMLButtonElement>('[data-account-logout]')!.click();
  await fixture.whenStable();
  expect(page.querySelector('[role="alert"]')?.textContent).toContain(
    TestBed.inject(LanguageService).t('account.logoutError'),
  );
  expect(navigate).not.toHaveBeenCalled();
});

it('retains /profile and optional navigation context during language changes', async () => {
  await render('/sq/profile?view=settings#account-settings-title');
  expect(TestBed.inject(LanguageService).switchUrl('en')).toBe(
    '/en/profile?view=settings#account-settings-title',
  );
});

it('does not race provider logout with client-side home navigation from either logout button', async () => {
  const { fixture, page } = await render('/sq/profile');
  const logout = vi
    .spyOn(TestBed.inject(AccountSessionService), 'logout')
    .mockResolvedValue('redirect');
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  page.querySelector<HTMLButtonElement>('[data-account-logout]')!.click();
  await fixture.whenStable();
  expect(logout).toHaveBeenCalledWith('sq');
  expect(navigate).not.toHaveBeenCalled();
  accountTrigger(page).click();
  await fixture.whenStable();
  accountPanel()!.querySelector<HTMLButtonElement>('button')!.click();
  await fixture.whenStable();
  expect(logout).toHaveBeenCalledTimes(2);
  expect(navigate).not.toHaveBeenCalled();
  expect(page.textContent).not.toContain(TestBed.inject(LanguageService).t('account.logoutError'));
});

it.each(['de', 'sq', 'en'] as const)(
  'distinguishes unavailable provider data from absent fields in %s',
  async (locale) => {
    const partial: OwnAccount = {
      ...identity,
      displayName: 'Verified name',
      email: undefined,
      username: undefined,
      profileStatus: 'unavailable',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => new Response(JSON.stringify(partial))),
    );
    const path = routePath(locale, 'profile');
    const { fixture, page } = await render(path);
    expect(page.querySelector('[data-account-profile-error]')?.textContent).toContain(
      accountCopy[locale]['account.profileError'],
    );
    expect(page.querySelector('[data-account-email]')?.textContent).toContain(
      accountCopy[locale]['account.profileUnavailable'],
    );
    expect(page.querySelector('[data-account-username]')?.textContent).toContain(
      accountCopy[locale]['account.profileUnavailable'],
    );
    expect(page.querySelector('[data-copy-username]')).toBeNull();
    expect(page.querySelector('[data-account-display-name-field]')?.textContent).toContain(
      'Verified name',
    );
    expect(page.textContent).not.toContain(accountCopy[locale]['account.missing']);
    expect(page.querySelector('[data-account-profile-error] a')?.getAttribute('href')).toBe(
      '/auth/login?returnTo=' + encodeURIComponent(path),
    );
    TestBed.inject(AccountSessionService).invalidate();
    await fixture.whenStable();
    expect(page.querySelector('[data-account-profile-error]')).toBeNull();
    expect(page.textContent).not.toContain('Verified name');
  },
);

it('shows a fallback only for the genuinely missing field after a successful lookup', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation(
        async () =>
          new Response(
            JSON.stringify({ ...identity, username: undefined, profileStatus: 'ready' }),
          ),
      ),
  );
  const { page } = await render();
  expect(page.querySelector('[data-account-username]')?.textContent).toContain(
    accountCopy.de['account.missing'],
  );
  expect(page.querySelector('[data-copy-username]')).toBeNull();
  expect(page.querySelector('[data-account-email]')?.textContent).toContain(identity.email);
  expect(page.querySelector('[data-account-display-name-field]')?.textContent).toContain(
    identity.displayName,
  );
  expect(page.querySelector('[data-account-profile-error]')).toBeNull();
});

it('drops copy feedback and old personal data when the account context changes', async () => {
  const { fixture, page } = await render();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  page.querySelector<HTMLButtonElement>('[data-copy-user-id]')!.click();
  await vi.waitFor(() => expect(page.querySelector('[data-copy-user-id-status]')).not.toBeNull());
  const nextIdentity: OwnAccount = {
    userId: 'second-account',
    displayName: 'Second synthetic account',
    email: 'second@example.invalid',
    accountType: 'customer',
    roles: ['customer'],
    garageMemberships: [],
    expiresAt: identity.expiresAt,
  };
  TestBed.inject(AccountSessionService).identity.set(nextIdentity);
  await fixture.whenStable();
  expect(page.textContent).toContain(nextIdentity.email);
  expect(page.textContent).not.toContain(identity.email);
  expect(page.querySelector('[data-copy-user-id-status]')).toBeNull();
});
