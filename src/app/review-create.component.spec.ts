import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { ReviewCreateComponent } from './review-create.component';
import { SiteHeaderComponent } from './site-header.component';
import { AccountSessionService } from './account-session.service';
import { LanguageService } from './language.service';

@Component({ selector: 'app-site-header', template: '' })
class HeaderStub {
  readonly compact = input(false);
  readonly active = input('');
}
const valid = {
  serviceCategoryId: 'bremsen',
  visitMonth: '2026-08',
  vehicleMakeId: '',
  text: 'DEMO – Fiktive Erfahrung für einen Prüfungstest.',
  workQuality: 2,
  communication: 3,
  priceTransparency: 2,
  punctuality: 3,
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render() {
  const account = {
    state: signal('ready'),
    identity: signal({ userId: 'synthetic-author', roles: ['customer'], garageMemberships: [] }),
    dataContext: signal<string | null>('author:1'),
    refresh: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn(),
  };
  const params = new BehaviorSubject(convertToParamMap({ garageId: 'demo-garage' }));
  const fetch = vi
    .fn()
    .mockImplementation(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes('/api/public/')
              ? { id: 'demo-garage', name: 'DEMO Garage' }
              : { mode: 'local_fixture' },
          ),
        ),
    );
  vi.stubGlobal('fetch', fetch);
  await TestBed.configureTestingModule({
    imports: [ReviewCreateComponent],
    providers: [
      provideRouter([]),
      { provide: AccountSessionService, useValue: account },
      {
        provide: ActivatedRoute,
        useValue: { paramMap: params, snapshot: { paramMap: params.value } },
      },
      {
        provide: LanguageService,
        useValue: {
          language: 'de',
          setPageText: vi.fn(),
          link: () => '/reviews',
          t: () => '',
          serviceLabel: (s: string) => s,
        },
      },
    ],
  })
    .overrideComponent(ReviewCreateComponent, {
      remove: { imports: [SiteHeaderComponent] },
      add: { imports: [HeaderStub] },
    })
    .compileComponents();
  const fixture = TestBed.createComponent(ReviewCreateComponent);
  await fixture.whenStable();
  await vi.waitFor(() => expect(fixture.componentInstance.garageName()).toBe('DEMO Garage'));
  return { fixture, component: fixture.componentInstance, account, fetch };
}
it('marks invalid fields and never posts an incomplete review', async () => {
  const { fixture, component, fetch } = await render();
  fetch.mockClear();
  component.evidenceId.set('synthetic-file');
  await component.submit();
  await fixture.whenStable();
  expect(fetch).not.toHaveBeenCalled();
  expect(fixture.nativeElement.querySelectorAll('[aria-invalid="true"]').length).toBeGreaterThan(3);
  expect(component.error()).not.toBe('');
});
it('keeps retry data on a network error and prevents concurrent submissions', async () => {
  const { component, fetch } = await render();
  component.form = { ...valid };
  component.evidenceId.set('synthetic-file');
  let finish!: (r: Response) => void;
  fetch.mockImplementation(
    () =>
      new Promise<Response>((r) => {
        finish = r;
      }),
  );
  fetch.mockClear();
  const save = component.submit();
  await component.submit();
  expect(fetch).toHaveBeenCalledOnce();
  finish(new Response('{}', { status: 503 }));
  await save;
  expect(component.form.text).toBe(valid.text);
  expect(component.evidenceId()).toBe('synthetic-file');
  expect(component.result()).toBeNull();
});
it('forgets private drafts and ignores late success after account switch', async () => {
  const { component, fixture, account, fetch } = await render();
  component.form = { ...valid };
  component.evidenceId.set('synthetic-file');
  let finish!: (r: Response) => void;
  fetch.mockImplementation(
    () =>
      new Promise<Response>((r) => {
        finish = r;
      }),
  );
  const save = component.submit();
  account.dataContext.set(null);
  account.state.set('guest');
  await fixture.whenStable();
  finish(new Response(JSON.stringify({ id: 'late', publicationState: 'submitted' })));
  await save;
  expect(component.form.text).toBe('');
  expect(component.evidenceId()).toBe('');
  expect(component.result()).toBeNull();
});
it('protects an optional-make-only draft on navigation', async () => {
  const { component } = await render();
  component.form.vehicleMakeId = 'skoda';
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  expect(component.hasDraft()).toBe(true);
  expect(component.canLeave()).toBe(false);
});
