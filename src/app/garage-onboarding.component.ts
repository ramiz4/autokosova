import {
  LucideArrowRight,
  LucideBadgeCheck,
  LucideInfo,
  LucideMapPin,
  LucidePencil,
  LucideSearch,
  LucideShieldCheck,
  type LucideIcon,
} from '@lucide/angular';
import { adminLabel } from '../shared/admin-copy';
import type { AdminSupportContext } from '../shared/administration';
import { garageManagementCopy } from '../shared/garage-management-copy';
import { accountType } from '../shared/account';
import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectorRef,
  DestroyRef,
  Component,
  ElementRef,
  PLATFORM_ID,
  inject,
  input,
  output,
  viewChild,
  effect,
  untracked,
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
import { LucideIconComponent } from './ui/lucide-icon.component';
import { MultiSelectComponent, type SelectionOption } from './ui/multi-select.component';
import { ConfirmationDialogComponent } from './ui/confirmation-dialog.component';

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
  imports: [
    FormsModule,
    RouterLink,
    NgTemplateOutlet,
    SiteHeaderComponent,
    LucideIconComponent,
    MultiSelectComponent,
    ConfirmationDialogComponent,
  ],
  templateUrl: './garage-onboarding.component.html',
  styleUrl: './garage-onboarding.component.scss',
  host: {
    '(window:beforeunload)': 'onBeforeUnload($event)',
  },
})
export class GarageOnboardingComponent {
  readonly confirmation = viewChild.required<ConfirmationDialogComponent>('confirmation');
  readonly ArrowRightIcon: LucideIcon = LucideArrowRight;
  readonly BadgeCheckIcon: LucideIcon = LucideBadgeCheck;
  readonly InfoIcon: LucideIcon = LucideInfo;
  readonly MapPinIcon: LucideIcon = LucideMapPin;
  readonly PencilIcon: LucideIcon = LucidePencil;
  readonly SearchIcon: LucideIcon = LucideSearch;
  readonly ShieldCheckIcon: LucideIcon = LucideShieldCheck;

  readonly supportContext = input<AdminSupportContext | null>(null);
  readonly supportSaved = output<string>();
  protected get supportMode(): boolean {
    return !!this.supportContext() && this.account.identity()?.roles.includes('admin') === true;
  }
  protected supportLabel(key: string): string {
    return adminLabel(key, this.language.language);
  }
  private loadedSupport: AdminSupportContext | null = null;

  protected readonly language = inject(LanguageService);
  protected readonly account = inject(AccountSessionService);
  protected readonly accountType = accountType;
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private dataOwnerId?: string;
  private accountRevision = 0;
  private readonly formElement = viewChild<ElementRef<HTMLFormElement>>('formElement');
  protected form = blankForm();
  protected consentAccepted = false;
  protected sending = false;
  protected loading = false;
  protected message = '';
  protected messageRole: 'status' | 'alert' = 'status';
  protected needsLogin = false;
  protected errors: Record<string, string> = {};
  protected garageId?: string;
  protected canDelete = false;
  protected get management() {
    return garageManagementCopy[this.language.language];
  }
  protected publicationState: GaragePublicationState = 'draft';
  protected locationVerified = false;
  protected statusKnown = true;
  protected savedSnapshot = JSON.stringify(this.form);
  protected owned: OwnedGarage[] = [];
  protected ownedLoadFailed = false;
  protected ownedLoading = false;
  protected ownedLoaded = false;
  protected editing = false;
  protected activeSection = 'garage-basics';
  private readonly workspaceTitle = viewChild<ElementRef<HTMLElement>>('workspaceTitle');
  protected get managing(): boolean {
    return (
      !this.supportMode &&
      this.account.signedIn() &&
      accountType(this.account.identity()) === 'garage'
    );
  }
  protected get showForm(): boolean {
    return this.supportMode || !this.managing || this.editing;
  }
  protected get workspaceVisible(): boolean {
    return (
      !this.dataOwnerId ||
      (this.account.state() === 'ready' &&
        this.account.identity()?.userId === this.dataOwnerId &&
        !this.account.busy())
    );
  }
  private captureContext() {
    const userId = this.account.identity()?.userId;
    this.dataOwnerId ??= userId;
    return { userId, revision: this.accountRevision };
  }
  private currentContext(context: { userId?: string; revision: number }): boolean {
    return (
      context.revision === this.accountRevision &&
      (context.userId === this.account.identity()?.userId ||
        (['loading', 'error'].includes(this.account.state()) &&
          this.dataOwnerId === context.userId))
    );
  }
  private focusTitle(): void {
    this.cdr.detectChanges();
    this.workspaceTitle()?.nativeElement.focus();
  }
  protected async backToOverview(): Promise<void> {
    if (!(await this.canLeave())) return;
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
  protected get previewUnsaved(): boolean {
    return !!this.garageId && !this.unchanged;
  }
  protected get previewServices(): string[] {
    return this.form.serviceCategoryIds.map((id) => this.language.serviceLabel(id));
  }
  protected get previewMakes(): string[] {
    return this.form.vehicleMakeIds.map((id) => VEHICLE_MAKE_LABELS[id] ?? id);
  }
  protected get previewLanguages(): string[] {
    return this.form.languages.map((id) => garageOptionLabels[this.language.language][id] ?? id);
  }
  protected get previewPlace(): string {
    return this.places.find((place) => place.id === this.form.placeId)?.label ?? '';
  }
  protected navigateToSection(id: string): void {
    this.activeSection = id;
    if (!this.browser) return;
    const target = document.getElementById(id);
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  }
  protected get saveDisabled(): boolean {
    return (
      !this.workspaceVisible ||
      this.sending ||
      this.loading ||
      this.publicationState === 'suspended' ||
      (!!this.garageId && (this.unchanged || !this.statusKnown))
    );
  }
  protected cancelEditing(): void {
    if (this.managing) this.backToOverview();
    else this.reset();
  }
  private async rejectResponse(
    response: Response,
    fallback = this.copy.error,
    creating = false,
  ): Promise<boolean> {
    if (response.ok) return false;
    this.messageRole = 'alert';
    this.needsLogin = response.status === 401;
    if (response.status === 401) this.message = this.copy.signIn;
    else if (response.status === 403) {
      const body = (await response.json().catch(() => null)) as { code?: unknown } | null;
      this.needsLogin = body?.code === 'csrf_invalid';
      this.message = this.needsLogin ? this.management.csrfError : this.management.forbidden;
    } else if (response.status === 409) {
      this.message = creating ? this.copy.duplicate : this.management.writeConflict;
    } else if (response.status === 404) this.message = this.management.missing;
    else if (response.status === 422 || response.status === 400) this.message = this.copy.invalid;
    else this.message = fallback;
    return true;
  }
  private get hasUnsavedChanges(): boolean {
    return !this.unchanged || (!this.garageId && this.consentAccepted);
  }
  async canLeave(): Promise<boolean> {
    if (!this.workspaceVisible || this.sending || this.loading) return false;
    if (!this.hasUnsavedChanges) return true;
    const context = this.captureContext();
    const accepted = await this.confirmation().ask({
      title: this.copy.discard,
      description: this.copy.discard,
      confirmLabel: this.management.back,
      cancelLabel: this.management.cancel,
    });
    return (
      accepted &&
      this.currentContext(context) &&
      this.workspaceVisible &&
      !this.sending &&
      !this.loading &&
      this.hasUnsavedChanges
    );
  }
  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.hasUnsavedChanges && !this.sending && !this.loading) return;
    event.preventDefault();
    event.returnValue = '';
  }
  protected get stateLabel(): string {
    return this.stateLabelFor(this.publicationState);
  }
  protected stateLabelFor(state: GaragePublicationState): string {
    const labels = {
      draft: this.copy.stateDraft,
      pending_review: this.copy.statePending,
      published: this.copy.statePublished,
      rejected: this.copy.stateRejected,
      suspended: this.copy.stateSuspended,
    };
    return labels[state];
  }
  protected stateHelpFor(state: GaragePublicationState): string {
    return {
      draft: this.management.draftHelp,
      pending_review: this.management.pendingHelp,
      published: this.management.publishedHelp,
      rejected: this.management.rejectedHelp,
      suspended: this.management.suspendedHelp,
    }[state];
  }
  private async refreshStatus(): Promise<void> {
    this.statusKnown = false;
    await this.loadOwned();
    const current = this.ownedLoadFailed
      ? undefined
      : this.owned.find((g) => g.id === this.garageId);
    if (current) {
      this.publicationState = current.publicationState;
      this.statusKnown = true;
    }
  }
  constructor() {
    this.language.setPage('home.garageOnboarding', 'home.intro', true);
    effect(() => {
      const id = this.account.identity()?.userId;
      const state = this.account.state();
      this.confirmation().cancelPending();
      untracked(() => {
        // A refresh of the same account temporarily hides, but does not discard, unsaved work.
        // A confirmed logout or different account must forget the previous private workspace.
        if (
          this.dataOwnerId &&
          (state === 'guest' || (state === 'ready' && id !== this.dataOwnerId))
        ) {
          this.accountRevision++;
          this.clearForm();
          this.editing = false;
          this.owned = [];
          this.ownedLoaded = false;
          this.ownedLoading = false;
          this.ownedLoadFailed = false;
          this.sending = false;
          this.loading = false;
          this.dataOwnerId = undefined;
        }
        if (state === 'ready' && id) {
          this.dataOwnerId = id;
          if (this.browser && !this.ownedLoaded && !this.ownedLoading) void this.loadOwned();
        }
        this.cdr.markForCheck();
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.accountRevision++;
      this.clearForm();
      this.owned = [];
      this.dataOwnerId = undefined;
    });
    effect(() => {
      const context = this.supportContext(),
        allowed = this.account.identity()?.roles.includes('admin') === true;
      if (this.browser && context && allowed && context !== this.loadedSupport) {
        this.loadedSupport = context;
        untracked(() => {
          this.clearForm();
          if (context.garageId) void this.open(context.garageId);
        });
      }
    });
    if (this.browser) void this.refreshSession();
  }
  protected async refreshSession(): Promise<void> {
    await this.account.refresh();
    this.needsLogin = !this.account.signedIn();
    if (this.account.signedIn()) await this.loadOwned();
    else this.owned = [];
    this.cdr.markForCheck();
  }
  private async loadOwned(): Promise<void> {
    if (this.supportMode) {
      this.owned = [];
      this.ownedLoaded = true;
      return;
    }
    if (this.ownedLoading) return;
    const context = this.captureContext();
    this.ownedLoadFailed = false;
    this.ownedLoading = true;
    try {
      const response = await fetch('/api/me/garages', { cache: 'no-store' });
      if (!this.currentContext(context)) return;
      if (await this.rejectResponse(response, this.copy.loadError)) {
        this.ownedLoadFailed = true;
        return;
      }
      const data = (await response.json()) as { garages: OwnedGarage[] };
      if (!this.currentContext(context)) return;
      this.owned = data.garages;
    } catch {
      if (!this.currentContext(context)) return;
      this.ownedLoadFailed = true;
      this.messageRole = 'alert';
      this.message = this.copy.loadError;
    } finally {
      if (this.currentContext(context)) {
        this.ownedLoading = false;
        this.ownedLoaded = true;
        this.cdr.markForCheck();
      }
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
      this.messageRole = 'alert';
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
    if (this.saveDisabled || !this.validate()) return;
    const csrf = document.cookie
      .split('; ')
      .find((cookie) => cookie.startsWith('autokosova_csrf='))
      ?.split('=')[1];
    if (!csrf) {
      this.needsLogin = true;
      this.messageRole = 'alert';
      this.message = this.copy.signIn;
      return;
    }
    const context = this.captureContext();
    this.sending = true;
    this.message = '';
    try {
      const profile = this.profile();
      const support = this.supportMode ? this.supportContext() : null;
      const response = await fetch(
        support
          ? this.garageId
            ? '/api/admin/management/garages/' + encodeURIComponent(this.garageId) + '/profile'
            : '/api/admin/garages/assisted-onboarding'
          : this.garageId
            ? '/api/garages/' + encodeURIComponent(this.garageId)
            : '/api/garages',
        {
          method: this.garageId ? 'PUT' : 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
          body: JSON.stringify(
            support
              ? this.garageId
                ? {
                    profile,
                    revision: support.revision,
                    reason: 'documented_support',
                    requestReference: support.requestReference,
                  }
                : {
                    profile,
                    applicantUserId: support.applicantUserId,
                    consentVersion: 'garage-onboarding-v1',
                    consentSource: 'documented_support_request',
                    requestReference: support.requestReference,
                  }
              : this.garageId
                ? profile
                : { consentVersion: 'garage-onboarding-v1', profile },
          ),
        },
      );
      if (!this.currentContext(context)) return;
      if (await this.rejectResponse(response, this.copy.error, !this.garageId)) return;
      this.needsLogin = false;
      this.messageRole = 'status';
      if (!this.garageId) {
        const created = (await response.json()) as { id: string };
        if (!this.currentContext(context)) return;
        this.garageId = created.id;
        this.canDelete = !support;
        this.editing = true;
        await this.account.refresh();
        if (!this.currentContext(context)) return;
      }
      this.form = profile;
      this.savedSnapshot = JSON.stringify(this.form);
      if (support) {
        this.sending = false;
        this.supportSaved.emit(this.garageId!);
        return;
      }
      await this.refreshStatus();
      if (!this.currentContext(context)) return;
      this.message = !this.statusKnown
        ? this.management.statusUnavailable
        : this.publicationState === 'published'
          ? this.copy.publicSaved
          : this.copy.saved;
    } catch {
      if (!this.currentContext(context)) return;
      this.messageRole = 'alert';
      this.message = this.copy.error;
    } finally {
      if (this.currentContext(context)) {
        this.sending = false;
        this.cdr.markForCheck();
      }
    }
  }
  protected async open(id: string): Promise<void> {
    if (!(await this.canLeave())) return;
    const context = this.captureContext();
    this.loading = true;
    this.message = '';
    try {
      const response = await fetch('/api/garages/' + encodeURIComponent(id), { cache: 'no-store' });
      if (!this.currentContext(context)) return;
      if (await this.rejectResponse(response, this.copy.loadError)) return;
      this.needsLogin = false;
      const garage = (await response.json()) as PrivateGarage;
      if (!this.currentContext(context)) return;
      this.form = { ...garage.profile, address: garage.profile.address ?? blankForm().address };
      this.garageId = garage.id;
      this.canDelete = !this.supportMode && garage.canDelete === true;
      this.publicationState = garage.publicationState;
      this.statusKnown = true;
      this.consentAccepted = true;
      this.locationVerified =
        !!garage.profile.locationPoint && garage.verification.location === 'verified';
      this.savedSnapshot = JSON.stringify(this.form);
      this.errors = {};
      this.editing = true;
      this.focusTitle();
    } catch {
      if (!this.currentContext(context)) return;
      this.messageRole = 'alert';
      this.message = this.copy.loadError;
    } finally {
      if (this.currentContext(context)) {
        this.loading = false;
        this.cdr.markForCheck();
      }
    }
  }
  protected async reset(): Promise<void> {
    if (!(await this.canLeave())) return;
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
    this.statusKnown = true;
    this.message = '';
    this.messageRole = 'status';
    this.errors = {};
    this.savedSnapshot = JSON.stringify(this.form);
  }
  protected async remove(): Promise<void> {
    if (!this.workspaceVisible || !this.garageId || !this.canDelete || this.sending || this.loading)
      return;
    const context = this.captureContext();
    const id = this.garageId;
    if (
      !(await this.confirmation().ask({
        title: this.management.remove,
        description: this.management.confirm.replace('{name}', this.form.name),
        confirmLabel: this.management.remove,
        cancelLabel: this.management.cancel,
      }))
    )
      return;
    if (
      !this.currentContext(context) ||
      !this.workspaceVisible ||
      this.garageId !== id ||
      !this.canDelete ||
      this.sending ||
      this.loading
    )
      return;
    const csrf = document.cookie
      .split('; ')
      .find((cookie) => cookie.startsWith('autokosova_csrf='))
      ?.split('=')[1];
    if (!csrf) {
      this.needsLogin = true;
      this.messageRole = 'alert';
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
      if (!this.currentContext(context)) return;
      if (await this.rejectResponse(response)) return;
      this.needsLogin = false;
      this.messageRole = 'status';
      this.clearForm();
      this.editing = false;
      this.message = this.management.deleted;
      await this.loadOwned();
      await this.account.refresh();
      if (!this.currentContext(context)) return;
      this.focusTitle();
    } catch {
      if (!this.currentContext(context)) return;
      this.messageRole = 'alert';
      this.message = this.copy.error;
    } finally {
      if (this.currentContext(context)) {
        this.sending = false;
        this.cdr.markForCheck();
      }
    }
  }
  protected async submitForReview(): Promise<void> {
    if (
      this.supportMode ||
      !this.workspaceVisible ||
      !this.garageId ||
      !this.unchanged ||
      !this.statusKnown ||
      this.sending ||
      this.loading ||
      (this.publicationState !== 'draft' && this.publicationState !== 'rejected')
    )
      return;
    const context = this.captureContext();
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
      if (!this.currentContext(context)) return;
      if (await this.rejectResponse(response)) return;
      this.needsLogin = false;
      this.messageRole = 'status';
      await this.refreshStatus();
      if (!this.currentContext(context)) return;
      this.message = this.statusKnown ? this.copy.submitted : this.management.statusUnavailable;
    } catch {
      if (!this.currentContext(context)) return;
      this.messageRole = 'alert';
      this.message = this.copy.error;
    } finally {
      if (this.currentContext(context)) {
        this.sending = false;
        this.cdr.markForCheck();
      }
    }
  }
}
