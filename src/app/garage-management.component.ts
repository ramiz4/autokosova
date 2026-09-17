import {
  Component,
  DestroyRef,
  afterNextRender,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideMapPin,
  LucidePencil,
  LucidePlus,
  LucideShieldCheck,
  LucideTrash2,
  type LucideIcon,
} from '@autokosova/icons';
import { accountType } from '../shared/account';
import { CATALOG_PLACES } from '../shared/catalog';
import { garageManagementCopy } from '../shared/garage-management-copy';
import type { GaragePublicationState } from '../shared/garage-onboarding';
import { onboardingCopy } from '../shared/onboarding-copy';
import { AccountSessionService } from './account-session.service';
import { LanguageService } from './language.service';
import { SiteHeaderComponent } from './site-header.component';
import { ButtonDirective } from './ui/button.directive';
import { AuthRequiredDialogComponent } from './ui/auth-required-dialog.component';
import { ConfirmationDialogComponent } from './ui/confirmation-dialog.component';
import { LucideIconComponent } from './ui/lucide-icon.component';

interface ManagedGarage {
  canDelete: boolean;
  id: string;
  name: string;
  photoId?: string;
  placeId: string;
  publicationState: GaragePublicationState;
  serviceCategoryIds?: readonly string[];
  updatedAt?: string;
}

@Component({
  selector: 'app-garage-management',
  imports: [
    RouterLink,
    SiteHeaderComponent,
    ButtonDirective,
    ConfirmationDialogComponent,
    LucideIconComponent,
    AuthRequiredDialogComponent,
  ],
  templateUrl: './garage-management.component.html',
  styleUrl: './garage-management.component.scss',
})
export class GarageManagementComponent {
  readonly MapPinIcon: LucideIcon = LucideMapPin;
  readonly PencilIcon: LucideIcon = LucidePencil;
  readonly PlusIcon: LucideIcon = LucidePlus;
  readonly ShieldCheckIcon: LucideIcon = LucideShieldCheck;
  readonly TrashIcon: LucideIcon = LucideTrash2;
  readonly confirmation = viewChild.required<ConfirmationDialogComponent>('confirmation');

  protected readonly account = inject(AccountSessionService);
  protected readonly language = inject(LanguageService);
  protected readonly garages = signal<readonly ManagedGarage[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'error' | 'forbidden'>('loading');
  protected readonly deletingId = signal<string | null>(null);
  protected readonly failedPhotos = signal<ReadonlySet<string>>(new Set());
  protected readonly message = signal('');
  private generation = 0;
  private controller = new AbortController();

  constructor() {
    effect(() => this.language.setPageText(this.management.title, this.management.intro, true));
    effect(() => {
      const context = this.account.dataContext();
      const accountState = this.account.state();
      untracked(() => {
        this.generation++;
        this.controller.abort();
        this.controller = new AbortController();
        this.garages.set([]);
        this.failedPhotos.set(new Set());
        this.message.set('');
        if (!context && accountState === 'guest') this.state.set('forbidden');
      });
    });
    afterNextRender(() => void this.refresh());
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
      this.controller.abort();
      this.confirmation().cancelPending();
    });
  }

  protected get management() {
    return garageManagementCopy[this.language.language];
  }
  protected get copy() {
    return onboardingCopy[this.language.language];
  }
  protected placeLabel(placeId: string): string {
    return CATALOG_PLACES.find((place) => place.id === placeId)?.label ?? placeId;
  }
  protected stateLabel(state: GaragePublicationState): string {
    return {
      draft: this.copy.stateDraft,
      pending_review: this.copy.statePending,
      published: this.copy.statePublished,
      rejected: this.copy.stateRejected,
      suspended: this.copy.stateSuspended,
    }[state];
  }
  protected editLink(id: string): string {
    return this.language.link('garage-management-edit', id);
  }
  protected loginUrl(): string {
    return `/auth/login?returnTo=${encodeURIComponent(this.language.link('garage-management'))}`;
  }
  protected photoUrl(garage: ManagedGarage): string | null {
    return garage.photoId && !this.failedPhotos().has(garage.id)
      ? `/api/public/garages/${encodeURIComponent(garage.id)}/photos/${encodeURIComponent(garage.photoId)}`
      : null;
  }
  protected photoFailed(id: string): void {
    this.failedPhotos.update((current) => new Set([...current, id]));
  }
  protected async refresh(): Promise<void> {
    await this.account.refresh();
    if (!this.account.signedIn() || accountType(this.account.identity()) !== 'garage') {
      this.state.set('forbidden');
      return;
    }
    const generation = ++this.generation;
    const context = this.account.dataContext();
    this.controller.abort();
    this.controller = new AbortController();
    this.state.set('loading');
    try {
      const response = await fetch('/api/me/garages', {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: this.controller.signal,
      });
      if (!this.current(generation, context)) return;
      if (response.status === 401) {
        this.account.invalidate();
        return;
      }
      if (!response.ok) throw new Error('load');
      const data = (await response.json()) as { garages: ManagedGarage[] };
      const garages = await this.withPublicPhotos(data.garages, this.controller.signal);
      if (!this.current(generation, context)) return;
      this.garages.set(garages);
      this.state.set('ready');
    } catch {
      if (this.current(generation, context)) this.state.set('error');
    }
  }
  private async withPublicPhotos(
    garages: readonly ManagedGarage[],
    signal: AbortSignal,
  ): Promise<readonly ManagedGarage[]> {
    return Promise.all(
      garages.map(async (garage) => {
        if (garage.photoId || garage.publicationState !== 'published') return garage;
        try {
          const response = await fetch(`/api/public/garages/${encodeURIComponent(garage.id)}`, {
            credentials: 'omit',
            cache: 'no-store',
            referrerPolicy: 'no-referrer',
            signal,
          });
          if (!response.ok) return garage;
          const profile = (await response.json()) as { photoIds?: unknown };
          const photoId = Array.isArray(profile.photoIds)
            ? profile.photoIds.find((value): value is string => typeof value === 'string')
            : undefined;
          return photoId ? { ...garage, photoId } : garage;
        } catch {
          return garage;
        }
      }),
    );
  }
  protected async remove(garage: ManagedGarage): Promise<void> {
    if (!garage.canDelete || this.deletingId()) return;
    const accepted = await this.confirmation().ask({
      title: this.management.remove,
      description: this.management.confirm.replace('{name}', garage.name),
      confirmLabel: this.management.remove,
      cancelLabel: this.management.cancel,
    });
    if (!accepted) return;
    const csrf = document.cookie
      .split('; ')
      .find((cookie) => cookie.startsWith('autokosova_csrf='))
      ?.split('=')[1];
    if (!csrf) return;
    const context = this.account.dataContext();
    this.deletingId.set(garage.id);
    try {
      const response = await fetch('/api/garages/' + encodeURIComponent(garage.id), {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'x-csrf-token': csrf },
      });
      if (context !== this.account.dataContext()) return;
      if (response.status === 401) {
        this.account.invalidate();
        return;
      }
      if (!response.ok) throw new Error('delete');
      this.garages.update((items) => items.filter((item) => item.id !== garage.id));
      this.message.set(this.management.deleted);
      await this.account.refresh();
    } catch {
      if (context === this.account.dataContext()) this.message.set(this.copy.error);
    } finally {
      if (context === this.account.dataContext()) this.deletingId.set(null);
    }
  }
  private current(generation: number, context: unknown): boolean {
    return generation === this.generation && context === this.account.dataContext();
  }
}
