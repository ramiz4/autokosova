import {
  LucideArrowRight,
  LucideCar,
  LucideCheck,
  LucideChevronDown,
  LucideChevronRight,
  LucideClock,
  LucideEllipsis,
  LucideFileText,
  LucideGlobe,
  LucideInfo,
  LucideMapPin,
  LucidePause,
  LucidePencil,
  LucidePlus,
  LucideShieldCheck,
  LucideTrash2,
  LucideUser,
  LucideWrench,
  type LucideIcon,
} from '@lucide/angular';
import { DOCUMENT } from '@angular/common';
import {
  Component,
  DestroyRef,
  Injector,
  afterNextRender,
  effect,
  inject,
  signal,
  viewChild,
  untracked,
} from '@angular/core';
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
import { InquiryEditorComponent } from './inquiry-editor.component';
import { InquiryDeleteDialogComponent } from './inquiry-delete-dialog.component';
import { LucideIconComponent } from './ui/lucide-icon.component';
import { ButtonDirective } from './ui/button.directive';

@Component({
  selector: 'app-inquiries',
  imports: [
    RouterLink,
    SiteHeaderComponent,
    ButtonDirective,
    LucideIconComponent,
    InquiryEditorComponent,
    InquiryDeleteDialogComponent,
  ],
  styleUrl: './inquiries.component.scss',
  host: {
    '(document:pointerdown)': 'dismissActions($event)',
    '(document:focusin)': 'dismissActions($event)',
    '(keydown.escape)': 'closeActions(true)',
  },
  providers: [SavedRepairRequestsService],
  templateUrl: './inquiries.component.html',
})
export class InquiriesComponent {
  readonly ArrowRightIcon: LucideIcon = LucideArrowRight;
  readonly CarIcon: LucideIcon = LucideCar;
  readonly CheckIcon: LucideIcon = LucideCheck;
  readonly ChevronDownIcon: LucideIcon = LucideChevronDown;
  readonly ChevronRightIcon: LucideIcon = LucideChevronRight;
  readonly ClockIcon: LucideIcon = LucideClock;
  readonly EllipsisIcon: LucideIcon = LucideEllipsis;
  readonly FileTextIcon: LucideIcon = LucideFileText;
  readonly GlobeIcon: LucideIcon = LucideGlobe;
  readonly InfoIcon: LucideIcon = LucideInfo;
  readonly MapPinIcon: LucideIcon = LucideMapPin;
  readonly PauseIcon: LucideIcon = LucidePause;
  readonly PencilIcon: LucideIcon = LucidePencil;
  readonly PlusIcon: LucideIcon = LucidePlus;
  readonly ShieldCheckIcon: LucideIcon = LucideShieldCheck;
  readonly TrashIcon: LucideIcon = LucideTrash2;
  readonly UserIcon: LucideIcon = LucideUser;
  readonly WrenchIcon: LucideIcon = LucideWrench;

  protected readonly account = inject(AccountSessionService);
  protected readonly language = inject(LanguageService);
  protected readonly saved = inject(SavedRepairRequestsService);

  protected readonly filters = ['all', 'active', 'inactive'] as const;
  protected readonly actionsId = signal<string | null>(null);
  protected readonly editingId = signal<string | null>(null);
  protected readonly deleting = signal<RepairRequestSummary | null>(null);
  private readonly editor = viewChild(InquiryEditorComponent);
  private actionTrigger?: HTMLElement;
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    effect(() => {
      this.account.dataContext();
      untracked(() => {
        this.editingId.set(null);
        this.deleting.set(null);
        this.closeActions();
      });
    });
    effect(() => this.language.setPageText(this.text('title'), this.text('description'), true));
    // Browser-only session validation; no private data is fetched into SSR/TransferState.
    afterNextRender(() => {
      void this.account.refresh();
    });
  }

  canLeave(): boolean | Promise<boolean> {
    return this.account.state() !== 'ready' || this.account.busy()
      ? true
      : (this.editor()?.canLeave() ?? true);
  }
  protected async edit(request: RepairRequestSummary): Promise<void> {
    if (this.saved.writeState() === 'saving') return;
    // The editor must return to the persistent trigger, not the removed menu item.
    this.closeActions(true);
    this.editingId.set(request.id);
    await this.saved.openDetail(request.id);
  }
  protected editorClosed(id: string): void {
    this.editingId.set(null);
    afterNextRender(
      () => {
        const trigger = this.document.getElementById(`actions-trigger-${id}`);
        if (trigger instanceof HTMLElement && trigger.isConnected) return;
        this.document.querySelector<HTMLElement>('#inquiries-title')?.focus();
      },
      { injector: this.injector },
    );
  }
  protected toggleActions(id: string, event: Event): void {
    if (this.actionsId() === id) this.closeActions(true);
    else this.openActions(id, event);
  }
  protected onActionTriggerKeydown(id: string, event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    this.openActions(id, event, event.key === 'ArrowUp');
  }
  private openActions(id: string, event: Event, last = false): void {
    if (this.saved.writeState() === 'saving') return;
    this.actionTrigger = event.currentTarget as HTMLElement;
    this.actionsId.set(id);
    afterNextRender(
      () => {
        // Ignore a pending focus callback if another card or a dialog has taken over.
        if (this.actionsId() !== id) return;
        const items = this.document
          .getElementById('actions-' + id)
          ?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
        items?.[last ? items.length - 1 : 0]?.focus();
      },
      { injector: this.injector },
    );
  }
  protected onActionsKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.closeActions(true);
      return;
    }
    if (event.key === 'Tab') {
      // Resume the browser's normal Tab/Shift+Tab order from the persistent trigger.
      this.closeActions(true);
      return;
    }
    const items = Array.from(
      (event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    );
    const index = items.indexOf(this.document.activeElement as HTMLButtonElement);
    let next: number;
    switch (event.key) {
      case 'ArrowDown':
        next = (index + 1) % items.length;
        break;
      case 'ArrowUp':
        next = (index - 1 + items.length) % items.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    items[next]?.focus();
  }
  protected closeActions(restore = false): void {
    if (!this.actionsId()) return;
    this.actionsId.set(null);
    if (restore) this.actionTrigger?.focus();
  }
  protected dismissActions(event: Event): void {
    if (
      event.target instanceof Node &&
      !this.actionTrigger?.closest('[data-inquiry-actions]')?.contains(event.target)
    ) {
      this.closeActions(event.type === 'pointerdown');
    }
  }
  protected async deactivate(request: RepairRequestSummary): Promise<void> {
    const trigger = this.actionTrigger;
    const context = this.account.dataContext();
    this.closeActions(true);
    await this.saved.mutate(request, { kind: 'activity', active: !request.active });
    if (this.destroyRef.destroyed || this.account.dataContext() !== context) return;
    afterNextRender(
      () => {
        if (this.account.dataContext() !== context) return;
        if (trigger?.isConnected) trigger.focus();
        else this.document.querySelector<HTMLElement>('#inquiries-title')?.focus();
      },
      { injector: this.injector },
    );
  }
  protected confirmDelete(request: RepairRequestSummary): void {
    if (this.saved.writeState() === 'saving') return;
    this.closeActions(true);
    this.deleting.set(request);
  }
  protected deleteClosed(id: string): void {
    this.deleting.set(null);
    afterNextRender(
      () => {
        const trigger = this.document.getElementById(`actions-trigger-${id}`);
        if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
        else this.document.querySelector<HTMLElement>('#inquiries-title')?.focus();
      },
      { injector: this.injector },
    );
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
    if (!request.active) return null;
    const serviceCategoryId = REPAIR_REQUEST_SERVICE_CATEGORIES.find(
      (id) => id === request.serviceCategoryId,
    );
    return serviceCategoryId
      ? Object.fromEntries(
          buildRepairRequestSearchParams({ areas: request.areas, serviceCategoryId }),
        )
      : null;
  }

  protected placeLabel(id: string): string {
    return getCatalogPlace(id)?.label ?? id;
  }

  protected vehicleLabel(vehicle: RepairRequestSummary['vehicle']): string {
    return [
      vehicle?.vehicleClass ? this.requestText(vehicle.vehicleClass) : '',
      vehicle?.makeId ? VEHICLE_MAKE_LABELS[vehicle.makeId] : '',
      vehicle?.model,
      vehicle?.year,
    ]
      .filter((value) => value !== undefined && value !== '')
      .join(' · ');
  }

  protected date(value: string, calendar = false): string {
    return new Intl.DateTimeFormat(this.language.language, {
      dateStyle: 'medium',
      ...(calendar ? { timeZone: 'UTC' } : { timeStyle: 'short' as const }),
    }).format(new Date(calendar ? `${value}T00:00:00Z` : value));
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
      else if (
        key === 'vehicleClass' ||
        key === 'fuel' ||
        (key === 'transmissionDetails' &&
          ['manual', 'automatic', 'semiAutomatic', 'other'].includes(display))
      ) {
        display = this.requestText(display as RequestCopyKey);
      } else if (key === 'mileageKm')
        display = `${Number(value).toLocaleString(this.language.language)} km`;
      return [{ label: this.requestText(labels[key]), value: display }];
    });
  }
}
