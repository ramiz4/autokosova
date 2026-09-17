import { DOCUMENT } from '@angular/common';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import {
  Component,
  DestroyRef,
  afterNextRender,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideCalendarDays,
  LucideEllipsisVertical,
  LucideEye,
  LucideFileText,
  LucideMessageSquarePlus,
  LucideSearch,
  type LucideIcon,
} from '@lucide/angular';
import { AccountSessionService } from './account-session.service';
import { LanguageService } from './language.service';
import { SiteHeaderComponent } from './site-header.component';
import { ButtonDirective } from './ui/button.directive';
import { AuthRequiredDialogComponent } from './ui/auth-required-dialog.component';
import { ConfirmationDialogComponent } from './ui/confirmation-dialog.component';
import { LucideIconComponent } from './ui/lucide-icon.component';
import { RatingStarsComponent } from './ui/rating-stars.component';
import { ReviewContributionComponent } from './review-contribution.component';
import { SelectFieldComponent, type SelectFieldOption } from './ui/select-field.component';
import { reviewLabel } from '../shared/review-copy';
import {
  REVIEW_PAGE_SIZE,
  type OwnReviewDetail,
  type OwnReviewPage,
  type OwnReviewSort,
  type ReviewPublicationState,
} from '../shared/reviews';
import { ReviewHttpError, reviewChecked, reviewError, reviewJson } from './review-http';

type ReviewAction = 'view' | 'evidence' | 'update';

@Component({
  selector: 'app-reviews',
  imports: [
    SiteHeaderComponent,
    RouterLink,
    ButtonDirective,
    ReviewContributionComponent,
    ConfirmationDialogComponent,
    LucideIconComponent,
    RatingStarsComponent,
    SelectFieldComponent,
    CdkMenu,
    CdkMenuItem,
    CdkMenuTrigger,
    AuthRequiredDialogComponent,
  ],
  styleUrl: './reviews.component.scss',
  templateUrl: './reviews.component.html',
})
export class ReviewsComponent {
  readonly CalendarIcon: LucideIcon = LucideCalendarDays;
  readonly EllipsisIcon: LucideIcon = LucideEllipsisVertical;
  readonly EvidenceIcon: LucideIcon = LucideFileText;
  readonly EyeIcon: LucideIcon = LucideEye;
  readonly SearchIcon: LucideIcon = LucideSearch;
  readonly UpdateIcon: LucideIcon = LucideMessageSquarePlus;
  readonly confirmation = viewChild.required<ConfirmationDialogComponent>('confirmation');
  readonly account = inject(AccountSessionService);
  readonly language = inject(LanguageService);
  readonly ready = signal(false);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly reviews = signal<readonly OwnReviewDetail[]>([]);
  readonly garagePhotos = signal<ReadonlyMap<string, string | null>>(new Map());
  readonly failedGaragePhotos = signal<ReadonlySet<string>>(new Set());
  readonly detail = signal<OwnReviewDetail | null>(null);
  readonly evidence = signal<string | null>(null);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly search = signal('');
  readonly publicationState = signal<ReviewPublicationState | 'all'>('all');
  readonly sort = signal<OwnReviewSort>('submitted_desc');
  readonly startUpdate = signal(false);
  readonly states: readonly (ReviewPublicationState | 'all')[] = [
    'all',
    'submitted',
    'under_review',
    'published',
    'temporarily_hidden',
    'rejected',
    'withdrawn',
  ];
  readonly sorts: readonly OwnReviewSort[] = ['submitted_desc', 'submitted_asc'];
  readonly actionsMenuPositions = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -8 },
  ] satisfies CdkMenuTrigger['menuPosition'];
  private readonly actionMenus = viewChildren(CdkMenuTrigger);
  private readonly document = inject(DOCUMENT);
  private dirty = false;
  private generation = 0;
  private controller = new AbortController();
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    afterNextRender(() => {
      this.ready.set(true);
      void this.account.refresh();
    });
    effect(() => {
      const context = this.account.dataContext(),
        ready = this.ready();
      // The menu query changes when loaded rows are rendered. It must not become a
      // dependency of this session/view lifecycle effect, or each response triggers
      // another reset and list request.
      untracked(() => {
        this.confirmation().cancelPending();
        this.actionMenus().forEach((menu) => menu.close());
        this.generation++;
        this.controller.abort();
        this.controller = new AbortController();
        if (this.searchTimer) clearTimeout(this.searchTimer);
        this.reviews.set([]);
        this.garagePhotos.set(new Map());
        this.failedGaragePhotos.set(new Set());
        this.detail.set(null);
        this.evidence.set(null);
        this.error.set('');
        this.loading.set(false);
        this.busy.set(false);
        this.total.set(0);
        this.dirty = false;
        if (context && ready) void this.load();
      });
    });
    effect(() => this.language.setPageText(this.label('own'), this.label('intro'), true));
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
      this.controller.abort();
      if (this.searchTimer) clearTimeout(this.searchTimer);
    });
  }
  label(key: string): string {
    return reviewLabel(key, this.language.language);
  }
  loginUrl(): string {
    return '/auth/login?returnTo=' + encodeURIComponent(this.language.link('reviews'));
  }
  hasActiveFilters(): boolean {
    return !!this.search() || this.publicationState() !== 'all' || this.sort() !== 'submitted_desc';
  }
  searchLabel(): string {
    return this.label('searchReviews');
  }
  sortLabel(sort: OwnReviewSort): string {
    return this.label(sort);
  }
  stateLabel(state: ReviewPublicationState | 'all'): string {
    return state === 'all' ? this.label('allReviews') : this.label(state);
  }
  submittedAt(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const locale =
      this.language.language === 'de' ? 'de-CH' : this.language.language === 'sq' ? 'sq' : 'en-GB';
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  }
  ratingLabel(rating: number): string {
    const number = rating.toLocaleString(
      this.language.language === 'de' ? 'de-CH' : this.language.language,
      { minimumFractionDigits: 1, maximumFractionDigits: 1 },
    );
    return this.language.language === 'sq'
      ? `${number} nga 5 yje`
      : this.language.language === 'en'
        ? `${number} out of 5 stars`
        : `${number} von 5 Sternen`;
  }
  statusClass(status: string): string {
    return `status-${status}`;
  }
  setDirty(value: boolean): void {
    this.dirty = value;
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
  onSearch(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.changeList({ query: input.value }, input), 250);
  }
  stateOptions(): readonly SelectFieldOption[] {
    return this.states.map((state) => ({ value: state, label: this.stateLabel(state) }));
  }
  sortOptions(): readonly SelectFieldOption[] {
    return this.sorts.map((sort) => ({ value: sort, label: this.sortLabel(sort) }));
  }
  onState(state: string): void {
    void this.changeList({ publicationState: state as ReviewPublicationState | 'all' });
  }
  onSort(sort: string): void {
    void this.changeList({ sort: sort as OwnReviewSort });
  }
  async clearFilters(): Promise<void> {
    await this.changeList({ query: '', publicationState: 'all', sort: 'submitted_desc' });
  }
  async load(page = 1, skipLeave = false): Promise<void> {
    if (!this.account.dataContext() || this.busy() || (!skipLeave && !(await this.canLeave())))
      return;
    const generation = ++this.generation,
      context = this.account.dataContext();
    this.controller.abort();
    this.controller = new AbortController();
    this.loading.set(true);
    this.error.set('');
    this.detail.set(null);
    this.evidence.set(null);
    this.startUpdate.set(false);
    this.dirty = false;
    try {
      const data = await reviewJson<OwnReviewPage>(
        await fetch(this.listUrl(page), {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: this.controller.signal,
        }),
      );
      if (this.current(generation, context)) {
        if (
          !Array.isArray(data.reviews) ||
          typeof data.hasMore !== 'boolean' ||
          !Number.isInteger(data.total)
        )
          throw new Error('Invalid review page');
        const lastPage = Math.max(1, Math.ceil(data.total / REVIEW_PAGE_SIZE));
        if (data.total > 0 && page > lastPage) {
          this.total.set(data.total);
          void this.load(lastPage, true);
          return;
        }
        this.reviews.set(data.reviews);
        void this.resolveGaragePhotos(data.reviews, generation, context, this.controller.signal);
        this.page.set(data.total ? page : 1);
        this.total.set(data.total);
      }
    } catch (error) {
      if (this.current(generation, context)) {
        this.reviews.set([]);
        this.total.set(0);
        this.failure(error);
      }
    } finally {
      if (this.current(generation, context)) this.loading.set(false);
    }
  }
  protected garagePhotoUrl(review: OwnReviewDetail): string | null {
    const photoId = this.garagePhotos().get(review.garageId);
    return photoId && !this.failedGaragePhotos().has(review.garageId)
      ? `/api/public/garages/${encodeURIComponent(review.garageId)}/photos/${encodeURIComponent(photoId)}`
      : null;
  }
  protected garagePhotoFailed(garageId: string): void {
    this.failedGaragePhotos.update((current) => new Set([...current, garageId]));
  }
  private async resolveGaragePhotos(
    reviews: readonly OwnReviewDetail[],
    generation: number,
    context: unknown,
    signal: AbortSignal,
  ): Promise<void> {
    const garageIds = [
      ...new Set(
        reviews
          .map((review) => review.garageId)
          .filter((garageId) => !this.garagePhotos().has(garageId)),
      ),
    ];
    const resolved = await Promise.all(
      garageIds.map(async (garageId): Promise<readonly [string, string | null]> => {
        try {
          const response = await fetch(`/api/public/garages/${encodeURIComponent(garageId)}`, {
            credentials: 'omit',
            cache: 'no-store',
            referrerPolicy: 'no-referrer',
            signal,
          });
          if (!response.ok) return [garageId, null];
          const profile = (await response.json()) as { photoIds?: unknown };
          const photoId = Array.isArray(profile.photoIds)
            ? profile.photoIds.find((value): value is string => typeof value === 'string')
            : undefined;
          return [garageId, photoId ?? null];
        } catch {
          return [garageId, null];
        }
      }),
    );
    if (!this.current(generation, context)) return;
    this.garagePhotos.update((current) => new Map([...current, ...resolved]));
  }
  async open(id: string, action: ReviewAction = 'view'): Promise<void> {
    if (!(await this.canLeave())) return;
    const generation = ++this.generation,
      context = this.account.dataContext();
    this.controller.abort();
    this.controller = new AbortController();
    this.loading.set(true);
    this.error.set('');
    this.detail.set(null);
    this.evidence.set(null);
    this.startUpdate.set(false);
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
        if (action === 'update') this.startUpdate.set(true);
        afterNextRender(() => this.document.getElementById('own-review-detail-title')?.focus());
        if (action === 'evidence') await this.openEvidence();
      }
    } catch (error) {
      if (this.current(generation, context)) this.failure(error);
    } finally {
      if (this.current(generation, context)) this.loading.set(false);
    }
  }
  openFromMenu(review: OwnReviewDetail, action: ReviewAction, menu: CdkMenuTrigger): void {
    menu.close();
    void this.open(review.id, action);
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
  private async changeList(
    change: {
      query?: string;
      publicationState?: ReviewPublicationState | 'all';
      sort?: OwnReviewSort;
    },
    input?: HTMLInputElement,
  ): Promise<void> {
    if (!(await this.canLeave())) {
      if (input) input.value = this.search();
      return;
    }
    if (change.query !== undefined) this.search.set(change.query);
    if (change.publicationState !== undefined) this.publicationState.set(change.publicationState);
    if (change.sort !== undefined) this.sort.set(change.sort);
    await this.load(1, true);
  }
  private listUrl(page: number): string {
    const params = new URLSearchParams({ page: String(page), sort: this.sort() });
    if (this.search().trim()) params.set('query', this.search().trim());
    if (this.publicationState() !== 'all') params.set('publicationState', this.publicationState());
    return '/api/me/reviews?' + params.toString();
  }
  private current(generation: number, context: unknown): boolean {
    return generation === this.generation && context === this.account.dataContext();
  }
  private failure(error: unknown): void {
    if (error instanceof ReviewHttpError && error.status === 401) this.account.invalidate();
    else this.error.set(reviewError(error, this.language.language));
  }
}
