import { signal } from '@angular/core';
import { AccountSessionService } from './account-session.service';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { SiteHeaderComponent } from './site-header.component';

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
      const page = fixture.nativeElement as HTMLElement;
      const links = Array.from(page.querySelectorAll<HTMLAnchorElement>('a[href^="/auth/login"]'));
      expect(links).toHaveLength(4);
      const returnTo = locale ? '/' + locale + '/inquiry' : '/inquiry';
      for (const [index, link] of links.entries()) {
        const url = new URL(link.href);
        expect(url.pathname).toBe('/auth/login');
        expect(url.searchParams.get('returnTo')).toBe(returnTo);
        expect(url.searchParams.get('prompt')).toBe(index % 2 ? 'create' : null);
      }
      expect(page.querySelector('[aria-live]')).toBeNull();
      expect(page.querySelector('nav [aria-disabled="true"]')).toBeNull();
      expect(page.querySelector('#account-menu')).toBeNull();
    },
  );
});

describe('Active navigation', () => {
  it.each([
    ['request', '/inquiry'],
    ['search', '/garages'],
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

it('shows notification and account controls instead of login buttons for an authenticated session', async () => {
  const account = {
    signedIn: signal(true),
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
  expect(notification).toBeTruthy();
  expect(profile).toBeTruthy();
  notification.click();
  await fixture.whenStable();
  expect(page.textContent).toContain('Benachrichtigungen sind noch nicht verfügbar.');
  profile.click();
  await fixture.whenStable();
  expect(page.querySelector('#account-notifications')).toBeNull();
  const menu = page.querySelector('#account-menu')!;
  expect(menu.textContent).toContain('Abmelden');
  expect(menu.textContent).toContain('Meine Anfragen');
  expect(menu.textContent).toContain('Favoriten');
  expect(menu.querySelectorAll('button:disabled')).toHaveLength(2);
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
  await fixture.whenStable();
  expect(page.querySelector('#account-menu')).toBeNull();
  expect(page.textContent).not.toContain('Meine Anfragen');
  expect(page.textContent).not.toContain('Favoriten');
});
