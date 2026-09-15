import { garageManagementCopy } from '../shared/garage-management-copy';
import { accountType } from '../shared/account';
import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  PLATFORM_ID,
  inject,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CATALOG_PLACES, SERVICE_CATEGORY_LABELS, VEHICLE_MAKE_LABELS } from '../shared/catalog';
import {
  GARAGE_LANGUAGES,
  GARAGE_SPECIALIZATIONS,
  addressMatchesPlace,
  validGarageAddress,
} from '../shared/garage-onboarding';
import { garageOptionLabels, onboardingCopy } from '../shared/onboarding-copy';
import type {
  GarageProfileInput,
  VerificationChecklist,
  GaragePublicationState,
} from '../shared/garage-onboarding';
import { LanguageService } from './language.service';
import { AccountSessionService } from './account-session.service';
import { SiteHeaderComponent } from './site-header.component';
import { IconComponent } from './ui/icon.component';
import { MultiSelectComponent, type SelectionOption } from './ui/multi-select.component';

type Form = { -readonly [Key in keyof GarageProfileInput]: GarageProfileInput[Key] } & {
  address: string;
};
interface OwnedGarage {
  id: string;
  name: string;
  publicationState: GaragePublicationState;
}
interface PrivateGarage {
  canDelete?: boolean;
  id: string;
  profile: GarageProfileInput;
  consentVersion: string;
  publicationState: GaragePublicationState;
  verification: VerificationChecklist;
}
function blankForm(): Form {
  return {
    name: '',
    placeId: '',
    contactPerson: '',
    contactPhone: '',
    publicPhone: '',
    publicWhatsapp: false,
    languages: [],
    selfReportedSpecializations: [],
    serviceCategoryIds: [],
    vehicleMakeIds: [],
    address: '',
  };
}

@Component({
  selector: 'app-garage-onboarding',
  imports: [FormsModule, RouterLink, SiteHeaderComponent, IconComponent, MultiSelectComponent],
  templateUrl: './garage-onboarding.component.html',
  styleUrl: './garage-onboarding.component.scss',
  host: {
    '(window:beforeunload)': 'onBeforeUnload($event)',
  },
})
export class GarageOnboardingComponent {
  protected readonly language = inject(LanguageService);
  protected readonly account = inject(AccountSessionService);
  protected readonly accountType = accountType;
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly formElement = viewChild<ElementRef<HTMLFormElement>>('formElement');
  protected form = blankForm();
  protected consentAccepted = false;
  protected sending = false;
  protected loading = false;
  protected message = '';
  protected needsLogin = false;
  protected errors: Record<string, string> = {};
  protected garageId?: string;
  protected canDelete = false;
  protected get management() {
    return garageManagementCopy[this.language.language];
  }
  protected publicationState: GaragePublicationState = 'draft';
  protected locationVerified = false;
  protected savedSnapshot = JSON.stringify(this.form);
  protected owned: OwnedGarage[] = [];
  protected ownedLoadFailed = false;
  protected ownedLoading = false;
  protected ownedLoaded = false;
  protected editing = false;
  private readonly workspaceTitle = viewChild<ElementRef<HTMLElement>>('workspaceTitle');
  protected get managing(): boolean {
    return this.account.signedIn() && accountType(this.account.identity()) === 'garage';
  }
  protected get showForm(): boolean {
    return !this.managing || this.editing;
  }
  private focusTitle(): void {
    this.cdr.detectChanges();
    this.workspaceTitle()?.nativeElement.focus();
  }
  protected backToOverview(): void {
    if (!this.canLeave()) return;
    this.clearForm();
    this.editing = false;
    this.focusTitle();
  }
  protected readonly places = CATALOG_PLACES;
  protected get copy() {
    return onboardingCopy[this.language.language];
  }
  protected get services(): SelectionOption[] {
    return Object.keys(SERVICE_CATEGORY_LABELS).map((id) => ({
      id,
      label: this.language.serviceLabel(id),
      aliases: [SERVICE_CATEGORY_LABELS[id]],
    }));
  }
  protected get makes(): SelectionOption[] {
    return Object.entries(VEHICLE_MAKE_LABELS).map(([id, label]) => ({ id, label }));
  }
  protected options(kind: 'languages' | 'selfReportedSpecializations'): SelectionOption[] {
    const choices = kind === 'languages' ? GARAGE_LANGUAGES : GARAGE_SPECIALIZATIONS;
    return [...new Set([...choices, ...this.form[kind]])].map((id) => ({
      id,
      label: garageOptionLabels[this.language.language][id] ?? id,
    }));
  }
  protected get loginUrl(): string {
    return '/auth/login?returnTo=' + encodeURIComponent(this.language.link('onboarding'));
  }
  protected get unchanged(): boolean {
    return JSON.stringify(this.form) === this.savedSnapshot;
  }
  private get hasUnsavedChanges(): boolean {
    return !this.unchanged || (!this.garageId && this.consentAccepted);
  }
  canLeave(): boolean {
    if (this.sending || this.loading) return false;
    return (
      !this.hasUnsavedChanges ||
      (typeof window !== 'undefined' && window.confirm(this.copy.discard))
    );
  }
  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.hasUnsavedChanges && !this.sending && !this.loading) return;
    event.preventDefault();
    event.returnValue = '';
  }
  protected get stateLabel(): string {
    const labels = {
      draft: this.copy.stateDraft,
      pending_review: this.copy.statePending,
      published: this.copy.statePublished,
      rejected: this.copy.stateRejected,
      suspended: this.copy.stateSuspended,
    };
    return labels[this.publicationState];
  }
  constructor() {
    this.language.setPage('home.garageOnboarding', 'home.intro', true);
    if (isPlatformBrowser(inject(PLATFORM_ID))) void this.refreshSession();
  }
  protected async refreshSession(): Promise<void> {
    await this.account.refresh();
    this.needsLogin = !this.account.signedIn();
    if (this.account.signedIn()) await this.loadOwned();
    else this.owned = [];
    this.cdr.markForCheck();
  }
  private async loadOwned(): Promise<void> {
    this.ownedLoadFailed = false;
    this.ownedLoading = true;
    try {
      const response = await fetch('/api/me/garages', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      this.owned = ((await response.json()) as { garages: OwnedGarage[] }).garages;
    } catch {
      this.ownedLoadFailed = true;
      this.message = this.copy.loadError;
    } finally {
      this.ownedLoading = false;
      this.ownedLoaded = true;
      this.cdr.markForCheck();
    }
  }
  protected addressChanged(): void {
    this.locationVerified = false;
  }
  protected validate(): boolean {
    const errors: Record<string, string> = {};
    for (const field of ['name', 'placeId', 'contactPerson'] as const)
      if (!this.form[field].trim()) errors[field] = this.copy.required;
    if (this.form.contactPhone.trim().length < 3) errors['contactPhone'] = this.copy.phoneError;
    if (this.form.publicPhone && this.form.publicPhone.trim().length < 3)
      errors['publicPhone'] = this.copy.phoneError;
    for (const field of ['serviceCategoryIds', 'languages'] as const)
      if (!this.form[field].length) errors[field] = this.copy.selectRequired;
    if (!validGarageAddress(this.profile().address, this.form.placeId))
      errors['street'] = this.copy.addressError;
    if (
      this.form.address.trim() &&
      this.form.placeId &&
      !addressMatchesPlace(this.form.address, this.form.placeId)
    )
      errors['street'] = this.copy.conflict;
    if (!this.garageId && !this.consentAccepted) errors['consent'] = this.copy.required;
    this.errors = errors;
    if (Object.keys(errors).length) {
      this.message = this.copy.invalid;
      this.cdr.detectChanges();
      this.formElement()
        ?.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus();
      return false;
    }
    return true;
  }
  private profile(): Form {
    if (!this.form.publicPhone?.trim()) this.form.publicWhatsapp = false;
    return {
      ...this.form,
      name: this.form.name.trim(),
      contactPerson: this.form.contactPerson.trim(),
      contactPhone: this.form.contactPhone.trim(),
      publicPhone: this.form.publicPhone?.trim() || undefined,
      publicWhatsapp: this.form.publicWhatsapp,
      address: this.form.address.trim(),
    };
  }
  protected async submit(): Promise<void> {
    if (this.sending || this.loading || !this.validate()) return;
    const csrf = document.cookie
      .split('; ')
      .find((cookie) => cookie.startsWith('autokosova_csrf='))
      ?.split('=')[1];
    if (!csrf) {
      this.needsLogin = true;
      this.message = this.copy.signIn;
      return;
    }
    this.sending = true;
    this.message = '';
    try {
      const profile = this.profile();
      const response = await fetch(
        this.garageId ? '/api/garages/' + encodeURIComponent(this.garageId) : '/api/garages',
        {
          method: this.garageId ? 'PUT' : 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
          body: JSON.stringify(
            this.garageId ? profile : { consentVersion: 'garage-onboarding-v1', profile },
          ),
        },
      );
      if (response.status === 401 || response.status === 403) {
        this.needsLogin = true;
        this.message = this.copy.signIn;
        return;
      }
      if (response.status === 409) {
        this.message = this.copy.duplicate;
        await this.loadOwned();
        return;
      }
      if (!response.ok) throw new Error();
      if (!this.garageId) {
        this.garageId = ((await response.json()) as { id: string }).id;
        this.canDelete = true;
        this.editing = true;
        await this.account.refresh();
      }
      if (this.publicationState === 'pending_review') this.publicationState = 'draft';
      this.form = profile;
      this.savedSnapshot = JSON.stringify(this.form);
      this.message =
        this.publicationState === 'published' ? this.copy.publicSaved : this.copy.saved;
      await this.loadOwned();
    } catch {
      this.message = this.copy.error;
    } finally {
      this.sending = false;
      this.cdr.markForCheck();
    }
  }
  protected async open(id: string): Promise<void> {
    if (!this.canLeave()) return;
    this.loading = true;
    this.message = '';
    try {
      const response = await fetch('/api/garages/' + encodeURIComponent(id), { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const garage = (await response.json()) as PrivateGarage;
      this.form = { ...garage.profile, address: garage.profile.address ?? blankForm().address };
      this.garageId = garage.id;
      this.canDelete = garage.canDelete === true;
      this.publicationState = garage.publicationState;
      this.consentAccepted = true;
      this.locationVerified =
        !!garage.profile.locationPoint && garage.verification.location === 'verified';
      this.savedSnapshot = JSON.stringify(this.form);
      this.errors = {};
      this.editing = true;
      this.focusTitle();
    } catch {
      this.message = this.copy.loadError;
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }
  protected reset(): void {
    if (!this.canLeave()) return;
    this.clearForm();
    this.editing = true;
    this.focusTitle();
  }
  private clearForm(): void {
    this.canDelete = false;
    this.form = blankForm();
    this.garageId = undefined;
    this.consentAccepted = false;
    this.locationVerified = false;
    this.publicationState = 'draft';
    this.message = '';
    this.errors = {};
    this.savedSnapshot = JSON.stringify(this.form);
  }
  protected async remove(): Promise<void> {
    if (!this.garageId || !this.canDelete || this.sending || this.loading) return;
    if (!window.confirm(this.management.confirm.replace('{name}', this.form.name))) return;
    const csrf = document.cookie
      .split('; ')
      .find((cookie) => cookie.startsWith('autokosova_csrf='))
      ?.split('=')[1];
    if (!csrf) {
      this.needsLogin = true;
      this.message = this.copy.signIn;
      return;
    }
    this.sending = true;
    this.message = '';
    try {
      const response = await fetch('/api/garages/' + encodeURIComponent(this.garageId), {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'x-csrf-token': csrf },
      });
      if (response.status === 401 || response.status === 403) {
        this.needsLogin = true;
        this.message = this.copy.signIn;
        return;
      }
      if (!response.ok) throw new Error();
      this.clearForm();
      this.editing = false;
      this.message = this.management.deleted;
      await this.loadOwned();
      await this.account.refresh();
      this.focusTitle();
    } catch {
      this.message = this.copy.error;
    } finally {
      this.sending = false;
      this.cdr.markForCheck();
    }
  }
  protected async submitForReview(): Promise<void> {
    if (
      !this.garageId ||
      !this.unchanged ||
      this.sending ||
      this.loading ||
      (this.publicationState !== 'draft' && this.publicationState !== 'rejected')
    )
      return;
    this.sending = true;
    this.message = '';
    try {
      const csrf =
        document.cookie
          .split('; ')
          .find((cookie) => cookie.startsWith('autokosova_csrf='))
          ?.split('=')[1] ?? '';
      const response = await fetch(
        '/api/garages/' + encodeURIComponent(this.garageId) + '/submit-for-review',
        { method: 'POST', headers: { 'x-csrf-token': csrf } },
      );
      if (response.status === 401 || response.status === 403) {
        this.needsLogin = true;
        this.message = this.copy.signIn;
        return;
      }
      if (!response.ok) throw new Error();
      this.needsLogin = false;
      this.publicationState = 'pending_review';
      this.message = this.copy.submitted;
    } catch {
      this.message = this.copy.error;
    } finally {
      this.sending = false;
      this.cdr.markForCheck();
    }
  }
}
