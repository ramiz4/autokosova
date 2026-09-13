import { Routes } from '@angular/router';
import { FoundationComponent } from './app';
import { RepairRequestComponent } from './repair-request.component';
import { SearchHandoffComponent } from './search-handoff.component';
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
  {
    component: RepairRequestComponent,
    path: 'anfrage',
    title: 'Reparaturanfrage | AutoKosova',
  },
  {
    component: SearchHandoffComponent,
    path: 'suche',
    title: 'Werkstattsuche | AutoKosova',
  },
  { path: '**', redirectTo: '' },
];
