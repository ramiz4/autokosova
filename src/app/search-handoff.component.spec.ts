import { By } from '@angular/platform-browser';
import { SearchAreasComponent } from './ui/search-areas.component';
import { BehaviorSubject, of } from 'rxjs';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap, Router } from '@angular/router';
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
      if (String(input).startsWith('/api/me/') || String(input) === '/api/session')
        return new Response('{}', { status: 401 });
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

  it('shows verified results without a duplicate verification chip or an unconfigured map', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) =>
      String(input).startsWith('/api/me/') || String(input) === '/api/session'
        ? new Response('{}', { status: 401 })
        : new Response(
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
                  reasons: ['Unternehmensdaten geprüft', 'Leistung: Bremsen'],
                  reviewSummary: {
                    state: 'available',
                    averageRating: 2.7,
                    reviewCount: 2,
                    label: '2.7 von 5 · 2 Bewertungen',
                  },
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
      const card = (fixture.nativeElement as HTMLElement).querySelector('ol > li')!;
      expect(
        card.querySelector('[role="img"][aria-label="Unternehmensdaten geprüft"]'),
      ).toBeTruthy();
      expect(card.querySelector('ul')?.textContent).not.toContain('Unternehmensdaten geprüft');
      expect(card.querySelector('ul')?.textContent).toContain('Leistung: Bremsen');
      const profileLink = card.querySelector<HTMLAnchorElement>('a[href^="/garages/"]')!;
      const profileUrl = new URL(profileLink.href);
      expect(profileUrl.pathname).toBe('/garages/fiktive-werkstatt');
      expect(profileUrl.searchParams.get('places')).toBe('xk-pristina:20');
      expect(profileUrl.searchParams.get('service')).toBe('bremsen');
      expect(card.querySelectorAll('.rating-stars > span')).toHaveLength(5);
      expect(
        Array.from(card.querySelectorAll<HTMLElement>('.rating-stars > span > span')).map(
          (star) => star.style.width,
        ),
      ).toEqual(['100%', '100%', '70%', '0%', '0%']);
      expect(card.textContent).toContain('2.7');
      expect(card.textContent).toContain('(2 Bewertungen)');
      const response = fixture.componentInstance['response']!;
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            ...response,
            results: response.results.map((result) => ({
              ...result,
              companyDataVerified: false,
              reviewSummary: { ...result.reviewSummary, state: 'unavailable' },
            })),
          }),
          { status: 200 },
        );
      await fixture.componentInstance['load']();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector(
          'ol > li [role="img"][aria-label="Unternehmensdaten geprüft"]',
        ),
      ).toBeNull();
      expect(fixture.nativeElement.querySelector('.rating-stars')).toBeNull();
      expect(fixture.nativeElement.textContent).toContain('Noch keine Bewertungen');
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
    if (url.startsWith('/api/me/') || url === '/api/session')
      return Promise.resolve(new Response('{}', { status: 401 }));
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
    fixture.componentInstance['areasEditing'].set(true);
    params.next(convertToParamMap({}));
    expect(fixture.componentInstance['areasEditing']()).toBe(false);
    expect(calls[2]).toContain('all=true');
    expect(fixture.componentInstance['areas']).toEqual([]);
    pending[2](response(25));
    await loads.mock.results[2].value;
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('25 passende Werkstätten gefunden');
  } finally {
    vi.unstubAllGlobals();
    loads.mockRestore();
  }
});

async function areaFixture(query: Record<string, string> = {}) {
  await TestBed.configureTestingModule({
    imports: [SearchHandoffComponent],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: routeWith(query) },
      { provide: PLATFORM_ID, useValue: 'server' },
    ],
  }).compileComponents();
  return TestBed.createComponent(SearchHandoffComponent);
}

it('uses the shared editor without applying unconfirmed locations and preserves independent radii in the URL', async () => {
  const fixture = await areaFixture({ places: 'xk-prizren:30,xk-peja:50' });
  const component = fixture.componentInstance;
  component['response'] = {
    allResults: false,
    page: 1,
    pageSize: 10,
    results: [],
    searchAreas: [],
    serviceCategory: { id: 'all', label: 'Alle Leistungen' },
    sort: 'recommended',
    total: 0,
    totalPages: 1,
  };
  component['state'] = 'ready';
  fixture.detectChanges();
  await fixture.whenStable();
  const editor = fixture.debugElement.query(By.directive(SearchAreasComponent))
    .componentInstance as SearchAreasComponent;
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  editor['editArea'](0);
  editor['areaEditor']()!.area.radiusKm = 75;
  expect(component['areasEditing']()).toBe(true);
  component['applyFilters']();
  expect(navigate).not.toHaveBeenCalled();
  expect(component['areas'][0].radiusKm).toBe(30);
  editor.cancelArea();
  editor['editArea'](0);
  editor['areaEditor']()!.area = { placeId: 'xk-ferizaj', radiusKm: 75 };
  editor['saveArea']();
  await fixture.whenStable();
  expect(component['areasEditing']()).toBe(false);
  expect(component['areas']).toEqual([
    { placeId: 'xk-ferizaj', radiusKm: 75 },
    { placeId: 'xk-peja', radiusKm: 50 },
  ]);
  component['applyFilters']();
  expect(navigate).toHaveBeenCalledWith(
    ['/garages'],
    expect.objectContaining({
      queryParams: expect.objectContaining({ places: 'xk-ferizaj:75,xk-peja:50', all: null }),
    }),
  );
});

it('omits the removed language filter from search requests and login return paths', async () => {
  const fixture = await areaFixture({ language: 'Deutsch', vehicleMake: 'skoda' });
  const component = fixture.componentInstance;
  const request = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          allResults: true,
          page: 1,
          pageSize: 10,
          results: [],
          searchAreas: [],
          serviceCategory: { id: 'all', label: 'Alle Leistungen' },
          sort: 'recommended',
          total: 0,
          totalPages: 1,
        }),
      ),
  );
  vi.stubGlobal('fetch', request);
  try {
    await component['load']();
    fixture.detectChanges();
    expect(request.mock.calls[0]).toEqual([
      '/api/public/search?vehicleMake=skoda&all=true',
      { credentials: 'same-origin' },
    ]);
    expect(fixture.nativeElement.querySelector('select[name="spokenLanguage"]')).toBeNull();
    expect(decodeURIComponent(component['favoriteLoginUrl']())).not.toContain('language=');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component['applyFilters']();
    expect(navigate).toHaveBeenCalledWith(
      ['/garages'],
      expect.objectContaining({
        queryParams: expect.objectContaining({ language: null, vehicleMake: 'skoda' }),
      }),
    );
  } finally {
    vi.unstubAllGlobals();
  }
});
