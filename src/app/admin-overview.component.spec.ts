import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminOverviewComponent } from './admin-overview.component';
import { StaffLayoutComponent } from './staff-layout.component';
import { AccountSessionService } from './account-session.service';
import { LanguageService } from './language.service';
import type { AdminOverview } from '../shared/administration';

@Component({ selector: 'app-staff-layout', template: '<ng-content />' })
class StaffLayoutStub {
  readonly admin = input(false);
  readonly active = input('');
}

const allZero: AdminOverview = {
  unassignedCases: 0,
  escalatedCases: 0,
  pendingGarages: 0,
  pendingDeletions: 0,
  blockedDeletions: 0,
  openReviews: 0,
  openReports: 0,
  openAppeals: 0,
};

async function render(overview: AdminOverview | null = allZero, fetchFails = false) {
  const fetchMock = vi.fn().mockImplementation(async () => {
    if (fetchFails) return new Response('', { status: 500 });
    return new Response(JSON.stringify(overview));
  });
  vi.stubGlobal('fetch', fetchMock);
  const account = {
    state: signal('ready'),
    identity: signal({ userId: 'admin-1', roles: ['admin'], garageMemberships: [] }),
    dataContext: signal<string | null>('admin:1'),
    refresh: vi.fn().mockResolvedValue(undefined),
  };
  await TestBed.configureTestingModule({
    imports: [AdminOverviewComponent],
    providers: [
      provideRouter([]),
      { provide: AccountSessionService, useValue: account },
      {
        provide: LanguageService,
        useValue: {
          language: 'en',
          setPageText: vi.fn(),
          link: (route: string, section?: string) =>
            route === 'admin-section' ? `/admin/${section}` : `/${route}`,
          serviceLabel: () => '',
        },
      },
    ],
  })
    .overrideComponent(AdminOverviewComponent, {
      remove: { imports: [StaffLayoutComponent] },
      add: { imports: [StaffLayoutStub] },
    })
    .compileComponents();
  const fixture = TestBed.createComponent(AdminOverviewComponent);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  await fixture.whenStable();
  // afterNextRender does not fire in the test harness; seed state directly.
  if (fetchFails) {
    component.error.set('error');
  } else if (overview) {
    component.overview.set(overview);
  }
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, component, page: fixture.nativeElement as HTMLElement };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('shows the all-clear banner when all domain counts are zero', async () => {
  const { page } = await render(allZero);
  expect(page.querySelector('[data-admin-all-clear]')).not.toBeNull();
  expect(page.querySelector('[data-admin-overview]')).not.toBeNull();
});

it('hides the all-clear banner when any count is non-zero', async () => {
  const { page } = await render({ ...allZero, openReviews: 3 });
  expect(page.querySelector('[data-admin-all-clear]')).toBeNull();
});

it('links the reviews card to /admin/reviews', async () => {
  const { page } = await render({ ...allZero, openReviews: 2 });
  const card = page.querySelector<HTMLAnchorElement>('[data-open-reviews]');
  expect(card).not.toBeNull();
  expect(card!.getAttribute('href')).toBe('/admin/reviews');
});

it('links the reports card to /admin/reports', async () => {
  const { page } = await render();
  const card = page.querySelector<HTMLAnchorElement>('[data-open-reports]');
  expect(card).not.toBeNull();
  expect(card!.getAttribute('href')).toBe('/admin/reports');
});

it('links the appeals card to /admin/appeals', async () => {
  const { page } = await render();
  const card = page.querySelector<HTMLAnchorElement>('[data-open-appeals]');
  expect(card).not.toBeNull();
  expect(card!.getAttribute('href')).toBe('/admin/appeals');
});

it('hides the blocked-deletions card when count is zero', async () => {
  const { page } = await render(allZero);
  expect(page.querySelector('[data-blocked-deletions]')).toBeNull();
});

it('shows the blocked-deletions card when count is non-zero', async () => {
  const { page } = await render({ ...allZero, blockedDeletions: 1 });
  expect(page.querySelector('[data-blocked-deletions]')).not.toBeNull();
});

it('shows an error message when the overview fetch fails', async () => {
  const { page } = await render(null, true);
  expect(page.querySelector('[role="alert"]')).not.toBeNull();
  expect(page.querySelector('[data-admin-overview]')).toBeNull();
});
