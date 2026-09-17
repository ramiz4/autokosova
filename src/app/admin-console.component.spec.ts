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
import { ToastService } from './ui/toast.service';

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
  prerequisites: {
    publishable: false,
    blockers: ['company_document', 'owner_account', 'point'],
    restorable: false,
    restoreBlockers: ['state', 'company_document', 'owner_account', 'point'],
  },
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
  vi.spyOn(component.confirmation(), 'ask').mockResolvedValue(false);
  await component.savePolicy();
  expect(fetch).not.toHaveBeenCalled();
});
it('keeps the loaded revision and unsaved checks on a conflict, with no success claim', async () => {
  const { component, fetch } = await render('garages');
  component.detail.set(garage);
  component.reviewReason = 'company_verified';
  component.verification.phone = 'verified';
  fetch.mockClear();
  fetch.mockResolvedValue(new Response('{}', { status: 409 }));
  await component.saveVerification();
  expect(component.detail()?.revision).toBe(7);
  expect(component.verification.phone).toBe('verified');
  expect(component.dirty()).toBe(true);
  expect(component.stale()).toBe(true);
  expect(TestBed.inject(ToastService).current()).toBeNull();
  expect(component.error()).not.toBe('');
});
it('uses equality for a reverted review draft and leaves a cancelled context untouched', async () => {
  const { component } = await render('garages');
  await component.openGarage('demo-admin-test', 'review', false);
  const initial = component.verification.phone;
  component.verification.phone = 'verified';
  expect(component.dirty()).toBe(initial !== 'verified');
  component.verification.phone = initial;
  expect(component.dirty()).toBe(false);
  const confirm = vi.spyOn(component.confirmation(), 'ask').mockResolvedValue(false);
  component.reviewReason = 'missing_information';
  await expect(component.canLeave('/admin/garages?garageId=another')).resolves.toBe(false);
  expect(component.detail()?.id).toBe('demo-admin-test');
  expect(confirm).toHaveBeenCalledOnce();
});
it('keeps the mutation busy until its authoritative garage read completes', async () => {
  const { component, fetch } = await render('garages');
  await component.openGarage('demo-admin-test', 'review', false);
  component.reviewReason = 'company_verified';
  let finishRead!: (value: Response) => void;
  fetch.mockClear();
  fetch
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockImplementationOnce(() => new Promise<Response>((resolve) => (finishRead = resolve)));
  const saving = component.saveVerification();
  await vi.waitFor(() => expect(component.busy()).toBe(true));
  await component.saveVerification();
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/verification'))).toHaveLength(1);
  finishRead(new Response(JSON.stringify(garage)));
  await saving;
  expect(component.busy()).toBe(false);
});
it('prevents duplicate writes and discards a late result after logout', async () => {
  const { component, account, fetch, fixture } = await render('garages');
  component.detail.set(garage);
  component.reviewReason = 'company_verified';
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
  expect(TestBed.inject(ToastService).current()).toBeNull();
});
it('ignores a stale candidate search so it cannot replace the newer selection list', async () => {
  const { component, fetch } = await render('users');
  component.detailTab = 'team';
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
  vi.spyOn(component.confirmation(), 'ask').mockResolvedValue(true);
  fetch.mockClear();
  fetch
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValue(new Response(JSON.stringify({ requests: [], page: 1, hasMore: false })));
  await component.processDeletion('synthetic-request', 'SYNTHETIC-CONFIRMED');
  const [path, options] = fetch.mock.calls[0];
  expect(path).toContain('/synthetic-request/process');
  expect(JSON.parse(options.body)).toEqual({ policyVersion: 'SYNTHETIC-CONFIRMED' });
});

it('rejects a changed transfer or retention policy while its confirmation is pending', async () => {
  const { component, account, fetch } = await render('garages');
  component.detail.set({
    ...garage,
    members: [{ userId: 'from', label: 'From', role: 'owner', state: 'active' }],
  });
  component.fromUserId = 'from';
  component.targetUserId = 'to';
  let answer!: (value: boolean) => void;
  vi.spyOn(component.confirmation(), 'ask').mockImplementation(
    () => new Promise<boolean>((resolve) => (answer = resolve)),
  );
  fetch.mockClear();
  const transfer = component.transfer();
  component.targetUserId = 'other';
  account.dataContext.set('admin:2');
  answer(true);
  await transfer;
  expect(fetch).not.toHaveBeenCalled();

  component.policyVersion = 'SYNTHETIC';
  component.approvalReference = 'SYNTHETIC APPROVAL';
  component.publicReviewHandling = 'delete';
  for (const key of component.durations) component.days[key] = 30;
  component.approvalConfirmed = true;
  const policy = component.savePolicy();
  component.policyVersion = 'CHANGED';
  answer(true);
  await policy;
  expect(fetch).not.toHaveBeenCalled();
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

it('refreshes privacy during its own save and does not report a stale policy as current', async () => {
  const { component, fetch } = await render('privacy');
  component.policyVersion = 'SYNTHETIC';
  component.approvalReference = 'SYNTHETIC NOT REAL APPROVAL';
  component.publicReviewHandling = 'delete';
  for (const key of component.durations) component.days[key] = 30;
  component.approvalConfirmed = true;
  vi.spyOn(component.confirmation(), 'ask').mockResolvedValue(true);
  fetch.mockClear();
  fetch
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ requests: [], policy: { version: 'SYNTHETIC' }, page: 1, hasMore: false }),
      ),
    );
  await component.savePolicy();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(component.privacy()?.policy?.version).toBe('SYNTHETIC');
  expect(TestBed.inject(ToastService).current()?.message).toBe(adminLabel('policySaved', 'de'));
  expect(component.policyDirty()).toBe(false);
});

it('does not announce a fresh garage state after a failed post-write read', async () => {
  const { component, fetch } = await render('garages');
  await component.openGarage('demo-admin-test', 'review', false);
  component.reviewReason = 'company_verified';
  fetch
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(new Response('{}', { status: 503 }));
  await component.saveVerification();
  expect(component.error()).not.toBe('');
  expect(TestBed.inject(ToastService).current()).toBeNull();
  expect(component.stale()).toBe(true);
});
