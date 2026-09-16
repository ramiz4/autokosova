import { DatePipe } from '@angular/common';
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
import { AccountSessionService } from './account-session.service';
import { LanguageService } from './language.service';
import { SiteHeaderComponent } from './site-header.component';
import { ButtonDirective } from './ui/button.directive';
import { ConfirmationDialogComponent } from './ui/confirmation-dialog.component';
import { ReviewContributionComponent } from './review-contribution.component';
import { reviewLabel } from '../shared/review-copy';
import type { OwnReviewDetail, OwnReviewPage } from '../shared/reviews';
import { ReviewHttpError, reviewJson, reviewChecked, reviewError } from './review-http';

@Component({
  selector: 'app-reviews',
  imports: [
    SiteHeaderComponent,
    RouterLink,
    DatePipe,
    ButtonDirective,
    ReviewContributionComponent,
    ConfirmationDialogComponent,
  ],
  templateUrl: './reviews.component.html',
})
export class ReviewsComponent {
  readonly confirmation = viewChild.required<ConfirmationDialogComponent>('confirmation');
  readonly account = inject(AccountSessionService);
  readonly language = inject(LanguageService);
  readonly ready = signal(false);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly reviews = signal<readonly OwnReviewDetail[]>([]);
  readonly detail = signal<OwnReviewDetail | null>(null);
  readonly evidence = signal<string | null>(null);
  readonly page = signal(1);
  readonly hasMore = signal(false);
  private dirty = false;
  private generation = 0;
  private controller = new AbortController();
  constructor() {
    afterNextRender(() => {
      this.ready.set(true);
      void this.account.refresh();
    });
    effect(() => {
      const context = this.account.dataContext(),
        ready = this.ready();
      this.confirmation().cancelPending();
      this.generation++;
      this.controller.abort();
      this.controller = new AbortController();
      this.reviews.set([]);
      this.detail.set(null);
      this.evidence.set(null);
      this.error.set('');
      this.loading.set(false);
      this.busy.set(false);
      this.dirty = false;
      if (context && ready) untracked(() => void this.load());
    });
    effect(() => this.language.setPageText(this.label('own'), this.label('intro'), true));
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
      this.controller.abort();
    });
  }
  label(key: string): string {
    return reviewLabel(key, this.language.language);
  }
  loginUrl(): string {
    return '/auth/login?returnTo=' + encodeURIComponent(this.language.link('reviews'));
  }
  async canLeave(): Promise<boolean> {
    if (this.busy() || !this.dirty) return !this.busy();
    const context = this.account.dataContext();
    const accepted = await this.confirmation().ask({
      title: this.label('discard'),
      description: this.label('discard'),
      confirmLabel: this.label('discard'),
      cancelLabel: this.label('cancel'),
    });
    return accepted && context === this.account.dataContext() && !this.busy() && this.dirty;
  }
  setDirty(value: boolean): void {
    this.dirty = value;
  }
  private current(generation: number, context: unknown): boolean {
    return generation === this.generation && context === this.account.dataContext();
  }
  async load(page = 1): Promise<void> {
    if (!this.account.dataContext() || this.busy() || !(await this.canLeave())) return;
    const generation = ++this.generation,
      context = this.account.dataContext();
    this.controller.abort();
    this.controller = new AbortController();
    this.loading.set(true);
    this.error.set('');
    this.detail.set(null);
    this.evidence.set(null);
    this.dirty = false;
    try {
      const data = await reviewJson<OwnReviewPage>(
        await fetch('/api/me/reviews?page=' + page, {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: this.controller.signal,
        }),
      );
      if (this.current(generation, context)) {
        if (!Array.isArray(data.reviews) || typeof data.hasMore !== 'boolean')
          throw new Error('Invalid review page');
        this.reviews.set(data.reviews);
        this.page.set(data.page);
        this.hasMore.set(data.hasMore);
      }
    } catch (error) {
      if (this.current(generation, context)) {
        this.reviews.set([]);
        this.failure(error);
      }
    } finally {
      if (this.current(generation, context)) this.loading.set(false);
    }
  }
  async open(id: string, afterSaved = false): Promise<void> {
    if (!afterSaved && !(await this.canLeave())) return;
    const generation = ++this.generation,
      context = this.account.dataContext();
    this.controller.abort();
    this.controller = new AbortController();
    this.loading.set(true);
    this.error.set('');
    this.detail.set(null);
    this.evidence.set(null);
    this.dirty = false;
    try {
      const data = await reviewJson<OwnReviewDetail>(
        await fetch('/api/me/reviews/' + encodeURIComponent(id), {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: this.controller.signal,
        }),
      );
      if (this.current(generation, context)) {
        if (data.id !== id || typeof data.text !== 'string') throw new Error('Invalid own review');
        this.detail.set(data);
      }
    } catch (error) {
      if (this.current(generation, context)) this.failure(error);
    } finally {
      if (this.current(generation, context)) this.loading.set(false);
    }
  }
  async openEvidence(): Promise<void> {
    const detail = this.detail();
    if (!detail || this.busy()) return;
    const generation = this.generation,
      context = this.account.dataContext();
    this.busy.set(true);
    this.error.set('');
    this.evidence.set(null);
    try {
      const grant = await reviewJson<{ fileId: string; grantId: string; localFixture?: boolean }>(
        await fetch('/api/reviews/' + encodeURIComponent(detail.id) + '/evidence/download-grant', {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: this.controller.signal,
        }),
      );
      if (!this.current(generation, context)) return;
      if (!grant.localFixture) throw new ReviewHttpError(503);
      const response = await reviewChecked(
        await fetch('/api/local-demo/files/' + encodeURIComponent(grant.fileId) + '/content', {
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'x-file-grant': grant.grantId },
          signal: this.controller.signal,
        }),
      );
      const text = await response.text();
      if (this.current(generation, context)) this.evidence.set(text);
    } catch (error) {
      if (this.current(generation, context)) this.failure(error);
    } finally {
      if (this.current(generation, context)) this.busy.set(false);
    }
  }
  private failure(error: unknown): void {
    if (error instanceof ReviewHttpError && error.status === 401) {
      this.account.invalidate();
      return;
    }
    this.error.set(reviewError(error, this.language.language));
  }
}
