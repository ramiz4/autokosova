import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { routes } from './app.routes';
import { LanguageService, routePath } from './language.service';

beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter(routes)] }));

it.each(['de', 'sq', 'en'] as const)(
  'exposes the canonical monetization route in %s',
  async (locale) => {
    const router = TestBed.inject(Router);
    const path = routePath(locale, 'monetization');
    await router.navigateByUrl(path);
    expect(router.url).toBe(path);
    for (const target of ['de', 'sq', 'en'] as const) {
      expect(TestBed.inject(LanguageService).switchUrl(target)).toBe(
        routePath(target, 'monetization'),
      );
    }
  },
);

it.each(['', '/sq', '/en'])(
  'redirects the German alias for %s without losing query parameters or fragments',
  async (prefix) => {
    const router = TestBed.inject(Router);
    for (const suffix of ['', '?source=information', '?source=information#monetization-main']) {
      await router.navigateByUrl(`${prefix}/monetarisierung${suffix}`);
      expect(router.url).toBe(`${prefix}/monetization${suffix}`);
      expect(TestBed.inject(LanguageService).switchUrl('en')).toBe(`/en/monetization${suffix}`);
    }
  },
);

it('keeps existing keyed metadata and indexing behavior when accepting localized page text', () => {
  const language = TestBed.inject(LanguageService);
  const meta = TestBed.inject(Meta);
  const title = TestBed.inject(Title);
  language.setPage('landing.pageTitle', 'landing.intro', true);
  expect(title.getTitle()).toBe(`${language.t('landing.pageTitle')} | AutoKosova`);
  expect(meta.getTag('name="description"')?.content).toBe(language.t('landing.intro'));
  expect(meta.getTag('name="robots"')?.content).toBe('noindex, nofollow');
  language.setPageText('Kosten & Fairness', 'Die aktuelle kostenlose Phase und unabhängige Suche.');
  expect(title.getTitle()).toBe('Kosten & Fairness | AutoKosova');
  expect(meta.getTag('name="description"')?.content).toBe(
    'Die aktuelle kostenlose Phase und unabhängige Suche.',
  );
  expect(meta.getTag('name="robots"')).toBeNull();
});
