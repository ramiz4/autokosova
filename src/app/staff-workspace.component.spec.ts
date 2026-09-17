import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { StaffWorkspaceComponent } from './staff-workspace.component';
import { StaffLayoutComponent } from './staff-layout.component';
import { AccountSessionService } from './account-session.service';
import { LanguageService } from './language.service';
import type { AdminCaseSection } from '../shared/administration';
import type { StaffCaseDetail } from '../shared/moderation';

@Component({ selector: 'app-staff-layout', template: '<ng-content />' })
class StaffLayoutStub {
  readonly admin = input(false);
  readonly active = input('');
}

const emptyPage = { cases: [], page: 1, hasMore: false };

const baseDetail: StaffCaseDetail = {
  id: 'case-1',
  priority: 'normal',
  status: 'submitted',
  subjectId: 'subject-1',
  subjectType: 'review',
  kind: 'review_submission',
  revision: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  label: 'Test case',
  history: [],
  appeals: [],
  canAssign: false,
  canEscalate: false,
  conflictOfInterest: false,
  openAppeal: false,
};

async function render(
  data: { adminOnly: boolean; staffDomain?: AdminCaseSection },
  options: { query?: Record<string, string>; caseId?: string } = {},
) {
  const query = options.query ?? {};
  const caseId = options.caseId ?? null;
  const account = {
    state: signal('ready'),
    identity: signal({ userId: 'synthetic-admin', roles: ['admin'], garageMemberships: [] }),
    dataContext: signal<string | null>('admin:1'),
    refresh: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn(),
  };
  const fetch = vi.fn().mockImplementation(async (url: string) => {
    if (url.startsWith('/api/staff/cases/') && !url.includes('?'))
      return new Response(JSON.stringify(baseDetail));
    if (url.startsWith('/api/staff/cases?')) return new Response(JSON.stringify(emptyPage));
    if (url === '/api/staff/moderators') return new Response(JSON.stringify({ moderators: [] }));
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fetch);
  const route = {
    snapshot: {
      data,
      paramMap: convertToParamMap(caseId ? { caseId } : {}),
      queryParamMap: convertToParamMap(query),
    },
    paramMap: new BehaviorSubject(convertToParamMap(caseId ? { caseId } : {})),
    queryParamMap: new BehaviorSubject(convertToParamMap(query)),
  };
  await TestBed.configureTestingModule({
    imports: [StaffWorkspaceComponent],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: route },
      { provide: AccountSessionService, useValue: account },
      {
        provide: LanguageService,
        useValue: {
          language: 'en',
          setPageText: vi.fn(),
          link: (routeName: string, parameter?: string) =>
            routeName === 'admin-section' ? `/admin/${parameter}` : `/${routeName}`,
        },
      },
    ],
  })
    .overrideComponent(StaffWorkspaceComponent, {
      remove: { imports: [StaffLayoutComponent] },
      add: { imports: [StaffLayoutStub] },
    })
    .compileComponents();
  const fixture = TestBed.createComponent(StaffWorkspaceComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  return {
    fixture,
    component: fixture.componentInstance,
    router: TestBed.inject(Router),
    page: fixture.nativeElement as HTMLElement,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('locks the kind filter to reviews and hides the kind selector on /admin/reviews', async () => {
  const { component, page } = await render(
    { adminOnly: true, staffDomain: 'reviews' },
    { query: { kind: 'report' } },
  );
  expect(component.filterKind).toBe('review_submission');
  expect(page.querySelector('select[name="kind"]')).toBeNull();
  expect(page.querySelector('[data-review-filter]')).toBeNull();
});

it('locks the kind filter to reports and hides the kind selector on /admin/reports', async () => {
  const { component, page } = await render(
    { adminOnly: true, staffDomain: 'reports' },
    { query: { kind: 'review_submission' } },
  );
  expect(component.filterKind).toBe('report');
  expect(page.querySelector('select[name="kind"]')).toBeNull();
});

it('forces the appeal filter on /admin/appeals but keeps the kind selector narrowed', async () => {
  const { component, page } = await render(
    { adminOnly: true, staffDomain: 'appeals' },
    { query: { appeal: 'false' } },
  );
  expect(component.onlyAppeal).toBe(true);
  const select = page.querySelector<HTMLSelectElement>('select[name="kind"]');
  expect(select).not.toBeNull();
  expect(Array.from(select!.options).map((option) => option.value)).toEqual([
    '',
    'report',
    'review_submission',
  ]);
  expect(page.querySelector('[data-appeal-filter]')).toBeNull();
});

it('does not lock any filter on the personal /moderation queue', async () => {
  const { component } = await render(
    { adminOnly: false },
    { query: { kind: 'review_submission' } },
  );
  expect(component.filterKind).toBe('review_submission');
  expect(component.onlyAppeal).toBe(false);
});

it('returns to its own domain page when leaving a case opened from /admin/reports', async () => {
  const { component, router } = await render(
    { adminOnly: true, staffDomain: 'reports' },
    { caseId: 'case-1' },
  );
  await vi.waitFor(() => expect(component.detail()).not.toBeNull());
  const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  component.back();
  expect(navigate).toHaveBeenCalledWith('/admin/reports');
});

it('derives the back target from the loaded case on a direct /admin/cases/:id deep link', async () => {
  const { component, router } = await render({ adminOnly: true }, { caseId: 'case-1' });
  await vi.waitFor(() => expect(component.detail()).not.toBeNull());
  const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

  component.detail.set({ ...baseDetail, kind: 'review_submission', openAppeal: false });
  component.back();
  expect(navigate).toHaveBeenCalledWith('/admin/reviews');

  navigate.mockClear();
  component.detail.set({ ...baseDetail, kind: 'report', openAppeal: false });
  component.back();
  expect(navigate).toHaveBeenCalledWith('/admin/reports');

  navigate.mockClear();
  component.detail.set({ ...baseDetail, kind: 'review_submission', openAppeal: true });
  component.back();
  expect(navigate).toHaveBeenCalledWith('/admin/appeals');
});

it('falls back to the admin overview when no domain and no case are known', async () => {
  const { component, router } = await render({ adminOnly: true }, { caseId: 'case-1' });
  await vi.waitFor(() => expect(component.detail()).not.toBeNull());
  component.detail.set(null);
  const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  component.back();
  expect(navigate).toHaveBeenCalledWith('/admin');
});
