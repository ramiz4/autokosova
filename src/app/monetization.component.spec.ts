import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { monetizationCopy } from '../shared/monetization-copy';
import { AccountSessionService } from './account-session.service';
import { AnalyticsService } from './analytics.service';
import { App } from './app';
import { routes } from './app.routes';
import { LanguageService, languageFromUrl, routePath } from './language.service';
import { MonetizationComponent } from './monetization.component';

const languages = ['de', 'sq', 'en'] as const;

describe('Costs and fairness page', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MonetizationComponent, App],
      providers: [
        provideRouter(routes),
        {
          provide: AccountSessionService,
          useValue: {
            signedIn: signal(false),
            state: signal('guest'),
            identity: signal(null),
            loginAvailable: signal(true),
            displayName: () => '',
            busy: signal(false),
            refresh: vi.fn().mockResolvedValue(undefined),
            logout: vi.fn().mockResolvedValue(true),
          },
        },
        {
          provide: AnalyticsService,
          useValue: { consented: false, setConsent: vi.fn(), track: vi.fn() },
        },
      ],
    }).compileComponents();
  });

  async function render(language: (typeof languages)[number] = 'de') {
    await TestBed.inject(Router).navigateByUrl(routePath(language, 'monetization'));
    const fixture = TestBed.createComponent(MonetizationComponent);
    await fixture.whenStable();
    return { fixture, page: fixture.nativeElement as HTMLElement };
  }

  it.each(languages)(
    'explains the current free phase without future offers in %s',
    async (locale) => {
      const { page } = await render(locale);
      const copy = monetizationCopy[locale];
      expect(page.querySelector('h1')?.textContent?.trim()).toBe(copy.title);
      expect(Object.keys(copy.cards)).toEqual(['drivers', 'profiles']);
      expect(page.querySelectorAll('article[data-card]')).toHaveLength(2);
      for (const id of ['drivers', 'profiles'] as const) {
        const card = page.querySelector(`[data-card="${id}"]`)!;
        expect(card.querySelector('h2')?.textContent?.trim()).toBe(copy.cards[id].title);
        expect(card.querySelectorAll('li')).toHaveLength(copy.cards[id].points.length);
      }
      expect(page.querySelector('[data-phase-label]')?.textContent).toContain(copy.currentLabel);
      for (const text of [copy.pilotNotice, copy.feesNotice, copy.principlesBody]) {
        expect(page.textContent).toContain(text);
      }
      expect(page.querySelector('header img')?.getAttribute('src')).toBe(
        '/branding/autokosova-logo-header.png',
      );
      expect(page.querySelector('app-site-footer')).toBeNull();
      expect(page.querySelector('picture img')?.getAttribute('alt')).toBe('');
      expect(page.querySelector('[data-card="tools"], [data-card="partners"]')).toBeNull();
      expect(page.querySelector('main')?.textContent).not.toMatch(
        /Pro-Abo|Pro-Werkzeuge|Kooperationen|Zukunftsidee|future idea|partner[sz]?hips|(?:29|49)\s*(?:EUR|€)|10[’']?000|500\+|Bosch|Continental|Allianz|Liqui.Moly/i,
      );
      expect(page.querySelectorAll('main form, main input, main button')).toHaveLength(0);
    },
  );

  it.each(languages)('links only to existing localized user flows in %s', async (locale) => {
    const { page } = await render(locale);
    expect(page.querySelector('[data-card="profiles"] a')?.getAttribute('href')).toBe(
      routePath(locale, 'onboarding'),
    );
    expect(page.querySelector('[data-card="drivers"] a')?.getAttribute('href')).toBe(
      routePath(locale, 'search'),
    );
    for (const link of page.querySelectorAll<HTMLAnchorElement>('main a')) {
      expect(link.textContent?.trim()).toBeTruthy();
      expect([routePath(locale, 'search'), routePath(locale, 'onboarding')]).toContain(
        link.getAttribute('href'),
      );
      expect(link.hasAttribute('target')).toBe(false);
    }
    expect(page.querySelector('[data-audience-grid]')?.classList.contains('md:grid-cols-2')).toBe(
      true,
    );
  });

  it('updates copy and metadata on language changes without returning home', async () => {
    const { fixture, page } = await render();
    const router = TestBed.inject(Router);
    const language = TestBed.inject(LanguageService);
    for (const locale of ['sq', 'en', 'de'] as const) {
      await router.navigateByUrl(language.switchUrl(locale));
      await fixture.whenStable();
      expect(router.url).toBe(routePath(locale, 'monetization'));
      expect(page.querySelector('h1')?.textContent?.trim()).toBe(monetizationCopy[locale].title);
      expect(TestBed.inject(Title).getTitle()).toBe(
        `${monetizationCopy[locale].title} | AutoKosova`,
      );
      expect(TestBed.inject(Meta).getTag('name="description"')?.content).toBe(
        monetizationCopy[locale].description,
      );
    }
  });

  it.each(languages)('keeps anchors and language changes on this page in %s', async (locale) => {
    const { fixture, page } = await render(locale);
    const router = TestBed.inject(Router);
    const language = TestBed.inject(LanguageService);
    const base = routePath(locale, 'monetization');
    for (const query of ['', '?source=information']) {
      await router.navigateByUrl(`${base}${query}#monetization-principles`);
      await fixture.whenStable();
      const skip = page.querySelector<HTMLAnchorElement>('a[href$="#monetization-main"]')!;
      expect(skip.getAttribute('href')).toBe(`${base}${query}#monetization-main`);
      expect(new URL(skip.href).pathname).toBe(base);
      skip.click();
      await fixture.whenStable();
      expect(router.url).toBe(`${base}${query}#monetization-main`);
      expect(document.activeElement?.id).toBe('monetization-main');
      const details = page.querySelector<HTMLDetailsElement>('app-language-switcher details')!;
      const trigger = details.querySelector<HTMLElement>('summary')!;
      trigger.click();
      await fixture.whenStable();
      const links = [...details.querySelectorAll<HTMLAnchorElement>('nav a')];
      for (const target of languages) {
        const targetUrl = `${routePath(target, 'monetization')}${query}#monetization-main`;
        expect(language.switchUrl(target)).toBe(targetUrl);
        expect(links.find((link) => link.getAttribute('href') === targetUrl)).toBeTruthy();
      }
      expect(
        links.find((link) => link.getAttribute('aria-current') === 'page')?.getAttribute('href'),
      ).toBe(`${base}${query}#monetization-main`);
      links[0].dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
      await fixture.whenStable();
      expect(details.open).toBe(false);
    }
    expect(languageFromUrl(`${routePath(locale, 'home')}#content`)).toBe(locale);
  });

  it('distinguishes platform fees, repair costs, review evidence and publication', async () => {
    const { page } = await render();
    const text = page.querySelector('main')!.textContent;
    expect(text).toContain('Kosten & Fairness');
    expect(text).toContain('Reparaturkosten vereinbarst du direkt mit der Werkstatt');
    expect(text).toContain('privatem Besuchsnachweis');
    expect(text).toContain('gesondert zur Prüfung einreichen');
    expect(text).toContain('Veröffentlichung erst nach Prüfung und Freigabe');
    expect(text).toContain(monetizationCopy.de.verificationNotice);
    expect(text).toContain(monetizationCopy.de.contactNotice);
  });

  it('navigates to public search without starting a payment or inquiry', async () => {
    const { fixture, page } = await render('sq');
    page.querySelector<HTMLAnchorElement>('[data-card="drivers"] a')!.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/sq/garages');
  });

  it('keeps the skip target and section labels connected', async () => {
    const { page } = await render();
    expect(page.querySelector('a[href="/monetization#monetization-main"]')).toBeTruthy();
    expect(page.querySelector('#monetization-main')?.getAttribute('tabindex')).toBe('-1');
    for (const section of page.querySelectorAll('main [aria-labelledby]')) {
      expect(page.querySelector('#' + section.getAttribute('aria-labelledby'))).toBeTruthy();
    }
  });

  it.each(languages)('uses one shell footer with optional analytics in %s', async (locale) => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl(routePath(locale, 'monetization'));
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelectorAll('app-site-footer footer')).toHaveLength(1);
    const consent = page.querySelector<HTMLButtonElement>('footer button[aria-pressed]')!;
    expect(consent.getAttribute('aria-pressed')).toBe('false');
    consent.click();
    expect(TestBed.inject(AnalyticsService).setConsent).toHaveBeenCalledWith(true);
    for (const target of languages) {
      await router.navigateByUrl(routePath(target, 'monetization') + '?source=information');
      await fixture.whenStable();
      expect(page.querySelector('h1')?.textContent?.trim()).toBe(monetizationCopy[target].title);
      expect(page.querySelectorAll('footer')).toHaveLength(1);
      expect(page.querySelector(`footer a[href="${routePath(target, 'search')}"]`)).toBeTruthy();
      expect(page.querySelector(`footer a[href="${routePath(target, 'privacy')}"]`)).toBeTruthy();
    }
  });
});
