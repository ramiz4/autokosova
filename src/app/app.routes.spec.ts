import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { routes } from './app.routes';
import { LanguageService, routePath } from './language.service';

beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter(routes)] }));

it.each(['', 'sq', 'en'])(
  'uses English canonical paths with /%s language prefixes',
  async (locale) => {
    const base = locale ? `/${locale}` : '';
    const router = TestBed.inject(Router);
    for (const path of ['/inquiry', '/garages/new', '/garages/demo', '/garages']) {
      await router.navigateByUrl(base + path);
      expect(router.url).toBe(base + path);
    }
    await router.navigateByUrl(base + '/garages/demo');
    expect(TestBed.inject(LanguageService).switchUrl('en')).toBe('/en/garages/demo');
    expect(routePath('sq', 'request')).toBe('/sq/inquiry');
    expect(routePath('sq', 'onboarding')).toBe('/sq/garages/new');
  },
);

it.each(['', 'sq', 'en'])('redirects old German links to English paths for /%s', async (locale) => {
  const base = locale ? `/${locale}` : '';
  const router = TestBed.inject(Router);
  for (const [oldPath, canonical] of [
    ['/anfrage', '/inquiry'],
    ['/werkstatt/aufnahme', '/garages/new'],
    ['/werkstatt/demo', '/garages/demo'],
    ['/suche', '/garages'],
    ['/werkstaetten', '/garages'],
  ]) {
    await router.navigateByUrl(base + oldPath);
    expect(router.url).toBe(base + canonical);
  }
  await router.navigateByUrl(base + '/suche?service=bremsen&places=xk-pristina:20');
  expect(router.url).toBe(base + '/garages?service=bremsen&places=xk-pristina:20');
});
