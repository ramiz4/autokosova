import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { PUBLIC_PAGE_PATHS } from '../shared/public-pages';
import { FoundationComponent } from './app';
import { MonetizationComponent } from './monetization.component';
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
    {
      component: MonetizationComponent,
      path: `${childPrefix}monetization`,
      pathMatch: 'full',
    },
    {
      path: `${childPrefix}monetarisierung`,
      pathMatch: 'full',
      // Build the full URL at request time, including server-rendered redirects.
      redirectTo: ({ queryParams, fragment }) =>
        inject(Router).createUrlTree([`/${childPrefix}monetization`], {
          queryParams,
          fragment: fragment ?? undefined,
        }),
    },
    {
      path: `${childPrefix}profile`,
      pathMatch: 'full',
      loadComponent: () =>
        import('./account-profile.component').then((module) => module.AccountProfileComponent),
    },
    {
      path: `${childPrefix}inquiries`,
      pathMatch: 'full',
      loadComponent: () =>
        import('./inquiries.component').then((module) => module.InquiriesComponent),
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
    ...Object.entries(PUBLIC_PAGE_PATHS).map(([publicPage, path]) => ({
      path: `${childPrefix}${path.slice(1)}`,
      pathMatch: 'full' as const,
      data: { publicPage },
      loadComponent: () =>
        import('./public-page.component').then((module) => module.PublicPageComponent),
    })),
    {
      component: GarageProfileComponent,
      path: `${childPrefix}garages/:garageId`,
      // The profile keeps the shared footer inside its mobile safe-area layout.
      data: { ownsFooter: true },
    },
  ];
}
