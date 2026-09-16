import {
  LucideArrowRight,
  LucideCar,
  LucideCarFront,
  LucideCaravan,
  LucideClock,
  LucideMapPin,
  LucideMotorbike,
  LucideShieldCheck,
  LucideThumbsUp,
  LucideVan,
  type LucideIcon,
} from '@lucide/angular';
import { SearchAreasComponent, type SearchArea } from './ui/search-areas.component';
import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  inject,
  viewChild,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  hasConsistentTravelDates,
  buildRepairRequestSearchParams,
  REPAIR_REQUEST_LIMITS,
  REPAIR_REQUEST_FUELS,
  REPAIR_REQUEST_VEHICLE_CLASSES,
  REPAIR_REQUEST_VEHICLE_MAKES,
  REPAIR_REQUEST_PLACES,
  type RepairRequestInput,
  type RepairRequestVehicle,
} from '../shared/repair-request';
import { RepairRequestDraft } from './repair-request-draft';
import { LanguageService } from './language.service';
import { SiteHeaderComponent } from './site-header.component';
import { ButtonDirective } from './ui/button.directive';
import { LucideIconComponent } from './ui/lucide-icon.component';
import { requestCopy, type RequestCopyKey } from '../shared/request-copy';

const serviceCategories = [
  ['service-inspektion', 'Service und Inspektion'],
  ['bremsen', 'Bremsen'],
  ['reifen', 'Reifen'],
  ['motor', 'Motor'],
  ['getriebe', 'Getriebe'],
  ['elektronik-diagnose', 'Elektronik und Diagnose'],
  ['klima', 'Klimaanlage'],
  ['karosserie', 'Karosserie'],
] as const;

const vehicleMakes = [
  ['audi', 'Audi'],
  ['bmw', 'BMW'],
  ['mercedes-benz', 'Mercedes-Benz'],
  ['opel', 'Opel'],
  ['renault', 'Renault'],
  ['skoda', 'Škoda'],
  ['toyota', 'Toyota'],
  ['volkswagen', 'Volkswagen'],
] as const;

const places = [
  ['xk-pristina', 'Prishtina'],
  ['xk-prizren', 'Prizren'],
  ['xk-peja', 'Pejë'],
  ['xk-gjakova', 'Gjakovë'],
  ['xk-ferizaj', 'Ferizaj'],
  ['xk-gjilan', 'Gjilan'],
  ['xk-mitrovica', 'Mitrovicë'],
] as const;

@Component({
  imports: [
    SearchAreasComponent,
    ReactiveFormsModule,
    SiteHeaderComponent,
    ButtonDirective,
    LucideIconComponent,
  ],
  selector: 'app-repair-request',
  templateUrl: './repair-request.component.html',
})
export class RepairRequestComponent {
  readonly CarIcon: LucideIcon = LucideCar;
  readonly SuvIcon: LucideIcon = LucideCarFront;
  readonly MotorbikeIcon: LucideIcon = LucideMotorbike;
  readonly VanIcon: LucideIcon = LucideVan;
  readonly CamperIcon: LucideIcon = LucideCaravan;
  protected readonly vehicleIcons: Readonly<
    Record<(typeof REPAIR_REQUEST_VEHICLE_CLASSES)[number], LucideIcon>
  > = {
    car: this.CarIcon,
    suv: this.SuvIcon,
    motorcycle: this.MotorbikeIcon,
    van: this.VanIcon,
    camper: this.CamperIcon,
  };
  readonly ArrowRightIcon: LucideIcon = LucideArrowRight;
  readonly ClockIcon: LucideIcon = LucideClock;
  readonly MapPinIcon: LucideIcon = LucideMapPin;
  readonly ShieldCheckIcon: LucideIcon = LucideShieldCheck;
  readonly ThumbsUpIcon: LucideIcon = LucideThumbsUp;

  protected readonly benefits = [
    [this.ClockIcon, 'benefit1', 'benefit1Help'],
    [this.MapPinIcon, 'benefit2', 'benefit2Help'],
    [this.ThumbsUpIcon, 'benefit3', 'benefit3Help'],
    [this.ShieldCheckIcon, 'benefit4', 'benefit4Help'],
  ] as const;
  protected readonly footerBenefits = [
    [this.ClockIcon, 'footer1'],
    [this.ThumbsUpIcon, 'footer2'],
    [this.ShieldCheckIcon, 'footer3'],
  ] as const;
  protected get stepLabels(): readonly string[] {
    return [
      this.language.t('request.stepVehicle'),
      this.text('repair'),
      this.text('placeTime'),
      this.text('details'),
      this.text('done'),
    ];
  }
  protected readonly vehicleClasses = REPAIR_REQUEST_VEHICLE_CLASSES;
  protected readonly transmissions = ['manual', 'automatic', 'semiAutomatic', 'other'] as const;
  protected isKnownTransmission(value: string): boolean {
    return (this.transmissions as readonly string[]).includes(value);
  }
  protected readonly fuels = REPAIR_REQUEST_FUELS;
  protected saving = false;
  protected saved = false;
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly router = inject(Router);
  private readonly stepTitle = viewChild<ElementRef<HTMLElement>>('stepTitle');
  protected text(key: RequestCopyKey): string {
    return requestCopy[this.language.language][key];
  }
  protected readonly limits = REPAIR_REQUEST_LIMITS;
  protected readonly serviceCategories = serviceCategories;
  protected readonly vehicleMakes = vehicleMakes;
  protected step = 1;
  protected selectedFiles: File[] = [];
  protected fileError = '';
  protected formError = '';
  protected statusMessage = '';

  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  protected readonly language = inject(LanguageService);
  private readonly draft = inject(RepairRequestDraft);

  protected readonly form = this.formBuilder.group({
    areas: this.formBuilder.control<SearchArea[]>([]),
    earliestDropoffOn: ['', Validators.required],
    latestPickupOn: ['', Validators.required],
    serviceCategoryId: ['', Validators.required],
    symptom: ['', Validators.maxLength(REPAIR_REQUEST_LIMITS.maxSymptomLength)],
    vehicle: this.formBuilder.group({
      vehicleClass: [''],
      fuel: [''],
      engineDetails: ['', Validators.maxLength(120)],
      makeId: [''],
      mileageKm: [
        '',
        [Validators.pattern(/^\d*$/), Validators.max(REPAIR_REQUEST_LIMITS.maxMileageKm)],
      ],
      model: ['', Validators.maxLength(120)],
      transmissionDetails: ['', Validators.maxLength(120)],
      year: [
        '',
        [
          Validators.pattern(/^\d{4}$/),
          Validators.min(REPAIR_REQUEST_LIMITS.minVehicleYear),
          Validators.max(REPAIR_REQUEST_LIMITS.maxVehicleYear),
        ],
      ],
    }),
  });

  constructor() {
    this.language.setPage('request.title', 'request.intro', true);
    if (!this.browser) return;
    const stored = this.draft.read();
    if (stored) {
      const storedAreas = stored['areas'];
      const restored: Record<string, unknown> & { areas: SearchArea[] } = {
        ...stored,
        areas: Array.isArray(storedAreas)
          ? storedAreas
              .filter(
                (area) =>
                  area &&
                  typeof area.placeId === 'string' &&
                  area.placeId !== '' &&
                  typeof area.radiusKm === 'number',
              )
              .slice(0, this.limits.maxAreas)
              .map((area) => ({ placeId: area.placeId, radiusKm: area.radiusKm }))
          : [],
      };
      // Older drafts offered a checkbox to exclude previously entered vehicle details.
      if (restored['useVehicle'] === false) delete restored['vehicle'];
      this.form.patchValue(restored);
      // Re-serialize only the current form contract, dropping obsolete draft fields.
      this.draft.write(this.form.getRawValue());
    }
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.saved = false;
      this.statusMessage = '';
      this.draft.write(this.form.getRawValue());
    });
  }

  protected get areas() {
    return this.form.controls.areas;
  }
  protected readonly areasEditing = signal(false);
  private readonly areasEditor = viewChild(SearchAreasComponent);

  protected next(): void {
    this.formError = '';
    if (this.step === 1 && !this.vehicleStepIsValid()) return;
    if (this.step === 2 && !this.serviceStepIsValid()) return;
    if (this.step === 3 && !this.travelStepIsValid()) return;
    if (this.step < 5) this.step += 1;
    this.focusStep();
  }

  protected previous(): void {
    this.areasEditor()?.cancelArea(false);
    this.areasEditing.set(false);
    if (this.step > 1) this.step -= 1;
    this.formError = '';
    this.focusStep();
  }

  protected onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const selected = [...(input.files ?? [])];
    const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png']);
    const allFiles = [...this.selectedFiles, ...selected];
    if (
      allFiles.length > REPAIR_REQUEST_LIMITS.maxAttachments ||
      allFiles.some(
        (file) => !allowedTypes.has(file.type) || file.size > 10 * 1024 * 1024 || file.size === 0,
      )
    ) {
      this.fileError = this.text('fileError');
      input.value = '';
      return;
    }
    this.fileError = '';
    this.selectedFiles = allFiles;
    input.value = '';
  }

  protected removeFile(index: number): void {
    this.selectedFiles = this.selectedFiles.filter((_, currentIndex) => currentIndex !== index);
  }

  private focusStep(): void {
    setTimeout(() => this.stepTitle()?.nativeElement.focus());
  }

  protected cancel(): void {
    this.draft.clear();
    void this.router.navigateByUrl(this.language.link('home'));
  }

  protected loginUrl(): string {
    return `/auth/login?returnTo=${encodeURIComponent(this.language.link('request'))}`;
  }

  protected vehicleSummary(): string {
    const vehicle = this.form.getRawValue().vehicle;
    return (
      [
        vehicle.vehicleClass ? this.text(vehicle.vehicleClass as RequestCopyKey) : '',
        vehicle.makeId,
        vehicle.model,
        vehicle.year,
        vehicle.engineDetails,
        vehicle.fuel ? this.text(vehicle.fuel as RequestCopyKey) : '',
        this.isKnownTransmission(vehicle.transmissionDetails)
          ? this.text(vehicle.transmissionDetails as RequestCopyKey)
          : vehicle.transmissionDetails,
        vehicle.mileageKm ? `${vehicle.mileageKm} km` : '',
      ]
        .filter(Boolean)
        .join(' · ') || this.text('noVehicle')
    );
  }

  protected placeName(id: string): string {
    return places.find((place) => place[0] === id)?.[1] ?? id;
  }

  private validRequest(): boolean {
    this.formError = '';
    for (const [step, valid] of [
      [1, () => this.vehicleStepIsValid()],
      [2, () => this.serviceStepIsValid()],
      [3, () => this.travelStepIsValid()],
    ] as const) {
      if (!valid()) {
        this.step = step;
        this.focusStep();
        return false;
      }
    }
    return true;
  }

  protected search(): void {
    if (!this.validRequest()) return;
    void this.router.navigateByUrl(this.matchingPath(this.toInput()));
  }

  protected async savePrivately(): Promise<void> {
    if (this.saving || this.saved || !this.browser || !this.validRequest()) return;
    this.saving = true;
    this.statusMessage = '';
    try {
      const response = await fetch('/api/me/repair-requests', {
        body: JSON.stringify(this.toInput()),
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-csrf-token': this.csrfToken() },
        method: 'POST',
      });
      if (response.status === 401) {
        this.statusMessage = this.text('loginRequired');
        return;
      }
      if (!response.ok) {
        this.statusMessage = this.text('saveError');
        return;
      }
      this.saved = true;
      this.draft.clear();
      this.statusMessage = this.text('saved');
    } catch {
      this.statusMessage = this.text('saveError');
    } finally {
      this.saving = false;
      this.changeDetector.markForCheck();
    }
  }

  private csrfToken(): string {
    return (
      document.cookie
        .split('; ')
        .find((item) => item.startsWith('autokosova_csrf='))
        ?.split('=')[1] ?? ''
    );
  }

  private matchingPath(input: RepairRequestInput): string {
    return `${this.language.link('search')}?${buildRepairRequestSearchParams(input)}`;
  }

  private serviceStepIsValid(): boolean {
    const controls = this.form.controls;
    controls.serviceCategoryId.markAsTouched();
    controls.symptom.markAsTouched();
    if (controls.serviceCategoryId.invalid || controls.symptom.invalid) {
      this.formError = this.text('serviceError');
      return false;
    }
    return true;
  }

  private toInput(): RepairRequestInput {
    const value = this.form.getRawValue();
    const v = value.vehicle;
    const vehicle: RepairRequestVehicle = {
      ...(v.vehicleClass
        ? { vehicleClass: v.vehicleClass as RepairRequestVehicle['vehicleClass'] }
        : {}),
      ...(v.fuel ? { fuel: v.fuel as RepairRequestVehicle['fuel'] } : {}),
      ...(v.makeId ? { makeId: v.makeId as RepairRequestVehicle['makeId'] } : {}),
      ...(v.model.trim() ? { model: v.model.trim() } : {}),
      ...(v.year ? { year: Number(v.year) } : {}),
      ...(v.engineDetails.trim() ? { engineDetails: v.engineDetails.trim() } : {}),
      ...(v.transmissionDetails.trim()
        ? { transmissionDetails: v.transmissionDetails.trim() }
        : {}),
      ...(v.mileageKm ? { mileageKm: Number(v.mileageKm) } : {}),
    };
    return {
      areas: value.areas.map((area) => ({
        placeId: area.placeId as RepairRequestInput['areas'][number]['placeId'],
        radiusKm: Number(area.radiusKm),
      })),
      earliestDropoffOn: value.earliestDropoffOn,
      latestPickupOn: value.latestPickupOn,
      serviceCategoryId: value.serviceCategoryId as RepairRequestInput['serviceCategoryId'],
      ...(value.symptom.trim() ? { symptom: value.symptom.trim() } : {}),
      ...(Object.keys(vehicle).length ? { vehicle } : {}),
    };
  }

  private travelStepIsValid(): boolean {
    if (this.areasEditing()) {
      this.formError = this.language.t('search.ui.finishArea');
      this.areasEditor()?.focusEditor();
      return false;
    }
    const controls = this.form.controls;
    controls.earliestDropoffOn.markAsTouched();
    controls.latestPickupOn.markAsTouched();
    this.areas.markAllAsTouched();
    const input = this.toInput();
    if (
      this.areas.invalid ||
      input.areas.length > this.limits.maxAreas ||
      new Set(input.areas.map((area) => area.placeId)).size !== input.areas.length ||
      input.areas.some(
        (area) =>
          !REPAIR_REQUEST_PLACES.includes(area.placeId) ||
          !Number.isInteger(area.radiusKm) ||
          area.radiusKm < this.limits.minRadiusKm ||
          area.radiusKm > this.limits.maxRadiusKm,
      )
    ) {
      this.formError = this.text('areasError');
      return false;
    }
    if (
      controls.earliestDropoffOn.invalid ||
      controls.latestPickupOn.invalid ||
      !hasConsistentTravelDates(input)
    ) {
      this.formError = this.text('travelError');
      return false;
    }
    return true;
  }

  private vehicleStepIsValid(): boolean {
    const vehicle = this.form.controls.vehicle;
    vehicle.markAllAsTouched();
    const value = vehicle.getRawValue();
    if (
      vehicle.invalid ||
      (value.vehicleClass &&
        !(REPAIR_REQUEST_VEHICLE_CLASSES as readonly string[]).includes(value.vehicleClass)) ||
      (value.fuel && !(REPAIR_REQUEST_FUELS as readonly string[]).includes(value.fuel)) ||
      (value.makeId && !(REPAIR_REQUEST_VEHICLE_MAKES as readonly string[]).includes(value.makeId))
    ) {
      this.formError = this.text('vehicleError');
      return false;
    }
    return true;
  }
}
