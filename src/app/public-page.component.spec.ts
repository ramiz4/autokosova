import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { APP_LANGUAGES } from '../shared/i18n';
import { footerCopy } from '../shared/footer-copy';
import { PUBLIC_PAGE_PATHS, isPublicPageId } from '../shared/public-pages';
import { App } from './app';
import { AnalyticsService } from './analytics.service';
import { routes } from './app.routes';
import { LanguageService, languageFromUrl, routePath } from './language.service';

describe('Provisional public pages and shared shell', () => {
  beforeEach(async () => {
    // No live session, contact or vehicle data is accessed by these rendering tests.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => new Response('', { status: 503 })),
    );
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        {
          provide: AnalyticsService,
          useValue: { consented: false, track: vi.fn(), setConsent: vi.fn() },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => vi.unstubAllGlobals());

  it.each(APP_LANGUAGES)('renders every real provisional route in %s', async (locale) => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    const language = TestBed.inject(LanguageService);
    const page = fixture.nativeElement as HTMLElement;
    const base = locale === 'de' ? '' : `/${locale}`;
    const meta = TestBed.inject(Meta);
    const title = TestBed.inject(Title);

    for (const [id, path] of Object.entries(PUBLIC_PAGE_PATHS)) {
      if (!isPublicPageId(id)) throw new Error('Invalid public page ID');
      await router.navigateByUrl(base + path);
      await fixture.whenStable();
      expect(router.url).toBe(base + path);
      expect(router.routerState.snapshot.root.firstChild?.data['publicPage']).toBe(id);
      expect(page.querySelector('main h1')?.textContent?.trim()).toBe(
        footerCopy[locale][`${id}Title`],
      );
      expect(page.querySelector('main')?.textContent).toContain(footerCopy[locale][`${id}Body`]);
      expect(page.querySelector('main')?.textContent).toContain(footerCopy[locale].provisional);
      if (['privacy', 'terms', 'imprint'].includes(id)) {
        expect(page.querySelector('main')?.textContent).toContain(footerCopy[locale].legalPending);
      }
      expect(page.querySelectorAll('footer')).toHaveLength(1);
      expect(page.querySelector('main footer')).toBeNull();
      expect(
        page.querySelector('main form, main a[href^="mailto:"], main a[href^="tel:"]'),
      ).toBeNull();
      expect(meta.getTag('name="robots"')?.content).toBe('noindex, follow');
      expect(title.getTitle()).toBe(`${footerCopy[locale][`${id}Title`]} | AutoKosova`);
      expect(document.documentElement.lang).toBe(locale);
      const trigger = page.querySelector<HTMLButtonElement>(
        'app-site-footer app-language-switcher button[brnOverlayTrigger]',
      )!;
      trigger.click();
      await fixture.whenRenderingDone();
      const links = [
        ...document.querySelectorAll<HTMLAnchorElement>('.cdk-overlay-container nav a'),
      ];
      expect(links.map((link) => link.getAttribute('href'))).toEqual(
        APP_LANGUAGES.map((target) => routePath(target, id)),
      );
      expect(
        links.find((link) => link.getAttribute('aria-current') === 'page')?.getAttribute('href'),
      ).toBe(routePath(locale, id));
      for (const target of APP_LANGUAGES) {
        expect(language.switchUrl(target)).toBe(routePath(target, id));
      }
      links[0].dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
      await fixture.whenStable();
      expect(document.querySelector('.cdk-overlay-container nav')).toBeNull();
    }

    // The default shell keeps one footer; provisional noindex must not leak to home.
    await router.navigateByUrl(base || '/');
    await fixture.whenStable();
    expect(page.querySelectorAll('footer')).toHaveLength(1);
    expect(meta.getTag('name="robots"')).toBeNull();
  });

  it.each(APP_LANGUAGES)('keeps one footer across layouts in %s', async (locale) => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    const page = fixture.nativeElement as HTMLElement;
    const base = locale === 'de' ? '' : `/${locale}`;
    for (const path of ['/help', '/garages/footer-test-missing', '/inquiry', '/garages', '/help']) {
      await router.navigateByUrl(base + path);
      await fixture.whenStable();
      expect(page.querySelectorAll('app-site-footer')).toHaveLength(1);
      expect(page.querySelectorAll('footer')).toHaveLength(1);
      expect(page.querySelector(`app-site-footer a[href="${base}/privacy"]`)).not.toBeNull();
    }
  });

  it('preserves fragments and query parameters on all information routes', async () => {
    const router = TestBed.inject(Router);
    const language = TestBed.inject(LanguageService);
    for (const path of Object.values(PUBLIC_PAGE_PATHS)) {
      await router.navigateByUrl(`/sq${path}?topic=general#public-page-title`);
      expect(language.switchUrl('en')).toBe(`/en${path}?topic=general#public-page-title`);
      expect(language.switchUrl('de')).toBe(`${path}?topic=general#public-page-title`);
    }
    expect(languageFromUrl('/sq#public-page-title')).toBe('sq');
    expect(languageFromUrl('/en?topic=general')).toBe('en');
  });
});
