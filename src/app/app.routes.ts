import { Routes } from '@angular/router';
import { FoundationComponent } from './app';
import { RepairRequestComponent } from './repair-request.component';
import { SearchHandoffComponent } from './search-handoff.component';
import { GarageProfileComponent } from './garage-profile.component';

export const routes: Routes = [
  ...localizedRoutes(''),
  ...localizedRoutes('sq'),
  ...localizedRoutes('en'),
  { path: '**', redirectTo: '' },
];

function localizedRoutes(prefix: string): Routes {
  const childPrefix = prefix ? `${prefix}/` : '';
  return [
    {
      component: FoundationComponent,
      path: prefix,
      pathMatch: 'full',
    },
    // Compatibility redirects only; generated links always use English route names.
    {
      path: `${childPrefix}anfrage`,
      pathMatch: 'full',
      redirectTo: `${childPrefix}inquiry`,
    },
    {
      path: `${childPrefix}werkstatt/aufnahme`,
      pathMatch: 'full',
      redirectTo: `${childPrefix}garages/new`,
    },
    {
      path: `${childPrefix}werkstatt/:garageId`,
      redirectTo: `${childPrefix}garages/:garageId`,
    },
    {
      loadComponent: () =>
        import('./garage-onboarding.component').then((module) => module.GarageOnboardingComponent),
      path: `${childPrefix}garages/new`,
    },
    {
      component: RepairRequestComponent,
      path: `${childPrefix}inquiry`,
    },
    {
      component: SearchHandoffComponent,
      path: `${childPrefix}garages`,
    },
    {
      path: `${childPrefix}suche`,
      pathMatch: 'full',
      redirectTo: `${childPrefix}garages`,
    },
    {
      path: `${childPrefix}werkstaetten`,
      pathMatch: 'full',
      redirectTo: `${childPrefix}garages`,
    },
    {
      component: GarageProfileComponent,
      path: `${childPrefix}garages/:garageId`,
    },
  ];
}
