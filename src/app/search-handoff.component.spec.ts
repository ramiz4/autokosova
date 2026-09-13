import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { SearchHandoffComponent } from './search-handoff.component';

function routeWith(query: Record<string, string>) {
  return { snapshot: { queryParamMap: convertToParamMap(query) } };
}

describe('SearchHandoffComponent', () => {
  it('loads the explicit all-results default when no filters are supplied', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      expect(String(input)).toContain('/api/public/search?all=true');
      return new Response(
        JSON.stringify({
          allResults: true,
          page: 1,
          pageSize: 10,
          results: [],
          searchAreas: [],
          serviceCategory: { id: 'all', label: 'Alle Leistungen' },
          sort: 'recommended',
          total: 25,
          totalPages: 3,
        }),
        { status: 200 },
      );
    };
    await TestBed.configureTestingModule({
      imports: [SearchHandoffComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: routeWith({}) },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    }).compileComponents();

    try {
      const fixture = TestBed.createComponent(SearchHandoffComponent);
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('25 passende Werkstätten gefunden');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('does not render a map column when no map provider is configured', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          page: 1,
          pageSize: 10,
          results: [
            {
              companyDataVerified: true,
              distanceKm: 0,
              id: 'fiktive-werkstatt',
              matchingPlace: { id: 'xk-pristina', label: 'Prishtina' },
              name: 'Fiktive Werkstatt',
              reasons: ['Leistung: Bremsen'],
              reviewSummary: { label: 'Noch keine Bewertungen' },
              selfReportedSpecializations: [],
            },
          ],
          searchAreas: [{ label: 'Prishtina', radiusKm: 20 }],
          serviceCategory: { label: 'Bremsen' },
          total: 1,
          totalPages: 1,
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      );
    try {
      await TestBed.configureTestingModule({
        imports: [SearchHandoffComponent],
        providers: [
          provideRouter([]),
          {
            provide: ActivatedRoute,
            useValue: routeWith({ places: 'xk-pristina:20', service: 'bremsen' }),
          },
          { provide: PLATFORM_ID, useValue: 'browser' },
        ],
      }).compileComponents();

      const fixture = TestBed.createComponent(SearchHandoffComponent);
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Fiktive Werkstatt');
      expect(fixture.nativeElement.textContent).toContain('Filter anwenden');
      expect(fixture.nativeElement.textContent).not.toContain(
        'Kartenansicht ist derzeit nicht verfügbar',
      );
      expect(fixture.nativeElement.querySelectorAll('aside')).toHaveLength(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
