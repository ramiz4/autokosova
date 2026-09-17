import {
  LucideArrowRight,
  LucideCar,
  LucideCheck,
  LucideChevronDown,
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
  LucideWrench,
  LucideX,
  type LucideIcon,
} from '@lucide/angular';
import { DOCUMENT } from '@angular/common';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import {
  Component,
  DestroyRef,
  Injector,
  afterNextRender,
  effect,
  inject,
  signal,
  viewChild,
  viewChildren,
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
import { AuthRequiredDialogComponent } from './ui/auth-required-dialog.component';

type InquiryToast = 'updated' | 'deactivated' | 'reactivated' | 'deleted';

@Component({
  selector: 'app-inquiries',
  imports: [
    RouterLink,
    SiteHeaderComponent,
    ButtonDirective,
    LucideIconComponent,
    InquiryEditorComponent,
    InquiryDeleteDialogComponent,
    CdkMenu,
    CdkMenuItem,
    CdkMenuTrigger,
    AuthRequiredDialogComponent,
  ],
  providers: [SavedRepairRequestsService],
  templateUrl: './inquiries.component.html',
})
export class InquiriesComponent {
  readonly ArrowRightIcon: LucideIcon = LucideArrowRight;
  readonly CarIcon: LucideIcon = LucideCar;
  readonly CheckIcon: LucideIcon = LucideCheck;
  readonly ChevronDownIcon: LucideIcon = LucideChevronDown;
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
  readonly WrenchIcon: LucideIcon = LucideWrench;
  readonly XIcon: LucideIcon = LucideX;

  protected readonly account = inject(AccountSessionService);
  protected readonly language = inject(LanguageService);
  protected readonly saved = inject(SavedRepairRequestsService);

  protected readonly filters = ['all', 'active', 'inactive'] as const;
  protected readonly actionsMenuPositions = [
    {
      originX: 'end',
      originY: 'bottom',
      overlayX: 'end',
      overlayY: 'top',
      offsetY: 6,
    },
    {
      originX: 'end',
      originY: 'top',
      overlayX: 'end',
      overlayY: 'bottom',
      offsetY: -6,
    },
  ] satisfies CdkMenuTrigger['menuPosition'];
  protected readonly editingId = signal<string | null>(null);
  protected readonly deleting = signal<RepairRequestSummary | null>(null);
  protected readonly toast = signal<InquiryToast | null>(null);
  private readonly editor = viewChild(InquiryEditorComponent);
  private readonly actionMenus = viewChildren(CdkMenuTrigger);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      this.account.dataContext();
      untracked(() => {
        this.editingId.set(null);
        this.deleting.set(null);
        this.actionMenus().forEach((menu) => menu.close());
      });
    });
    effect(() => this.language.setPageText(this.text('title'), this.text('description'), true));
    effect(() => {
      const notice = this.saved.notice();
      untracked(() => this.showToast(notice));
    });
    // Browser-only session validation; no private data is fetched into SSR/TransferState.
    afterNextRender(() => {
      void this.account.refresh();
    });
    this.destroyRef.onDestroy(() => clearTimeout(this.toastTimer));
  }
  protected dismissToast(): void {
    clearTimeout(this.toastTimer);
    this.toastTimer = undefined;
    this.toast.set(null);
  }

  canLeave(): boolean | Promise<boolean> {
    return this.account.state() !== 'ready' || this.account.busy()
      ? true
      : (this.editor()?.canLeave() ?? true);
  }
  private showToast(notice: InquiryToast | null): void {
    clearTimeout(this.toastTimer);
    this.toastTimer = undefined;
    this.toast.set(notice);
    if (notice) this.toastTimer = setTimeout(() => this.dismissToast(), 5000);
  }
  protected async edit(request: RepairRequestSummary, menu: CdkMenuTrigger): Promise<void> {
    if (this.saved.writeState() === 'saving') return;
    // The CDK menu closes before the editor's Brain dialog opens and owns focus.
    menu.close();
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
  protected async deactivate(request: RepairRequestSummary, menu: CdkMenuTrigger): Promise<void> {
    const context = this.account.dataContext();
    menu.close();
    await this.saved.mutate(request, { kind: 'activity', active: !request.active });
    if (this.destroyRef.destroyed || this.account.dataContext() !== context) return;
    afterNextRender(
      () => {
        if (this.account.dataContext() !== context) return;
        const trigger = this.document.getElementById(`actions-trigger-${request.id}`);
        if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
        else this.document.querySelector<HTMLElement>('#inquiries-title')?.focus();
      },
      { injector: this.injector },
    );
  }
  protected confirmDelete(request: RepairRequestSummary, menu: CdkMenuTrigger): void {
    if (this.saved.writeState() === 'saving') return;
    menu.close();
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
