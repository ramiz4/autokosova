import { Component, DestroyRef, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  LucideArrowLeft,
  LucideCalendarDays,
  LucideFileText,
  type LucideIcon,
} from '@autokosova/icons';
import { reviewLabel } from '../shared/review-copy';
import type { OwnReviewDetail } from '../shared/reviews';
import { AccountSessionService } from './account-session.service';
import { LanguageService } from './language.service';
import { ReviewContributionComponent } from './review-contribution.component';
import { ReviewHttpError, reviewChecked, reviewError, reviewJson } from './review-http';
import { SiteHeaderComponent } from './site-header.component';
import { AuthRequiredDialogComponent } from './ui/auth-required-dialog.component';
import { ButtonDirective } from './ui/button.directive';
import { ConfirmationDialogComponent } from './ui/confirmation-dialog.component';
import { LucideIconComponent } from './ui/lucide-icon.component';
import { RatingStarsComponent } from './ui/rating-stars.component';

@Component({
  selector: 'app-review-detail',
  imports: [
    RouterLink,
    SiteHeaderComponent,
    AuthRequiredDialogComponent,
    ButtonDirective,
    ConfirmationDialogComponent,
    LucideIconComponent,
    RatingStarsComponent,
    ReviewContributionComponent,
  ],
  templateUrl: './review-detail.component.html',
})
export class ReviewDetailComponent {
  readonly confirmation = viewChild.required<ConfirmationDialogComponent>('confirmation');
  readonly ArrowLeftIcon: LucideIcon = LucideArrowLeft;
  readonly CalendarIcon: LucideIcon = LucideCalendarDays;
  readonly EvidenceIcon: LucideIcon = LucideFileText;
  protected readonly account = inject(AccountSessionService);
  protected readonly language = inject(LanguageService);
  protected readonly detail = signal<OwnReviewDetail | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'error' | 'missing'>('loading');
  protected readonly photoId = signal<string | null>(null);
  protected readonly evidence = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly startUpdate = signal(false);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private dirty = false;
  private generation = 0;
  private controller = new AbortController();

  constructor() {
    afterNextRender(() => void this.load());
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
      this.controller.abort();
      this.confirmation().cancelPending();
    });
  }
  protected routeUrl(): string {
    return this.language.link('review-detail', this.route.snapshot.paramMap.get('reviewId') ?? '');
  }
  protected loginUrl(): string {
    return `/auth/login?returnTo=${encodeURIComponent(this.routeUrl())}`;
  }
  protected label(key: string): string {
    return reviewLabel(key, this.language.language);
  }
  protected submittedAt(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(
      this.language.language === 'de' ? 'de-CH' : this.language.language,
      { day: '2-digit', month: 'short', year: 'numeric' },
    ).format(date);
  }
  protected photoUrl(review: OwnReviewDetail): string | null {
    const id = this.photoId();
    return id
      ? `/api/public/garages/${encodeURIComponent(review.garageId)}/photos/${encodeURIComponent(id)}`
      : null;
  }
  protected async load(): Promise<void> {
    await this.account.refresh();
    if (!this.account.signedIn()) return;
    const id = this.route.snapshot.paramMap.get('reviewId') ?? '';
    const generation = ++this.generation;
    const context = this.account.dataContext();
    this.controller.abort();
    this.controller = new AbortController();
    this.detail.set(null);
    this.photoId.set(null);
    this.state.set('loading');
    this.error.set('');
    this.evidence.set(null);
    this.startUpdate.set(false);
    this.dirty = false;
    try {
      const detail = await reviewJson<OwnReviewDetail>(
        await fetch(`/api/me/reviews/${encodeURIComponent(id)}`, {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: this.controller.signal,
        }),
      );
      if (!this.current(generation, context)) return;
      if (detail.id !== id) throw new Error('invalid');
      this.detail.set(detail);
      const action = this.route.snapshot.queryParamMap.get('action');
      this.startUpdate.set(action === 'update');
      this.state.set('ready');
      void this.loadPhoto(detail.garageId, generation, context, this.controller.signal);
      if (action === 'evidence') void this.openEvidence();
      if (action)
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { action: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
    } catch (error) {
      if (!this.current(generation, context)) return;
      if (error instanceof ReviewHttpError && error.status === 404) this.state.set('missing');
      else this.failure(error);
    }
  }
  private async loadPhoto(
    garageId: string,
    generation: number,
    context: unknown,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      const response = await fetch(`/api/public/garages/${encodeURIComponent(garageId)}`, {
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        signal,
      });
      if (!response.ok) return;
      const profile = (await response.json()) as { photoIds?: unknown };
      const id = Array.isArray(profile.photoIds)
        ? profile.photoIds.find((value): value is string => typeof value === 'string')
        : undefined;
      if (this.current(generation, context)) this.photoId.set(id ?? null);
    } catch {
      if (this.current(generation, context)) this.photoId.set(null);
    }
  }
  protected async openEvidence(): Promise<void> {
    const review = this.detail();
    if (!review || this.busy()) return;
    const generation = this.generation;
    const context = this.account.dataContext();
    this.busy.set(true);
    this.error.set('');
    this.evidence.set(null);
    try {
      const grant = await reviewJson<{ fileId: string; grantId: string; localFixture?: boolean }>(
        await fetch(`/api/reviews/${encodeURIComponent(review.id)}/evidence/download-grant`, {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: this.controller.signal,
        }),
      );
      if (!this.current(generation, context)) return;
      if (!grant.localFixture) throw new ReviewHttpError(503);
      const response = await reviewChecked(
        await fetch(`/api/local-demo/files/${encodeURIComponent(grant.fileId)}/content`, {
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'x-file-grant': grant.grantId },
          signal: this.controller.signal,
        }),
      );
      const content = await response.text();
      if (this.current(generation, context)) this.evidence.set(content);
    } catch (error) {
      if (this.current(generation, context)) this.failure(error);
    } finally {
      if (this.current(generation, context)) this.busy.set(false);
    }
  }
  protected setDirty(value: boolean): void {
    this.dirty = value;
  }
  canLeave(): boolean | Promise<boolean> {
    if (!this.dirty) return true;
    const context = this.account.dataContext();
    return this.confirmation()
      .ask({
        title: this.label('discard'),
        description: this.label('discard'),
        confirmLabel: this.label('discard'),
        cancelLabel: this.label('cancel'),
      })
      .then((accepted) => accepted && context === this.account.dataContext() && this.dirty);
  }
  private current(generation: number, context: unknown): boolean {
    return generation === this.generation && context === this.account.dataContext();
  }
  private failure(error: unknown): void {
    if (error instanceof ReviewHttpError && error.status === 401) {
      this.account.invalidate();
      return;
    }
    this.error.set(reviewError(error, this.language.language));
    if (!this.detail()) this.state.set('error');
  }
}
