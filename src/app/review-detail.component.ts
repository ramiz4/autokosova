import { Component, afterNextRender, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  LucideArrowLeft,
  LucideCalendarDays,
  LucideFileText,
  type LucideIcon,
} from '@lucide/angular';
import { reviewLabel } from '../shared/review-copy';
import type { OwnReviewDetail } from '../shared/reviews';
import { AccountSessionService } from './account-session.service';
import { LanguageService } from './language.service';
import { ReviewContributionComponent } from './review-contribution.component';
import { reviewChecked, reviewJson } from './review-http';
import { SiteHeaderComponent } from './site-header.component';
import { AuthRequiredDialogComponent } from './ui/auth-required-dialog.component';
import { ButtonDirective } from './ui/button.directive';
import { LucideIconComponent } from './ui/lucide-icon.component';
import { RatingStarsComponent } from './ui/rating-stars.component';

@Component({
  selector: 'app-review-detail',
  imports: [
    RouterLink,
    SiteHeaderComponent,
    AuthRequiredDialogComponent,
    ButtonDirective,
    LucideIconComponent,
    RatingStarsComponent,
    ReviewContributionComponent,
  ],
  templateUrl: './review-detail.component.html',
})
export class ReviewDetailComponent {
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
  protected readonly startUpdate = signal(false);
  private readonly route = inject(ActivatedRoute);

  constructor() {
    afterNextRender(() => void this.load());
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
    return new Intl.DateTimeFormat(
      this.language.language === 'de' ? 'de-CH' : this.language.language,
      { day: '2-digit', month: 'short', year: 'numeric' },
    ).format(new Date(value));
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
    this.state.set('loading');
    try {
      const response = await fetch(`/api/me/reviews/${encodeURIComponent(id)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (response.status === 404) return this.state.set('missing');
      if (!response.ok) throw new Error('load');
      const detail = (await response.json()) as OwnReviewDetail;
      if (detail.id !== id) throw new Error('invalid');
      this.detail.set(detail);
      const action = this.route.snapshot.queryParamMap.get('action');
      this.startUpdate.set(action === 'update');
      this.state.set('ready');
      void this.loadPhoto(detail.garageId);
      if (action === 'evidence') void this.openEvidence();
    } catch {
      this.state.set('error');
    }
  }
  private async loadPhoto(garageId: string): Promise<void> {
    try {
      const response = await fetch(`/api/public/garages/${encodeURIComponent(garageId)}`, {
        credentials: 'omit',
        cache: 'no-store',
      });
      if (!response.ok) return;
      const profile = (await response.json()) as { photoIds?: unknown };
      const id = Array.isArray(profile.photoIds)
        ? profile.photoIds.find((value): value is string => typeof value === 'string')
        : undefined;
      this.photoId.set(id ?? null);
    } catch {
      this.photoId.set(null);
    }
  }
  protected async openEvidence(): Promise<void> {
    const review = this.detail();
    if (!review || this.busy()) return;
    this.busy.set(true);
    try {
      const grant = await reviewJson<{ fileId: string; grantId: string; localFixture?: boolean }>(
        await fetch(`/api/reviews/${encodeURIComponent(review.id)}/evidence/download-grant`, {
          credentials: 'same-origin',
          cache: 'no-store',
        }),
      );
      if (!grant.localFixture) return;
      const response = await reviewChecked(
        await fetch(`/api/local-demo/files/${encodeURIComponent(grant.fileId)}/content`, {
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'x-file-grant': grant.grantId },
        }),
      );
      this.evidence.set(await response.text());
    } finally {
      this.busy.set(false);
    }
  }
}
