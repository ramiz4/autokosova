import {
  LucideBadgeCheck,
  LucideCar,
  LucideCheck,
  LucideChevronLeft,
  LucideChevronRight,
  LucideGlobe,
  LucideHeart,
  LucideHouse,
  LucideImages,
  LucideInfo,
  LucideListFilter,
  LucideMapPin,
  LucideMessageCircle,
  LucidePhone,
  LucideSend,
  LucideShare2,
  LucideWrench,
  LucideX,
  type LucideIcon,
} from '@lucide/angular';
import { AccountSessionService } from './account-session.service';
import type { PublicGarageReview, PublicReviewPage } from '../shared/reviews';
import { reviewLabel } from '../shared/review-copy';
import { ReviewContributionComponent } from './review-contribution.component';
import { DatePipe, isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  effect,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  PendingTasks,
  PLATFORM_ID,
  REQUEST,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { getCatalogPlace, VEHICLE_MAKE_LABELS } from '../shared/catalog';
import {
  buildContactPreview,
  buildTelephoneHref,
  buildWhatsAppHref,
} from '../shared/contact-preview';
import { isLocalDemoGarageId } from '../shared/local-demo';
import { AnalyticsService } from './analytics.service';
import { FavoriteNoticeComponent } from './favorite-notice.component';
import { FavoritesService } from './favorites.service';
import { LanguageService } from './language.service';
import { SiteFooterComponent } from './site-footer.component';
import { SiteHeaderComponent } from './site-header.component';
import { ButtonDirective } from './ui/button.directive';
import { LucideIconComponent } from './ui/lucide-icon.component';
import { RatingStarsComponent } from './ui/rating-stars.component';
import { ConfirmationDialogComponent } from './ui/confirmation-dialog.component';

interface PublicGarageProfile {
  readonly contact: { readonly phone?: string; readonly whatsapp?: boolean };
  readonly description?: string;
  readonly id: string;
  readonly languages: readonly string[];
  readonly name: string;
  readonly photoIds: readonly string[];
  readonly placeId: string;
  readonly reviewSummary?: {
    readonly averageRating?: number;
    readonly label: string;
    readonly reviewCount: number;
    readonly state: 'available' | 'unavailable';
    readonly verifiedVisitCount: number;
  };
  readonly searchContext?: {
    readonly distanceKm: number;
    readonly matchingPlace: { readonly id: string; readonly label: string };
  };
  readonly selfReportedSpecializations: readonly string[];
  readonly serviceCategoryIds: readonly string[];
  readonly vehicleMakeIds: readonly string[];
  readonly verificationLabel?: 'Unternehmensdaten geprüft';
}

const PROFILE_SECTIONS = new Set(['about', 'reviews', 'services', 'makes', 'location', 'photos']);

@Component({
  selector: 'app-garage-profile',
  imports: [
    DatePipe,
    ReviewContributionComponent,
    ButtonDirective,
    FavoriteNoticeComponent,
    FormsModule,
    LucideIconComponent,
    RatingStarsComponent,
    ConfirmationDialogComponent,
    RouterLink,
    SiteFooterComponent,
    SiteHeaderComponent,
  ],
  templateUrl: './garage-profile.component.html',
})
export class GarageProfileComponent {
  readonly confirmation = viewChild.required<ConfirmationDialogComponent>('confirmation');
  readonly BadgeCheckIcon: LucideIcon = LucideBadgeCheck;
  readonly CarIcon: LucideIcon = LucideCar;
  readonly CheckIcon: LucideIcon = LucideCheck;
  readonly ChevronLeftIcon: LucideIcon = LucideChevronLeft;
  readonly ChevronRightIcon: LucideIcon = LucideChevronRight;
  readonly GlobeIcon: LucideIcon = LucideGlobe;
  readonly HeartIcon: LucideIcon = LucideHeart;
  readonly HomeIcon: LucideIcon = LucideHouse;
  readonly ImagesIcon: LucideIcon = LucideImages;
  readonly InfoIcon: LucideIcon = LucideInfo;
  readonly ListFilterIcon: LucideIcon = LucideListFilter;
  readonly MapPinIcon: LucideIcon = LucideMapPin;
  readonly MessageCircleIcon: LucideIcon = LucideMessageCircle;
  readonly PhoneIcon: LucideIcon = LucidePhone;
  readonly SendIcon: LucideIcon = LucideSend;
  readonly ShareIcon: LucideIcon = LucideShare2;
  readonly WrenchIcon: LucideIcon = LucideWrench;
  readonly XIcon: LucideIcon = LucideX;

  protected reviewPage = 1;
  protected reviewHasMore = false;
  private reviewGeneration = 0;
  private reviewController?: AbortController;
  private readonly contributionDrafts = new Set<string>();
  protected reviewLabel(key: string): string {
    return reviewLabel(key, this.language.language);
  }
  protected contributionDirty(id: string, dirty: boolean): void {
    if (dirty) this.contributionDrafts.add(id);
    else this.contributionDrafts.delete(id);
  }
  async canLeave(): Promise<boolean> {
    if (!this.contributionDrafts.size) return true;
    const context = this.account.dataContext();
    const accepted = await this.confirmation().ask({
      title: this.reviewLabel('discard'),
      description: this.reviewLabel('discard'),
      confirmLabel: this.reviewLabel('discard'),
      cancelLabel: this.reviewLabel('cancel'),
    });
    return accepted && context === this.account.dataContext() && this.contributionDrafts.size > 0;
  }
  protected async reviewPageChanged(page: number): Promise<void> {
    if (!(await this.canLeave())) return;
    await this.loadReviewsPage(this.profile?.id, undefined, page);
  }

  private readonly account = inject(AccountSessionService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly analytics = inject(AnalyticsService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  protected readonly favorites = inject(FavoritesService);
  protected readonly language = inject(LanguageService);
  private readonly pendingTasks = inject(PendingTasks);
  private readonly request = inject(REQUEST);
  private readonly route = inject(ActivatedRoute);
  private readonly galleryClose = viewChild<ElementRef<HTMLButtonElement>>('galleryClose');
  private readonly contactClose = viewChild<ElementRef<HTMLButtonElement>>('contactClose');
  private readonly shareUrlInput = viewChild<ElementRef<HTMLInputElement>>('shareUrlInput');
  private galleryTrigger?: HTMLElement;
  private contactTrigger?: HTMLElement;

  protected readonly contactOpen = signal(false);
  protected readonly galleryIndex = signal(0);
  protected readonly galleryOpen = signal(false);
  protected includeDetails = false;
  protected profile?: PublicGarageProfile;
  protected repairSummary = '';
  protected reviews: readonly PublicGarageReview[] = [];
  protected reviewServiceCategoryId = '';
  protected reviewState: 'error' | 'loading' | 'ready' = 'loading';
  protected reviewVehicleMakeId = '';
  protected readonly shareOpen = signal(false);
  protected readonly shareState = signal<'copied' | 'error' | null>(null);
  protected state: 'error' | 'loading' | 'ready' = 'loading';
  protected vehicleSummary = '';
  protected readonly vehicleMakeOptions = Object.entries(VEHICLE_MAKE_LABELS);
  constructor() {
    effect(() => {
      this.account.dataContext();
      this.confirmation().cancelPending();
      this.contributionDrafts.clear();
    });
    this.language.setPage('profile.profile', 'profile.trust');
    if (this.browser) {
      this.route.fragment.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((fragment) => {
        this.scrollToSection(fragment);
      });
      void this.favorites.load();
      void this.load();
    } else if (this.request) {
      this.pendingTasks.run(() => this.loadForServer(this.request!));
    }
    this.destroyRef.onDestroy(() => {
      this.reviewGeneration++;
      this.reviewController?.abort();
      this.galleryTrigger = undefined;
      this.contactTrigger = undefined;
    });
  }

  protected ui(key: string, replacements?: Record<string, string | number>): string {
    return this.language.t(key, replacements);
  }

  private scrollToSection(section: string | null): void {
    if (!this.browser || !section || !PROFILE_SECTIONS.has(section)) return;
    afterNextRender(() => document.getElementById(section)?.scrollIntoView?.({ block: 'start' }), {
      injector: this.injector,
    });
  }

  protected backQueryParams(): Record<string, string> {
    const query: Record<string, string> = {};
    for (const key of ['all', 'places', 'service', 'vehicleMake', 'sort', 'page']) {
      const value = this.route.snapshot.queryParamMap.get(key);
      if (value) query[key] = value;
    }
    return query;
  }

  protected contactPreview(): string {
    return buildContactPreview({
      includeDetails: this.includeDetails,
      repairSummary: this.repairSummary,
      vehicleSummary: this.vehicleSummary,
      garageName: this.profile?.name ?? this.language.t('home.badge'),
    });
  }

  protected placeLabel(placeId: string): string {
    return getCatalogPlace(placeId)?.label ?? 'Kosovo';
  }

  protected serviceLabel(serviceCategoryId: string): string {
    return this.language.serviceLabel(serviceCategoryId);
  }

  protected makeLabel(vehicleMakeId: string): string {
    return VEHICLE_MAKE_LABELS[vehicleMakeId] ?? vehicleMakeId;
  }

  protected initials(): string {
    return (
      this.profile?.name
        .replace(/^DEMO\s*·\s*/u, '')
        .split(/\s+/u)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('') || 'AK'
    );
  }

  protected hasReviews(): boolean {
    const summary = this.profile?.reviewSummary;
    return Boolean(
      summary?.state === 'available' &&
      summary.reviewCount > 0 &&
      summary.averageRating &&
      summary.averageRating >= 1 &&
      summary.averageRating <= 5,
    );
  }

  protected ratingLabel(rating: number): string {
    return `${rating.toFixed(1)} ${this.ui('profile.ui.outOfFive')}`;
  }

  protected reviewCountLabel(count: number): string {
    return this.ui(count === 1 ? 'profile.ui.ratingCountOne' : 'profile.ui.ratingCount', { count });
  }

  protected monthLabel(value: string): string {
    const match = /^(\d{4})-(\d{2})$/u.exec(value);
    if (!match) return value;
    return new Intl.DateTimeFormat(this.language.language, {
      month: 'long',
      year: 'numeric',
    }).format(new Date(Number(match[1]), Number(match[2]) - 1, 1));
  }

  protected locationLabel(): string {
    const context = this.profile?.searchContext;
    if (context) {
      return this.ui('profile.ui.distance', {
        distance: context.distanceKm.toLocaleString(this.language.language, {
          maximumFractionDigits: 1,
          minimumFractionDigits: 1,
        }),
        place: context.matchingPlace.label,
      });
    }
    return this.ui('profile.ui.locationIn', {
      place: this.placeLabel(this.profile?.placeId ?? ''),
    });
  }

  protected photoUrl(photoId: string): string {
    return `/api/public/garages/${encodeURIComponent(this.profile?.id ?? '')}/photos/${encodeURIComponent(photoId)}`;
  }

  protected profileImageUrl(): string | undefined {
    if (!this.isLocalDemoProfile() || !this.profile?.photoIds.length) return undefined;
    const index = [...this.profile.id].reduce((sum, character) => sum + character.charCodeAt(0), 0);
    return this.photoUrl(this.profile.photoIds[index % this.profile.photoIds.length]);
  }

  protected openGallery(index: number, event: Event): void {
    if (!this.profile?.photoIds[index]) return;
    this.galleryTrigger = event.currentTarget as HTMLElement;
    this.galleryIndex.set(index);
    this.galleryOpen.set(true);
    afterNextRender(() => this.galleryClose()?.nativeElement.focus(), { injector: this.injector });
  }

  protected moveGallery(direction: -1 | 1): void {
    const count = this.profile?.photoIds.length ?? 0;
    if (!count) return;
    this.galleryIndex.set((this.galleryIndex() + direction + count) % count);
  }

  protected closeGallery(): void {
    this.galleryOpen.set(false);
    this.galleryTrigger?.focus();
  }

  protected openContact(event: Event): void {
    this.contactTrigger = event.currentTarget as HTMLElement;
    this.contactOpen.set(true);
    afterNextRender(() => this.contactClose()?.nativeElement.focus(), { injector: this.injector });
  }

  protected closeContact(): void {
    this.contactOpen.set(false);
    this.contactTrigger?.focus();
  }

  protected telephoneHref(): string | undefined {
    return buildTelephoneHref(this.profile?.contact.phone);
  }

  protected whatsAppHref(): string | undefined {
    return this.profile?.contact.whatsapp
      ? buildWhatsAppHref(this.profile.contact.phone, this.contactPreview())
      : undefined;
  }

  protected blockLocalDemoContact(event: Event): void {
    if (this.isLocalDemoProfile()) event.preventDefault();
  }

  protected isLocalDemoProfile(): boolean {
    return isLocalDemoGarageId(this.profile?.id);
  }

  protected async shareProfile(): Promise<void> {
    const data = { title: this.profile?.name ?? 'AutoKosova', url: this.shareUrl() };
    if (this.browser && typeof navigator.share === 'function') {
      try {
        await navigator.share(data);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    this.shareState.set(null);
    this.shareOpen.set(true);
    afterNextRender(() => this.shareUrlInput()?.nativeElement.select(), {
      injector: this.injector,
    });
  }

  protected async copyShareUrl(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.shareUrl());
      this.shareState.set('copied');
    } catch {
      this.shareState.set('error');
      this.shareUrlInput()?.nativeElement.select();
    }
  }

  protected shareUrl(): string {
    const path = this.language.link('garage', this.profile?.id ?? '');
    return this.browser ? new URL(path, window.location.origin).toString() : path;
  }

  protected favoriteLoginUrl(): string {
    const path = this.language.link('garage', this.profile?.id ?? '');
    const query = new URLSearchParams(this.backQueryParams());
    const returnTo = `${path}${query.size ? `?${query}` : ''}`;
    return `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
  }

  protected async load(): Promise<void> {
    const garageId = this.route.snapshot.paramMap.get('garageId');
    if (!this.browser || !garageId) {
      this.state = 'error';
      return;
    }
    await this.loadProfile(garageId);
  }

  private async loadForServer(request: Request): Promise<void> {
    const garageId = this.route.snapshot.paramMap.get('garageId');
    if (!garageId) {
      this.state = 'error';
      return;
    }
    await this.loadProfile(garageId, request.url);
  }

  private async loadProfile(garageId: string, requestUrl?: string): Promise<void> {
    this.state = 'loading';
    try {
      const places = this.route.snapshot.queryParamMap.get('places');
      const suffix = places ? `?places=${encodeURIComponent(places)}` : '';
      const response = await fetch(
        this.publicApiUrl(
          `/api/public/garages/${encodeURIComponent(garageId)}${suffix}`,
          requestUrl,
        ),
        { credentials: 'same-origin' },
      );
      if (!response.ok) throw new Error('Garage profile request failed');
      this.profile = (await response.json()) as PublicGarageProfile;
      this.state = 'ready';
      if (this.browser) this.changeDetector.detectChanges();
      const fragment = this.route.snapshot.fragment;
      this.scrollToSection(fragment);
      this.language.setProfilePage(this.profile.name, this.profile.description);
      if (this.browser) this.analytics.track('garage_profile_opened');
      await this.loadReviews(garageId, requestUrl);
    } catch {
      this.state = 'error';
    } finally {
      this.changeDetector.markForCheck();
    }
  }

  protected contactOpened(): void {
    this.analytics.track('contact_channel_opened');
  }

  protected async loadReviews(
    garageId = this.profile?.id,
    requestUrl?: string,
    page = 1,
  ): Promise<void> {
    if ((!this.browser && !requestUrl) || !garageId) return;
    if (this.browser && !(await this.canLeave())) return;
    await this.loadReviewsPage(garageId, requestUrl, page);
  }

  private async loadReviewsPage(
    garageId = this.profile?.id,
    requestUrl?: string,
    page = 1,
  ): Promise<void> {
    if ((!this.browser && !requestUrl) || !garageId) return;
    this.contributionDrafts.clear();
    const generation = ++this.reviewGeneration;
    this.reviewController?.abort();
    this.reviewController = new AbortController();
    this.reviewState = 'loading';
    try {
      const query = new URLSearchParams({ page: String(page) });
      if (this.reviewServiceCategoryId)
        query.set('serviceCategoryId', this.reviewServiceCategoryId);
      if (this.reviewVehicleMakeId) query.set('vehicleMakeId', this.reviewVehicleMakeId);
      const suffix = query.size ? `?${query}` : '';
      const response = await fetch(
        this.publicApiUrl(
          `/api/public/garages/${encodeURIComponent(garageId)}/reviews${suffix}`,
          requestUrl,
        ),
        { credentials: 'same-origin', cache: 'no-store', signal: this.reviewController.signal },
      );
      if (!response.ok) throw new Error('Garage reviews request failed');
      const payload = (await response.json()) as PublicReviewPage;
      if (generation !== this.reviewGeneration) return;
      this.reviews = payload.reviews ?? [];
      this.reviewPage = payload.page ?? page;
      this.reviewHasMore = payload.hasMore === true;
      this.reviewState = 'ready';
    } catch {
      if (generation === this.reviewGeneration) this.reviewState = 'error';
    } finally {
      this.changeDetector.markForCheck();
    }
  }

  private publicApiUrl(path: string, requestUrl?: string): string {
    return requestUrl ? new URL(path, requestUrl).toString() : path;
  }
}
