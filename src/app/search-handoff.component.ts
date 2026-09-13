import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectorRef, Component, inject, PLATFORM_ID } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AnalyticsService } from './analytics.service';
import { LanguageService } from './language.service';
import { LanguageSwitcherComponent } from './language-switcher.component';

interface SearchResult {
  readonly companyDataVerified: boolean;
  readonly distanceKm: number;
  readonly id: string;
  readonly matchingPlace: { readonly id: string; readonly label: string };
  readonly name: string;
  readonly reasons: readonly string[];
  readonly reviewSummary: {
    readonly averageRating?: number;
    readonly label: string;
    readonly reviewCount?: number;
    readonly state?: 'available' | 'unavailable';
  };
  readonly selfReportedSpecializations: readonly string[];
}

interface SearchResponse {
  readonly page: number;
  readonly pageSize: number;
  readonly results: readonly SearchResult[];
  readonly searchAreas: readonly { readonly label: string; readonly radiusKm: number }[];
  readonly serviceCategory: { readonly id: string; readonly label: string };
  readonly total: number;
  readonly totalPages: number;
}

@Component({
  imports: [RouterLink, LanguageSwitcherComponent],
  selector: 'app-search-handoff',
  template: `
    <main
      class="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6 sm:py-12"
      aria-labelledby="search-title"
    >
      <header class="flex flex-wrap items-center justify-between gap-4">
        <a
          [routerLink]="language.link('home')"
          class="text-sm font-semibold text-sky-800 underline"
          >{{ language.t('common.backHome') }}</a
        >
        <app-language-switcher />
      </header>
      <p class="mt-6 text-sm font-bold tracking-widest text-sky-700 uppercase">
        {{ language.t('home.badge') }}
      </p>
      <h1 id="search-title" class="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        {{ language.t('search.title') }}
      </h1>
      <p class="mt-3 max-w-3xl leading-7 text-slate-700">
        {{ language.t('search.intro') }}
      </p>

      @if (state === 'loading') {
        <p
          class="mt-8 rounded-xl border border-slate-200 bg-white p-5 text-slate-700"
          role="status"
        >
          {{ language.t('search.loading') }}
        </p>
      }

      @if (state === 'invalid') {
        <section
          class="mt-8 rounded-xl border border-amber-300 bg-amber-50 p-5"
          aria-labelledby="invalid-title"
        >
          <h2 id="invalid-title" class="text-xl font-bold">{{ language.t('search.invalid') }}</h2>
          <p class="mt-2 leading-7 text-slate-700">
            {{ language.t('search.invalidBody') }}
          </p>
          <a
            [routerLink]="language.link('request')"
            class="mt-4 inline-flex min-h-11 items-center font-semibold text-sky-800 underline"
            >{{ language.t('home.search') }}</a
          >
        </section>
      }

      @if (state === 'error') {
        <section
          class="mt-8 rounded-xl border border-rose-300 bg-rose-50 p-5"
          aria-labelledby="search-error-title"
        >
          <h2 id="search-error-title" class="text-xl font-bold">
            {{ language.t('search.error') }}
          </h2>
          <p class="mt-2 leading-7 text-slate-700">
            {{ language.t('search.errorBody') }}
          </p>
          <button
            type="button"
            class="mt-4 min-h-11 rounded-lg border border-sky-800 px-4 font-semibold text-sky-900"
            (click)="load()"
          >
            {{ language.t('common.retry') }}
          </button>
        </section>
      }

      @if (state === 'ready' && response) {
        <section
          class="mt-8 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          [attr.aria-label]="language.t('search.activeFilters')"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="font-bold">{{ language.serviceLabel(response.serviceCategory.id) }}</h2>
              <p class="mt-1 text-sm text-slate-700">
                @for (area of response.searchAreas; track area.label; let last = $last) {
                  {{ radiusLabel(area.radiusKm, area.label) }}
                  @if (!last) {
                    ,
                  }
                }
              </p>
            </div>
            <a
              [routerLink]="language.link('request')"
              class="inline-flex min-h-11 items-center font-semibold text-sky-800 underline"
              >{{ language.t('search.adjust') }}</a
            >
          </div>
        </section>

        <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p class="font-semibold" role="status">
            {{ response.total }}
            {{
              response.total === 1 ? language.t('search.foundOne') : language.t('search.foundMany')
            }}
          </p>
          <button
            type="button"
            class="min-h-11 rounded-lg border border-slate-300 px-4 font-semibold text-slate-800"
            (click)="showMapFallback()"
          >
            {{ language.t('search.map') }}
          </button>
        </div>

        @if (mapUnavailable) {
          <p
            class="mt-4 rounded-xl border border-slate-200 bg-slate-100 p-4 text-sm leading-6 text-slate-700"
            role="status"
          >
            {{ language.t('search.mapUnavailable') }}
          </p>
        }

        @if (!response.results.length) {
          <section
            class="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            aria-labelledby="empty-title"
          >
            <h2 id="empty-title" class="text-xl font-bold">
              {{ language.t('search.empty') }}
            </h2>
            <p class="mt-2 max-w-2xl leading-7 text-slate-700">
              {{ language.t('search.emptyBody') }}
            </p>
            <a
              [routerLink]="language.link('request')"
              class="mt-4 inline-flex min-h-11 items-center font-semibold text-sky-800 underline"
              >{{ language.t('search.adjust') }}</a
            >
          </section>
        } @else {
          <ol class="mt-6 grid gap-4" aria-label="Suchergebnisse">
            @for (workshop of response.results; track workshop.id) {
              <li class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 class="text-xl font-bold">{{ workshop.name }}</h2>
                    <p class="mt-1 text-sm text-slate-700">
                      {{ aerialDistance(workshop.distanceKm, workshop.matchingPlace.label) }}
                    </p>
                  </div>
                  @if (workshop.companyDataVerified) {
                    <span
                      class="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-900"
                      >{{ language.t('profile.verified') }}</span
                    >
                  }
                </div>
                <p class="mt-4 font-semibold text-slate-900">{{ language.t('search.why') }}</p>
                <ul class="mt-2 flex flex-wrap gap-2 text-sm text-slate-700">
                  @for (reason of matchingReasons(workshop); track reason) {
                    <li class="rounded-full bg-sky-50 px-3 py-1">{{ reason }}</li>
                  }
                </ul>
                @if (workshop.selfReportedSpecializations.length) {
                  <p class="mt-4 text-sm leading-6 text-slate-700">
                    <span class="font-semibold">{{ language.t('search.selfReported') }}</span>
                    {{ workshop.selfReportedSpecializations.join(', ') }}
                  </p>
                }
                <p class="mt-4 text-sm leading-6 text-slate-700">
                  {{ reviewLabel(workshop.reviewSummary) }}
                </p>
                <a
                  [routerLink]="language.link('workshop', workshop.id)"
                  class="mt-5 inline-flex min-h-11 items-center font-semibold text-sky-800 underline"
                  >{{ language.t('search.profile') }}</a
                >
              </li>
            }
          </ol>
        }

        @if (response.totalPages > 1) {
          <nav class="mt-8 flex items-center justify-between gap-4" aria-label="Ergebnisseiten">
            <button
              type="button"
              class="min-h-11 rounded-lg border border-slate-300 px-4 font-semibold disabled:text-slate-400"
              [disabled]="response.page === 1"
              (click)="goToPage(response.page - 1)"
            >
              {{ language.t('search.previous') }}
            </button>
            <p class="text-sm text-slate-700">
              {{ pageLabel(response.page, response.totalPages) }}
            </p>
            <button
              type="button"
              class="min-h-11 rounded-lg border border-slate-300 px-4 font-semibold disabled:text-slate-400"
              [disabled]="response.page === response.totalPages"
              (click)="goToPage(response.page + 1)"
            >
              {{ language.t('search.next') }}
            </button>
          </nav>
        }
      }
    </main>
  `,
})
export class SearchHandoffComponent {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly analytics = inject(AnalyticsService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  protected readonly language = inject(LanguageService);
  private readonly route = inject(ActivatedRoute);
  protected mapUnavailable = false;
  protected response?: SearchResponse;
  protected state: 'error' | 'invalid' | 'loading' | 'ready' = 'loading';

  constructor() {
    this.language.setPage('search.title', 'search.intro', true);
    if (!this.hasRequiredFilters()) {
      this.state = 'invalid';
    } else if (this.browser) {
      void this.load();
    }
  }

  protected distance(distanceKm: number): string {
    return `${distanceKm.toLocaleString(this.language.language, { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km`;
  }

  protected aerialDistance(distanceKm: number, place: string): string {
    return this.language.t('search.aerialDistance', { distance: this.distance(distanceKm), place });
  }

  protected radiusLabel(radiusKm: number, place: string): string {
    return this.language.t('search.radius', { distance: `${radiusKm} km`, place });
  }

  protected pageLabel(page: number, totalPages: number): string {
    if (this.language.language === 'en') return `Page ${page} of ${totalPages}`;
    if (this.language.language === 'sq') return `Faqja ${page} nga ${totalPages}`;
    return `Seite ${page} von ${totalPages}`;
  }

  protected reviewLabel(summary: SearchResult['reviewSummary']): string {
    if (summary.state !== 'available' || !summary.averageRating || !summary.reviewCount) {
      return this.language.t('profile.noReviews');
    }
    const count = summary.reviewCount;
    if (this.language.language === 'en') {
      return `${summary.averageRating.toFixed(1)} / 5 · ${count} ${count === 1 ? 'review' : 'reviews'}`;
    }
    if (this.language.language === 'sq') {
      return `${summary.averageRating.toFixed(1)} / 5 · ${count} ${count === 1 ? 'vlerësim' : 'vlerësime'}`;
    }
    return summary.label;
  }

  protected matchingReasons(workshop: SearchResult): readonly string[] {
    return workshop.reasons.flatMap((reason) => {
      if (reason.startsWith('Leistung:')) {
        return [
          this.language.t('search.reasonService', {
            service: this.response
              ? this.language.serviceLabel(this.response.serviceCategory.id)
              : reason.slice('Leistung:'.length).trim(),
          }),
        ];
      }
      if (reason === 'Markenoffen') return [this.language.t('search.reasonAnyMake')];
      if (reason.startsWith('Sprache:')) {
        return [
          this.language.t('search.reasonLanguage', {
            language: reason.slice('Sprache:'.length).trim(),
          }),
        ];
      }
      if (reason === 'Unternehmensdaten geprüft') return [this.language.t('profile.verified')];
      // The same distance is already rendered immediately next to the profile name.
      if (reason.includes('Luftlinie')) return [];
      return [reason];
    });
  }

  protected goToPage(page: number): void {
    const query = new URLSearchParams(window.location.search);
    query.set('page', String(page));
    window.location.assign(`${this.language.link('search')}?${query.toString()}`);
  }

  protected async load(): Promise<void> {
    if (!this.browser || !this.hasRequiredFilters()) return;
    this.state = 'loading';
    try {
      const response = await fetch(`/api/public/search${window.location.search}`, {
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Search request failed');
      this.response = (await response.json()) as SearchResponse;
      this.state = 'ready';
      this.analytics.track('search_results_displayed');
      this.changeDetector.markForCheck();
    } catch {
      this.state = 'error';
      this.changeDetector.markForCheck();
    }
  }

  protected showMapFallback(): void {
    // A map provider has not been configured. Keep the list usable when the optional map is absent.
    this.mapUnavailable = true;
  }

  private hasRequiredFilters(): boolean {
    return Boolean(
      this.route.snapshot.queryParamMap.get('places') &&
      this.route.snapshot.queryParamMap.get('service'),
    );
  }
}
