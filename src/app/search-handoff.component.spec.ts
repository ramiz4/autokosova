import { BehaviorSubject, of } from 'rxjs';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { SearchHandoffComponent } from './search-handoff.component';

function routeWith(query: Record<string, string>) {
  return {
    snapshot: { queryParamMap: convertToParamMap(query) },
    queryParamMap: of(convertToParamMap(query)),
  };
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

it('refreshes results from changed URL filters and ignores stale responses', async () => {
  const loads = vi.spyOn(
    SearchHandoffComponent.prototype as unknown as { load(): Promise<void> },
    'load',
  );
  const params = new BehaviorSubject(convertToParamMap({ places: 'xk-pristina:20' }));
  const calls: string[] = [];
  const pending: ((response: Response) => void)[] = [];
  vi.stubGlobal('fetch', (url: string) => {
    calls.push(String(url));
    return new Promise<Response>((resolve) => pending.push(resolve));
  });
  const response = (total: number) =>
    new Response(
      JSON.stringify({
        allResults: false,
        page: 1,
        pageSize: 10,
        results: [],
        searchAreas: [],
        serviceCategory: { id: 'all', label: '' },
        sort: 'recommended',
        total,
        totalPages: 1,
      }),
    );
  try {
    await TestBed.configureTestingModule({
      imports: [SearchHandoffComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            get snapshot() {
              return { queryParamMap: params.value };
            },
            queryParamMap: params.asObservable(),
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(SearchHandoffComponent);
    fixture.detectChanges();
    params.next(convertToParamMap({ places: 'xk-pristina:30' }));
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain('places=xk-pristina%3A30');
    pending[1](response(7));
    await loads.mock.results[1].value;
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('7 passende Werkstätten gefunden');
    pending[0](response(99));
    await loads.mock.results[0].value;
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).not.toContain('99 passende');
    params.next(convertToParamMap({}));
    expect(calls[2]).toContain('all=true');
    expect(fixture.componentInstance['areas']).toEqual([{ placeId: 'xk-pristina', radiusKm: 20 }]);
    pending[2](response(25));
    await loads.mock.results[2].value;
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('25 passende Werkstätten gefunden');
  } finally {
    vi.unstubAllGlobals();
    loads.mockRestore();
  }
});

it('adds only distinct locations and always retains one location', async () => {
  await TestBed.configureTestingModule({
    imports: [SearchHandoffComponent],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: routeWith({}) },
      { provide: PLATFORM_ID, useValue: 'server' },
    ],
  }).compileComponents();
  const component = TestBed.createComponent(SearchHandoffComponent).componentInstance;
  component['areas'] = [{ placeId: 'xk-prizren', radiusKm: 30 }];
  component['addArea']();
  component['addArea']();
  component['addArea']();
  expect(component['areas']).toHaveLength(3);
  expect(component['expandedArea']()).toBe(2);
  expect(new Set(component['areas'].map((area) => area.placeId)).size).toBe(3);
  component['removeArea'](0);
  component['removeArea'](0);
  component['removeArea'](0);
  expect(component['areas']).toHaveLength(1);
  expect(component['expandedArea']()).toBe(0);
});
