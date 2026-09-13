import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  imports: [RouterLink],
  selector: 'app-search-handoff',
  template: `
    <main class="mx-auto min-h-screen max-w-3xl px-4 py-12 sm:px-6" aria-labelledby="search-title">
      <p class="text-sm font-bold tracking-widest text-sky-700 uppercase">Werkstattsuche</p>
      <h1 id="search-title" class="mt-2 text-3xl font-bold tracking-tight">Passende Werkstätten</h1>
      <p class="mt-4 max-w-2xl leading-7 text-slate-700">
        Dein Suchkontext wurde übernommen. Es wurden keine Fahrzeug-, Reise- oder Dateiangaben an
        Werkstätten gesendet.
      </p>
      <p
        class="mt-6 rounded-xl border border-slate-200 bg-white p-4 leading-7 text-slate-700"
        role="status"
      >
        Die Ergebnisliste wird mit der Mehrortsuche ergänzt. Bis dahin zeigen wir keine erfundenen
        Werkstätten oder Bewertungen.
      </p>
      <a
        routerLink="/anfrage"
        class="mt-8 inline-flex min-h-11 items-center font-semibold text-sky-800 underline"
        >Anfrage anpassen</a
      >
    </main>
  `,
})
export class SearchHandoffComponent {
  private readonly route = inject(ActivatedRoute);

  constructor() {
    // Reading only service and area filters proves that the handoff excludes private request details.
    void this.route.snapshot.queryParamMap.get('service');
    void this.route.snapshot.queryParamMap.get('places');
  }
}
