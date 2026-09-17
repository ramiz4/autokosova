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

const accountPanel = () => document.querySelector<HTMLElement>('[data-account-panel]');
const accountStateHandler = (component: SiteHeaderComponent) =>
  component as unknown as { onAccountState(state: 'open' | 'closed'): void };
const navigationTrigger = (page: HTMLElement) =>
  page.querySelector<HTMLButtonElement>('button.mobile-menu-toggle[brnOverlayTrigger]')!;
const navigationPanel = (page: HTMLElement) => {
  const trigger = navigationTrigger(page);
  return document
    .getElementById(trigger.getAttribute('aria-controls') ?? '')
    ?.querySelector<HTMLElement>('nav');
};
async function openNavigation(fixture: { whenStable(): Promise<void> }, page: HTMLElement) {
  const trigger = navigationTrigger(page);
  if (!navigationPanel(page)) {
    trigger.click();
    await fixture.whenStable();
  }
  return navigationPanel(page)!;
}

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
      const mobile = await openNavigation(fixture, page);
      const links = [
        ...page.querySelectorAll<HTMLAnchorElement>('a[href^="/auth/login"]'),
        ...mobile.querySelectorAll<HTMLAnchorElement>('a[href^="/auth/login"]'),
      ];
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
      expect(accountPanel()).toBeNull();
      const menuItems = (container: ParentNode) =>
        Array.from(container.querySelectorAll<HTMLAnchorElement>('a.nav-link')).map((link) => ({
          text: link.textContent!.trim(),
          href: link.getAttribute('href'),
        }));
      const desktop = menuItems(page.querySelector('#desktop-navigation')!);
      const mobileItems = menuItems(mobile);
      expect(desktop).toHaveLength(3);
      expect(mobileItems).toEqual(desktop);
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
    const page = fixture.nativeElement as HTMLElement;
    const mobile = await openNavigation(fixture, page);
    const links = [
      ...page.querySelectorAll<HTMLAnchorElement>(
        '#desktop-navigation a.nav-link[aria-current="page"]',
      ),
      ...mobile.querySelectorAll<HTMLAnchorElement>('a.nav-link[aria-current="page"]'),
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
  const toggle = navigationTrigger(page);
  await openNavigation(fixture, page);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  toggle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  await fixture.whenStable();
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await fixture.whenStable();
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(navigationPanel(page)).toBeUndefined();
});

it('closes native navigation on its second activation', async () => {
  await TestBed.configureTestingModule({
    imports: [SiteHeaderComponent],
    providers: [provideRouter([])],
  }).compileComponents();
  const fixture = TestBed.createComponent(SiteHeaderComponent);
  await fixture.whenStable();
  const page = fixture.nativeElement as HTMLElement;
  const toggle = navigationTrigger(page);
  await openNavigation(fixture, page);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  toggle.click();
  await fixture.whenStable();
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(navigationPanel(page)).toBeUndefined();
});

it('keeps the native navigation open when a delayed account close arrives', async () => {
  const account = {
    signedIn: signal(true),
    state: signal('ready'),
    identity: signal({ userId: 'fictitious-user', roles: ['customer'], garageMemberships: [] }),
    displayName: () => 'Fiktives Konto',
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
  page.querySelector<HTMLButtonElement>('button[data-account-trigger]')!.click();
  await fixture.whenStable();
  expect(accountPanel()).not.toBeNull();

  await openNavigation(fixture, page);
  expect(navigationPanel(page)).toBeDefined();
  expect(accountPanel()).toBeNull();

  accountStateHandler(fixture.componentInstance).onAccountState('closed');
  await fixture.whenStable();
  expect(navigationPanel(page)).toBeDefined();
});

it('uses the nonmodal overlay contract for the labelled account panel', async () => {
  const account = {
    signedIn: signal(true),
    state: signal('ready'),
    identity: signal({ userId: 'fictitious-user', roles: ['customer'], garageMemberships: [] }),
    displayName: () => 'Fiktives Konto',
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
  const trigger = page.querySelector<HTMLButtonElement>('button[data-account-trigger]')!;
  trigger.focus();
  trigger.click();
  await fixture.whenStable();

  const overlayTrigger = page.querySelector<HTMLButtonElement>('button[data-account-trigger]')!;

  const panel = accountPanel()!;
  expect(overlayTrigger.getAttribute('aria-expanded')).toBe('true');
  expect(document.getElementById(overlayTrigger.getAttribute('aria-controls')!)).not.toBeNull();
  expect(panel.getAttribute('aria-label')).toBe('Mein Konto');
  expect(panel.getAttribute('role')).toBeNull();
  expect(panel.getAttribute('aria-modal')).toBeNull();
  expect(panel.className).toContain('w-[var(--header-width)]');
  expect(panel.className).toContain('sm:w-88');
  expect(panel.className).not.toContain('absolute');

  overlayTrigger.focus();
  overlayTrigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await fixture.whenStable();
  expect(accountPanel()).toBeNull();
  expect(document.activeElement).toBe(overlayTrigger);
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
  let profile = page.querySelector<HTMLButtonElement>('button[data-account-trigger]')!;
  expect(notification).toBeNull();
  expect(profile).toBeTruthy();
  expect(page.textContent).not.toContain('Benachrichtigungen sind noch nicht verfügbar.');
  profile.click();
  await fixture.whenStable();
  profile = page.querySelector<HTMLButtonElement>('button[data-account-trigger]')!;
  expect(page.querySelector('#account-notifications')).toBeNull();
  const menu = accountPanel()!;
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
  profile.focus();
  profile.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await fixture.whenStable();
  expect(accountPanel()).toBeNull();
  expect(document.activeElement).toBe(profile);
  profile.click();
  await fixture.whenStable();
  account.signedIn.set(false);
  account.state.set('guest');
  account.identity.set(null!);
  await fixture.whenStable();
  expect(accountPanel()).toBeNull();
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
  page.querySelector<HTMLButtonElement>('button[data-account-trigger]')!.click();
  await fixture.whenStable();
  const menu = accountPanel()!;
  expect(menu.textContent).toContain('Werkstattbetreiber');
  expect(menu.querySelector('[data-account-garages]')?.getAttribute('href')).toBe(
    '/garages/manage',
  );
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
      const page = fixture.nativeElement as HTMLElement;
      const mobile = await openNavigation(fixture, page);
      const links = [
        ...page.querySelectorAll<HTMLAnchorElement>('a[href^="/auth/login"]'),
        ...mobile.querySelectorAll<HTMLAnchorElement>('a[href^="/auth/login"]'),
      ];
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
  let button = page.querySelector<HTMLButtonElement>('button[data-account-trigger]')!;
  let name = button.querySelector('span.truncate');
  expect(name).not.toBeNull();
  const language = page.querySelector('app-language-switcher');
  const navigation = page.querySelector('#desktop-navigation');
  for (let repeat = 0; repeat < 2; repeat++) {
    let finish!: (value: Response) => void;
    request.mockImplementationOnce(() => new Promise<Response>((resolve) => (finish = resolve)));
    button.click();
    await fixture.whenStable();
    button = page.querySelector<HTMLButtonElement>('button[data-account-trigger]')!;
    name = button.querySelector('span.truncate');
    expect(session.signedIn()).toBe(true);
    expect(session.state()).toBe('ready');
    expect(header.classList.contains('is-authenticated')).toBe(true);
    expect(button.querySelector('span.truncate')).toBe(name);
    expect(button.textContent).toContain(identity.displayName);
    expect(page.querySelector('app-language-switcher')).toBe(language);
    expect(page.querySelector('#desktop-navigation')).toBe(navigation);
    const menu = accountPanel()!;
    const menuName = menu.querySelector('[data-account-name]');
    const inquiries = menu.querySelector('[data-account-inquiries]');
    expect(menuName?.textContent).toContain(identity.displayName);
    expect(inquiries).not.toBeNull();
    expect(menu.querySelector('[role="status"]')).toBeNull();
    const refresh = session.refresh();
    finish(new Response(JSON.stringify(identity)));
    await refresh;
    await fixture.whenStable();
    expect(accountPanel()).toBe(menu);
    expect(menu.querySelector('[data-account-name]')).toBe(menuName);
    expect(menu.querySelector('[data-account-inquiries]')).toBe(inquiries);
    expect(button.querySelector('span.truncate')).toBe(name);
    button.click();
    await fixture.whenStable();
    expect(accountPanel()).toBeNull();
  }
});
