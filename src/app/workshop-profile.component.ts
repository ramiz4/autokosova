import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  inject,
  PendingTasks,
  PLATFORM_ID,
  REQUEST,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { getCatalogPlace, SERVICE_CATEGORY_LABELS, VEHICLE_MAKE_LABELS } from '../shared/catalog';
import {
  buildContactPreview,
  buildTelephoneHref,
  buildWhatsAppHref,
} from '../shared/contact-preview';
import { AnalyticsService } from './analytics.service';
import { LanguageService } from './language.service';
import { LanguageSwitcherComponent } from './language-switcher.component';

interface PublicWorkshopProfile {
  readonly contact: { readonly phone?: string };
  readonly description?: string;
  readonly id: string;
  readonly languages: readonly string[];
  readonly name: string;
  readonly photoIds: readonly string[];
  readonly placeId: string;
  readonly reviewSummary?: PublicReviewSummary;
  readonly selfReportedSpecializations: readonly string[];
  readonly serviceCategoryIds: readonly string[];
  readonly vehicleMakeIds: readonly string[];
  readonly verificationLabel?: 'Unternehmensdaten geprüft';
}

interface PublicReviewSummary {
  readonly averageRating?: number;
  readonly label: string;
  readonly reviewCount: number;
  readonly state: 'available' | 'unavailable';
  readonly verifiedVisitCount: number;
}

interface PublicWorkshopReview {
  readonly evidence: { readonly label: string };
  readonly id: string;
  readonly ratings: {
    readonly communication: number;
    readonly overall: number;
    readonly priceTransparency: number;
    readonly punctuality: number;
    readonly workQuality: number;
  };
  readonly serviceCategoryId: string;
  readonly text: string;
  readonly updates: readonly {
    readonly createdAt: string;
    readonly kind: string;
    readonly text: string;
  }[];
  readonly vehicleMakeId?: string;
  readonly visitMonth: string;
  readonly workshopResponse?: { readonly createdAt: string; readonly text: string };
}

@Component({
  imports: [FormsModule, RouterLink, LanguageSwitcherComponent],
  selector: 'app-workshop-profile',
  template: `
    <main
      class="mx-auto min-h-screen max-w-4xl px-4 py-8 pb-28 sm:px-6 sm:py-12"
      aria-labelledby="profile-title"
    >
      <header class="flex flex-wrap items-center justify-between gap-4">
        <a
          [routerLink]="language.link('search')"
          class="text-sm font-semibold text-sky-800 underline"
          >{{ language.t('common.backSearch') }}</a
        >
        <app-language-switcher />
      </header>

      @if (state === 'loading') {
        <p
          class="mt-8 rounded-xl border border-slate-200 bg-white p-5 text-slate-700"
          role="status"
        >
          {{ language.t('profile.loading') }}
        </p>
      }

      @if (state === 'error') {
        <section
          class="mt-8 rounded-xl border border-rose-300 bg-rose-50 p-5"
          aria-labelledby="profile-error-title"
        >
          <h1 id="profile-error-title" class="text-xl font-bold">
            {{ language.t('profile.notAvailable') }}
          </h1>
          <p class="mt-2 leading-7 text-slate-700">
            {{ language.t('profile.notAvailableBody') }}
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

      @if (state === 'ready' && profile) {
        <header class="mt-6">
          <p class="text-sm font-bold tracking-widest text-sky-700 uppercase">
            {{ language.t('profile.profile') }}
          </p>
          <div class="mt-2 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 id="profile-title" class="text-3xl font-bold tracking-tight sm:text-4xl">
                {{ profile.name }}
              </h1>
              <p class="mt-2 text-slate-700">{{ placeLabel(profile.placeId) }}</p>
            </div>
            @if (profile.verificationLabel) {
              <span
                class="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-900"
              >
                {{ language.t('profile.verified') }}
              </span>
            }
          </div>
        </header>

        <section
          class="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
          aria-labelledby="trust-title"
        >
          <h2 id="trust-title" class="text-xl font-bold">{{ language.t('profile.trust') }}</h2>
          @if (profile.verificationLabel) {
            <p class="mt-3 leading-7 text-slate-700">
              {{ language.t('profile.trustAvailable') }}
            </p>
          } @else {
            <p class="mt-3 leading-7 text-slate-700">
              {{ language.t('profile.trustUnavailable') }}
            </p>
          }
          @if (profile.reviewSummary?.state === 'available') {
            <p class="mt-4 font-semibold text-slate-900">{{ profile.reviewSummary?.label }}</p>
            <p class="mt-1 text-sm leading-6 text-slate-700">
              {{ language.t('profile.ratingDescription') }}
            </p>
          } @else {
            <p class="mt-4 font-semibold text-slate-900">{{ language.t('profile.noReviews') }}</p>
            <p class="mt-1 text-sm leading-6 text-slate-700">
              {{ language.t('profile.noReviewsBody') }}
            </p>
          }
        </section>

        <section
          class="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
          aria-labelledby="reviews-title"
        >
          <div class="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="reviews-title" class="text-xl font-bold">
                {{ language.t('profile.reviews') }}
              </h2>
              <p class="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
                {{ language.t('profile.visitProof') }}
              </p>
              <p class="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
                {{ language.t('profile.reviewsOriginal') }}
              </p>
            </div>
            <button
              type="button"
              class="min-h-11 rounded-lg border border-sky-800 px-4 font-semibold text-sky-900"
              (click)="loadReviews()"
            >
              {{ language.t('profile.filterReviews') }}
            </button>
          </div>
          <div class="mt-4 grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1 font-semibold"
              >{{ language.t('profile.filterService') }}
              <select
                [(ngModel)]="reviewServiceCategoryId"
                class="min-h-11 rounded-lg border border-slate-300 bg-white px-3 font-normal"
              >
                <option value="">{{ language.t('profile.allServices') }}</option>
                @for (service of profile.serviceCategoryIds; track service) {
                  <option [value]="service">{{ serviceLabels([service]) }}</option>
                }
              </select>
            </label>
            <label class="grid gap-1 font-semibold"
              >{{ language.t('profile.filterMake') }}
              <select
                [(ngModel)]="reviewVehicleMakeId"
                class="min-h-11 rounded-lg border border-slate-300 bg-white px-3 font-normal"
              >
                <option value="">{{ language.t('profile.allMakes') }}</option>
                @for (make of vehicleMakeOptions; track make[0]) {
                  <option [value]="make[0]">{{ make[1] }}</option>
                }
              </select>
            </label>
          </div>
          @if (reviewState === 'error') {
            <p
              class="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-slate-800"
            >
              {{ language.t('profile.reviewsUnavailable') }}
            </p>
          } @else if (reviewState === 'loading') {
            <p class="mt-4 text-sm text-slate-700" role="status">
              {{ language.t('profile.reviewsLoading') }}
            </p>
          } @else if (!reviews.length) {
            <p class="mt-4 text-sm leading-6 text-slate-700">
              {{ language.t('profile.reviewsEmpty') }}
            </p>
          } @else {
            <ol class="mt-5 grid gap-4" aria-label="Veröffentlichte Bewertungen">
              @for (review of reviews; track review.id) {
                <li class="rounded-xl border border-slate-200 p-4">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p class="font-semibold">
                        {{ review.ratings.overall.toFixed(1) }} von 5 ·
                        {{ serviceLabels([review.serviceCategoryId]) }}
                      </p>
                      <p class="mt-1 text-sm text-slate-700">
                        Besuch: {{ review.visitMonth }}
                        @if (review.vehicleMakeId) {
                          · {{ vehicleMakeLabels([review.vehicleMakeId]) }}
                        }
                      </p>
                    </div>
                    <span
                      class="rounded-full bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-950"
                    >
                      {{ review.evidence.label }}
                    </span>
                  </div>
                  <p class="mt-4 leading-7 text-slate-800">{{ review.text }}</p>
                  <p class="mt-3 text-sm text-slate-700">
                    Arbeitsqualität {{ review.ratings.workQuality }}/5 · Kommunikation
                    {{ review.ratings.communication }}/5 · Preistransparenz
                    {{ review.ratings.priceTransparency }}/5 · Termintreue
                    {{ review.ratings.punctuality }}/5
                  </p>
                  @if (review.workshopResponse) {
                    <div class="mt-4 border-l-4 border-sky-200 pl-4">
                      <p class="font-semibold">Öffentliche Antwort der Werkstatt</p>
                      <p class="mt-1 leading-7 text-slate-700">
                        {{ review.workshopResponse.text }}
                      </p>
                    </div>
                  }
                  @if (review.updates.length) {
                    <div class="mt-4 border-l-4 border-slate-200 pl-4">
                      <p class="font-semibold">Nachvollziehbare Updates</p>
                      @for (update of review.updates; track update.createdAt) {
                        <p class="mt-1 text-sm leading-6 text-slate-700">
                          {{ update.kind === 'rework' ? 'Nacharbeit' : 'Reklamation' }}:
                          {{ update.text }}
                        </p>
                      }
                    </div>
                  }
                </li>
              }
            </ol>
          }
        </section>

        <section
          class="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
          aria-labelledby="details-title"
        >
          <h2 id="details-title" class="text-xl font-bold">{{ language.t('profile.details') }}</h2>
          @if (profile.description) {
            <p class="mt-3 leading-7 text-slate-700">{{ profile.description }}</p>
            <p class="mt-1 text-sm text-slate-600">{{ language.t('profile.originalText') }}</p>
          }
          <dl class="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <dt class="font-semibold">Leistungen</dt>
              <dd class="mt-1 text-slate-700">{{ serviceLabels(profile.serviceCategoryIds) }}</dd>
            </div>
            <div>
              <dt class="font-semibold">Fahrzeugbezug</dt>
              <dd class="mt-1 text-slate-700">{{ vehicleMakeLabels(profile.vehicleMakeIds) }}</dd>
            </div>
            <div>
              <dt class="font-semibold">{{ language.t('profile.language') }}</dt>
              <dd class="mt-1 text-slate-700">{{ profile.languages.join(', ') }}</dd>
            </div>
            <div>
              <dt class="font-semibold">Spezialisierungen</dt>
              <dd class="mt-1 text-slate-700">
                {{
                  profile.selfReportedSpecializations.length
                    ? profile.selfReportedSpecializations.join(', ')
                    : 'Keine Selbstauskunft veröffentlicht'
                }}
              </dd>
            </div>
          </dl>
        </section>

        <section
          class="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
          aria-labelledby="photos-title"
        >
          <h2 id="photos-title" class="text-xl font-bold">{{ language.t('profile.photos') }}</h2>
          @if (profile.photoIds.length) {
            <div class="mt-4 grid gap-4 sm:grid-cols-2">
              @for (photoId of profile.photoIds; track photoId) {
                <img
                  [src]="'/api/public/workshops/' + profile.id + '/photos/' + photoId"
                  [alt]="'Veröffentlichtes Foto von ' + profile.name"
                  class="aspect-[4/3] w-full rounded-xl object-cover"
                />
              }
            </div>
          } @else {
            <p class="mt-3 text-slate-700">{{ language.t('profile.noPhotos') }}</p>
          }
        </section>

        <section
          id="kontakt"
          class="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-5 shadow-sm sm:p-7"
          aria-labelledby="contact-title"
        >
          <h2 id="contact-title" class="text-xl font-bold">{{ language.t('contact.title') }}</h2>
          <p class="mt-2 max-w-2xl leading-7 text-slate-700">
            {{ language.t('contact.description') }}
          </p>

          <fieldset class="mt-6 rounded-xl border border-sky-200 bg-white p-4">
            <legend class="px-1 font-semibold">{{ language.t('profile.contactConsent') }}</legend>
            <label class="mt-2 flex min-h-11 items-start gap-3 text-slate-800">
              <input class="mt-1 size-5" [(ngModel)]="includeDetails" type="checkbox" />
              <span>
                {{ language.t('profile.contactConsentBody') }}
              </span>
            </label>
            <p class="mt-3 text-sm leading-6 text-slate-700">
              {{ language.t('contact.userTextNote') }}
            </p>
            @if (includeDetails) {
              <div class="mt-4 grid gap-4">
                <label class="grid gap-1 font-semibold"
                  >Fahrzeug <span class="font-normal text-slate-600">optional</span>
                  <input
                    [(ngModel)]="vehicleSummary"
                    maxlength="120"
                    autocomplete="off"
                    class="min-h-11 rounded-lg border border-slate-300 px-3"
                    placeholder="Zum Beispiel: Škoda Octavia, 2018"
                  />
                </label>
                <label class="grid gap-1 font-semibold"
                  >Anliegen <span class="font-normal text-slate-600">optional</span>
                  <textarea
                    [(ngModel)]="repairSummary"
                    maxlength="500"
                    rows="4"
                    class="rounded-lg border border-slate-300 p-3"
                    placeholder="Zum Beispiel: Bremsen prüfen lassen"
                  ></textarea>
                </label>
              </div>
            }
          </fieldset>

          <label class="mt-6 grid gap-1 font-semibold"
            >{{ language.t('profile.messageDraft') }}
            <textarea
              class="rounded-lg border border-slate-300 bg-slate-50 p-3 font-normal leading-6 text-slate-800"
              [value]="contactPreview()"
              readonly
              rows="7"
            ></textarea>
          </label>

          @if (telephoneHref()) {
            <div class="mt-5 flex flex-wrap gap-3">
              @if (whatsAppHref()) {
                <a
                  [href]="whatsAppHref()"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex min-h-11 items-center rounded-lg bg-emerald-700 px-5 font-semibold text-white"
                  (click)="contactOpened()"
                  >{{ language.t('contact.openWhatsapp') }}</a
                >
              }
              <a
                [href]="telephoneHref()"
                class="inline-flex min-h-11 items-center rounded-lg border border-sky-800 px-5 font-semibold text-sky-950"
                (click)="contactOpened()"
                >{{ language.t('contact.call') }}</a
              >
            </div>
            <p class="mt-3 text-sm leading-6 text-slate-700">
              Falls WhatsApp nicht verfügbar ist oder ein neuer Tab blockiert wird, kannst du direkt
              anrufen. Es erscheint keine fingierte Versandbestätigung.
            </p>
          } @else {
            <p
              class="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 leading-6 text-slate-800"
            >
              {{ language.t('contact.unavailable') }}
            </p>
          }
        </section>

        @if (telephoneHref()) {
          <div class="sticky bottom-0 mt-6 border-t border-slate-200 bg-slate-50 py-3 sm:hidden">
            <a
              href="#kontakt"
              class="flex min-h-11 items-center justify-center rounded-lg bg-sky-800 px-5 font-semibold text-white"
              >{{ language.t('contact.choose') }}</a
            >
          </div>
        }
      }
    </main>
  `,
})
export class WorkshopProfileComponent {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly analytics = inject(AnalyticsService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  protected readonly language = inject(LanguageService);
  private readonly pendingTasks = inject(PendingTasks);
  private readonly request = inject(REQUEST);
  private readonly route = inject(ActivatedRoute);
  protected includeDetails = false;
  protected profile?: PublicWorkshopProfile;
  protected repairSummary = '';
  protected reviews: readonly PublicWorkshopReview[] = [];
  protected reviewServiceCategoryId = '';
  protected reviewState: 'error' | 'loading' | 'ready' = 'loading';
  protected reviewVehicleMakeId = '';
  protected state: 'error' | 'loading' | 'ready' = 'loading';
  protected vehicleSummary = '';
  protected readonly vehicleMakeOptions = Object.entries(VEHICLE_MAKE_LABELS);

  constructor() {
    this.language.setPage('profile.profile', 'profile.trust');
    if (this.browser) void this.load();
    else if (this.request) this.pendingTasks.run(() => this.loadForServer(this.request!));
  }

  protected contactPreview(): string {
    return buildContactPreview({
      includeDetails: this.includeDetails,
      repairSummary: this.repairSummary,
      vehicleSummary: this.vehicleSummary,
      workshopName: this.profile?.name ?? this.language.t('home.badge'),
    });
  }

  protected placeLabel(placeId: string): string {
    return getCatalogPlace(placeId)?.label ?? 'Kosovo';
  }

  protected serviceLabels(serviceCategoryIds: readonly string[]): string {
    return serviceCategoryIds.map((id) => SERVICE_CATEGORY_LABELS[id] ?? id).join(', ');
  }

  protected telephoneHref(): string | undefined {
    return buildTelephoneHref(this.profile?.contact.phone);
  }

  protected vehicleMakeLabels(vehicleMakeIds: readonly string[]): string {
    return vehicleMakeIds.length
      ? vehicleMakeIds.map((id) => VEHICLE_MAKE_LABELS[id] ?? id).join(', ')
      : 'Markenoffen';
  }

  protected whatsAppHref(): string | undefined {
    return buildWhatsAppHref(this.profile?.contact.phone, this.contactPreview());
  }

  protected async load(): Promise<void> {
    const workshopId = this.route.snapshot.paramMap.get('workshopId');
    if (!this.browser || !workshopId) {
      this.state = 'error';
      return;
    }
    await this.loadProfile(workshopId);
  }

  private async loadForServer(request: Request): Promise<void> {
    const workshopId = this.route.snapshot.paramMap.get('workshopId');
    if (!workshopId) {
      this.state = 'error';
      return;
    }
    await this.loadProfile(workshopId, request.url);
  }

  private async loadProfile(workshopId: string, requestUrl?: string): Promise<void> {
    this.state = 'loading';
    try {
      const response = await fetch(
        this.publicApiUrl(`/api/public/workshops/${encodeURIComponent(workshopId)}`, requestUrl),
        {
          credentials: 'same-origin',
        },
      );
      if (!response.ok) throw new Error('Workshop profile request failed');
      this.profile = (await response.json()) as PublicWorkshopProfile;
      this.state = 'ready';
      this.language.setProfilePage(this.profile.name, this.profile.description);
      if (this.browser) this.analytics.track('workshop_profile_opened');
      await this.loadReviews(workshopId, requestUrl);
      this.changeDetector.markForCheck();
    } catch {
      this.state = 'error';
      this.changeDetector.markForCheck();
    }
  }

  protected contactOpened(): void {
    this.analytics.track('contact_channel_opened');
  }

  protected async loadReviews(workshopId = this.profile?.id, requestUrl?: string): Promise<void> {
    if ((!this.browser && !requestUrl) || !workshopId) return;
    this.reviewState = 'loading';
    try {
      const query = new URLSearchParams();
      if (this.reviewServiceCategoryId)
        query.set('serviceCategoryId', this.reviewServiceCategoryId);
      if (this.reviewVehicleMakeId) query.set('vehicleMakeId', this.reviewVehicleMakeId);
      const suffix = query.size ? `?${query.toString()}` : '';
      const response = await fetch(
        this.publicApiUrl(
          `/api/public/workshops/${encodeURIComponent(workshopId)}/reviews${suffix}`,
          requestUrl,
        ),
        { credentials: 'same-origin' },
      );
      if (!response.ok) throw new Error('Workshop reviews request failed');
      const payload = (await response.json()) as { reviews?: readonly PublicWorkshopReview[] };
      this.reviews = payload.reviews ?? [];
      this.reviewState = 'ready';
      this.changeDetector.markForCheck();
    } catch {
      this.reviewState = 'error';
      this.changeDetector.markForCheck();
    }
  }

  private publicApiUrl(path: string, requestUrl?: string): string {
    return requestUrl ? new URL(path, requestUrl).toString() : path;
  }
}
