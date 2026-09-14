import { Component, afterNextRender, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { getCatalogPlace, VEHICLE_MAKE_LABELS } from '../shared/catalog';
import { inquiriesCopy, type InquiriesCopyKey } from '../shared/inquiries-copy';
import { requestCopy, type RequestCopyKey } from '../shared/request-copy';
import {
  buildRepairRequestSearchParams,
  REPAIR_REQUEST_SERVICE_CATEGORIES,
  type RepairRequestVehicle,
} from '../shared/repair-request';
import type { RepairRequestSummary } from '../shared/saved-repair-request';
import { AccountSessionService } from './account-session.service';
import { LanguageService } from './language.service';
import { SavedRepairRequestsService } from './saved-repair-requests.service';
import { SiteHeaderComponent } from './site-header.component';
import { ButtonDirective } from './ui/button.directive';

@Component({
  selector: 'app-inquiries',
  imports: [RouterLink, SiteHeaderComponent, ButtonDirective],
  providers: [SavedRepairRequestsService],
  templateUrl: './inquiries.component.html',
})
export class InquiriesComponent {
  protected readonly account = inject(AccountSessionService);
  protected readonly language = inject(LanguageService);
  protected readonly saved = inject(SavedRepairRequestsService);

  constructor() {
    effect(() => this.language.setPageText(this.text('title'), this.text('description'), true));
    // Browser-only session validation; no private data is fetched into SSR/TransferState.
    afterNextRender(() => { void this.account.refresh(); });
  }

  protected text(key: InquiriesCopyKey): string {
    return inquiriesCopy[this.language.language][key];
  }

  protected requestText(key: RequestCopyKey): string {
    return requestCopy[this.language.language][key];
  }

  protected loginUrl(): string {
    return `/auth/login?returnTo=${encodeURIComponent(this.language.link('inquiries'))}`;
  }

  protected searchQuery(request: RepairRequestSummary): Record<string, string> | null {
    const serviceCategoryId = REPAIR_REQUEST_SERVICE_CATEGORIES.find((id) => id === request.serviceCategoryId);
    return serviceCategoryId
      ? Object.fromEntries(buildRepairRequestSearchParams({ areas: request.areas, serviceCategoryId }))
      : null;
  }

  protected placeLabel(id: string): string {
    return getCatalogPlace(id)?.label ?? id;
  }

  protected vehicleLabel(vehicle: RepairRequestSummary['vehicle']): string {
    return [vehicle?.vehicleClass ? this.requestText(vehicle.vehicleClass) : '',
      vehicle?.makeId ? VEHICLE_MAKE_LABELS[vehicle.makeId] : '', vehicle?.model, vehicle?.year]
      .filter((value) => value !== undefined && value !== '').join(' · ');
  }

  protected date(value: string, calendar = false): string {
    return new Intl.DateTimeFormat(this.language.language, {
      dateStyle: 'medium',
      ...(calendar ? { timeZone: 'UTC' } : { timeStyle: 'short' as const }),
    }).format(new Date(calendar ? `${value}T00:00:00Z` : value));
  }

  protected vehicleEntries(vehicle: RepairRequestVehicle | undefined): readonly { label: string; value: string }[] {
    if (!vehicle) return [];
    const labels: Readonly<Record<keyof RepairRequestVehicle, RequestCopyKey>> = {
      makeId: 'make', model: 'model', year: 'year', vehicleClass: 'class', fuel: 'fuel',
      engineDetails: 'engine', transmissionDetails: 'transmission', mileageKm: 'mileage',
    };
    return (Object.keys(labels) as (keyof RepairRequestVehicle)[]).flatMap((key) => {
      const value = vehicle[key];
      if (value === undefined || value === '') return [];
      let display = String(value);
      if (key === 'makeId') display = VEHICLE_MAKE_LABELS[display] ?? display;
      else if (key === 'vehicleClass' || key === 'fuel' ||
        (key === 'transmissionDetails' && ['manual', 'automatic', 'semiAutomatic', 'other'].includes(display))) {
        display = this.requestText(display as RequestCopyKey);
      } else if (key === 'mileageKm') display = `${Number(value).toLocaleString(this.language.language)} km`;
      return [{ label: this.requestText(labels[key]), value: display }];
    });
  }
}
