import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { PUBLIC_PAGE_PATHS } from '../shared/public-pages';
import { FoundationComponent } from './app';
import type { GarageProfileComponent } from './garage-profile.component';
import { StaffDraftGuardService } from './staff-draft-guard.service';
import { AdminDraftGuardService } from './admin-draft-guard.service';

const staffDraftNavigationGuard = () => inject(StaffDraftGuardService).confirmDiscard();
const adminDraftNavigationGuard = (_: unknown, state: { url: string }) =>
  inject(AdminDraftGuardService).confirmContextChange(state.url);

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
      loadComponent: () => import('./monetization.component').then((m) => m.MonetizationComponent),
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
    ...['garages', 'users', 'privacy', 'audit', 'catalog', 'support'].map((section) => ({
      path: `${childPrefix}admin/${section}`,
      pathMatch: 'full' as const,
      data: { adminSection: section, ownsFooter: true },
      runGuardsAndResolvers: 'always' as const,
      canActivate: [adminDraftNavigationGuard],
      canDeactivate: [
        (component: import('./admin-console.component').AdminConsoleComponent | null) =>
          component?.canLeave() ?? true,
      ],
      loadComponent: () => import('./admin-console.component').then((m) => m.AdminConsoleComponent),
    })),
    ...['admin', 'moderation'].flatMap((path) => [
      {
        path: `${childPrefix}${path}/cases/:caseId`,
        pathMatch: 'full' as const,
        data: { adminOnly: path === 'admin', ownsFooter: true },
        runGuardsAndResolvers: 'always' as const,
        canActivate: [staffDraftNavigationGuard],
        canDeactivate: [
          (component: import('./staff-workspace.component').StaffWorkspaceComponent | null) =>
            component?.canLeave() ?? true,
        ],
        loadComponent: () =>
          import('./staff-workspace.component').then((m) => m.StaffWorkspaceComponent),
      },
      {
        path: `${childPrefix}${path}`,
        pathMatch: 'full' as const,
        data: { adminOnly: path === 'admin', ownsFooter: true },
        runGuardsAndResolvers: 'always' as const,
        canActivate: [staffDraftNavigationGuard],
        canDeactivate: [
          (component: import('./staff-workspace.component').StaffWorkspaceComponent | null) =>
            component?.canLeave() ?? true,
        ],
        loadComponent: () =>
          import('./staff-workspace.component').then((m) => m.StaffWorkspaceComponent),
      },
    ]),
    {
      path: `${childPrefix}profile`,
      pathMatch: 'full',
      loadComponent: () =>
        import('./account-profile.component').then((module) => module.AccountProfileComponent),
    },
    {
      path: `${childPrefix}inquiries`,
      canDeactivate: [
        (component: import('./inquiries.component').InquiriesComponent | null) =>
          component?.canLeave() ?? true,
      ],
      pathMatch: 'full',
      loadComponent: () =>
        import('./inquiries.component').then((module) => module.InquiriesComponent),
    },
    {
      path: `${childPrefix}favorites`,
      pathMatch: 'full',
      loadComponent: () =>
        import('./favorites.component').then((module) => module.FavoritesComponent),
    },
    {
      path: `${childPrefix}reviews`,
      pathMatch: 'full',
      loadComponent: () => import('./reviews.component').then((m) => m.ReviewsComponent),
      canDeactivate: [
        (component: import('./reviews.component').ReviewsComponent | null) =>
          component?.canLeave() ?? true,
      ],
    },
    {
      path: `${childPrefix}garages/:garageId/reviews/new`,
      pathMatch: 'full',
      loadComponent: () => import('./review-create.component').then((m) => m.ReviewCreateComponent),
      canDeactivate: [
        (component: import('./review-create.component').ReviewCreateComponent | null) =>
          component?.canLeave() ?? true,
      ],
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
      canDeactivate: [
        (component: import('./garage-onboarding.component').GarageOnboardingComponent | null) =>
          component?.canLeave() ?? true,
      ],
      path: `${childPrefix}garages/new`,
    },
    {
      loadComponent: () =>
        import('./repair-request.component').then((m) => m.RepairRequestComponent),
      path: `${childPrefix}inquiry`,
    },
    {
      loadComponent: () =>
        import('./search-handoff.component').then((m) => m.SearchHandoffComponent),
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
      loadComponent: () =>
        import('./garage-profile.component').then((m) => m.GarageProfileComponent),
      canDeactivate: [(component: GarageProfileComponent | null) => component?.canLeave() ?? true],
      path: `${childPrefix}garages/:garageId`,
      // The profile keeps the shared footer inside its mobile safe-area layout.
      data: { ownsFooter: true },
    },
  ];
}
