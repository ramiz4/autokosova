import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  Injector,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AccountSessionService } from './account-session.service';
import { LanguageService } from './language.service';
import { ButtonDirective } from './ui/button.directive';
import { reviewLabel } from '../shared/review-copy';
import type { PublicGarageReview, ReviewUpdateKind } from '../shared/reviews';
import { ReviewHttpError, reviewChecked, reviewCsrf, reviewError } from './review-http';

@Component({
  selector: 'app-review-contribution',
  imports: [FormsModule, ButtonDirective],
  templateUrl: './review-contribution.component.html',
  host: { '(window:beforeunload)': 'beforeUnload($event)' },
})
export class ReviewContributionComponent {
  readonly reviewId = input.required<string>();
  readonly garageId = input.required<string>();
  readonly mode = input<'response' | 'update'>('response');
  readonly response = input<PublicGarageReview['garageResponse']>();
  readonly changed = output<void>();
  readonly dirtyChange = output<boolean>();
  readonly account = inject(AccountSessionService);
  readonly language = inject(LanguageService);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  readonly canWrite = computed(
    () =>
      this.account.signedIn() &&
      (this.mode() === 'update' ||
        this.account.identity()?.garageMemberships.some((m) => m.garageId === this.garageId())),
  );
  readonly editing = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal(false);
  text = '';
  kind: ReviewUpdateKind = 'complaint';
  private baseline = '';
  private requestId = '';
  private generation = 0;
  private controller = new AbortController();
  constructor() {
    effect(() => {
      this.account.dataContext();
      this.reviewId();
      this.response();
      this.generation++;
      this.controller.abort();
      this.controller = new AbortController();
      this.editing.set(false);
      this.busy.set(false);
      this.error.set('');
      this.success.set(false);
      this.text = '';
      this.baseline = '';
      this.dirtyChange.emit(false);
    });
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
      this.controller.abort();
    });
  }
  label(key: string): string {
    return reviewLabel(key, this.language.language);
  }
  start(): void {
    this.baseline = this.mode() === 'response' ? (this.response()?.text ?? '') : '';
    this.text = this.baseline;
    this.requestId = crypto.randomUUID();
    this.editing.set(true);
    this.error.set('');
    this.success.set(false);
    afterNextRender(
      () => this.document.getElementById('review-contribution-' + this.reviewId())?.focus(),
      { injector: this.injector },
    );
  }
  dirty(): boolean {
    return this.editing() && this.text !== this.baseline;
  }
  edited(): void {
    this.dirtyChange.emit(this.dirty());
  }
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty() || this.busy()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
  cancel(): void {
    if (this.busy() || (this.dirty() && !window.confirm(this.label('discard')))) return;
    this.editing.set(false);
    this.text = '';
    this.dirtyChange.emit(false);
  }
  async save(): Promise<void> {
    if (
      this.busy() ||
      !this.canWrite() ||
      this.text.trim().length < 20 ||
      this.text.trim().length > 1200 ||
      !this.dirty()
    )
      return;
    if (!window.confirm(this.label('publicConfirm'))) return;
    const generation = this.generation,
      context = this.account.dataContext(),
      mode = this.mode();
    this.busy.set(true);
    this.error.set('');
    const body =
      mode === 'response'
        ? {
            text: this.text,
            requestId: this.requestId,
            responseRevision: this.response()?.revision ?? 0,
          }
        : { text: this.text, kind: this.kind, requestId: this.requestId };
    const path =
      mode === 'response'
        ? `/api/garages/${encodeURIComponent(this.garageId())}/reviews/${encodeURIComponent(this.reviewId())}/response`
        : `/api/me/reviews/${encodeURIComponent(this.reviewId())}/updates`;
    try {
      await reviewChecked(
        await fetch(path, {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': reviewCsrf(this.document),
          },
          body: JSON.stringify(body),
          signal: this.controller.signal,
        }),
      );
      if (generation !== this.generation || context !== this.account.dataContext()) return;
      this.editing.set(false);
      this.text = '';
      this.success.set(true);
      this.dirtyChange.emit(false);
      this.changed.emit();
    } catch (error) {
      if (generation !== this.generation || context !== this.account.dataContext()) return;
      if (error instanceof ReviewHttpError && error.status === 401) this.account.invalidate();
      else this.error.set(reviewError(error, this.language.language));
    } finally {
      if (generation === this.generation) this.busy.set(false);
    }
  }
}
