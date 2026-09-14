import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  inject,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  hasConsistentTravelDates,
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
import { IconComponent } from './ui/icon.component';
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
  imports: [ReactiveFormsModule, SiteHeaderComponent, ButtonDirective, IconComponent],
  selector: 'app-repair-request',
  templateUrl: './repair-request.component.html',
})
export class RepairRequestComponent {
  protected readonly benefits = [
    ['clock', 'benefit1', 'benefit1Help'],
    ['pin', 'benefit2', 'benefit2Help'],
    ['thumb', 'benefit3', 'benefit3Help'],
    ['shield', 'benefit4', 'benefit4Help'],
  ] as const;
  protected readonly footerBenefits = [
    ['clock', 'footer1'],
    ['thumb', 'footer2'],
    ['shield', 'footer3'],
  ] as const;
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
  protected readonly places = places;
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
    areas: this.formBuilder.array([this.createArea()]),
    earliestDropoffOn: ['', Validators.required],
    latestPickupOn: ['', Validators.required],
    serviceCategoryId: ['', Validators.required],
    stayEndsOn: ['', Validators.required],
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
      const areas = stored['areas'];
      if (Array.isArray(areas)) {
        for (let index = 1; index < Math.min(areas.length, this.limits.maxAreas); index++)
          this.addArea();
      }
      const restored = { ...stored };
      // Older drafts offered a checkbox to exclude previously entered vehicle details.
      if (restored['useVehicle'] === false) delete restored['vehicle'];
      this.form.patchValue(restored);
    }
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.saved = false;
      this.statusMessage = '';
      this.draft.write(this.form.getRawValue());
    });
  }

  protected get areas(): FormArray {
    return this.form.controls.areas;
  }

  protected addArea(): void {
    if (this.areas.length < REPAIR_REQUEST_LIMITS.maxAreas) this.areas.push(this.createArea());
  }

  protected removeArea(index: number): void {
    if (this.areas.length > 1) this.areas.removeAt(index);
  }

  protected next(): void {
    this.formError = '';
    if (this.step === 1 && !this.vehicleStepIsValid()) return;
    if (this.step === 2 && !this.serviceStepIsValid()) return;
    if (this.step === 3 && !this.travelStepIsValid()) return;
    if (this.step < 5) this.step += 1;
    this.focusStep();
  }

  protected previous(): void {
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

  private createArea() {
    return this.formBuilder.group({
      placeId: ['', Validators.required],
      radiusKm: [
        20,
        [
          Validators.min(REPAIR_REQUEST_LIMITS.minRadiusKm),
          Validators.max(REPAIR_REQUEST_LIMITS.maxRadiusKm),
        ],
      ],
    });
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
    const query = new URLSearchParams({
      places: input.areas.map((area) => `${area.placeId}:${area.radiusKm}`).join(','),
      service: input.serviceCategoryId,
    });
    return `${this.language.link('search')}?${query.toString()}`;
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
      stayEndsOn: value.stayEndsOn,
      ...(value.symptom.trim() ? { symptom: value.symptom.trim() } : {}),
      ...(Object.keys(vehicle).length ? { vehicle } : {}),
    };
  }

  private travelStepIsValid(): boolean {
    const controls = this.form.controls;
    controls.earliestDropoffOn.markAsTouched();
    controls.latestPickupOn.markAsTouched();
    controls.stayEndsOn.markAsTouched();
    this.areas.markAllAsTouched();
    const input = this.toInput();
    if (
      controls.earliestDropoffOn.invalid ||
      controls.latestPickupOn.invalid ||
      controls.stayEndsOn.invalid ||
      this.areas.invalid ||
      new Set(input.areas.map((area) => area.placeId)).size !== input.areas.length ||
      input.areas.some(
        (area) => !REPAIR_REQUEST_PLACES.includes(area.placeId) || !Number.isInteger(area.radiusKm),
      ) ||
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
