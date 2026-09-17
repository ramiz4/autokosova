import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AccountSessionService } from './account-session.service';
import { LanguageService } from './language.service';
import { ReviewDetailComponent } from './review-detail.component';
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

it('loads the requested private review and resolves its public garage image', async () => {
  const review = {
    id: 'review-1',
    garageId: 'garage-1',
    garageName: 'DEMO · Bremsen Nord Prishtina',
    serviceCategoryId: 'bremsen',
    visitMonth: '2026-08',
    submittedAt: '2026-09-16T10:00:00Z',
    text: 'Fiktive Bewertung für den Detailseiten-Test.',
    publicationState: 'published',
    evidenceStatus: 'verified',
    evidenceKind: 'invoice',
    ratings: {
      workQuality: 5,
      communication: 5,
      priceTransparency: 5,
      punctuality: 5,
      overall: 5,
    },
    updates: [],
  };
  const fetch = vi
    .fn()
    .mockImplementation(async (url: string) =>
      url === '/api/me/reviews/review-1'
        ? new Response(JSON.stringify(review))
        : new Response(JSON.stringify({ photoIds: ['photo-1'] })),
    );
  vi.stubGlobal('fetch', fetch);
  const account = {
    dataContext: signal<string | null>('customer:1'),
    identity: signal({ garageMemberships: [], roles: [], userId: 'customer' }),
    invalidate: vi.fn(),
    loginAvailable: signal(true),
    refresh: vi.fn().mockResolvedValue(undefined),
    signedIn: () => true,
    state: signal('ready'),
  };
  await TestBed.configureTestingModule({
    imports: [ReviewDetailComponent],
    providers: [
      provideRouter([{ path: 'reviews/:reviewId', component: ReviewDetailComponent }]),
      { provide: AccountSessionService, useValue: account },
      {
        provide: LanguageService,
        useValue: {
          language: 'de',
          link: (name: string, id?: string) =>
            name === 'review-detail' ? `/reviews/${id}` : '/reviews',
          serviceLabel: () => 'Bremsen',
          t: (key: string) => key,
        },
      },
    ],
  })
    .overrideComponent(ReviewDetailComponent, {
      remove: { imports: [SiteHeaderComponent] },
      add: { imports: [HeaderStub] },
    })
    .compileComponents();

  const harness = await RouterTestingHarness.create('/reviews/review-1');
  await vi.waitFor(() =>
    expect(harness.routeNativeElement?.textContent).toContain('DEMO · Bremsen Nord Prishtina'),
  );
  await vi.waitFor(() =>
    expect(harness.routeNativeElement?.querySelector('img')?.src).toContain(
      '/api/public/garages/garage-1/photos/photo-1',
    ),
  );

  expect(fetch).toHaveBeenCalledWith(
    '/api/me/reviews/review-1',
    expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' }),
  );
  expect(harness.routeNativeElement?.textContent).toContain('5 / 5');

  const component = harness.routeDebugElement!.componentInstance as ReviewDetailComponent;
  expect(component.canLeave()).toBe(true);
  (component as unknown as { setDirty(value: boolean): void }).setDirty(true);
  const confirm = vi.spyOn(component.confirmation(), 'ask').mockResolvedValue(true);
  await expect(component.canLeave()).resolves.toBe(true);
  expect(confirm).toHaveBeenCalledOnce();
});
