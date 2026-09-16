import { Component, input, output, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { AdminConsoleComponent } from './admin-console.component';
import { GarageOnboardingComponent } from './garage-onboarding.component';
import { StaffLayoutComponent } from './staff-layout.component';
import { AccountSessionService } from './account-session.service';
import { LanguageService } from './language.service';
import { adminLabel } from '../shared/admin-copy';
import type { AdminGarageDetail } from '../shared/administration';
import type { AppLanguage } from '../shared/i18n';

@Component({ selector: 'app-staff-layout', template: '<ng-content />' })
class StaffLayoutStub {
  readonly admin = input(false);
  readonly active = input('');
}
@Component({ selector: 'app-garage-onboarding', template: '' })
class OnboardingStub {
  readonly supportContext = input();
  readonly supportSaved = output<string>();
  canLeave() {
    return true;
  }
}
const garage: AdminGarageDetail = {
  id: 'demo-admin-test',
  name: 'DEMO Garage',
  publicationState: 'pending_review',
  deleted: false,
  revision: 7,
  ownerCount: 1,
  profile: {
    name: 'DEMO Garage',
    placeId: 'xk-pristina',
    address: 'DEMO Straße 10 Prishtina',
    contactPerson: 'DEMO Person',
    contactPhone: '+999123',
    languages: ['Deutsch'],
    serviceCategoryIds: ['bremsen'],
    vehicleMakeIds: [],
    selfReportedSpecializations: [],
  },
  verification: {
    phone: 'not_checked',
    contactPerson: 'not_checked',
    companyDocument: 'not_checked',
    location: 'not_checked',
  },
  adminSuspended: false,
  prerequisites: { publishable: false, blockers: ['company_document', 'owner_account', 'point'] },
  members: [],
  documents: [],
  photos: [],
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render(
  section = 'users',
  locale: AppLanguage = 'de',
  role = 'admin',
  query: Record<string, string> = {},
) {
  const account = {
    state: signal('ready'),
    identity: signal({ userId: 'synthetic-admin', roles: [role], garageMemberships: [] }),
    dataContext: signal<string | null>('admin:1'),
    refresh: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn(),
  };
  const fetch = vi
    .fn()
    .mockImplementation(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.endsWith('/provider')
              ? {}
              : url.includes('/privacy')
                ? { requests: [], page: 1, hasMore: false }
                : url.includes('/garages/demo-')
                  ? garage
                  : { items: [], page: 1, hasMore: false },
          ),
        ),
    );
  vi.stubGlobal('fetch', fetch);
  await TestBed.configureTestingModule({
    imports: [AdminConsoleComponent],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            data: { adminSection: section },
            queryParamMap: { get: (key: string) => query[key] ?? null },
          },
        },
      },
      { provide: AccountSessionService, useValue: account },
      {
        provide: LanguageService,
        useValue: { language: locale, setPageText: vi.fn(), link: () => '/admin' },
      },
    ],
  })
    .overrideComponent(AdminConsoleComponent, {
      remove: {
        imports: [StaffLayoutComponent, GarageOnboardingComponent],
      },
      add: { imports: [StaffLayoutStub, OnboardingStub] },
    })
    .compileComponents();
  const fixture = TestBed.createComponent(AdminConsoleComponent);
  await fixture.whenStable();
  await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false));
  return {
    fixture,
    component: fixture.componentInstance,
    account,
    fetch,
    page: fixture.nativeElement as HTMLElement,
  };
}
it.each(['de', 'sq', 'en'] as const)(
  'shows the correct localized admin section in %s',
  async (locale) => {
    const { page } = await render('users', locale);
    expect(page.querySelector('h1')?.textContent).toBe(adminLabel('users', locale));
  },
);
it('does not fetch or render administration for a moderator', async () => {
  const { page, component, fetch } = await render('users', 'de', 'moderator');
  expect(component.allowed()).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
  expect(page.querySelector('[data-admin-users]')).toBeNull();
});
it('requires deliberate operator attestation and all explicit retention values', async () => {
  const { component, fetch } = await render('privacy');
  fetch.mockClear();
  expect(component.validPolicy()).toBe(false);
  await component.savePolicy();
  expect(fetch).not.toHaveBeenCalled();
  component.policyVersion = 'SYNTHETIC';
  component.approvalReference = 'SYNTHETIC NOT REAL APPROVAL';
  component.publicReviewHandling = 'delete';
  for (const key of component.durations) component.days[key] = 30;
  expect(component.validPolicy()).toBe(false);
  component.approvalConfirmed = true;
  expect(component.validPolicy()).toBe(true);
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  await component.savePolicy();
  expect(fetch).not.toHaveBeenCalled();
});
it('keeps the loaded revision and unsaved checks on a conflict, with no success claim', async () => {
  const { component, fetch } = await render('garages');
  component.detail.set(garage);
  component.reason = 'company_verified';
  component.verification.phone = 'verified';
  component.dirty = true;
  fetch.mockClear();
  fetch.mockResolvedValue(new Response('{}', { status: 409 }));
  await component.saveVerification();
  expect(component.detail()?.revision).toBe(7);
  expect(component.verification.phone).toBe('verified');
  expect(component.dirty).toBe(true);
  expect(component.stale()).toBe(true);
  expect(component.success()).toBe('');
  expect(component.error()).not.toBe('');
});
it('prevents duplicate writes and discards a late result after logout', async () => {
  const { component, account, fetch, fixture } = await render('garages');
  component.detail.set(garage);
  component.reason = 'company_verified';
  component.latitude = 42.67;
  component.longitude = 21.16;
  component.query = 'private fixture query';
  let finish!: (r: Response) => void;
  fetch.mockClear();
  fetch.mockImplementation(() => new Promise<Response>((r) => (finish = r)));
  const pending = component.saveVerification();
  await component.saveVerification();
  expect(fetch).toHaveBeenCalledOnce();
  account.dataContext.set(null);
  account.state.set('guest');
  await fixture.whenStable();
  finish(new Response(null, { status: 204 }));
  await pending;
  expect(component.detail()).toBeNull();
  expect(component.latitude).toBeNull();
  expect(component.query).toBe('');
  expect(component.success()).toBe('');
});
it('ignores a stale candidate search so it cannot replace the newer selection list', async () => {
  const { component, fetch } = await render('users');
  let first!: (r: Response) => void;
  fetch
    .mockImplementationOnce(() => new Promise<Response>((r) => (first = r)))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [{ id: 'new', label: 'DEMO New', status: 'active' }] })),
    );
  component.candidateQuery = 'old';
  const pending = component.findCandidates();
  component.candidateQuery = 'new';
  await component.findCandidates();
  first(
    new Response(JSON.stringify({ items: [{ id: 'old', label: 'DEMO Old', status: 'active' }] })),
  );
  await pending;
  expect(component.candidates().map((u) => u.id)).toEqual(['new']);
});

it('submits exactly the deletion policy that the administrator confirmed', async () => {
  const { component, fetch } = await render('privacy');
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  fetch.mockClear();
  fetch
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValue(new Response(JSON.stringify({ requests: [], page: 1, hasMore: false })));
  await component.processDeletion('synthetic-request', 'SYNTHETIC-CONFIRMED');
  const [path, options] = fetch.mock.calls[0];
  expect(path).toContain('/synthetic-request/process');
  expect(JSON.parse(options.body)).toEqual({ policyVersion: 'SYNTHETIC-CONFIRMED' });
});

it('keeps only a technical selected request in the URL and detects policy edits by equality', async () => {
  const { component, fetch } = await render('privacy', 'de', 'admin', {
    requestId: 'synthetic-request',
    focus: 'privacy-context',
  });
  expect(
    fetch.mock.calls.some(([url]) => String(url).includes('requestId=synthetic-request')),
  ).toBe(true);
  expect(component.policyDirty()).toBe(false);
  component.policyVersion = 'SYNTHETIC-V1';
  expect(component.policyDirty()).toBe(true);
  component.policyVersion = '';
  expect(component.policyDirty()).toBe(false);
});
