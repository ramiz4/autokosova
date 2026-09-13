import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectorRef, Component, inject, PLATFORM_ID } from '@angular/core';
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
  readonly distanceKm: number;
  readonly id: string;
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
interface Area {
  placeId: string;
  radiusKm: number;
}

@Component({
  imports: [ButtonDirective, FormsModule, IconComponent, RouterLink, SiteHeaderComponent],
  selector: 'app-search-handoff',
  template: ` <main class="min-h-screen bg-[#f4f8fe] text-ink" aria-labelledby="search-title">
    <section
      class="relative isolate overflow-hidden bg-[#edf5ff] px-4 pt-4 sm:px-8 lg:px-12 lg:pt-6"
    >
      <div
        class="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(244,248,254,0.98)_0%,rgba(244,248,254,0.8)_44%,rgba(244,248,254,0.18)_100%),url('/images/search/search-hero-workshop.webp')] bg-cover bg-right"
      ></div>
      <app-site-header [active]="'search'" class="relative mx-auto block max-w-[1920px]" />
      <p
        lang="de"
        class="pointer-events-none absolute right-[31%] top-32 hidden max-w-52 -rotate-6 text-center font-serif text-4xl italic leading-tight text-brand-dark xl:block"
      >
        {{ ui('search.ui.slogan') }}
      </p>
      <div
        class="mx-auto grid max-w-[1920px] gap-7 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)] lg:items-end lg:py-16"
      >
        <div class="max-w-3xl">
          <p class="text-xs font-bold tracking-[.24em] text-brand-dark">
            {{ language.t('home.badge') }}
          </p>
          <h1 id="search-title" class="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
            {{ language.t('search.title') }}
          </h1>
          <p class="mt-4 max-w-2xl text-lg leading-relaxed text-slate-700">
            {{ ui('search.ui.heroIntro') }}
          </p>
          <ul class="mt-6 flex flex-wrap gap-x-7 gap-y-3 text-sm font-semibold text-brand-dark">
            <li class="flex items-center gap-2">
              <app-icon name="shield" class="size-6" />{{ language.t('profile.verified') }}
            </li>
            <li class="flex items-center gap-2">
              <app-icon name="thumb" class="size-6" />{{ language.t('landing.choiceBenefit') }}
            </li>
            <li class="flex items-center gap-2">
              <app-icon name="check" class="size-6" />{{ language.t('home.transparent.title') }}
            </li>
          </ul>
        </div>
        <form
          class="rounded-2xl border border-white/80 bg-white/95 p-3 shadow-xl shadow-slate-950/10"
          (ngSubmit)="applyFilters()"
          novalidate
        >
          <label class="sr-only" for="hero-place">{{ ui('search.ui.place') }}</label>
          <div class="flex flex-col gap-3 sm:flex-row">
            <span class="relative flex-1">
              <app-icon
                name="pin"
                class="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-brand-dark"
              />
              <select
                id="hero-place"
                [(ngModel)]="areas[0].placeId"
                name="hero-place"
                class="min-h-12 min-w-0 w-full rounded-xl border border-slate-300 bg-white py-2 pl-11 pr-3 font-semibold"
              >
                @for (place of places; track place.id) {
                  <option [value]="place.id">{{ place.label }}</option>
                }
              </select>
            </span>
            <button type="submit" appButton class="min-h-12 px-8">
              <app-icon name="search" class="size-5" />{{ language.t('nav.search') }}
            </button>
          </div>
        </form>
      </div>
    </section>
    @if (state === 'loading') {
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
    @if (state === 'ready' && response) {
      <section class="mx-auto max-w-[1920px] px-4 py-6 sm:px-8 lg:px-12">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3 xl:ml-[292px]">
          <p class="text-xl font-bold" role="status">
            {{ ui('search.ui.resultCount', { count: response.total }) }}
          </p>
          <label class="flex items-center gap-2 text-sm font-semibold"
            >{{ ui('search.ui.sort')
            }}<select
              [(ngModel)]="sort"
              name="sort"
              class="min-h-11 rounded-lg border border-slate-300 bg-white px-3"
              (change)="applyFilters()"
            >
              <option value="recommended">{{ ui('search.ui.sortRecommended') }}</option>
              <option value="rating">{{ ui('search.ui.sortRating') }}</option>
            </select></label
          >
        </div>
        <div class="grid gap-5 xl:grid-cols-[272px_minmax(0,1fr)]">
          <aside class="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
            <div class="flex items-center justify-between gap-3">
              <h2 class="font-bold">{{ ui('search.ui.filter') }}</h2>
              <button
                type="button"
                class="min-h-11 text-sm font-bold text-brand-dark underline"
                (click)="resetFilters()"
              >
                {{ ui('search.ui.clear') }}
              </button>
            </div>
            <div class="mt-5 grid gap-4">
              @for (area of areas; track $index; let index = $index) {
                <fieldset class="rounded-xl bg-blue-50/70 p-3">
                  <label class="grid gap-1 text-sm font-semibold"
                    >{{ ui('search.ui.place')
                    }}<select
                      [(ngModel)]="area.placeId"
                      [name]="'place-' + index"
                      class="min-h-11 rounded-lg border border-slate-300 bg-white px-2"
                    >
                      @for (place of places; track place.id) {
                        <option [value]="place.id">{{ place.label }}</option>
                      }
                    </select></label
                  ><label class="mt-3 grid gap-1 text-sm font-semibold"
                    >{{ ui('search.ui.radius')
                    }}<input
                      [(ngModel)]="area.radiusKm"
                      [name]="'radius-' + index"
                      type="number"
                      [min]="limits.minRadiusKm"
                      [max]="limits.maxRadiusKm"
                      class="min-h-11 rounded-lg border border-slate-300 bg-white px-2"
                  /></label>
                  <input
                    [(ngModel)]="area.radiusKm"
                    [name]="'radius-range-' + index"
                    type="range"
                    [min]="limits.minRadiusKm"
                    [max]="limits.maxRadiusKm"
                    class="mt-3 w-full accent-brand"
                  />
                  @if (areas.length > 1) {
                    <button
                      type="button"
                      class="mt-2 min-h-11 text-sm font-bold text-brand-dark underline"
                      (click)="removeArea(index)"
                    >
                      {{ ui('search.ui.removeArea') }}
                    </button>
                  }
                </fieldset>
              }
              @if (areas.length < limits.maxAreas) {
                <button
                  type="button"
                  class="min-h-11 text-left text-sm font-bold text-brand-dark underline"
                  (click)="addArea()"
                >
                  {{ ui('search.ui.addArea') }}
                </button>
              }
              <fieldset class="grid gap-1 text-sm font-semibold">
                <legend>{{ language.t('home.service') }}</legend>
                @for (entry of serviceIds; track entry) {
                  <label class="flex min-h-7 items-center gap-2 font-normal">
                    <input
                      type="checkbox"
                      [checked]="service === entry"
                      (change)="toggleService(entry)"
                      class="size-4 accent-brand"
                    />{{ language.serviceLabel(entry) }}
                  </label>
                }
              </fieldset>
              <label class="grid gap-1 text-sm font-semibold"
                >Marke<select
                  [(ngModel)]="vehicleMake"
                  name="vehicleMake"
                  class="min-h-11 rounded-lg border border-slate-300 bg-white px-2"
                >
                  <option value="">{{ language.t('profile.allMakes') }}</option>
                  @for (entry of makeIds; track entry) {
                    <option [value]="entry">{{ makeLabels[entry] }}</option>
                  }
                </select></label
              ><label class="grid gap-1 text-sm font-semibold"
                >Sprache<select
                  [(ngModel)]="spokenLanguage"
                  name="spokenLanguage"
                  class="min-h-11 rounded-lg border border-slate-300 bg-white px-2"
                >
                  <option value="">{{ language.t('common.optional') }}</option>
                  <option value="Deutsch">Deutsch</option>
                  <option value="Shqip">Shqip</option>
                  <option value="English">English</option>
                </select></label
              ><button type="button" appButton size="compact" (click)="applyFilters()">
                {{ ui('search.ui.apply') }}
              </button>
            </div>
          </aside>
          <section aria-label="Suchergebnisse">
            @if (!response.results.length) {
              <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 class="text-xl font-bold">{{ language.t('search.empty') }}</h2>
                <p class="mt-2 text-slate-700">{{ language.t('search.emptyBody') }}</p>
              </div>
            } @else {
              <ol class="grid gap-4">
                @for (workshop of response.results; track workshop.id; let index = $index) {
                  <li
                    class="grid gap-3 rounded-2xl border border-blue-100 bg-white p-2 shadow-sm transition hover:border-brand/30 hover:shadow-md sm:grid-cols-[205px_minmax(0,1fr)]"
                  >
                    <div class="relative min-h-[144px] overflow-hidden rounded-xl bg-slate-100">
                      @if (photoIds(workshop).length) {
                        <img
                          [src]="photoUrl(workshop)"
                          [alt]="workshop.name"
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
                      <div class="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h2 class="text-xl font-bold tracking-tight">{{ workshop.name }}</h2>
                          <p class="mt-1 text-sm text-slate-600">
                            {{
                              response.allResults
                                ? workshop.matchingPlace.label
                                : aerialDistance(workshop.distanceKm, workshop.matchingPlace.label)
                            }}
                          </p>
                        </div>
                        @if (workshop.companyDataVerified) {
                          <span
                            class="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-brand-dark"
                            >{{ language.t('profile.verified') }}</span
                          >
                        }
                      </div>
                      <p class="mt-2 text-sm font-semibold text-amber-700">
                        {{ reviewLabel(workshop.reviewSummary) }}
                      </p>
                      <ul class="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-brand-dark">
                        @for (reason of matchingReasons(workshop); track reason) {
                          <li class="rounded-full bg-blue-50 px-3 py-1">{{ reason }}</li>
                        }
                        @for (tag of specializations(workshop); track tag) {
                          <li class="rounded-full bg-slate-100 px-3 py-1">{{ tag }}</li>
                        }
                      </ul>
                      <a
                        [routerLink]="language.link('workshop', workshop.id)"
                        appButton="outline"
                        size="compact"
                        class="mt-4 sm:absolute sm:right-5 sm:top-1/2 sm:mt-0 sm:-translate-y-1/2"
                        >{{ ui('search.ui.details') }}<app-icon name="arrow" class="size-4"
                      /></a>
                    </div>
                  </li>
                }
              </ol>
            }
            @if (response.totalPages > 1) {
              <nav class="mt-6 flex items-center justify-between gap-3" aria-label="Ergebnisseiten">
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
          <aside class="hidden rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
            <div class="flex items-center justify-between gap-3">
              <h2 class="font-bold">{{ ui('search.ui.viewMap') }}</h2>
              <button
                type="button"
                class="min-h-11 text-sm font-bold text-brand-dark underline"
                (click)="mapOpen = !mapOpen"
              >
                {{ ui(mapOpen ? 'search.ui.hideMap' : 'search.ui.mapOpen') }}
              </button>
            </div>
            @if (mapOpen) {
              <div class="mt-4 rounded-xl border border-dashed border-blue-200 bg-blue-50 p-5">
                <app-icon name="shield" class="size-8 text-brand" />
                <h3 class="mt-3 font-bold">{{ ui('search.ui.mapDisabled') }}</h3>
                <p class="mt-2 text-sm leading-6 text-slate-700">
                  {{ ui('search.ui.mapDisabledBody') }}
                </p>
                <p class="mt-4 text-xs text-slate-500">{{ language.t('search.intro') }}</p>
              </div>
            }
          </aside>
        </div>
      </section>
    }
  </main>`,
})
export class SearchHandoffComponent {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly language = inject(LanguageService);
  protected readonly limits = REPAIR_REQUEST_LIMITS;
  protected readonly places = CATALOG_PLACES;
  protected readonly serviceIds = Object.keys(SERVICE_CATEGORY_LABELS);
  protected readonly makeIds = Object.keys(VEHICLE_MAKE_LABELS);
  protected readonly makeLabels = VEHICLE_MAKE_LABELS;
  protected areas: Area[] = [{ placeId: 'xk-pristina', radiusKm: 20 }];
  protected service = '';
  protected sort: 'recommended' | 'rating' = 'recommended';
  protected vehicleMake = '';
  protected spokenLanguage = '';
  protected mapOpen = true;
  protected response?: Response;
  protected state: 'error' | 'invalid' | 'loading' | 'ready' = 'loading';
  constructor() {
    this.language.setPage('search.title', 'search.intro', true);
    this.readFilters();
    if (this.browser) void this.load();
  }
  protected ui(key: string, replacements?: Record<string, string | number>): string {
    return this.language.t(key, replacements);
  }
  protected addArea(): void {
    this.areas.push({ placeId: 'xk-prizren', radiusKm: 20 });
  }

  protected toggleService(service: string): void {
    this.service = this.service === service ? '' : service;
  }
  protected removeArea(index: number): void {
    this.areas.splice(index, 1);
  }
  protected aerialDistance(distance: number, place: string): string {
    return this.language.t('search.aerialDistance', {
      distance: `${distance.toLocaleString(this.language.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`,
      place,
    });
  }
  protected matchingReasons(workshop: Result): readonly string[] {
    return workshop.reasons
      .filter((reason) => !reason.includes('Luftlinie'))
      .map((reason) =>
        reason === 'Unternehmensdaten geprüft' ? this.language.t('profile.verified') : reason,
      );
  }
  protected photoIds(workshop: Result): readonly string[] {
    return workshop.photoIds ?? [];
  }

  protected conceptImage(index: number): string {
    return `/images/search/cards/concept-${(index % 4) + 1}.webp`;
  }

  protected specializations(workshop: Result): readonly string[] {
    return workshop.selfReportedSpecializations ?? [];
  }

  protected photoUrl(workshop: Result): string {
    return `/api/public/workshops/${encodeURIComponent(workshop.id)}/photos/${encodeURIComponent(this.photoIds(workshop)[0])}`;
  }
  protected reviewLabel(summary: Result['reviewSummary']): string {
    return summary.state === 'available' && summary.averageRating && summary.reviewCount
      ? summary.label
      : this.language.t('profile.noReviews');
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
    const valid =
      (!this.service || this.serviceIds.includes(this.service)) &&
      this.areas.length > 0 &&
      this.areas.length <= this.limits.maxAreas &&
      this.areas.every(
        (area) =>
          this.places.some((place) => place.id === area.placeId) &&
          Number.isInteger(Number(area.radiusKm)) &&
          area.radiusKm >= this.limits.minRadiusKm &&
          area.radiusKm <= this.limits.maxRadiusKm,
      );
    if (!valid || new Set(this.areas.map((area) => area.placeId)).size !== this.areas.length) {
      this.state = 'invalid';
      return;
    }
    this.navigate({
      all: null,
      places: this.areas.map((area) => `${area.placeId}:${area.radiusKm}`).join(','),
      service: this.service || null,
      sort: this.sort,
      vehicleMake: this.vehicleMake || null,
      language: this.spokenLanguage || null,
      page: null,
    });
  }
  protected resetFilters(): void {
    this.areas = [{ placeId: 'xk-pristina', radiusKm: 20 }];
    this.service = '';
    this.sort = 'recommended';
    this.vehicleMake = '';
    this.spokenLanguage = '';
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
    if (!this.browser) return;
    this.state = 'loading';
    try {
      const result = await fetch(`/api/public/search${window.location.search || '?all=true'}`, {
        credentials: 'same-origin',
      });
      if (!result.ok) throw Error();
      this.response = (await result.json()) as Response;
      this.sort = this.response.sort;
      this.state = 'ready';
      this.analytics.track('search_results_displayed');
    } catch {
      this.state = 'error';
    } finally {
      this.changeDetector.markForCheck();
    }
  }
  private navigate(queryParams: Record<string, string | null>): void {
    void this.router.navigate([this.language.link('search')], {
      queryParams,
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
    if (values?.length) this.areas = values;
    this.service = q.get('service') ?? this.service;
    this.sort = q.get('sort') === 'rating' ? 'rating' : 'recommended';
    this.vehicleMake = q.get('vehicleMake') ?? '';
    this.spokenLanguage = q.get('language') ?? '';
  }
}
