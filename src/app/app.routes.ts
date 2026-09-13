import { Routes } from '@angular/router';
import { FoundationComponent } from './app';
import { WorkshopOnboardingComponent } from './workshop-onboarding.component';

export const routes: Routes = [
  {
    component: FoundationComponent,
    path: '',
    pathMatch: 'full',
  },
  {
    component: WorkshopOnboardingComponent,
    path: 'werkstatt/aufnahme',
    title: 'Werkstatt aufnehmen | AutoKosova',
  },
];
