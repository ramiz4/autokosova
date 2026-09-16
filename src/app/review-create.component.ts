import { DOCUMENT } from '@angular/common';
import {
  Component,
  Injector,
  DestroyRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AccountSessionService } from './account-session.service';
import { LanguageService } from './language.service';
import { SiteHeaderComponent } from './site-header.component';
import { ButtonDirective } from './ui/button.directive';
import { reviewLabel } from '../shared/review-copy';
import {
  REVIEW_RATING_FIELDS,
  REVIEW_LIMITS,
  calculateOverallRating,
  isAllowedVisitMonth,
  validReviewSubmission,
  type OwnReview,
  type ReviewSubmissionInput,
} from '../shared/reviews';
import {
  REPAIR_REQUEST_SERVICE_CATEGORIES,
  REPAIR_REQUEST_VEHICLE_MAKES,
} from '../shared/repair-request';
import { ReviewHttpError, reviewJson, reviewCsrf, reviewError } from './review-http';

@Component({
  selector: 'app-review-create',
  imports: [SiteHeaderComponent, RouterLink, FormsModule, ButtonDirective],
  templateUrl: './review-create.component.html',
  host: { '(window:beforeunload)': 'beforeUnload($event)' },
})
export class ReviewCreateComponent {
  readonly account = inject(AccountSessionService);
  readonly language = inject(LanguageService);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly garageId = computed(() => this.params().get('garageId') ?? '');
  readonly ready = signal(false);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly garageName = signal('');
  readonly uploadMode = signal('unavailable');
  readonly evidenceId = signal('');
  readonly result = signal<OwnReview | null>(null);
  readonly canReview = computed(
    () =>
      !!this.account.identity() &&
      !this.account.identity()!.roles.includes('admin') &&
      !this.account.identity()!.garageMemberships.some((m) => m.garageId === this.garageId()),
  );
  readonly fields = REVIEW_RATING_FIELDS;
  readonly services = REPAIR_REQUEST_SERVICE_CATEGORIES;
  readonly makes = REPAIR_REQUEST_VEHICLE_MAKES;
  readonly limits = REVIEW_LIMITS;
  readonly maximumMonth = new Date().toISOString().slice(0, 7);
  form = {
    serviceCategoryId: '',
    visitMonth: '',
    vehicleMakeId: '',
    text: '',
    workQuality: 0,
    communication: 0,
    priceTransparency: 0,
    punctuality: 0,
  };
  file: File | null = null;
  attempted = false;
  private requestId = '';
  private generation = 0;
  private controller = new AbortController();
  constructor() {
    afterNextRender(() => {
      this.ready.set(true);
      void this.account.refresh();
    });
    effect(() => {
      const context = this.account.dataContext(),
        id = this.garageId(),
        ready = this.ready();
      this.generation++;
      this.controller.abort();
      this.controller = new AbortController();
      this.error.set('');
      this.garageName.set('');
      this.evidenceId.set('');
      this.result.set(null);
      this.busy.set(false);
      this.loading.set(false);
      this.file = null;
      this.requestId = '';
      this.attempted = false;
      this.form = {
        serviceCategoryId: '',
        visitMonth: '',
        vehicleMakeId: '',
        text: '',
        workQuality: 0,
        communication: 0,
        priceTransparency: 0,
        punctuality: 0,
      };
      if (context && ready && id) untracked(() => void this.load());
    });
    effect(() => this.language.setPageText(this.label('write'), this.label('intro'), true));
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
      this.controller.abort();
    });
  }
  label(key: string): string {
    return reviewLabel(key, this.language.language);
  }
  loginUrl(): string {
    return (
      '/auth/login?returnTo=' +
      encodeURIComponent(this.language.link('review-new', this.garageId()))
    );
  }
  monthValid(): boolean {
    return isAllowedVisitMonth(this.form.visitMonth);
  }
  overall(): string {
    return this.fields.every((field) => this.form[field] >= 1)
      ? calculateOverallRating(this.form).toFixed(1)
      : '–';
  }
  hasDraft(): boolean {
    return (
      !this.result() &&
      (!!this.file ||
        !!this.form.text ||
        !!this.form.serviceCategoryId ||
        !!this.form.visitMonth ||
        !!this.form.vehicleMakeId ||
        this.fields.some((f) => this.form[f] !== 0))
    );
  }
  canLeave(): boolean {
    return !this.busy() && (!this.hasDraft() || window.confirm(this.label('discard')));
  }
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.busy() || this.hasDraft()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
  private current(generation: number, context: unknown): boolean {
    return generation === this.generation && context === this.account.dataContext();
  }
  async load(): Promise<void> {
    if (this.busy()) return;
    const generation = this.generation,
      context = this.account.dataContext();
    this.loading.set(true);
    this.error.set('');
    try {
      const [garage, capabilities] = await Promise.all([
        fetch('/api/public/garages/' + encodeURIComponent(this.garageId()), {
          cache: 'no-store',
          signal: this.controller.signal,
        }).then((r) => reviewJson<{ id: string; name: string }>(r)),
        fetch('/api/me/review-evidence', {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: this.controller.signal,
        }).then((r) => reviewJson<{ mode: string }>(r)),
      ]);
      if (!this.current(generation, context)) return;
      if (typeof garage.name !== 'string' || garage.id !== this.garageId())
        throw new Error('Invalid garage');
      this.garageName.set(garage.name);
      this.uploadMode.set(capabilities.mode);
    } catch (error) {
      if (this.current(generation, context)) this.failure(error);
    } finally {
      if (this.current(generation, context)) this.loading.set(false);
    }
  }
  selectFile(event: Event): void {
    this.file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.evidenceId.set('');
    this.requestId = crypto.randomUUID();
    this.error.set('');
  }
  async upload(): Promise<void> {
    if (this.busy() || !this.canReview() || !this.file || this.uploadMode() !== 'local_fixture')
      return;
    if (this.file.size > 4096 || !this.file.name.toLowerCase().endsWith('.txt')) {
      this.error.set(this.label('demo'));
      return;
    }
    const generation = this.generation,
      context = this.account.dataContext(),
      csrf = reviewCsrf(this.document),
      file = this.file;
    this.busy.set(true);
    this.error.set('');
    try {
      const text = await file.text();
      if (!this.current(generation, context)) return;
      const data = await reviewJson<{ fileId: string; localFixture: boolean }>(
        await fetch('/api/me/review-evidence/' + this.requestId, {
          method: 'PUT',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { 'content-type': 'text/plain; charset=utf-8', 'x-csrf-token': csrf },
          body: text,
          signal: this.controller.signal,
        }),
      );
      if (!this.current(generation, context)) return;
      if (typeof data.fileId !== 'string' || data.localFixture !== true)
        throw new Error('Invalid upload response');
      this.evidenceId.set(data.fileId);
    } catch (error) {
      if (this.current(generation, context)) this.failure(error);
    } finally {
      if (this.current(generation, context)) this.busy.set(false);
    }
  }
  async submit(): Promise<void> {
    if (this.busy() || !this.canReview()) return;
    this.attempted = true;
    const input: ReviewSubmissionInput = {
      ...this.form,
      garageId: this.garageId(),
      evidenceFileId: this.evidenceId(),
      evidenceKind: 'invoice',
      vehicleMakeId: this.form.vehicleMakeId || undefined,
    };
    if (!validReviewSubmission(input)) {
      this.error.set(this.label('invalid'));
      afterNextRender(
        () => this.document.querySelector<HTMLElement>('main [aria-invalid="true"]')?.focus(),
        { injector: this.injector },
      );
      return;
    }
    const generation = this.generation,
      context = this.account.dataContext();
    this.busy.set(true);
    this.error.set('');
    try {
      const result = await reviewJson<OwnReview>(
        await fetch('/api/me/reviews', {
          method: 'POST',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': reviewCsrf(this.document),
          },
          body: JSON.stringify(input),
          signal: this.controller.signal,
        }),
      );
      if (this.current(generation, context)) {
        if (typeof result.id !== 'string' || typeof result.publicationState !== 'string')
          throw new Error('Invalid review response');
        this.result.set(result);
        this.file = null;
      }
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
