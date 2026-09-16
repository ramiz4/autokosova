import { Routes } from '@angular/router';

/** Test-build-only route table. It never participates in the normal product build. */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: '__foundation-ui-pilot' },
  {
    data: { foundationFixture: true },
    loadComponent: () =>
      import('./headless-foundation-pilot.component').then(
        (m) => m.HeadlessFoundationPilotComponent,
      ),
    path: '__foundation-ui-pilot',
    pathMatch: 'full',
  },
  { path: '**', redirectTo: '__foundation-ui-pilot' },
];
