import { signal } from '@angular/core';
import { AccountSessionService } from './account-session.service';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { SiteHeaderComponent } from './site-header.component';

beforeEach(() =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => new Response('{}', { status: 401 })),
  ),
);
afterEach(() => vi.unstubAllGlobals());

describe('Header account actions', () => {
  it.each(['', 'sq', 'en'])(
    'links login and registration directly to OIDC for /%s',
    async (locale) => {
      await TestBed.configureTestingModule({
        imports: [SiteHeaderComponent],
        providers: [provideRouter([{ path: locale, component: SiteHeaderComponent }])],
      }).compileComponents();
      await TestBed.inject(Router).navigateByUrl('/' + locale);
      const fixture = TestBed.createComponent(SiteHeaderComponent);
      await fixture.whenStable();
      // Wait for the browser-only session request, rather than asserting the loading shell.
      await vi.waitFor(() => expect(TestBed.inject(AccountSessionService).state()).toBe('guest'));
      await fixture.whenStable();
      const page = fixture.nativeElement as HTMLElement;
      const links = Array.from(page.querySelectorAll<HTMLAnchorElement>('a[href^="/auth/login"]'));
      expect(links).toHaveLength(4);
      const expectedLocale = locale || 'de';
      for (const [index, link] of links.entries()) {
        const url = new URL(link.href);
        expect(url.pathname).toBe('/auth/login');
        expect(url.searchParams.get('returnTo')).toBeNull();
        expect(url.searchParams.get('locale')).toBe(expectedLocale);
        expect(url.searchParams.get('prompt')).toBe(index % 2 ? 'create' : null);
      }
      expect(page.querySelector('[aria-live]')).toBeNull();
      expect(page.querySelector('nav [aria-disabled="true"]')).toBeNull();
      expect(page.querySelector('#account-menu')).toBeNull();
      const menuItems = (selector: string) =>
        Array.from(page.querySelectorAll<HTMLAnchorElement>(selector)).map((link) => ({
          text: link.textContent!.trim(),
          href: link.getAttribute('href'),
        }));
      const desktop = menuItems('#desktop-navigation a.nav-link');
      const mobile = menuItems('#mobile-navigation a.nav-link');
      expect(desktop).toHaveLength(3);
      expect(mobile).toEqual(desktop);
      expect(desktop.map((item) => item.href)).toEqual([
        locale ? `/${locale}/inquiry` : '/inquiry',
        locale ? `/${locale}/garages` : '/garages',
        locale ? `/${locale}/garages/new` : '/garages/new',
      ]);
    },
  );
});

describe('Active navigation', () => {
  it.each([
    ['request', '/inquiry'],
    ['search', '/garages'],
    ['garage', '/garages/new'],
  ])('marks %s consistently on desktop and mobile', async (active, href) => {
    await TestBed.configureTestingModule({
      imports: [SiteHeaderComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(SiteHeaderComponent);
    fixture.componentRef.setInput('compact', true);
    fixture.componentRef.setInput('active', active);
    await fixture.whenStable();
    const links = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>(
        'nav a.nav-link[aria-current="page"]',
      ),
    ];
    expect(links).toHaveLength(2);
    expect(links.every((link) => link.getAttribute('href') === href)).toBe(true);
  });
});

it('uses the same compact brand mark in every navigation context', async () => {
  await TestBed.configureTestingModule({
    imports: [SiteHeaderComponent],
    providers: [provideRouter([])],
  }).compileComponents();
  const fixture = TestBed.createComponent(SiteHeaderComponent);
  fixture.detectChanges();
  const page = fixture.nativeElement as HTMLElement;
  const logo = page.querySelector<HTMLImageElement>('img[alt="AutoKosova"]')!;
  expect(logo.className).toContain('h-7');
  expect(logo.className).toContain('sm:h-8');
  expect(logo.className).toContain('w-auto');
});

it('dismisses the floating menu with an outside pointer action', async () => {
  await TestBed.configureTestingModule({
    imports: [SiteHeaderComponent],
    providers: [provideRouter([])],
  }).compileComponents();
  const fixture = TestBed.createComponent(SiteHeaderComponent);
  await fixture.whenStable();
  const page = fixture.nativeElement as HTMLElement;
  const toggle = page.querySelector<HTMLButtonElement>(
    'button[aria-controls="mobile-navigation"]',
  )!;
  toggle.click();
  await fixture.whenStable();
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  toggle.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  await fixture.whenStable();
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  await fixture.whenStable();
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(page.querySelector<HTMLElement>('#mobile-navigation')!.hidden).toBe(true);
});

it('shows the account control without unavailable notifications or login buttons for an authenticated session', async () => {
  const account = {
    signedIn: signal(true),
    state: signal('ready'),
    identity: signal({ userId: 'fictitious-user', roles: ['customer'], garageMemberships: [] }),
    displayName: () => 'Fiktives Konto',
    loginAvailable: signal(true),
    busy: signal(false),
    refresh: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(true),
  };
  await TestBed.configureTestingModule({
    imports: [SiteHeaderComponent],
    providers: [provideRouter([]), { provide: AccountSessionService, useValue: account }],
  }).compileComponents();
  const fixture = TestBed.createComponent(SiteHeaderComponent);
  await fixture.whenStable();
  const page = fixture.nativeElement as HTMLElement;
  expect(page.querySelectorAll('a[href^="/auth/login"]')).toHaveLength(0);
  expect(page.textContent).not.toContain('Meine Anfragen');
  expect(page.textContent).not.toContain('Favoriten');
  const notification = page.querySelector<HTMLButtonElement>(
    'button[aria-controls="account-notifications"]',
  )!;
  const profile = page.querySelector<HTMLButtonElement>('button[aria-controls="account-menu"]')!;
  expect(notification).toBeNull();
  expect(profile).toBeTruthy();
  expect(page.textContent).not.toContain('Benachrichtigungen sind noch nicht verfügbar.');
  profile.click();
  await fixture.whenStable();
  expect(page.querySelector('#account-notifications')).toBeNull();
  const menu = page.querySelector('#account-menu')!;
  expect(menu.textContent).toContain('Abmelden');
  expect(menu.textContent).toContain('Meine Anfragen');
  expect(menu.textContent).toContain('Favoriten');
  const inquiries = menu.querySelector<HTMLAnchorElement>('a[data-account-inquiries]')!;
  expect(inquiries.getAttribute('href')).toBe('/inquiries');
  expect(inquiries.hasAttribute('disabled')).toBe(false);
  expect(inquiries.getAttribute('aria-current')).toBeNull();
  expect(menu.querySelectorAll('button:disabled')).toHaveLength(0);
  const favorites = menu.querySelector<HTMLAnchorElement>('[data-account-favorites]')!;
  expect(favorites.getAttribute('href')).toBe('/favorites');
  expect(favorites.hasAttribute('disabled')).toBe(false);
  expect(favorites.getAttribute('aria-current')).toBeNull();
  expect(
    Array.from(menu.querySelectorAll('a.nav-link')).map((link) => link.getAttribute('href')),
  ).toEqual(
    Array.from(page.querySelectorAll('#desktop-navigation a.nav-link')).map((link) =>
      link.getAttribute('href'),
    ),
  );
  for (const nav of page.querySelectorAll('nav')) {
    expect(nav.textContent).not.toContain('Meine Anfragen');
    expect(nav.textContent).not.toContain('Favoriten');
  }
  profile.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await fixture.whenStable();
  expect(page.querySelector('#account-menu')).toBeNull();
  expect(document.activeElement).toBe(profile);
  profile.click();
  await fixture.whenStable();
  account.signedIn.set(false);
  account.state.set('guest');
  account.identity.set(null!);
  await fixture.whenStable();
  expect(page.querySelector('#account-menu')).toBeNull();
  expect(page.textContent).not.toContain('Meine Anfragen');
  expect(page.textContent).not.toContain('Favoriten');
});

it('keeps a garage operator in the business menu even after deleting the last garage', async () => {
  const account = {
    signedIn: signal(true),
    state: signal('ready'),
    identity: signal({
      userId: 'fictitious-operator',
      accountType: 'garage',
      roles: ['customer'],
      garageMemberships: [],
    }),
    displayName: () => 'Fiktiver Werkstattbetreiber',
    loginAvailable: signal(true),
    busy: signal(false),
    refresh: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(true),
  };
  await TestBed.configureTestingModule({
    imports: [SiteHeaderComponent],
    providers: [provideRouter([]), { provide: AccountSessionService, useValue: account }],
  }).compileComponents();
  const fixture = TestBed.createComponent(SiteHeaderComponent);
  await fixture.whenStable();
  const page = fixture.nativeElement as HTMLElement;
  page.querySelector<HTMLButtonElement>('button[aria-controls="account-menu"]')!.click();
  await fixture.whenStable();
  const menu = page.querySelector('#account-menu')!;
  expect(menu.textContent).toContain('Werkstattbetreiber');
  expect(menu.querySelector('[data-account-garages]')?.getAttribute('href')).toBe('/garages/new');
  expect(menu.querySelector('[data-account-inquiries]')).toBeNull();
  expect(menu.querySelector('[data-account-favorites]')?.getAttribute('href')).toBe('/favorites');
});

it.each(['', 'sq', 'en'])(
  'keeps explicit login destinations for /%s ahead of general landing',
  async (locale) => {
    await TestBed.configureTestingModule({
      imports: [SiteHeaderComponent],
      providers: [provideRouter([{ path: locale, component: SiteHeaderComponent }])],
    }).compileComponents();
    await TestBed.inject(Router).navigateByUrl('/' + locale);
    const fixture = TestBed.createComponent(SiteHeaderComponent);
    const prefix = locale ? '/' + locale : '';
    for (const path of ['/inquiry', '/inquiries', '/favorites', '/profile', '/garages/new']) {
      fixture.componentRef.setInput('loginReturnTo', prefix + path);
      await fixture.whenStable();
      await vi.waitFor(() => expect(TestBed.inject(AccountSessionService).state()).toBe('guest'));
      await fixture.whenStable();
      const links = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>(
        'a[href^="/auth/login"]',
      );
      expect(links).toHaveLength(4);
      for (const link of links) {
        const url = new URL(link.href);
        expect(url.searchParams.get('returnTo')).toBe(prefix + path);
        expect(url.searchParams.has('locale')).toBe(false);
      }
    }
  },
);

it('keeps the real session and account menu intact throughout a delayed refresh', async () => {
  const identity = {
    userId: 'fictional-menu-user',
    displayName: 'Fiktives stabiles Konto',
    email: 'fixture@example.invalid',
    roles: ['customer'],
    garageMemberships: [],
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  };
  const request = vi.fn().mockImplementation(async () => new Response(JSON.stringify(identity)));
  vi.stubGlobal('fetch', request);
  await TestBed.configureTestingModule({
    imports: [SiteHeaderComponent],
    providers: [provideRouter([])],
  }).compileComponents();
  const fixture = TestBed.createComponent(SiteHeaderComponent);
  await fixture.whenStable();
  const session = TestBed.inject(AccountSessionService);
  await session.refresh();
  await fixture.whenStable();
  const page = fixture.nativeElement as HTMLElement;
  const header = page.querySelector('header')!;
  const button = page.querySelector<HTMLButtonElement>('button[aria-controls="account-menu"]')!;
  const name = button.querySelector('span.truncate');
  expect(name).not.toBeNull();
  const language = page.querySelector('app-language-switcher');
  const navigation = page.querySelector('#desktop-navigation');
  for (let repeat = 0; repeat < 2; repeat++) {
    let finish!: (value: Response) => void;
    request.mockImplementationOnce(() => new Promise<Response>((resolve) => (finish = resolve)));
    button.click();
    await fixture.whenStable();
    expect(session.signedIn()).toBe(true);
    expect(session.state()).toBe('ready');
    expect(header.classList.contains('is-authenticated')).toBe(true);
    expect(button.querySelector('span.truncate')).toBe(name);
    expect(button.textContent).toContain(identity.displayName);
    expect(page.querySelector('app-language-switcher')).toBe(language);
    expect(page.querySelector('#desktop-navigation')).toBe(navigation);
    const menu = page.querySelector('#account-menu')!;
    const menuName = menu.querySelector('[data-account-name]');
    const inquiries = menu.querySelector('[data-account-inquiries]');
    expect(menuName?.textContent).toContain(identity.displayName);
    expect(inquiries).not.toBeNull();
    expect(menu.querySelector('[role="status"]')).toBeNull();
    const refresh = session.refresh();
    finish(new Response(JSON.stringify(identity)));
    await refresh;
    await fixture.whenStable();
    expect(page.querySelector('#account-menu')).toBe(menu);
    expect(menu.querySelector('[data-account-name]')).toBe(menuName);
    expect(menu.querySelector('[data-account-inquiries]')).toBe(inquiries);
    expect(button.querySelector('span.truncate')).toBe(name);
    button.click();
    await fixture.whenStable();
    expect(page.querySelector('#account-menu')).toBeNull();
  }
});
