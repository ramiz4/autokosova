import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectorRef, Component, inject, PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { getCatalogPlace, SERVICE_CATEGORY_LABELS, VEHICLE_MAKE_LABELS } from '../shared/catalog';
import {
  buildContactPreview,
  buildTelephoneHref,
  buildWhatsAppHref,
} from '../shared/contact-preview';

interface PublicWorkshopProfile {
  readonly contact: { readonly phone?: string };
  readonly description?: string;
  readonly id: string;
  readonly languages: readonly string[];
  readonly name: string;
  readonly photoIds: readonly string[];
  readonly placeId: string;
  readonly selfReportedSpecializations: readonly string[];
  readonly serviceCategoryIds: readonly string[];
  readonly vehicleMakeIds: readonly string[];
  readonly verificationLabel?: 'Unternehmensdaten geprüft';
}

@Component({
  imports: [FormsModule, RouterLink],
  selector: 'app-workshop-profile',
  template: `
    <main
      class="mx-auto min-h-screen max-w-4xl px-4 py-8 pb-28 sm:px-6 sm:py-12"
      aria-labelledby="profile-title"
    >
      <a routerLink="/suche" class="text-sm font-semibold text-sky-800 underline">Zur Suche</a>

      @if (state === 'loading') {
        <p
          class="mt-8 rounded-xl border border-slate-200 bg-white p-5 text-slate-700"
          role="status"
        >
          Werkstattprofil wird geladen …
        </p>
      }

      @if (state === 'error') {
        <section
          class="mt-8 rounded-xl border border-rose-300 bg-rose-50 p-5"
          aria-labelledby="profile-error-title"
        >
          <h1 id="profile-error-title" class="text-xl font-bold">
            Werkstattprofil nicht verfügbar
          </h1>
          <p class="mt-2 leading-7 text-slate-700">
            Die Werkstatt ist möglicherweise nicht veröffentlicht oder die Verbindung ist gerade
            unterbrochen. Es wurde kein Kontakt ausgelöst.
          </p>
          <button
            type="button"
            class="mt-4 min-h-11 rounded-lg border border-sky-800 px-4 font-semibold text-sky-900"
            (click)="load()"
          >
            Erneut laden
          </button>
        </section>
      }

      @if (state === 'ready' && profile) {
        <header class="mt-6">
          <p class="text-sm font-bold tracking-widest text-sky-700 uppercase">Werkstattprofil</p>
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
                {{ profile.verificationLabel }}
              </span>
            }
          </div>
        </header>

        <section
          class="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
          aria-labelledby="trust-title"
        >
          <h2 id="trust-title" class="text-xl font-bold">Vertrauensinformationen</h2>
          @if (profile.verificationLabel) {
            <p class="mt-3 leading-7 text-slate-700">
              „Unternehmensdaten geprüft“ bedeutet, dass Kontakt, Ansprechperson,
              Unternehmensnachweis und Standort geprüft wurden. Das ist keine Garantie für
              Reparaturqualität oder Verfügbarkeit.
            </p>
          } @else {
            <p class="mt-3 leading-7 text-slate-700">
              Für dieses Profil liegt kein Kennzeichen für geprüfte Unternehmensdaten vor.
            </p>
          }
          <p class="mt-4 font-semibold text-slate-900">Noch keine Bewertungen</p>
          <p class="mt-1 text-sm leading-6 text-slate-700">
            Bewertungen werden erst nach einem separaten, überprüfbaren Besuchs- und
            Moderationsablauf ergänzt. Wir zeigen keine Beispielsterne.
          </p>
        </section>

        <section
          class="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
          aria-labelledby="details-title"
        >
          <h2 id="details-title" class="text-xl font-bold">Leistungen und Angaben</h2>
          @if (profile.description) {
            <p class="mt-3 leading-7 text-slate-700">{{ profile.description }}</p>
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
              <dt class="font-semibold">Sprachen</dt>
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
          <h2 id="photos-title" class="text-xl font-bold">Fotos</h2>
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
            <p class="mt-3 text-slate-700">Keine Fotos veröffentlicht.</p>
          }
        </section>

        <section
          id="kontakt"
          class="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-5 shadow-sm sm:p-7"
          aria-labelledby="contact-title"
        >
          <h2 id="contact-title" class="text-xl font-bold">Kontakt bewusst vorbereiten</h2>
          <p class="mt-2 max-w-2xl leading-7 text-slate-700">
            Du wählst diesen Betrieb selbst. Ein Klick öffnet nur den von dir sichtbaren Entwurf
            oder die Telefon-App; er sendet keine Nachricht, bestätigt keinen Auftrag und reserviert
            keinen Termin. Preis und Fertigstellung vereinbarst du direkt mit der Werkstatt.
          </p>

          <fieldset class="mt-6 rounded-xl border border-sky-200 bg-white p-4">
            <legend class="px-1 font-semibold">Optionale Angaben freigeben</legend>
            <label class="mt-2 flex min-h-11 items-start gap-3 text-slate-800">
              <input class="mt-1 size-5" [(ngModel)]="includeDetails" type="checkbox" />
              <span>
                Ich möchte die unten selbst eingegebenen Fahrzeug- und Anliegenangaben in meinen
                Nachrichtenentwurf aufnehmen.
              </span>
            </label>
            <p class="mt-3 text-sm leading-6 text-slate-700">
              Nichts aus einer gespeicherten Anfrage wird automatisch übernommen. VIN, Kennzeichen,
              Dokumente, Upload-URLs und genaue Reisedaten gehören nicht in diesen Entwurf.
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
            >Dein Nachrichtenentwurf
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
                  >In WhatsApp öffnen</a
                >
              }
              <a
                [href]="telephoneHref()"
                class="inline-flex min-h-11 items-center rounded-lg border border-sky-800 px-5 font-semibold text-sky-950"
                >Anrufen</a
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
              Für dieses Profil ist keine gültige öffentliche Telefonnummer verfügbar. Ein externer
              Kontaktlink wird deshalb nicht angeboten.
            </p>
          }
        </section>

        @if (telephoneHref()) {
          <div class="sticky bottom-0 mt-6 border-t border-slate-200 bg-slate-50 py-3 sm:hidden">
            <a
              href="#kontakt"
              class="flex min-h-11 items-center justify-center rounded-lg bg-sky-800 px-5 font-semibold text-white"
              >Kontakt auswählen</a
            >
          </div>
        }
      }
    </main>
  `,
})
export class WorkshopProfileComponent {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  protected includeDetails = false;
  protected profile?: PublicWorkshopProfile;
  protected repairSummary = '';
  protected state: 'error' | 'loading' | 'ready' = 'loading';
  protected vehicleSummary = '';

  constructor() {
    if (this.browser) void this.load();
  }

  protected contactPreview(): string {
    return buildContactPreview({
      includeDetails: this.includeDetails,
      repairSummary: this.repairSummary,
      vehicleSummary: this.vehicleSummary,
      workshopName: this.profile?.name ?? 'Werkstatt',
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
    this.state = 'loading';
    try {
      const response = await fetch(`/api/public/workshops/${encodeURIComponent(workshopId)}`, {
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Workshop profile request failed');
      this.profile = (await response.json()) as PublicWorkshopProfile;
      this.state = 'ready';
      this.changeDetector.markForCheck();
    } catch {
      this.state = 'error';
      this.changeDetector.markForCheck();
    }
  }
}
