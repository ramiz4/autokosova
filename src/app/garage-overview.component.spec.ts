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
    expect(page.querySelectorAll('[data-garage-status]')).toHaveLength(5);
    for (const state of states)
      expect(
        page.querySelector('[data-garage-status][data-state="' + state + '"]')?.textContent?.trim(),
      ).toBeTruthy();
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
  await component['reset']();
  fixture.detectChanges();
  expect(page.querySelectorAll('form')).toHaveLength(1);
  expect(page.querySelector('[data-garages-overview]')).toBeNull();
  component['form'].contactPhone = '+99900000002';
  const confirm = vi.spyOn(component.confirmation(), 'ask').mockResolvedValue(false);
  await component['backToOverview']();
  fixture.detectChanges();
  expect(component['form'].contactPhone).toBe('+99900000002');
  expect(page.querySelector('form')).not.toBeNull();
  confirm.mockResolvedValue(true);
  await component['backToOverview']();
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

it('renders the existing-garage editor as one accessible form with public-only preview data', async () => {
  const { fixture, component, page } = await setup();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'owned',
          profile: { ...profile, contactPerson: 'PRIVATE PERSON', contactPhone: '+999PRIVATE' },
          canDelete: true,
          publicationState: 'published',
          verification: { location: 'not_checked' },
        }),
      ),
    ),
  );
  await component['open']('owned');
  fixture.detectChanges();

  expect(page.querySelectorAll('form')).toHaveLength(1);
  expect(page.querySelector('.garage-editor-form')).not.toBeNull();
  expect(page.querySelector('.editor-section-nav')).not.toBeNull();
  expect(page.querySelectorAll('.editor-section-nav button')).toHaveLength(3);
  expect(page.querySelector('.editor-sidebar')).not.toBeNull();
  expect(page.querySelector('.editor-sidebar')?.textContent).toContain(profile.name);
  expect(page.querySelector('.editor-sidebar')?.textContent).not.toContain('PRIVATE PERSON');
  expect(page.querySelector('.editor-sidebar')?.textContent).not.toContain('+999PRIVATE');
  expect(page.querySelector('form [data-garage-danger]')).toBeNull();
  expect(page.querySelector('.editor-sidebar [data-garage-danger]')).not.toBeNull();

  const name = page.querySelector<HTMLInputElement>('#garage-name')!;
  name.value = 'Öffentliche Vorschau';
  name.dispatchEvent(new Event('input', { bubbles: true }));
  await fixture.whenStable();
  expect(page.querySelector('.editor-preview-unsaved')).not.toBeNull();
  expect(page.querySelector('.editor-sidebar')?.textContent).toContain('Öffentliche Vorschau');
  page.querySelectorAll<HTMLButtonElement>('.editor-section-nav button')[1].click();
  expect(component['activeSection']).toBe('garage-contact');
});

it('uses the server-confirmed publication state after submission instead of guessing a transition', async () => {
  const { fixture, component, page } = await setup();
  component['garageId'] = 'owned';
  component['form'] = { ...profile, address: profile.address };
  component['savedSnapshot'] = JSON.stringify(component['form']);
  component['editing'] = true;
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            garages: [{ id: 'owned', name: profile.name, publicationState: 'published' }],
          }),
        ),
      ),
  );
  await component['submitForReview']();
  fixture.detectChanges();
  expect(component['publicationState']).toBe('published');
  expect(component['statusKnown']).toBe(true);
  expect(page.querySelector('[data-garage-status]')?.getAttribute('data-state')).toBe('published');
  expect(page.querySelector('[data-garage-status]')?.textContent).toContain(
    'In der öffentlichen Suche sichtbar.',
  );
  expect(
    page
      .querySelector('[data-garage-status]')!
      .compareDocumentPosition(page.querySelector('form')!) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

it('does not announce a successful transition when submission fails', async () => {
  const { fixture, component, page } = await setup();
  component['garageId'] = 'owned';
  component['editing'] = true;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));
  await component['submitForReview']();
  fixture.detectChanges();
  expect(component['publicationState']).toBe('draft');
  expect(component['message']).toBe(component['copy'].error);
  expect(page.querySelector('[data-garage-status]')?.textContent).toContain(
    'Noch nicht öffentlich sichtbar.',
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('marks status unavailable after a confirmed write with failed readback, and disables further submission until reloaded', async () => {
  const { fixture, component, page } = await setup();
  component['garageId'] = 'owned';
  component['editing'] = true;
  const request = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(new Response('{}', { status: 503 }));
  vi.stubGlobal('fetch', request);
  await component['submitForReview']();
  fixture.detectChanges();
  expect(component['statusKnown']).toBe(false);
  expect(page.querySelector('[data-garage-status]')).toBeNull();
  expect(page.querySelector('[data-garage-status-unavailable]')).not.toBeNull();
  await component['submitForReview']();
  expect(request).toHaveBeenCalledTimes(2);
  request.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        id: 'owned',
        profile,
        publicationState: 'pending_review',
        verification: { location: 'not_checked' },
      }),
    ),
  );
  await component['open']('owned');
  fixture.detectChanges();
  expect(component['statusKnown']).toBe(true);
  expect(page.querySelector('[data-garage-status]')?.getAttribute('data-state')).toBe(
    'pending_review',
  );
});

it.each(['de', 'sq', 'en'] as const)(
  'disables an unchanged save, enables real edits and separates danger actions in %s',
  async (locale) => {
    const { fixture, component, page } = await setup();
    vi.spyOn(TestBed.inject(LanguageService), 'language', 'get').mockReturnValue(locale);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'owned',
            profile,
            canDelete: true,
            publicationState: 'published',
            verification: { location: 'not_checked' },
          }),
        ),
      ),
    );
    await component['open']('owned');
    fixture.detectChanges();
    const save = page.querySelector<HTMLButtonElement>('[data-save-garage]')!;
    expect(save.disabled).toBe(true);
    expect(page.querySelector('[data-garage-actions] [data-delete-garage]')).toBeNull();
    expect(page.querySelector('[data-garage-danger] [data-delete-garage]')).not.toBeNull();
    expect(page.querySelector('[data-cancel-garage]')?.textContent).toContain(
      component['management'].cancel,
    );
    const calls = vi.mocked(fetch).mock.calls.length;
    await component['submit']();
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
    await fixture.whenStable();
    const name = page.querySelector<HTMLInputElement>('#garage-name')!;
    name.value = 'Neue Angabe';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    expect(save.disabled).toBe(false);
    name.value = profile.name;
    name.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    expect(save.disabled).toBe(true);
    const confirm = vi.spyOn(component.confirmation(), 'ask');
    component['cancelEditing']();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(confirm).not.toHaveBeenCalled();
    expect(page.querySelector('form')).toBeNull();
  },
);

it.each([
  { status: 401, body: {}, key: 'signIn', login: true },
  { status: 403, body: {}, key: 'forbidden', login: false },
  { status: 403, body: { code: 'csrf_invalid' }, key: 'csrfError', login: true },
  { status: 409, body: {}, key: 'writeConflict', login: false },
  { status: 503, body: {}, key: 'error', login: false },
])(
  'keeps edits and gives a distinct alert for failed garage save $status/$key',
  async ({ status, body, key, login }) => {
    const { fixture, component, page } = await setup();
    component['garageId'] = 'owned';
    component['canDelete'] = true;
    component['editing'] = true;
    component['form'] = structuredClone(profile);
    component['savedSnapshot'] = JSON.stringify(component['form']);
    component['form'].name = 'Ungespeichert';
    document.cookie = 'autokosova_csrf=fixture-token; path=/';
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })),
      );
      await component['submit']();
      fixture.detectChanges();
      expect(component['form'].name).toBe('Ungespeichert');
      expect(component['unchanged']).toBe(false);
      expect(component['needsLogin']).toBe(login);
      expect(component['messageRole']).toBe('alert');
      const expected =
        key === 'signIn'
          ? component['copy'].signIn
          : key === 'error'
            ? component['copy'].error
            : component['management'][key as 'forbidden' | 'csrfError' | 'writeConflict'];
      expect(component['message']).toBe(expected);
      expect(page.querySelector('form [role="alert"]')?.textContent).toContain(expected);
    } finally {
      document.cookie = 'autokosova_csrf=; Max-Age=0; path=/';
    }
  },
);

it('clears private garage fields on logout rather than rendering the previous account in public onboarding', async () => {
  const { fixture, component, page } = await setup();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'private-owned',
          profile: { ...profile, name: 'PRIVATE-ACCOUNT-A' },
          publicationState: 'draft',
          verification: { location: 'not_checked' },
        }),
      ),
    ),
  );
  await component['open']('private-owned');
  fixture.detectChanges();
  expect(page.textContent).toContain('PRIVATE-ACCOUNT-A');
  const account = TestBed.inject(AccountSessionService);
  account.identity.set(null);
  account.state.set('guest');
  account.signedIn.set(false);
  await fixture.whenStable();
  expect(page.textContent).not.toContain('PRIVATE-ACCOUNT-A');
  expect(component['garageId']).toBeUndefined();
  expect(component['form'].name).toBe('');
});

it('ignores a late private profile response after an account switch', async () => {
  const { fixture, component, page } = await setup();
  let finish!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const read = component['open']('private-owned');
  const account = TestBed.inject(AccountSessionService);
  account.identity.set({
    userId: 'other-owner',
    accountType: 'garage',
    roles: ['customer'],
    garageMemberships: [],
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  });
  await fixture.whenStable();
  finish(
    new Response(
      JSON.stringify({
        id: 'private-owned',
        profile: { ...profile, name: 'PRIVATE-ACCOUNT-A' },
        publicationState: 'draft',
        verification: { location: 'not_checked' },
      }),
    ),
  );
  await read;
  fixture.detectChanges();
  expect(page.textContent).not.toContain('PRIVATE-ACCOUNT-A');
  expect(component['garageId']).toBeUndefined();
});
