import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectorRef, Component, inject, PLATFORM_ID } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

interface SearchResult {
  readonly companyDataVerified: boolean;
  readonly distanceKm: number;
  readonly id: string;
  readonly matchingPlace: { readonly id: string; readonly label: string };
  readonly name: string;
  readonly reasons: readonly string[];
  readonly reviewSummary: { readonly label: string };
  readonly selfReportedSpecializations: readonly string[];
}

interface SearchResponse {
  readonly page: number;
  readonly pageSize: number;
  readonly results: readonly SearchResult[];
  readonly searchAreas: readonly { readonly label: string; readonly radiusKm: number }[];
  readonly serviceCategory: { readonly label: string };
  readonly total: number;
  readonly totalPages: number;
}

@Component({
  imports: [RouterLink],
  selector: 'app-search-handoff',
  template: `
    <main
      class="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6 sm:py-12"
      aria-labelledby="search-title"
    >
      <a routerLink="/" class="text-sm font-semibold text-sky-800 underline">Zur Startseite</a>
      <p class="mt-6 text-sm font-bold tracking-widest text-sky-700 uppercase">Werkstattsuche</p>
      <h1 id="search-title" class="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        Passende Werkstätten
      </h1>
      <p class="mt-3 max-w-3xl leading-7 text-slate-700">
        Der Suchkreis ist eine Luftlinie. Mehrere Orte werden zusammen berücksichtigt; eine
        Werkstatt erscheint nur einmal. Fahrzeug-, Reise- und Dateiangaben werden nicht an
        Werkstätten gesendet.
      </p>

      @if (state === 'loading') {
        <p
          class="mt-8 rounded-xl border border-slate-200 bg-white p-5 text-slate-700"
          role="status"
        >
          Suche wird geladen …
        </p>
      }

      @if (state === 'invalid') {
        <section
          class="mt-8 rounded-xl border border-amber-300 bg-amber-50 p-5"
          aria-labelledby="invalid-title"
        >
          <h2 id="invalid-title" class="text-xl font-bold">Suchangaben fehlen</h2>
          <p class="mt-2 leading-7 text-slate-700">
            Wähle bitte Leistung, Ort und Radius. Wir erweitern den Suchkreis nicht stillschweigend.
          </p>
          <a
            routerLink="/anfrage"
            class="mt-4 inline-flex min-h-11 items-center font-semibold text-sky-800 underline"
            >Suche starten</a
          >
        </section>
      }

      @if (state === 'error') {
        <section
          class="mt-8 rounded-xl border border-rose-300 bg-rose-50 p-5"
          aria-labelledby="search-error-title"
        >
          <h2 id="search-error-title" class="text-xl font-bold">
            Ergebnisse sind gerade nicht verfügbar
          </h2>
          <p class="mt-2 leading-7 text-slate-700">
            Bitte versuche es erneut oder passe deine Filter an. Es wurde keine Anfrage an eine
            Werkstatt gesendet.
          </p>
          <button
            type="button"
            class="mt-4 min-h-11 rounded-lg border border-sky-800 px-4 font-semibold text-sky-900"
            (click)="load()"
          >
            Erneut suchen
          </button>
        </section>
      }

      @if (state === 'ready' && response) {
        <section
          class="mt-8 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          aria-label="Aktive Filter"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="font-bold">{{ response.serviceCategory.label }}</h2>
              <p class="mt-1 text-sm text-slate-700">
                @for (area of response.searchAreas; track area.label; let last = $last) {
                  {{ area.label }} · {{ area.radiusKm }} km Luftlinie
                  @if (!last) {
                    ,
                  }
                }
              </p>
            </div>
            <a
              routerLink="/anfrage"
              class="inline-flex min-h-11 items-center font-semibold text-sky-800 underline"
              >Filter anpassen</a
            >
          </div>
        </section>

        <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p class="font-semibold" role="status">
            {{ response.total }} {{ response.total === 1 ? 'Werkstatt' : 'Werkstätten' }} gefunden
          </p>
          <button
            type="button"
            class="min-h-11 rounded-lg border border-slate-300 px-4 font-semibold text-slate-800"
            (click)="showMapFallback()"
          >
            Karte anzeigen
          </button>
        </div>

        @if (mapUnavailable) {
          <p
            class="mt-4 rounded-xl border border-slate-200 bg-slate-100 p-4 text-sm leading-6 text-slate-700"
            role="status"
          >
            Die Kartenansicht ist derzeit nicht verfügbar. Die Ergebnisliste funktioniert weiterhin
            vollständig; Entfernungen bleiben als Luftlinie zum passenden Suchort gekennzeichnet.
          </p>
        }

        @if (!response.results.length) {
          <section
            class="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            aria-labelledby="empty-title"
          >
            <h2 id="empty-title" class="text-xl font-bold">
              Keine Werkstatt im gewählten Suchkreis
            </h2>
            <p class="mt-2 max-w-2xl leading-7 text-slate-700">
              Passe Leistung oder Ort an oder wähle bewusst einen grösseren Radius. Wir zeigen nicht
              automatisch weiter entfernte Betriebe.
            </p>
            <a
              routerLink="/anfrage"
              class="mt-4 inline-flex min-h-11 items-center font-semibold text-sky-800 underline"
              >Filter anpassen</a
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
                      {{ distance(workshop.distanceKm) }} Luftlinie zu
                      {{ workshop.matchingPlace.label }}
                    </p>
                  </div>
                  @if (workshop.companyDataVerified) {
                    <span
                      class="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-900"
                      >Unternehmensdaten geprüft</span
                    >
                  }
                </div>
                <p class="mt-4 font-semibold text-slate-900">Warum passend</p>
                <ul class="mt-2 flex flex-wrap gap-2 text-sm text-slate-700">
                  @for (reason of workshop.reasons; track reason) {
                    <li class="rounded-full bg-sky-50 px-3 py-1">{{ reason }}</li>
                  }
                </ul>
                @if (workshop.selfReportedSpecializations.length) {
                  <p class="mt-4 text-sm leading-6 text-slate-700">
                    <span class="font-semibold">Selbstauskunft:</span>
                    {{ workshop.selfReportedSpecializations.join(', ') }}
                  </p>
                }
                <p class="mt-4 text-sm leading-6 text-slate-700">
                  {{ workshop.reviewSummary.label }}
                </p>
                <a
                  [routerLink]="['/werkstatt', workshop.id]"
                  class="mt-5 inline-flex min-h-11 items-center font-semibold text-sky-800 underline"
                  >Profil ansehen</a
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
              Zurück
            </button>
            <p class="text-sm text-slate-700">
              Seite {{ response.page }} von {{ response.totalPages }}
            </p>
            <button
              type="button"
              class="min-h-11 rounded-lg border border-slate-300 px-4 font-semibold disabled:text-slate-400"
              [disabled]="response.page === response.totalPages"
              (click)="goToPage(response.page + 1)"
            >
              Weiter
            </button>
          </nav>
        }
      }
    </main>
  `,
})
export class SearchHandoffComponent {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  protected mapUnavailable = false;
  protected response?: SearchResponse;
  protected state: 'error' | 'invalid' | 'loading' | 'ready' = 'loading';

  constructor() {
    if (!this.hasRequiredFilters()) {
      this.state = 'invalid';
    } else if (this.browser) {
      void this.load();
    }
  }

  protected distance(distanceKm: number): string {
    return `${distanceKm.toLocaleString('de-CH', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km`;
  }

  protected goToPage(page: number): void {
    const query = new URLSearchParams(window.location.search);
    query.set('page', String(page));
    window.location.assign(`/suche?${query.toString()}`);
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
