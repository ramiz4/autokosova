import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AccountSessionService } from './account-session.service';
import { GarageOnboardingComponent } from './garage-onboarding.component';
import { LanguageService } from './language.service';

const profile = {
  name: 'Fiktive Werkstatt',
  placeId: 'xk-pristina',
  address: 'Demostrasse 1, Prishtina',
  contactPerson: 'Demo',
  contactPhone: '+99900000001',
  languages: ['Deutsch'],
  serviceCategoryIds: ['bremsen'],
  vehicleMakeIds: [],
  selfReportedSpecializations: [],
};
async function setup() {
  const account = {
    signedIn: signal(true),
    state: signal('ready'),
    identity: signal({
      userId: 'fixture',
      accountType: 'garage',
      roles: ['customer'],
      garageMemberships: [],
    }),
    busy: signal(false),
    displayName: () => 'Fixture',
    refresh: vi.fn().mockResolvedValue(undefined),
  };
  await TestBed.configureTestingModule({
    imports: [GarageOnboardingComponent],
    providers: [
      provideRouter([]),
      { provide: PLATFORM_ID, useValue: 'server' },
      { provide: AccountSessionService, useValue: account },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(GarageOnboardingComponent);
  fixture.detectChanges();
  return {
    fixture,
    component: fixture.componentInstance,
    page: fixture.nativeElement as HTMLElement,
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(['de', 'sq', 'en'] as const)(
  'shows only the overview and valid public links in %s, without a form or marketing',
  async (locale) => {
    const { fixture, component, page } = await setup();
    vi.spyOn(TestBed.inject(LanguageService), 'language', 'get').mockReturnValue(locale);
    expect(page.querySelector('form')).toBeNull();
    expect(page.querySelector('[data-garages-empty]')).toBeNull();
    expect(page.querySelector('[data-garages-loading]')).not.toBeNull();
    const states = ['published', 'draft', 'pending_review', 'rejected', 'suspended'];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            garages: states.map((publicationState, i) => ({
              id: 'fixture-' + i,
              name: 'Demo ' + i,
              publicationState,
            })),
          }),
        ),
      ),
    );
    await component['loadOwned']();
    fixture.detectChanges();
    expect(page.querySelectorAll('[data-owned-garage]')).toHaveLength(5);
    expect(page.querySelectorAll('[data-public-garage]')).toHaveLength(1);
    expect(page.querySelector('[data-public-garage]')?.getAttribute('href')).toBe(
      (locale === 'de' ? '' : '/' + locale) + '/garages/fixture-0',
    );
    expect(page.querySelectorAll('[data-new-garage]')).toHaveLength(1);
    expect(
      page.querySelector('header[aria-labelledby="onboarding-hero-title"], aside, form'),
    ).toBeNull();
  },
);

it('distinguishes pending, failed and genuinely empty lists and supports retry', async () => {
  const { fixture, component, page } = await setup();
  let finish!: (r: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const loading = component['loadOwned']();
  fixture.detectChanges();
  expect(page.querySelector('[data-garages-empty]')).toBeNull();
  finish(new Response('{}', { status: 503 }));
  await loading;
  fixture.detectChanges();
  expect(page.querySelector('[data-garages-retry]')).not.toBeNull();
  expect(page.querySelector('[data-garages-empty]')).toBeNull();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ garages: [] }))));
  await component['refreshSession']();
  fixture.detectChanges();
  expect(page.querySelector('[data-garages-empty]')).not.toBeNull();
  expect(page.querySelector('[data-garages-retry]')).toBeNull();
});

it('opens one form, preserves edits when back is declined and clears only after confirmation', async () => {
  const { fixture, component, page } = await setup();
  component['reset']();
  fixture.detectChanges();
  expect(page.querySelectorAll('form')).toHaveLength(1);
  expect(page.querySelector('[data-garages-overview]')).toBeNull();
  component['form'].contactPhone = '+99900000002';
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  component['backToOverview']();
  fixture.detectChanges();
  expect(component['form'].contactPhone).toBe('+99900000002');
  expect(page.querySelector('form')).not.toBeNull();
  confirm.mockReturnValue(true);
  component['backToOverview']();
  fixture.detectChanges();
  expect(page.querySelector('form')).toBeNull();
  expect(component['form'].contactPhone).toBe('');
});

it('opens the selected profile without accidentally choosing the first and keeps an overview on load failure', async () => {
  const { fixture, component, page } = await setup();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 403 })));
  await component['open']('second');
  fixture.detectChanges();
  expect(page.querySelector('form')).toBeNull();
  expect(component['garageId']).toBeUndefined();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'second',
          profile,
          canDelete: false,
          publicationState: 'draft',
          verification: { location: 'not_checked' },
        }),
      ),
    ),
  );
  await component['open']('second');
  fixture.detectChanges();
  expect(page.querySelector('#form-title')?.textContent).toContain(profile.name);
  expect(component['garageId']).toBe('second');
  expect(page.querySelector('form')).not.toBeNull();
  expect(page.querySelector('[data-delete-garage]')).toBeNull();
});
