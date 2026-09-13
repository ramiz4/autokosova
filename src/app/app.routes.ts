import { Routes } from '@angular/router';
import { FoundationComponent } from './app';
import { RepairRequestComponent } from './repair-request.component';
import { SearchHandoffComponent } from './search-handoff.component';
import { WorkshopOnboardingComponent } from './workshop-onboarding.component';
import { WorkshopProfileComponent } from './workshop-profile.component';

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
      component: WorkshopOnboardingComponent,
      path: `${childPrefix}werkstatt/aufnahme`,
    },
    {
      component: RepairRequestComponent,
      path: `${childPrefix}anfrage`,
    },
    {
      component: SearchHandoffComponent,
      path: `${childPrefix}suche`,
    },
    {
      component: WorkshopProfileComponent,
      path: `${childPrefix}werkstatt/:workshopId`,
    },
  ];
}
