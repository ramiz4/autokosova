import { FavoritesService } from './favorites.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SearchAreasComponent, type SearchArea } from './ui/search-areas.component';
import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CATALOG_PLACES, SERVICE_CATEGORY_LABELS, VEHICLE_MAKE_LABELS } from '../shared/catalog';
import { REPAIR_REQUEST_LIMITS } from '../shared/repair-request';
import { AnalyticsService } from './analytics.service';
import { LanguageService } from './language.service';
import { SiteHeaderComponent } from './site-header.component';
import { ButtonDirective } from './ui/button.directive';
import { IconComponent } from './ui/icon.component';

interface Result {
  readonly companyDataVerified: boolean;
  readonly distanceKm?: number;
  readonly id: string;
  readonly locationAvailable: boolean;
  readonly matchingPlace: { readonly id: string; readonly label: string };
  readonly name: string;
  readonly photoIds: readonly string[];
  readonly reasons: readonly string[];
  readonly reviewSummary: {
    readonly averageRating?: number;
    readonly label: string;
    readonly reviewCount?: number;
    readonly state?: 'available' | 'unavailable';
  };
  readonly selfReportedSpecializations: readonly string[];
}
interface Response {
  readonly allResults: boolean;
  readonly page: number;
  readonly pageSize: number;
  readonly results: readonly Result[];
  readonly searchAreas: readonly {
    readonly label: string;
    readonly placeId: string;
    readonly radiusKm: number;
  }[];
  readonly serviceCategory: { readonly id: string; readonly label: string };
  readonly sort: 'recommended' | 'rating';
  readonly total: number;
  readonly totalPages: number;
}
type SearchState = 'error' | 'invalid' | 'loading' | 'ready';

@Component({
  imports: [
    SearchAreasComponent,
    ButtonDirective,
    FormsModule,
    IconComponent,
    RouterLink,
    SiteHeaderComponent,
  ],
  selector: 'app-search-handoff',
  providers: [FavoritesService],
  template: ` <main class="min-h-screen bg-[#f4f8fe] text-ink" aria-labelledby="search-title">
    <div class="site-navbar-surface sticky top-0 z-50 px-3 lg:px-8">
      <app-site-header [compact]="true" active="search" />
    </div>
    <h1 id="search-title" class="sr-only">{{ language.t('search.title') }}</h1>
    @if (state === 'loading' && !response) {
      <p class="mx-auto max-w-6xl px-4 py-12 text-slate-700" role="status">
        {{ language.t('search.loading') }}
      </p>
    }
    @if (state === 'invalid') {
      <section class="mx-auto my-8 max-w-4xl rounded-2xl border border-amber-300 bg-amber-50 p-6">
        <h2 class="text-xl font-bold">{{ language.t('search.invalid') }}</h2>
        <p class="mt-2 text-slate-700">{{ language.t('search.invalidBody') }}</p>
        <a [routerLink]="language.link('home')" appButton="outline" size="compact" class="mt-5">{{
          language.t('common.backHome')
        }}</a>
      </section>
    }
    @if (state === 'error') {
      <section class="mx-auto my-8 max-w-4xl rounded-2xl border border-rose-300 bg-rose-50 p-6">
        <h2 class="text-xl font-bold">{{ language.t('search.error') }}</h2>
        <p class="mt-2 text-slate-700">{{ language.t('search.errorBody') }}</p>
        <button type="button" appButton="outline" size="compact" class="mt-5" (click)="load()">
          {{ language.t('common.retry') }}
        </button>
      </section>
    }
    @if (response) {
      <section
        class="mx-auto w-[calc(100%_-_1.5rem)] max-w-[1360px] px-4 py-6 sm:px-6 lg:w-[calc(100%_-_4rem)]"
      >
        <div class="grid gap-5 xl:grid-cols-[minmax(280px,320px)_minmax(0,1fr)]">
          <aside
            class="sticky top-20 z-10 max-h-[calc(100dvh-6rem)] self-start overflow-y-auto rounded-2xl border border-slate-200/80 bg-white px-5 py-3 shadow-sm shadow-slate-900/5"
          >
            <div
              class="flex min-h-11 items-center justify-between gap-3 border-slate-100 xl:min-h-10 xl:border-b xl:pb-2"
              [class.border-b]="filtersOpen()"
              [class.pb-2]="filtersOpen()"
            >
              <h2 id="filter-title" class="text-base font-bold tracking-tight">
                {{ ui('search.ui.filter') }}
              </h2>
              <button
                type="button"
                class="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-brand-dark xl:hidden"
                aria-controls="search-filters"
                [attr.aria-expanded]="filtersOpen()"
                (click)="filtersOpen.set(!filtersOpen())"
              >
                {{ ui(filtersOpen() ? 'search.ui.closeFilters' : 'search.ui.openFilters') }}
                <app-icon name="chevron-down" class="size-4" [class.rotate-180]="filtersOpen()" />
              </button>
            </div>
            <form
              id="search-filters"
              aria-labelledby="filter-title"
              class="mt-4 xl:block"
              [class.hidden]="!filtersOpen()"
              (ngSubmit)="applyFilters()"
              novalidate
            >
              <div class="grid gap-5">
                <app-search-areas
                  idPrefix="search"
                  [(ngModel)]="areas"
                  name="areas"
                  (editingChange)="areasEditing.set($event)"
                />
                <div class="grid gap-4 border-t border-slate-100 pt-5">
                  <label class="grid gap-2 text-sm font-semibold"
                    >{{ ui('search.ui.make') }}
                    <select
                      [(ngModel)]="vehicleMake"
                      name="vehicleMake"
                      class="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-brand/30"
                    >
                      <option value="">{{ ui('search.ui.allMakes') }}</option>
                      @for (entry of makeIds; track entry) {
                        <option [value]="entry">{{ makeLabels[entry] }}</option>
                      }
                    </select>
                  </label>
                  <label class="grid gap-2 text-sm font-semibold"
                    >{{ language.t('home.service') }}
                    <select
                      [(ngModel)]="service"
                      name="service"
                      class="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-brand/30"
                    >
                      <option value="">{{ ui('search.ui.allServices') }}</option>
                      @for (entry of serviceIds; track entry) {
                        <option [value]="entry">{{ language.serviceLabel(entry) }}</option>
                      }
                    </select>
                  </label>
                </div>
                <div class="grid gap-2 border-t border-slate-100 pt-5">
                  @if (filterError()) {
                    <p class="text-sm leading-5 text-rose-800" role="alert">
                      {{ language.t('search.invalidBody') }}
                    </p>
                  }
                  <button
                    type="submit"
                    [disabled]="areasEditing() || state === 'loading'"
                    appButton
                    size="compact"
                    class="w-full"
                  >
                    {{ ui('search.ui.apply') }}
                  </button>
                  <button
                    type="button"
                    class="min-h-11 rounded-lg text-sm font-medium text-muted hover:bg-slate-50 hover:text-ink"
                    (click)="resetFilters()"
                  >
                    {{ ui('search.ui.clear') }}
                  </button>
                </div>
              </div>
            </form>
          </aside>
          <div class="min-w-0" [attr.aria-busy]="state === 'loading'">
            <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p class="text-xl font-bold" role="status">
                {{
                  state === 'loading'
                    ? language.t('search.loading')
                    : state === 'error'
                      ? ui('search.ui.previousResults')
                      : ui('search.ui.resultCount', { count: response.total })
                }}
              </p>
              <label class="flex w-full items-center gap-2 text-sm font-semibold sm:w-auto">
                <span class="shrink-0">{{ ui('search.ui.sort') }}</span>
                <select
                  [(ngModel)]="sort"
                  name="sort"
                  [disabled]="areasEditing()"
                  class="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 sm:flex-none"
                  (change)="applyFilters()"
                >
                  <option value="recommended">{{ ui('search.ui.sortRecommended') }}</option>
                  <option value="rating">{{ ui('search.ui.sortRating') }}</option>
                </select></label
              >
            </div>
            <section aria-label="Suchergebnisse">
              @if (!response.results.length) {
                <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 class="text-xl font-bold">{{ language.t('search.empty') }}</h2>
                  <p class="mt-2 text-slate-700">{{ language.t('search.emptyBody') }}</p>
                </div>
              } @else {
                <ol class="grid gap-4">
                  @for (garage of response.results; track garage.id; let index = $index) {
                    <li
                      class="grid gap-3 rounded-2xl border border-blue-100 bg-white p-2 shadow-sm transition hover:border-brand/30 hover:shadow-md sm:grid-cols-[205px_minmax(0,1fr)]"
                    >
                      <div class="relative min-h-[144px] overflow-hidden rounded-xl bg-slate-100">
                        @if (photoIds(garage).length) {
                          <img
                            [src]="photoUrl(garage)"
                            [alt]="garage.name"
                            class="h-full w-full object-cover"
                          />
                        } @else {
                          <img
                            [src]="conceptImage(index)"
                            alt=""
                            class="h-full min-h-[144px] w-full object-cover"
                          />
                          <span
                            class="absolute bottom-2 left-2 rounded bg-slate-950/75 px-2 py-1 text-xs font-bold text-white"
                            >Konzeptbild</span
                          >
                          <span class="sr-only">{{ ui('search.ui.noPhoto') }}</span>
                        }
                      </div>
                      <div class="relative p-3 sm:min-h-[144px] sm:pr-48">
                        <div class="flex items-center gap-2 pr-10 sm:pr-0">
                          <h2 class="min-w-0 text-xl font-bold tracking-tight break-words">
                            {{ garage.name }}
                          </h2>
                          @if (garage.companyDataVerified) {
                            <span
                              class="inline-flex size-5 shrink-0 text-brand"
                              role="img"
                              [title]="language.t('profile.verified')"
                              [attr.aria-label]="language.t('profile.verified')"
                            >
                              <app-icon name="badge-check" class="size-5" />
                            </span>
                          }
                        </div>
                        @if (hasReviews(garage)) {
                          <div class="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
                            <span class="rating-stars inline-flex gap-0.5" aria-hidden="true">
                              @for (star of [0, 1, 2, 3, 4]; track star) {
                                <span class="relative inline-flex size-3.5">
                                  <app-icon name="star" class="size-3.5 text-slate-200" />
                                  <span
                                    class="absolute inset-y-0 left-0 overflow-hidden"
                                    [style.width.%]="
                                      starFill(garage.reviewSummary.averageRating!, star)
                                    "
                                  >
                                    <app-icon
                                      name="star"
                                      class="absolute top-0 left-0 size-3.5 text-amber-500"
                                    />
                                  </span>
                                </span>
                              }
                            </span>
                            <span class="font-bold text-slate-950"
                              >{{ garage.reviewSummary.averageRating!.toFixed(1)
                              }}<span class="sr-only"> {{ ui('search.ui.outOfFive') }}</span></span
                            >
                            <span class="text-xs text-slate-500"
                              >({{
                                ui(
                                  garage.reviewSummary.reviewCount === 1
                                    ? 'search.ui.reviewCountOne'
                                    : 'search.ui.reviewCount',
                                  { count: garage.reviewSummary.reviewCount! }
                                )
                              }})</span
                            >
                          </div>
                        } @else {
                          <p class="mt-1 text-sm text-slate-500">
                            {{ language.t('profile.noReviews') }}
                          </p>
                        }
                        <p class="mt-2 flex items-center gap-1 text-sm text-slate-600">
                          <app-icon name="pin" class="size-4 text-brand-dark" />
                          {{ locationLabel(garage) }}
                        </p>
                        <ul class="mt-3 flex flex-wrap gap-2 text-xs">
                          @for (reason of matchingReasons(garage); track reason) {
                            <li class="rounded-lg bg-blue-50 px-4 py-1.5">{{ reason }}</li>
                          }
                          @for (tag of specializations(garage); track tag) {
                            <li class="rounded-lg bg-slate-100  px-4 py-1.5">{{ tag }}</li>
                          }
                        </ul>
                        <button
                          type="button"
                          class="absolute top-1 right-1 flex size-11 items-center justify-center rounded-full transition-colors hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-wait disabled:opacity-50"
                          [class.text-brand]="favorites.garageIds().has(garage.id)"
                          [class.text-ink]="!favorites.garageIds().has(garage.id)"
                          [attr.aria-label]="
                            ui(
                              favorites.garageIds().has(garage.id)
                                ? 'favorites.remove'
                                : 'favorites.add',
                              { garage: garage.name }
                            )
                          "
                          [attr.aria-pressed]="favorites.garageIds().has(garage.id)"
                          [disabled]="
                            favorites.pending().has(garage.id) || favorites.state() === 'loading'
                          "
                          (click)="favorites.toggle(garage.id)"
                        >
                          <app-icon
                            [name]="favorites.garageIds().has(garage.id) ? 'heart-filled' : 'heart'"
                            class="size-6"
                          />
                        </button>
                        <div
                          class="mt-4 flex justify-end pr-0.5 sm:absolute sm:right-3.5 sm:bottom-3 sm:mt-0 sm:pr-0"
                        >
                          <a
                            [routerLink]="language.link('garage', garage.id)"
                            appButton="outline-brand"
                            size="compact"
                            >{{ ui('search.ui.details') }}<app-icon name="arrow" class="size-4"
                          /></a>
                        </div>
                      </div>
                    </li>
                  }
                </ol>
              }
              @if (response.totalPages > 1) {
                <nav
                  class="mt-6 flex items-center justify-between gap-3"
                  aria-label="Ergebnisseiten"
                >
                  <button
                    type="button"
                    appButton="outline"
                    size="compact"
                    [disabled]="response.page === 1"
                    (click)="goToPage(response.page - 1)"
                  >
                    {{ language.t('search.previous') }}</button
                  ><span class="text-sm">{{ pageLabel(response.page, response.totalPages) }}</span
                  ><button
                    type="button"
                    appButton="outline"
                    size="compact"
                    [disabled]="response.page === response.totalPages"
                    (click)="goToPage(response.page + 1)"
                  >
                    {{ language.t('search.next') }}
                  </button>
                </nav>
              }
            </section>
          </div>
        </div>
      </section>
    }
    @if (favorites.message(); as message) {
      <div
        class="pointer-events-none fixed right-0 bottom-[max(1rem,env(safe-area-inset-bottom))] left-0 z-50 mx-auto flex w-[calc(100%_-_2rem)] max-w-xl justify-center"
      >
        <div
          [attr.role]="message === 'error' ? 'alert' : 'status'"
          class="pointer-events-auto flex w-full max-w-xl items-start gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 text-sm text-ink shadow-[0_8px_32px_-8px_rgba(7,20,62,0.22)]"
        >
          <span
            class="mt-1 flex size-9 shrink-0 items-center justify-center rounded-full"
            [class]="message === 'error' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-brand'"
          >
            <app-icon
              [name]="
                message === 'error'
                  ? 'info'
                  : message === 'saved'
                    ? 'heart-filled'
                    : message === 'removed'
                      ? 'check'
                      : 'user'
              "
              class="size-[18px]"
            />
          </span>
          <div
            class="flex min-h-11 min-w-0 grow flex-wrap items-center gap-x-2 text-sm leading-5 font-medium"
          >
            <span>{{ ui('favorites.' + message) }}</span>
            @if (message === 'signIn') {
              <a
                [href]="favoriteLoginUrl()"
                class="inline-flex min-h-11 items-center rounded-sm font-semibold text-brand-dark underline decoration-brand/35 underline-offset-4 hover:decoration-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >{{ ui('favorites.login') }}</a
              >
            }
          </div>
          <button
            type="button"
            class="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-slate-100 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            [attr.aria-label]="ui('favorites.dismiss')"
            (click)="favorites.dismiss()"
          >
            <app-icon name="close" class="size-[18px]" />
          </button>
        </div>
      </div>
    }
  </main>`,
})
export class SearchHandoffComponent {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly favorites = inject(FavoritesService);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly language = inject(LanguageService);
  protected readonly limits = REPAIR_REQUEST_LIMITS;
  protected readonly places = CATALOG_PLACES;
  protected readonly serviceIds = Object.keys(SERVICE_CATEGORY_LABELS);
  protected readonly makeIds = Object.keys(VEHICLE_MAKE_LABELS);
  protected readonly makeLabels = VEHICLE_MAKE_LABELS;
  protected areas: SearchArea[] = [];
  protected service = '';
  protected readonly filtersOpen = signal(false);
  protected readonly areasEditing = signal(false);
  private readonly searchAreas = viewChild(SearchAreasComponent);
  protected readonly filterError = signal(false);
  private readonly destroyRef = inject(DestroyRef);
  private loadVersion = 0;
  protected sort: 'recommended' | 'rating' = 'recommended';
  protected vehicleMake = '';
  private readonly responseState = signal<Response | undefined>(undefined);
  private readonly requestState = signal<SearchState>('loading');
  protected get response(): Response | undefined {
    return this.responseState();
  }
  protected set response(value: Response | undefined) {
    this.responseState.set(value);
  }
  protected get state(): SearchState {
    return this.requestState();
  }
  protected set state(value: SearchState) {
    this.requestState.set(value);
  }
  constructor() {
    this.language.setPage('search.title', 'search.intro', true);
    if (this.browser) void this.favorites.load();
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.readFilters();
      if (this.browser) void this.load();
    });
    this.destroyRef.onDestroy(() => {
      this.loadVersion++;
    });
  }
  protected ui(key: string, replacements?: Record<string, string | number>): string {
    return this.language.t(key, replacements);
  }
  protected favoriteLoginUrl(): string {
    const query = new URLSearchParams();
    for (const key of ['all', 'places', 'service', 'vehicleMake', 'sort', 'page']) {
      const value = this.route.snapshot.queryParamMap.get(key);
      if (value) query.set(key, value);
    }
    return `/auth/login?returnTo=${encodeURIComponent(this.language.link('search') + (query.size ? `?${query}` : ''))}`;
  }
  protected aerialDistance(distance: number, place: string): string {
    return this.language.t('search.aerialDistance', {
      distance: `${distance.toLocaleString(this.language.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`,
      place,
    });
  }
  protected matchingReasons(garage: Result): readonly string[] {
    return garage.reasons.filter(
      (reason) => !reason.includes('Luftlinie') && reason !== 'Unternehmensdaten geprüft',
    );
  }
  protected photoIds(garage: Result): readonly string[] {
    return garage.photoIds ?? [];
  }

  protected conceptImage(index: number): string {
    return `/images/search/cards/concept-${(index % 4) + 1}.webp`;
  }

  protected specializations(garage: Result): readonly string[] {
    return garage.selfReportedSpecializations ?? [];
  }

  protected photoUrl(garage: Result): string {
    return `/api/public/garages/${encodeURIComponent(garage.id)}/photos/${encodeURIComponent(this.photoIds(garage)[0])}`;
  }
  protected starFill(rating: number, index: number): number {
    return Math.max(0, Math.min(100, Math.round((rating - index) * 100)));
  }

  protected hasReviews(garage: Result): boolean {
    const summary = garage.reviewSummary;
    return (
      summary.state === 'available' &&
      Number.isFinite(summary.averageRating) &&
      summary.averageRating! >= 1 &&
      summary.averageRating! <= 5 &&
      Boolean(summary.reviewCount)
    );
  }

  protected locationLabel(garage: Result): string {
    return garage.distanceKm === undefined
      ? garage.locationAvailable
        ? garage.matchingPlace.label
        : `${garage.matchingPlace.label} · ${this.locationUnavailableLabel()}`
      : this.aerialDistance(garage.distanceKm, garage.matchingPlace.label);
  }

  protected locationUnavailableLabel(): string {
    return this.language.language === 'sq'
      ? 'Pozicioni i punëtorisë nuk është konfirmuar'
      : this.language.language === 'en'
        ? 'Garage position not confirmed'
        : 'Werkstattposition nicht bestätigt';
  }

  protected placeLabel(placeId: string): string {
    return this.places.find((place) => place.id === placeId)?.label ?? placeId;
  }
  protected pageLabel(page: number, total: number): string {
    return this.language.language === 'en'
      ? `Page ${page} of ${total}`
      : this.language.language === 'sq'
        ? `Faqja ${page} nga ${total}`
        : `Seite ${page} von ${total}`;
  }
  protected goToPage(page: number): void {
    this.navigate({ page: String(page) });
  }
  protected applyFilters(): void {
    if (this.areasEditing()) {
      this.filtersOpen.set(true);
      this.searchAreas()?.focusEditor();
      return;
    }
    const selectedAreas = this.areas.filter((area) => area.placeId);
    const valid =
      (!this.service || this.serviceIds.includes(this.service)) &&
      this.areas.length <= this.limits.maxAreas &&
      selectedAreas.every(
        (area) =>
          this.places.some((place) => place.id === area.placeId) &&
          Number.isInteger(Number(area.radiusKm)) &&
          area.radiusKm >= this.limits.minRadiusKm &&
          area.radiusKm <= this.limits.maxRadiusKm,
      );
    if (
      !valid ||
      new Set(selectedAreas.map((area) => area.placeId)).size !== selectedAreas.length
    ) {
      this.filterError.set(true);
      this.filtersOpen.set(true);
      return;
    }
    this.filterError.set(false);
    this.filtersOpen.set(false);
    this.navigate({
      all: selectedAreas.length ? null : 'true',
      places: selectedAreas.length
        ? selectedAreas.map((area) => `${area.placeId}:${area.radiusKm}`).join(',')
        : null,
      service: this.service || null,
      sort: this.sort,
      vehicleMake: this.vehicleMake || null,
      language: null,
      page: null,
    });
  }
  protected resetFilters(): void {
    this.areasEditing.set(false);
    this.areas = [];
    this.filterError.set(false);
    this.service = '';
    this.sort = 'recommended';
    this.vehicleMake = '';
    this.navigate({
      all: 'true',
      language: null,
      page: null,
      places: null,
      service: null,
      sort: this.sort,
      vehicleMake: null,
    });
  }
  protected async load(): Promise<void> {
    const version = ++this.loadVersion;
    this.state = 'loading';
    const query = new URLSearchParams();
    const params = this.route.snapshot.queryParamMap;
    for (const key of ['all', 'places', 'service', 'vehicleMake', 'sort', 'page']) {
      const value = params.get(key);
      if (value) query.set(key, value);
    }
    if (!query.has('places') && !query.has('service')) query.set('all', 'true');
    try {
      const result = await fetch(`/api/public/search?${query}`, { credentials: 'same-origin' });
      if (!result.ok) throw Error();
      const response = (await result.json()) as Response;
      if (version !== this.loadVersion) return;
      this.response = response;
      this.sort = response.sort;
      this.state = 'ready';
      this.analytics.track('search_results_displayed');
    } catch {
      if (version === this.loadVersion) this.state = 'error';
    } finally {
      if (version === this.loadVersion) this.changeDetector.markForCheck();
    }
  }
  private navigate(queryParams: Record<string, string | null>): void {
    void this.router.navigate([this.language.link('search')], {
      queryParams: { ...queryParams, language: null },
      queryParamsHandling: 'merge',
    });
  }
  private readFilters(): void {
    const q = this.route.snapshot.queryParamMap;
    const values = q
      .get('places')
      ?.split(',')
      .map((value) => {
        const [placeId, radius] = value.split(':');
        return { placeId, radiusKm: Number(radius) };
      })
      .filter((area) => area.placeId && Number.isFinite(area.radiusKm));
    this.areas = values?.length ? values : [];
    this.areasEditing.set(false);
    this.service = q.get('service') ?? '';
    this.filterError.set(false);
    this.sort = q.get('sort') === 'rating' ? 'rating' : 'recommended';
    this.vehicleMake = q.get('vehicleMake') ?? '';
  }
}
