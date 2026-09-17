import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ReviewsComponent } from './reviews.component';
import { AccountSessionService } from './account-session.service';
import { LanguageService } from './language.service';
import { SiteHeaderComponent } from './site-header.component';

@Component({ selector: 'app-site-header', template: '' })
class HeaderStub {
  readonly compact = input(false);
  readonly active = input<string>();
  readonly loginReturnTo = input<string>();
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('loads the private list once when its rows create action menus', async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        hasMore: false,
        page: 1,
        total: 1,
        reviews: [
          {
            id: 'fixture-review',
            garageId: 'fixture-garage',
            garageName: 'Fiktive Garage',
            serviceCategoryId: 'bremsen',
            visitMonth: '2026-08',
            submittedAt: '2026-08-15T10:00:00Z',
            text: 'Fiktive Bewertung für die Regression-Prüfung.',
            publicationState: 'submitted',
            evidenceStatus: 'submitted',
            evidenceKind: 'invoice',
            ratings: {
              workQuality: 4,
              communication: 4,
              priceTransparency: 4,
              punctuality: 4,
              overall: 4,
            },
            updates: [],
          },
        ],
      }),
    ),
  );
  vi.stubGlobal('fetch', fetch);
  const account = {
    dataContext: signal<string | null>('fixture:1'),
    invalidate: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined),
    state: signal('ready'),
  };
  await TestBed.configureTestingModule({
    imports: [ReviewsComponent],
    providers: [
      provideRouter([]),
      { provide: AccountSessionService, useValue: account },
      {
        provide: LanguageService,
        useValue: {
          language: 'de',
          link: () => '/reviews',
          serviceLabel: (service: string) => service,
          setPageText: vi.fn(),
          t: () => '',
        },
      },
    ],
  })
    .overrideComponent(ReviewsComponent, {
      remove: { imports: [SiteHeaderComponent] },
      add: { imports: [HeaderStub] },
    })
    .compileComponents();

  const fixture = TestBed.createComponent(ReviewsComponent);
  fixture.detectChanges();
  await vi.waitFor(() =>
    expect(fixture.nativeElement.querySelector('[data-review-id="fixture-review"]')).not.toBeNull(),
  );
  await new Promise((resolve) => setTimeout(resolve, 25));
  await fixture.whenStable();

  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0]?.[0]).toBe('/api/me/reviews?page=1&sort=submitted_desc');
  const controls = fixture.nativeElement.querySelector('.review-toolbar') as HTMLElement;
  expect(controls.querySelectorAll('app-select-field')).toHaveLength(2);
  expect(controls.querySelectorAll('select')).toHaveLength(0);
});
