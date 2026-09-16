import { LucideCheck, LucideX, type LucideIcon } from '@lucide/angular';
import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  Component,
  DestroyRef,
  Injector,
  inject,
  input,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, type AbstractControl } from '@angular/forms';
import {
  BrnDialog,
  BrnDialogContent,
  BrnDialogDescription,
  BrnDialogOverlay,
  BrnDialogTitle,
} from '@spartan-ng/brain/dialog';
import { VEHICLE_MAKE_LABELS } from '../shared/catalog';
import { inquiriesCopy, type InquiriesCopyKey } from '../shared/inquiries-copy';
import { requestCopy, type RequestCopyKey } from '../shared/request-copy';
import {
  hasConsistentTravelDates,
  REPAIR_REQUEST_SERVICE_CATEGORIES,
  REPAIR_REQUEST_VEHICLE_MAKES,
  REPAIR_REQUEST_VEHICLE_CLASSES,
  REPAIR_REQUEST_FUELS,
  type RepairRequestInput,
  type RepairRequestVehicle,
} from '../shared/repair-request';
import { validateRepairRequest } from '../shared/repair-request-validation';
import type { SavedRepairRequest } from '../shared/saved-repair-request';
import { LanguageService } from './language.service';
import { SavedRepairRequestsService } from './saved-repair-requests.service';
import { ButtonDirective } from './ui/button.directive';
import { LucideIconComponent } from './ui/lucide-icon.component';
import { SearchAreasComponent, type SearchArea } from './ui/search-areas.component';

const wholeNumber = (control: AbstractControl) =>
  control.value === null || Number.isInteger(control.value) ? null : { integer: true };

@Component({
  selector: 'app-inquiry-editor',
  imports: [
    ReactiveFormsModule,
    ButtonDirective,
    LucideIconComponent,
    SearchAreasComponent,
    BrnDialog,
    BrnDialogContent,
    BrnDialogDescription,
    BrnDialogOverlay,
    BrnDialogTitle,
  ],
  templateUrl: './inquiry-editor.component.html',
  host: { '(window:beforeunload)': 'beforeUnload($event)' },
})
export class InquiryEditorComponent implements OnInit {
  readonly CheckIcon: LucideIcon = LucideCheck;
  readonly XIcon: LucideIcon = LucideX;

  readonly request = input.required<SavedRepairRequest>();
  readonly closed = output<string>();
  protected readonly language = inject(LanguageService);
  protected readonly saved = inject(SavedRepairRequestsService);
  protected readonly services = REPAIR_REQUEST_SERVICE_CATEGORIES;
  protected readonly makes = REPAIR_REQUEST_VEHICLE_MAKES;
  protected readonly makeLabels = VEHICLE_MAKE_LABELS;
  protected readonly classes = REPAIR_REQUEST_VEHICLE_CLASSES;
  protected readonly fuels = REPAIR_REQUEST_FUELS;
  protected readonly transmissions = ['manual', 'automatic', 'semiAutomatic', 'other'] as const;
  protected readonly areasEditing = signal(false);
  protected readonly validation = signal('');
  protected readonly discarding = signal(false);
  protected readonly dialogState = signal<'closed' | 'open'>('closed');
  private readonly areasEditor = viewChild(SearchAreasComponent);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly fb = inject(FormBuilder).nonNullable;
  private savedSnapshot = '';
  protected get unchanged(): boolean {
    return JSON.stringify(this.form.getRawValue()) === this.savedSnapshot;
  }
  private leavePromise?: Promise<boolean>;
  private resolveLeave?: (leave: boolean) => void;
  protected readonly form = this.fb.group({
    serviceCategoryId: ['', Validators.required],
    symptom: ['', Validators.maxLength(2000)],
    earliestDropoffOn: ['', Validators.required],
    latestPickupOn: ['', Validators.required],
    areas: this.fb.control<SearchArea[]>([]),
    vehicle: this.fb.group({
      makeId: [''],
      model: ['', Validators.maxLength(120)],
      vehicleClass: [''],
      fuel: [''],
      engineDetails: ['', Validators.maxLength(120)],
      transmissionDetails: ['', Validators.maxLength(120)],
      year: this.fb.control<number | null>(null, [
        Validators.min(1886),
        Validators.max(2100),
        wholeNumber,
      ]),
      mileageKm: this.fb.control<number | null>(null, [
        Validators.min(0),
        Validators.max(2000000),
        wholeNumber,
      ]),
    }),
  });
  constructor() {
    afterNextRender(() => {
      this.dialogState.set('open');
    });
    this.destroyRef.onDestroy(() => {
      this.resolveLeave?.(false);
      this.form.reset();
    });
  }
  ngOnInit(): void {
    const request = this.request();
    this.form.patchValue({
      ...request,
      areas: request.areas.map((area) => ({ ...area })),
      vehicle: request.vehicle ?? {},
    });
    this.savedSnapshot = JSON.stringify(this.form.getRawValue());
    this.saved.writeState.set('idle');
  }
  protected text(key: InquiriesCopyKey): string {
    return inquiriesCopy[this.language.language][key];
  }
  protected field(key: RequestCopyKey): string {
    return requestCopy[this.language.language][key];
  }
  protected isKnownTransmission(value: string): boolean {
    return (this.transmissions as readonly string[]).includes(value);
  }
  protected cancel(event?: Event): void {
    event?.preventDefault();
    if (this.saved.writeState() === 'saving') return;
    if (!this.unchanged || this.areasEditing()) this.discarding.set(true);
    else this.finishClose();
  }
  protected onEditorEscape(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.cancel();
  }
  protected onDialogClosed(): void {
    this.closed.emit(this.request().id);
  }
  private finishClose(): void {
    this.dialogState.set('closed');
  }
  canLeave(): boolean | Promise<boolean> {
    if (this.saved.writeState() === 'saving') return false;
    if (this.unchanged && !this.areasEditing()) return true;
    this.discarding.set(true);
    return (this.leavePromise ??= new Promise((resolve) => {
      this.resolveLeave = resolve;
    }));
  }
  protected discard(): void {
    this.resolveLeave?.(true);
    this.resolveLeave = undefined;
    this.leavePromise = undefined;
    this.form.markAsPristine();
    this.finishClose();
  }
  protected keepEditing(): void {
    this.discarding.set(false);
    this.resolveLeave?.(false);
    this.resolveLeave = undefined;
    this.leavePromise = undefined;
  }
  protected beforeUnload(event: BeforeUnloadEvent): void {
    if (!this.unchanged || this.areasEditing() || this.saved.writeState() === 'saving') {
      event.preventDefault();
      event.returnValue = '';
    }
  }
  protected async save(): Promise<void> {
    if (this.saved.writeState() === 'saving' || this.unchanged || this.discarding()) return;
    this.form.markAllAsTouched();
    const raw = this.form.getRawValue();
    const vehicle = Object.fromEntries(
      Object.entries(raw.vehicle).filter(([, value]) => value !== '' && value !== null),
    ) as RepairRequestVehicle;
    const input: RepairRequestInput = {
      areas: raw.areas.map(({ placeId, radiusKm }) => ({
        placeId,
        radiusKm,
      })) as RepairRequestInput['areas'],
      earliestDropoffOn: raw.earliestDropoffOn,
      latestPickupOn: raw.latestPickupOn,
      serviceCategoryId: raw.serviceCategoryId as RepairRequestInput['serviceCategoryId'],
      ...(raw.symptom ? { symptom: raw.symptom } : {}),
      ...(Object.keys(vehicle).length ? { vehicle } : {}),
      attachmentIds: this.request().attachmentIds,
    };
    let error = '';
    if (!raw.serviceCategoryId || this.form.controls.symptom.invalid)
      error = this.field('serviceError');
    else if (this.form.controls.vehicle.invalid) error = this.field('vehicleError');
    else if (!hasConsistentTravelDates(input)) error = this.field('travelError');
    else if (this.areasEditing() || validateRepairRequest(input)) error = this.field('areasError');
    this.validation.set(error);
    if (error) {
      if (this.areasEditing()) this.areasEditor()?.focusEditor();
      else
        this.document
          .querySelector<HTMLElement>(
            '[data-inquiry-editor] input.ng-invalid,[data-inquiry-editor] select.ng-invalid,[data-inquiry-editor] textarea.ng-invalid',
          )
          ?.focus();
      return;
    }
    if (await this.saved.mutate(this.request(), { kind: 'update', input })) {
      this.form.markAsPristine();
      this.finishClose();
    } else this.restoreFocusAfterFailedWrite(this.request().id);
  }
  private restoreFocusAfterFailedWrite(requestId: string): void {
    afterNextRender(
      () => {
        if (this.destroyRef.destroyed || this.request().id !== requestId) return;
        if (this.document.activeElement !== this.document.body) return;
        this.document
          .querySelector<HTMLElement>(`[data-inquiry-editor-id="${requestId}"] #edit-symptom`)
          ?.focus();
      },
      { injector: this.injector },
    );
  }
}
