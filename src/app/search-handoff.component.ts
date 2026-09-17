import {
  LucideArrowRight,
  LucideBadgeCheck,
  LucideChevronDown,
  LucideHeart,
  LucideMapPin,
  LucideStar,
  type LucideIcon,
} from '@lucide/angular';
import { FavoritesService } from './favorites.service';
import { FavoriteNoticeComponent } from './favorite-notice.component';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SearchAreasComponent, type SearchArea } from './ui/search-areas.component';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { BreakpointObserver } from '@angular/cdk/layout';
import {
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  BrnCollapsible,
  BrnCollapsibleContent,
  BrnCollapsibleTrigger,
} from '@spartan-ng/brain/collapsible';
import { map } from 'rxjs';
import { CATALOG_PLACES, SERVICE_CATEGORY_LABELS, VEHICLE_MAKE_LABELS } from '../shared/catalog';
import { REPAIR_REQUEST_LIMITS } from '../shared/repair-request';
import { localDemoPhotoPath } from '../shared/local-demo';
import { AnalyticsService } from './analytics.service';
import { LanguageService } from './language.service';
import { SiteHeaderComponent } from './site-header.component';
import { ButtonDirective } from './ui/button.directive';
import { LucideIconComponent } from './ui/lucide-icon.component';

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
    BrnCollapsible,
    BrnCollapsibleContent,
    BrnCollapsibleTrigger,
    SearchAreasComponent,
    ButtonDirective,
    FormsModule,
    FavoriteNoticeComponent,
    LucideIconComponent,
    RouterLink,
    SiteHeaderComponent,
  ],
  selector: 'app-search-handoff',
  template: ` <main class="min-h-screen bg-brand/5 text-ink" aria-labelledby="search-title">
    <div class="site-navbar-surface sticky top-0 z-50 px-3 lg:px-8">
      <app-site-header [compact]="true" active="search" />
    </div>
    <h1 id="search-title" class="sr-only">{{ language.t('search.title') }}</h1>
    @if (state === 'loading' && !response) {
      <section
        data-search-skeleton
        class="mx-auto w-[calc(100%-1.5rem)] max-w-340 px-4 py-6 sm:px-6 lg:w-[calc(100%-4rem)]"
        aria-hidden="true"
      >
        <div
          class="grid animate-pulse gap-5 motion-reduce:animate-none xl:grid-cols-[minmax(280px,320px)_minmax(0,1fr)]"
        >
          <div class="hidden h-105 rounded-2xl bg-white shadow-sm xl:block"></div>
          <div>
            <div class="mb-5 flex items-center justify-between gap-4">
              <span class="h-7 w-64 max-w-2/3 rounded-lg bg-slate-200"></span>
              <span class="h-11 w-44 rounded-xl bg-white"></span>
            </div>
            <div class="grid gap-4">
              @for (item of [0, 1, 2, 3]; track item) {
                <div
                  class="grid gap-3 rounded-2xl border border-blue-100 bg-white p-2 shadow-sm sm:grid-cols-[205px_minmax(0,1fr)]"
                >
                  <span class="h-48 rounded-xl bg-slate-200 sm:h-36"></span>
                  <span class="grid content-start gap-3 p-3">
                    <span class="h-6 w-2/3 rounded-md bg-slate-200"></span>
                    <span class="h-4 w-40 rounded bg-slate-100"></span>
                    <span class="h-4 w-52 rounded bg-slate-100"></span>
                    <span class="mt-2 h-8 w-28 rounded-lg bg-slate-100"></span>
                  </span>
                </div>
              }
            </div>
          </div>
        </div>
      </section>
      <p class="sr-only" role="status">{{ language.t('search.loading') }}</p>
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
        class="mx-auto w-[calc(100%-1.5rem)] max-w-340 px-4 py-6 sm:px-6 lg:w-[calc(100%-4rem)]"
      >
        @let expandedFilters = filtersExpanded();
        <div class="grid gap-5 xl:grid-cols-[minmax(280px,320px)_minmax(0,1fr)]">
          <aside
            brnCollapsible
            [expanded]="expandedFilters"
            (expandedChange)="onFiltersExpanded($event)"
            class="sticky top-20 z-10 max-h-[calc(100dvh-6rem)] self-start overflow-y-auto rounded-2xl border border-slate-200/80 bg-white px-5 py-3 shadow-sm shadow-slate-900/5"
          >
            <div
              class="flex min-h-11 items-center justify-between gap-3 border-slate-100 xl:min-h-10 xl:border-b xl:pb-2"
              [class.border-b]="expandedFilters"
              [class.pb-2]="expandedFilters"
            >
              <h2 id="filter-title" class="text-base font-bold tracking-tight">
                {{ ui('search.ui.filter') }}
              </h2>
              <button
                #filterToggle
                type="button"
                brnCollapsibleTrigger
                class="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-brand-dark xl:hidden"
              >
                {{ ui(expandedFilters ? 'search.ui.closeFilters' : 'search.ui.openFilters') }}
                <lucide-icon
                  [name]="ChevronDownIcon"
                  class="size-4"
                  [class.rotate-180]="expandedFilters"
                />
              </button>
            </div>
            <form
              #filterContent
              brnCollapsibleContent
              id="search-filters"
              aria-labelledby="filter-title"
              class="mt-4"
              [hidden]="!expandedFilters"
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
                      <div
                        class="relative h-48 min-h-36 overflow-hidden rounded-xl bg-slate-100 sm:h-36"
                      >
                        @if (photoIds(garage).length) {
                          <img
                            [src]="photoUrl(garage)"
                            [alt]="garage.name"
                            width="1280"
                            height="960"
                            decoding="async"
                            [attr.fetchpriority]="index === 0 ? 'high' : 'auto'"
                            [attr.loading]="index < 3 ? 'eager' : 'lazy'"
                            class="h-full w-full object-cover"
                          />
                        } @else {
                          <img
                            [src]="conceptImage(index)"
                            alt=""
                            width="1024"
                            height="768"
                            decoding="async"
                            [attr.loading]="index < 3 ? 'eager' : 'lazy'"
                            class="h-full min-h-36 w-full object-cover"
                          />
                          <span
                            class="absolute bottom-2 left-2 rounded bg-slate-950/75 px-2 py-1 text-xs font-bold text-white"
                            >Konzeptbild</span
                          >
                          <span class="sr-only">{{ ui('search.ui.noPhoto') }}</span>
                        }
                      </div>
                      <div class="relative p-3 sm:min-h-36 sm:pr-48">
                        <div class="flex items-center gap-2 pr-10 sm:pr-0">
                          <h2 class="min-w-0 text-xl font-bold tracking-tight wrap-break-word">
                            {{ garage.name }}
                          </h2>
                          @if (garage.companyDataVerified) {
                            <span
                              class="inline-flex size-5 shrink-0 text-brand"
                              role="img"
                              [title]="language.t('profile.verified')"
                              [attr.aria-label]="language.t('profile.verified')"
                            >
                              <lucide-icon [name]="BadgeCheckIcon" class="size-5" />
                            </span>
                          }
                        </div>
                        @if (hasReviews(garage)) {
                          <div class="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
                            <span class="rating-stars inline-flex gap-0.5" aria-hidden="true">
                              @for (star of [0, 1, 2, 3, 4]; track star) {
                                <span class="relative inline-flex size-3.5">
                                  <lucide-icon
                                    [name]="StarIcon"
                                    class="[--lucide-fill:currentColor] size-3.5 text-slate-200"
                                  />
                                  <span
                                    class="absolute inset-y-0 left-0 overflow-hidden"
                                    [style.width.%]="
                                      starFill(garage.reviewSummary.averageRating!, star)
                                    "
                                  >
                                    <lucide-icon
                                      [name]="StarIcon"
                                      class="[--lucide-fill:currentColor] absolute top-0 left-0 size-3.5 text-amber-500"
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
                          <lucide-icon [name]="MapPinIcon" class="size-4 text-brand-dark" />
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
                          class="absolute top-1 right-1 flex size-11 items-center justify-center rounded-full transition-colors hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
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
                          <lucide-icon
                            [name]="HeartIcon"
                            class="size-6"
                            [style.--lucide-fill]="
                              favorites.garageIds().has(garage.id) ? 'currentColor' : 'none'
                            "
                          />
                        </button>
                        <div
                          class="mt-4 flex justify-end pr-0.5 sm:absolute sm:right-3.5 sm:bottom-3 sm:mt-0 sm:pr-0"
                        >
                          <a
                            [routerLink]="language.link('garage', garage.id)"
                            [queryParams]="profileQueryParams()"
                            appButton="outline-brand"
                            size="compact"
                            >{{ ui('search.ui.details')
                            }}<lucide-icon [name]="ArrowRightIcon" class="size-4"
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
    <app-favorite-notice [loginUrl]="favoriteLoginUrl()" />
  </main>`,
})
export class SearchHandoffComponent {
  readonly ArrowRightIcon: LucideIcon = LucideArrowRight;
  readonly BadgeCheckIcon: LucideIcon = LucideBadgeCheck;
  readonly ChevronDownIcon: LucideIcon = LucideChevronDown;
  readonly HeartIcon: LucideIcon = LucideHeart;
  readonly MapPinIcon: LucideIcon = LucideMapPin;
  readonly StarIcon: LucideIcon = LucideStar;

  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly document = inject(DOCUMENT);
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
  private readonly wideFilters = toSignal(
    inject(BreakpointObserver)
      .observe('(min-width: 1280px)')
      .pipe(map((breakpoint) => breakpoint.matches)),
    { initialValue: false },
  );
  protected readonly filtersExpanded = computed(() => this.wideFilters() || this.filtersOpen());
  protected readonly areasEditing = signal(false);
  private readonly searchAreas = viewChild(SearchAreasComponent);
  private readonly filterContent = viewChild<ElementRef<HTMLElement>>('filterContent');
  private readonly filterToggle = viewChild<ElementRef<HTMLButtonElement>>('filterToggle');
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
    let wasWide = this.wideFilters();
    effect(() => {
      const isWide = this.wideFilters();
      if (
        this.browser &&
        wasWide &&
        !isWide &&
        !this.filtersOpen() &&
        this.filterContent()?.nativeElement.contains(this.document.activeElement)
      )
        this.filterToggle()?.nativeElement.focus();
      wasWide = isWide;
    });
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
  protected profileQueryParams(): Record<string, string> {
    const query: Record<string, string> = {};
    for (const key of ['all', 'places', 'service', 'vehicleMake', 'sort', 'page']) {
      const value = this.route.snapshot.queryParamMap.get(key);
      if (value) query[key] = value;
    }
    return query;
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
    const photoId = this.photoIds(garage)[0];
    return (
      localDemoPhotoPath(garage.id, photoId) ??
      `/api/public/garages/${encodeURIComponent(garage.id)}/photos/${encodeURIComponent(photoId)}`
    );
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
  protected onFiltersExpanded(expanded: boolean): void {
    if (!this.wideFilters()) this.filtersOpen.set(expanded);
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
