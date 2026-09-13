import { isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, PLATFORM_ID, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  hasConsistentTravelDates,
  REPAIR_REQUEST_LIMITS,
  type RepairRequestInput,
  type RepairRequestVehicle,
} from '../shared/repair-request';
import { RepairRequestDraft } from './repair-request-draft';
import { LanguageService } from './language.service';
import { LanguageSwitcherComponent } from './language-switcher.component';

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
  imports: [ReactiveFormsModule, RouterLink, LanguageSwitcherComponent],
  selector: 'app-repair-request',
  templateUrl: './repair-request.component.html',
})
export class RepairRequestComponent {
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
    useVehicle: [false],
    vehicle: this.formBuilder.group({
      engineDetails: ['', Validators.maxLength(120)],
      makeId: [''],
      mileageKm: ['', Validators.pattern(/^\d*$/)],
      model: ['', Validators.maxLength(120)],
      transmissionDetails: ['', Validators.maxLength(120)],
      year: ['', Validators.pattern(/^\d{4}$/)],
    }),
  });

  constructor() {
    this.language.setPage('request.title', 'request.intro', true);
    if (!this.browser) return;
    const stored = this.draft.read();
    if (stored) this.form.patchValue(stored);
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
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
    this.step += 1;
  }

  protected previous(): void {
    if (this.step > 1) this.step -= 1;
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
      this.fileError = `Erlaubt sind höchstens ${REPAIR_REQUEST_LIMITS.maxAttachments} PDF-, JPG- oder PNG-Dateien bis 10 MB.`;
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

  protected search(): void {
    if (!this.travelStepIsValid()) {
      this.step = 3;
      return;
    }
    const path = this.matchingPath(this.toInput());
    this.draft.clear();
    window.location.assign(this.localizedMatchingPath(path));
  }

  protected async savePrivately(): Promise<void> {
    if (!this.travelStepIsValid()) {
      this.step = 3;
      return;
    }
    if (!this.browser) return;

    const response = await fetch('/api/me/repair-requests', {
      body: JSON.stringify(this.toInput()),
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': this.csrfToken(),
      },
      method: 'POST',
    });

    if (response.status === 401) {
      this.statusMessage = 'Bitte melde dich an, um diesen Entwurf dauerhaft privat zu speichern.';
      return;
    }
    if (!response.ok) {
      this.statusMessage = 'Der Entwurf konnte nicht gespeichert werden. Bitte prüfe die Angaben.';
      return;
    }

    const result = (await response.json()) as { matchingPath: string };
    this.draft.clear();
    window.location.assign(this.localizedMatchingPath(result.matchingPath));
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

  private localizedMatchingPath(path: string): string {
    const [, query = ''] = path.split('?', 2);
    return `${this.language.link('search')}${query ? `?${query}` : ''}`;
  }

  private serviceStepIsValid(): boolean {
    const controls = this.form.controls;
    controls.serviceCategoryId.markAsTouched();
    controls.symptom.markAsTouched();
    if (controls.serviceCategoryId.invalid || controls.symptom.invalid) {
      this.formError = 'Bitte wähle eine Leistung. Die Symptombeschreibung ist optional.';
      return false;
    }
    return true;
  }

  private toInput(): RepairRequestInput {
    const value = this.form.getRawValue();
    const vehicle = value.useVehicle
      ? {
          ...(value.vehicle.engineDetails.trim()
            ? { engineDetails: value.vehicle.engineDetails.trim() }
            : {}),
          makeId: value.vehicle.makeId as RepairRequestVehicle['makeId'],
          ...(value.vehicle.mileageKm ? { mileageKm: Number(value.vehicle.mileageKm) } : {}),
          model: value.vehicle.model.trim(),
          ...(value.vehicle.transmissionDetails.trim()
            ? { transmissionDetails: value.vehicle.transmissionDetails.trim() }
            : {}),
          year: Number(value.vehicle.year),
        }
      : undefined;
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
      ...(vehicle ? { vehicle } : {}),
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
      !hasConsistentTravelDates(input)
    ) {
      this.formError =
        'Bitte wähle mindestens einen Ort, einen Radius und konsistente Kalendertage.';
      return false;
    }
    return true;
  }

  private vehicleStepIsValid(): boolean {
    if (!this.form.controls.useVehicle.value) return true;
    const vehicle = this.form.controls.vehicle;
    vehicle.markAllAsTouched();
    if (
      !vehicle.controls.makeId.value ||
      !vehicle.controls.model.value.trim() ||
      !/^\d{4}$/.test(vehicle.controls.year.value)
    ) {
      this.formError =
        'Bitte ergänze Marke, Modell und Baujahr oder fahre ohne Fahrzeugdaten fort.';
      return false;
    }
    return true;
  }
}
