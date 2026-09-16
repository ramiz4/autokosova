import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { APP_LANGUAGES } from '../shared/i18n';
import { footerCopy } from '../shared/footer-copy';
import { AnalyticsService } from './analytics.service';
import { routes } from './app.routes';
import { LanguageService } from './language.service';
import { OFFICIAL_SOCIAL_LINKS, SiteFooterComponent } from './site-footer.component';

describe('Shared site footer', () => {
  let analytics: {
    consented: boolean;
    track: ReturnType<typeof vi.fn>;
    setConsent: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    analytics = { consented: false, track: vi.fn(), setConsent: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [SiteFooterComponent],
      providers: [provideRouter(routes), { provide: AnalyticsService, useValue: analytics }],
    }).compileComponents();
  });

  afterEach(() => vi.restoreAllMocks());

  async function render(url = '/') {
    await TestBed.inject(Router).navigateByUrl(url);
    const fixture = TestBed.createComponent(SiteFooterComponent);
    await fixture.whenStable();
    return { fixture, page: fixture.nativeElement as HTMLElement };
  }

  it.each(APP_LANGUAGES)('offers all twelve canonical destinations in %s', async (locale) => {
    const base = locale === 'de' ? '' : `/${locale}`;
    const { page } = await render(`${base}/help`);
    const main = page.querySelector(`nav[aria-label="${footerCopy[locale].navigation}"]`)!;
    const legal = page.querySelector(`nav[aria-label="${footerCopy[locale].legal}"]`)!;
    const links = [...main.querySelectorAll('a'), ...legal.querySelectorAll('a')];
    const paths = [
      '/garages',
      '/inquiry',
      '/help',
      '/garages/new',
      '/garages/partners',
      '/garages/benefits',
      '/about',
      '/careers',
      '/blog',
      '/privacy',
      '/terms',
      '/imprint',
    ];
    expect(main.querySelectorAll('h2')).toHaveLength(3);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      paths.map((path) => base + path),
    );
    const router = TestBed.inject(Router);
    for (const link of links) {
      const href = link.getAttribute('href')!;
      expect(link.textContent?.trim()).toBeTruthy();
      expect(link.hasAttribute('aria-disabled')).toBe(false);
      await router.navigateByUrl(href);
      expect(router.url).toBe(href);
    }
    expect(page.querySelector('a[href="#"], a:not([href])')).toBeNull();
    expect(page.querySelector('a[href^="mailto:"], a[href^="tel:"]')).toBeNull();
    expect(analytics.track).not.toHaveBeenCalled();
    expect(analytics.setConsent).not.toHaveBeenCalled();
  });

  it.each(APP_LANGUAGES)('does not invent optional social profiles in %s', async (locale) => {
    const { page } = await render(locale === 'de' ? '/' : `/${locale}`);
    expect(OFFICIAL_SOCIAL_LINKS).toEqual([]);
    expect(page.textContent).toContain(footerCopy[locale].noProfiles);
    expect(page.querySelector('a[target="_blank"], a[href^="https://"]')).toBeNull();
  });

  it('reuses the real logo and calculates the copyright year', async () => {
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2031);
    const { page } = await render();
    const logo = page.querySelector('img')!;
    expect(logo.getAttribute('src')).toBe('/branding/autokosova-logo-header.png');
    expect(logo.getAttribute('width')).toBe('640');
    expect(logo.getAttribute('height')).toBe('122');
    expect(logo.getAttribute('alt')).toBe('AutoKosova');
    expect(page.textContent).toContain('2031 AutoKosova');
    expect(page.textContent).not.toContain('2024');
  });

  it('preserves the page, query and fragment in the existing language switcher', async () => {
    const { fixture, page } = await render('/sq/help?topic=general#public-page-title');
    const switcher = page.querySelector('app-language-switcher')!;
    const trigger = switcher.querySelector<HTMLButtonElement>('button[brnOverlayTrigger]')!;
    expect(trigger.getAttribute('aria-label')).toBeTruthy();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-haspopup')).toBeNull();
    trigger.click();
    await fixture.whenRenderingDone();
    const panel = document.querySelector<HTMLElement>('.cdk-overlay-container nav')!;
    const links = [...panel.querySelectorAll('a')];
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/help?topic=general#public-page-title',
      '/sq/help?topic=general#public-page-title',
      '/en/help?topic=general#public-page-title',
    ]);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(panel.getAttribute('role')).toBeNull();
    expect(panel.querySelector('[aria-current="page"]')?.textContent).toContain('Shqip');
    links[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(document.querySelector('.cdk-overlay-container nav')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(TestBed.inject(LanguageService).switchUrl('en')).toBe(
      '/en/help?topic=general#public-page-title',
    );
  });

  it('retains mobile stacking, touch targets and visible focus styling', async () => {
    const { page } = await render('/sq/help');
    const navigation = page.querySelector(`nav[aria-label="${footerCopy.sq.navigation}"]`)!;
    expect(navigation.classList.contains('grid-cols-2')).toBe(true);
    expect(navigation.classList.contains('sm:grid-cols-3')).toBe(true);
    for (const control of page.querySelectorAll('a, button, summary')) {
      expect(control.classList.contains('min-h-11')).toBe(true);
      expect(control.className).toContain('focus-visible:outline');
    }
  });

  it('keeps all DE/SQ/EN content complete and nonempty', () => {
    for (const locale of APP_LANGUAGES) {
      expect(Object.keys(footerCopy[locale]).sort()).toEqual(Object.keys(footerCopy.de).sort());
      expect(Object.values(footerCopy[locale]).every((value) => value.trim().length > 0)).toBe(
        true,
      );
    }
  });
});
