import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { monetizationCopy } from '../shared/monetization-copy';
import { AccountSessionService } from './account-session.service';
import { routes } from './app.routes';
import { LanguageService, routePath } from './language.service';
import { MonetizationComponent } from './monetization.component';

const languages = ['de', 'sq', 'en'] as const;

describe('Monetization page', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MonetizationComponent],
      providers: [
        provideRouter(routes),
        {
          provide: AccountSessionService,
          useValue: {
            signedIn: signal(false),
            busy: signal(false),
            refresh: vi.fn().mockResolvedValue(undefined),
            logout: vi.fn().mockResolvedValue(true),
          },
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
    'renders the four localized cards and honest status labels in %s',
    async (locale) => {
      const { page } = await render(locale);
      const copy = monetizationCopy[locale];
      expect(page.querySelector('h1')?.textContent?.trim()).toBe(copy.title);
      expect(page.querySelectorAll('article[data-card]')).toHaveLength(4);
      for (const id of ['profiles', 'tools', 'drivers', 'partners'] as const) {
        const card = page.querySelector(`[data-card="${id}"]`)!;
        expect(card.querySelector('h2')?.textContent?.trim()).toBe(copy.cards[id].title);
        expect(card.querySelectorAll('li')).toHaveLength(copy.cards[id].points.length);
        expect(card.querySelector('[data-offer-status]')?.textContent?.trim()).toBe(
          id === 'tools' || id === 'partners' ? copy.futureLabel : copy.currentLabel,
        );
      }
      expect(page.textContent).toContain(copy.pilotNotice);
      expect(page.textContent).toContain(copy.principlesBody);
      expect(page.textContent).toContain(copy.conditions);
      expect(page.querySelector('header img')?.getAttribute('src')).toBe(
        '/branding/autokosova-logo-header.png',
      );
      expect(page.querySelector('picture img')?.getAttribute('alt')).toBe('');
      expect(page.querySelector('main')?.textContent).not.toMatch(
        /(?:29|49)\s*(?:EUR|€)|10[’']?000|500\+|Bosch|Continental|Allianz|Liqui.Moly/,
      );
      expect(page.querySelectorAll('main form, main input, main button')).toHaveLength(0);
    },
  );

  it.each(languages)(
    'uses existing localized actions and real information anchors in %s',
    async (locale) => {
      const { page } = await render(locale);
      expect(page.querySelector('[data-card="profiles"] a')?.getAttribute('href')).toBe(
        routePath(locale, 'onboarding'),
      );
      expect(page.querySelector('[data-card="drivers"] a')?.getAttribute('href')).toBe(
        routePath(locale, 'search'),
      );
      for (const id of ['tools', 'partners']) {
        const link = page.querySelector(`[data-card="${id}"] a`)!;
        expect(link.getAttribute('href')).toBe('#monetization-principles');
        expect(page.querySelector(link.getAttribute('href')!)).toBeTruthy();
      }
      for (const link of page.querySelectorAll<HTMLAnchorElement>('main a')) {
        expect(link.textContent?.trim()).toBeTruthy();
        expect(link.getAttribute('href')).toMatch(
          /^(?:#monetization-principles|\/(?:sq|en)?(?:\/|$)|\/garages)/,
        );
        expect(link.hasAttribute('target')).toBe(false);
      }
      expect(page.querySelector('main .grid')?.classList.contains('md:grid-cols-2')).toBe(true);
    },
  );

  it('updates the copy and metadata on language changes without returning home', async () => {
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

  it('navigates to public search without starting a payment or inquiry', async () => {
    const { fixture, page } = await render('sq');
    const link = page.querySelector<HTMLAnchorElement>('[data-card="drivers"] a')!;
    link.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/sq/garages');
  });

  it('keeps the skip target and all section labels connected', async () => {
    const { page } = await render();
    expect(page.querySelector('a[href="#monetization-main"]')).toBeTruthy();
    expect(page.querySelector('#monetization-main')?.getAttribute('tabindex')).toBe('-1');
    for (const section of page.querySelectorAll('main [aria-labelledby]')) {
      expect(page.querySelector('#' + section.getAttribute('aria-labelledby'))).toBeTruthy();
    }
  });
});
