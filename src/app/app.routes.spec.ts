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
    for (const path of [
      '/inquiry',
      '/garages/new',
      '/garages/manage',
      '/garages/demo',
      '/garages',
    ]) {
      await router.navigateByUrl(base + path);
      expect(router.url).toBe(base + path);
    }
    await router.navigateByUrl(base + '/garages/demo');
    expect(TestBed.inject(LanguageService).switchUrl('en')).toBe('/en/garages/demo');
    expect(routePath('sq', 'request')).toBe('/sq/inquiry');
    expect(routePath('sq', 'onboarding')).toBe('/sq/garages/new');
    expect(routePath('sq', 'garage-management')).toBe('/sq/garages/manage');
    expect(routePath('sq', 'garage-management-edit', 'demo')).toBe('/sq/garages/manage/demo/edit');
    expect(routePath('sq', 'inquiry-detail', 'request-1')).toBe('/sq/inquiries/request-1');
    expect(routePath('sq', 'review-detail', 'review-1')).toBe('/sq/reviews/review-1');
  },
  15_000,
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

// Non-landing pages must not pull their component code into the initial shell.
describe.each(['', 'sq', 'en'])('Route bundle boundaries for /%s', (locale) => {
  const prefix = locale ? `${locale}/` : '';

  it('loads the landing page on demand with no eager route component', async () => {
    const route = routes.find((candidate) => candidate.path === locale)!;
    expect(route.component).toBeUndefined();
    expect(route.loadComponent).toBeTypeOf('function');
    expect(await route.loadComponent!()).toBe(
      (await import('./foundation.component')).FoundationComponent,
    );
  });

  it.each([
    ['monetization', () => import('./monetization.component').then((m) => m.MonetizationComponent)],
    ['inquiry', () => import('./repair-request.component').then((m) => m.RepairRequestComponent)],
    ['garages', () => import('./search-handoff.component').then((m) => m.SearchHandoffComponent)],
    [
      'inquiries/:inquiryId',
      () => import('./inquiry-detail.component').then((m) => m.InquiryDetailComponent),
    ],
    [
      'reviews/:reviewId',
      () => import('./review-detail.component').then((m) => m.ReviewDetailComponent),
    ],
    [
      'garages/manage',
      () => import('./garage-management.component').then((m) => m.GarageManagementComponent),
    ],
    [
      'garages/:garageId',
      () => import('./garage-profile.component').then((m) => m.GarageProfileComponent),
    ],
  ] as const)('loads %s on demand', async (path, expectedComponent) => {
    const route = routes.find((candidate) => candidate.path === prefix + path)!;
    expect(route.component).toBeUndefined();
    expect(route.loadComponent).toBeTypeOf('function');
    expect(await route.loadComponent!()).toBe(await expectedComponent());
    if (path === 'garages/:garageId') {
      expect(route.canDeactivate).toHaveLength(1);
      expect(route.data?.['ownsFooter']).toBe(true);
    }
  });
});
