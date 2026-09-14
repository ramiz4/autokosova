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
