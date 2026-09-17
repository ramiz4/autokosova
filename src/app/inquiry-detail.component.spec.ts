import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AccountSessionService } from './account-session.service';
import { InquiryDetailComponent } from './inquiry-detail.component';
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

it('loads only the requested private inquiry and renders its complete details', async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        id: 'request-1',
        serviceCategoryId: 'service-inspection',
        symptom: 'Bremsen und Inspektion prüfen.',
        vehicle: {
          makeId: 'audi',
          model: 'Q7',
          year: 2024,
          vehicleClass: 'car',
          fuel: 'petrol',
          transmissionDetails: 'automatic',
          mileageKm: 20_000,
        },
        areas: [{ placeId: 'xk-pristina', radiusKm: 20 }],
        earliestDropoffOn: '2026-09-29',
        latestPickupOn: '2026-10-06',
        attachmentIds: ['file-1'],
        active: true,
        revision: 2,
        createdAt: '2026-09-16T08:45:00Z',
        updatedAt: '2026-09-17T08:45:00Z',
      }),
    ),
  );
  vi.stubGlobal('fetch', fetch);
  const account = {
    dataContext: signal<string | null>('customer:1'),
    invalidate: vi.fn(),
    loginAvailable: signal(true),
    refresh: vi.fn().mockResolvedValue(undefined),
    signedIn: () => true,
    state: signal('ready'),
  };
  await TestBed.configureTestingModule({
    imports: [InquiryDetailComponent],
    providers: [
      provideRouter([{ path: 'inquiries/:inquiryId', component: InquiryDetailComponent }]),
      { provide: AccountSessionService, useValue: account },
      {
        provide: LanguageService,
        useValue: {
          language: 'de',
          link: (name: string, id?: string) =>
            name === 'inquiry-detail' ? `/inquiries/${id}` : '/inquiries',
          serviceLabel: () => 'Service und Inspektion',
          t: (key: string) => key,
        },
      },
    ],
  })
    .overrideComponent(InquiryDetailComponent, {
      remove: { imports: [SiteHeaderComponent] },
      add: { imports: [HeaderStub] },
    })
    .compileComponents();

  const harness = await RouterTestingHarness.create('/inquiries/request-1');
  await vi.waitFor(() => expect(harness.routeNativeElement?.textContent).toContain('Q7'));

  expect(fetch).toHaveBeenCalledWith(
    '/api/me/repair-requests/request-1',
    expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' }),
  );
  expect(harness.routeNativeElement?.textContent).toContain('Service und Inspektion');
  expect(harness.routeNativeElement?.textContent).toContain('Prishtina');
  expect(harness.routeNativeElement?.textContent).toContain('20.000 km');
});
