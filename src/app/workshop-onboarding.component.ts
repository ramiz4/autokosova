import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LanguageService } from './language.service';

interface OnboardingForm {
  contactPerson: string;
  contactPhone: string;
  languages: string;
  name: string;
  placeId: string;
  publicPhone: string;
  selfReportedSpecializations: string;
  serviceCategoryIds: string;
  vehicleMakeIds: string;
}

@Component({
  imports: [FormsModule],
  selector: 'app-workshop-onboarding',
  template: `
    <main class="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6 sm:py-12">
      <section
        class="mx-auto max-w-xl rounded-2xl border border-sky-200 bg-white p-5 shadow-sm sm:p-8"
      >
        <p class="text-sm font-bold tracking-widest text-sky-700 uppercase">Werkstatt aufnehmen</p>
        <h1 class="mt-2 text-3xl font-bold tracking-tight">In wenigen Schritten zum Prüfauftrag</h1>
        <p class="mt-3 text-slate-700">
          Kein tägliches Dashboard und keine automatische Veröffentlichung. Das Profil bleibt
          privat, bis es geprüft und freigegeben wurde.
        </p>

        <div class="mt-6 rounded-xl bg-sky-50 p-4 text-sm text-slate-700">
          <p class="font-semibold text-slate-900">Vor dem Start</p>
          <p class="mt-1">Bei einem möglichen bestehenden Profil wird keine Übernahme ausgelöst.</p>
        </div>

        <form class="mt-6 space-y-5" (ngSubmit)="submit()">
          <label class="block font-semibold">
            Werkstattname
            <input
              class="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 focus:border-sky-700 focus:ring-2 focus:ring-sky-200"
              [(ngModel)]="form.name"
              name="name"
              required
            />
          </label>
          <label class="block font-semibold">
            Ort
            <select
              class="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 focus:border-sky-700 focus:ring-2 focus:ring-sky-200"
              [(ngModel)]="form.placeId"
              name="placeId"
              required
            >
              <option value="xk-pristina">Prishtina</option>
              <option value="xk-prizren">Prizren</option>
              <option value="xk-peja">Pejë</option>
              <option value="xk-gjakova">Gjakovë</option>
              <option value="xk-ferizaj">Ferizaj</option>
              <option value="xk-gjilan">Gjilan</option>
              <option value="xk-mitrovica">Mitrovicë</option>
            </select>
          </label>
          <fieldset class="grid gap-5 sm:grid-cols-2">
            <label class="block font-semibold">
              Ansprechpartner (privat)
              <input
                class="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 focus:border-sky-700 focus:ring-2 focus:ring-sky-200"
                [(ngModel)]="form.contactPerson"
                name="contactPerson"
                required
              />
            </label>
            <label class="block font-semibold">
              Telefon für die Prüfung (privat)
              <input
                class="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 focus:border-sky-700 focus:ring-2 focus:ring-sky-200"
                [(ngModel)]="form.contactPhone"
                name="contactPhone"
                required
                type="tel"
              />
            </label>
          </fieldset>
          <label class="block font-semibold">
            Öffentliches Telefon (optional)
            <input
              class="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 focus:border-sky-700 focus:ring-2 focus:ring-sky-200"
              [(ngModel)]="form.publicPhone"
              name="publicPhone"
              type="tel"
            />
          </label>
          <label class="block font-semibold">
            Leistungen (durch Komma getrennt)
            <input
              class="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 focus:border-sky-700 focus:ring-2 focus:ring-sky-200"
              [(ngModel)]="form.serviceCategoryIds"
              name="serviceCategoryIds"
              required
            />
          </label>
          <label class="block font-semibold">
            Fahrzeugmarken (durch Komma getrennt)
            <input
              class="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 focus:border-sky-700 focus:ring-2 focus:ring-sky-200"
              [(ngModel)]="form.vehicleMakeIds"
              name="vehicleMakeIds"
              required
            />
          </label>
          <label class="block font-semibold">
            Sprachen (durch Komma getrennt)
            <input
              class="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 focus:border-sky-700 focus:ring-2 focus:ring-sky-200"
              [(ngModel)]="form.languages"
              name="languages"
              required
            />
          </label>
          <label class="block font-semibold">
            Spezialisierungen als Selbstauskunft (optional)
            <input
              class="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 focus:border-sky-700 focus:ring-2 focus:ring-sky-200"
              [(ngModel)]="form.selfReportedSpecializations"
              name="selfReportedSpecializations"
            />
          </label>

          <label
            class="flex min-h-11 items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-700"
          >
            <input
              class="mt-1 size-5"
              [(ngModel)]="consentAccepted"
              name="consent"
              required
              type="checkbox"
            />
            <span>
              Ich stimme der Aufnahme meines Profils zur Prüfung zu. Ein Prüfkennzeichen ist keine
              Reparaturqualitätsgarantie.
            </span>
          </label>

          @if (message) {
            <p class="rounded-lg bg-slate-100 p-3 text-sm" role="status">{{ message }}</p>
          }

          <button
            class="min-h-11 w-full rounded-lg bg-sky-700 px-4 py-2 font-bold text-white hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400"
            [disabled]="sending || !consentAccepted"
            type="submit"
          >
            {{ sending ? 'Wird gespeichert …' : 'Privaten Entwurf erstellen' }}
          </button>
        </form>
      </section>
    </main>
  `,
})
export class WorkshopOnboardingComponent {
  private readonly language = inject(LanguageService);
  protected consentAccepted = false;
  protected form: OnboardingForm = {
    contactPerson: '',
    contactPhone: '',
    languages: 'Deutsch, Shqip',
    name: '',
    placeId: 'xk-pristina',
    publicPhone: '',
    selfReportedSpecializations: '',
    serviceCategoryIds: 'service-inspektion',
    vehicleMakeIds: 'volkswagen',
  };
  protected message = '';
  protected sending = false;

  constructor() {
    this.language.setPage('home.workshopOnboarding', 'home.intro', true);
  }

  protected async submit() {
    const csrfToken = document.cookie
      .split('; ')
      .find((cookie) => cookie.startsWith('autokosova_csrf='))
      ?.split('=')[1];
    if (!csrfToken) {
      globalThis.location.assign('/auth/login');
      return;
    }

    this.sending = true;
    this.message = '';
    try {
      const response = await fetch('/api/garages', {
        body: JSON.stringify({
          consentVersion: 'workshop-onboarding-v1',
          profile: {
            contactPerson: this.form.contactPerson,
            contactPhone: this.form.contactPhone,
            languages: splitList(this.form.languages),
            name: this.form.name,
            placeId: this.form.placeId,
            ...(this.form.publicPhone ? { publicPhone: this.form.publicPhone } : {}),
            selfReportedSpecializations: splitList(this.form.selfReportedSpecializations),
            serviceCategoryIds: splitList(this.form.serviceCategoryIds),
            vehicleMakeIds: splitList(this.form.vehicleMakeIds),
          },
        }),
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
        method: 'POST',
      });
      const result = (await response.json()) as { error?: string };
      this.message = response.ok
        ? 'Dein Entwurf ist privat gespeichert und kann jetzt zur Prüfung eingereicht werden.'
        : (result.error ?? 'Der Entwurf konnte nicht gespeichert werden.');
    } catch {
      this.message = 'Der Entwurf konnte nicht gespeichert werden. Bitte versuche es erneut.';
    } finally {
      this.sending = false;
    }
  }
}

function splitList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
