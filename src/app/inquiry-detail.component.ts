import { Component, afterNextRender, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideArrowLeft, LucideMapPin, LucidePaperclip, type LucideIcon } from '@lucide/angular';
import { getCatalogPlace, VEHICLE_MAKE_LABELS } from '../shared/catalog';
import { inquiriesCopy, type InquiriesCopyKey } from '../shared/inquiries-copy';
import { requestCopy, type RequestCopyKey } from '../shared/request-copy';
import type { RepairRequestVehicle } from '../shared/repair-request';
import type { SavedRepairRequest } from '../shared/saved-repair-request';
import { AccountSessionService } from './account-session.service';
import { LanguageService } from './language.service';
import { SiteHeaderComponent } from './site-header.component';
import { AuthRequiredDialogComponent } from './ui/auth-required-dialog.component';
import { ButtonDirective } from './ui/button.directive';
import { LucideIconComponent } from './ui/lucide-icon.component';

@Component({
  selector: 'app-inquiry-detail',
  imports: [
    RouterLink,
    SiteHeaderComponent,
    AuthRequiredDialogComponent,
    ButtonDirective,
    LucideIconComponent,
  ],
  templateUrl: './inquiry-detail.component.html',
})
export class InquiryDetailComponent {
  readonly ArrowLeftIcon: LucideIcon = LucideArrowLeft;
  readonly MapPinIcon: LucideIcon = LucideMapPin;
  readonly PaperclipIcon: LucideIcon = LucidePaperclip;
  protected readonly account = inject(AccountSessionService);
  protected readonly language = inject(LanguageService);
  protected readonly detail = signal<SavedRepairRequest | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'error' | 'missing'>('loading');
  private readonly route = inject(ActivatedRoute);

  constructor() {
    afterNextRender(() => void this.load());
  }
  protected loginUrl(): string {
    return `/auth/login?returnTo=${encodeURIComponent(this.routeUrl())}`;
  }
  protected routeUrl(): string {
    return this.language.link(
      'inquiry-detail',
      this.route.snapshot.paramMap.get('inquiryId') ?? '',
    );
  }
  protected text(key: InquiriesCopyKey): string {
    return inquiriesCopy[this.language.language][key];
  }
  protected requestText(key: RequestCopyKey): string {
    return requestCopy[this.language.language][key];
  }
  protected placeLabel(id: string): string {
    return getCatalogPlace(id)?.label ?? id;
  }
  protected date(value: string): string {
    return new Intl.DateTimeFormat(this.language.language, {
      dateStyle: 'medium',
      timeZone: 'UTC',
    }).format(new Date(`${value}T00:00:00Z`));
  }
  protected dateTime(value: string): string {
    return new Intl.DateTimeFormat(this.language.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }
  protected vehicleEntries(
    vehicle: RepairRequestVehicle | undefined,
  ): readonly { label: string; value: string }[] {
    if (!vehicle) return [];
    const labels: Readonly<Record<keyof RepairRequestVehicle, RequestCopyKey>> = {
      makeId: 'make',
      model: 'model',
      year: 'year',
      vehicleClass: 'class',
      fuel: 'fuel',
      engineDetails: 'engine',
      transmissionDetails: 'transmission',
      mileageKm: 'mileage',
    };
    return (Object.keys(labels) as (keyof RepairRequestVehicle)[]).flatMap((key) => {
      const value = vehicle[key];
      if (value === undefined || value === '') return [];
      let display = String(value);
      if (key === 'makeId') display = VEHICLE_MAKE_LABELS[display] ?? display;
      else if (key === 'vehicleClass' || key === 'fuel')
        display = this.requestText(display as RequestCopyKey);
      else if (key === 'mileageKm')
        display = `${Number(value).toLocaleString(this.language.language)} km`;
      return [{ label: this.requestText(labels[key]), value: display }];
    });
  }
  protected async load(): Promise<void> {
    await this.account.refresh();
    if (!this.account.signedIn()) return;
    const id = this.route.snapshot.paramMap.get('inquiryId') ?? '';
    this.state.set('loading');
    try {
      const response = await fetch(`/api/me/repair-requests/${encodeURIComponent(id)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (response.status === 404) return this.state.set('missing');
      if (!response.ok) throw new Error('load');
      const detail = (await response.json()) as SavedRepairRequest;
      if (detail.id !== id) throw new Error('invalid');
      this.detail.set(detail);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
