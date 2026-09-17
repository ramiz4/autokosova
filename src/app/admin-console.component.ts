import { DOCUMENT, DatePipe } from '@angular/common';
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
  viewChild,
} from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AccountSessionService } from './account-session.service';
import { LanguageService } from './language.service';
import { StaffLayoutComponent } from './staff-layout.component';
import { GarageOnboardingComponent } from './garage-onboarding.component';
import { ButtonDirective } from './ui/button.directive';
import { AdminAccountComboboxComponent } from './admin-account-combobox.component';
import { AdminDraftGuardService } from './admin-draft-guard.service';
import { ConfirmationDialogComponent } from './ui/confirmation-dialog.component';
import { ToastService } from './ui/toast.service';
import { adminLabel } from '../shared/admin-copy';
import {
  ADMIN_REASON_CODES,
  type AdminReasonCode,
  type AdminPage,
  type AdminUser,
  type AdminGarageSummary,
  type AdminGarageDetail,
  type AdminPrivacy,
  type AdminAuditEvent,
  type AdminCatalog,
  type AdminSupportContext,
  type AdminOverview,
} from '../shared/administration';
import type { VerificationChecklist } from '../shared/garage-onboarding';

@Component({
  selector: 'app-admin-console',
  imports: [
    DatePipe,
    FormsModule,
    StaffLayoutComponent,
    GarageOnboardingComponent,
    ButtonDirective,
    AdminAccountComboboxComponent,
    ConfirmationDialogComponent,
  ],
  templateUrl: './admin-console.component.html',
  host: { '(window:beforeunload)': 'beforeUnload($event)' },
})
export class AdminConsoleComponent {
  readonly account = inject(AccountSessionService);
  readonly language = inject(LanguageService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly draftGuard = inject(AdminDraftGuardService);
  readonly section = this.route.snapshot.data['adminSection'] as string;
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private candidateRead = 0;
  protected readonly toast = inject(ToastService);
  readonly allowed = computed(() => this.account.identity()?.roles.includes('admin') === true);
  readonly ready = signal(false);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly stale = signal(false);
  readonly error = signal('');
  readonly page = signal(1);
  readonly hasMore = signal(false);
  readonly users = signal<readonly AdminUser[]>([]);
  readonly garages = signal<readonly AdminGarageSummary[]>([]);
  readonly detail = signal<AdminGarageDetail | null>(null);
  readonly privacy = signal<AdminPrivacy | null>(null);
  readonly selectedPrivacy = computed(() => this.privacy()?.selected ?? null);
  readonly events = signal<readonly AdminAuditEvent[]>([]);
  readonly catalog = signal<AdminCatalog | null>(null);
  readonly overview = signal<AdminOverview | null>(null);
  readonly consoleUrl = signal('');
  readonly candidates = signal<readonly AdminUser[]>([]);
  readonly proof = signal('');
  readonly support = signal<AdminSupportContext | null>(null);
  readonly editor = viewChild<GarageOnboardingComponent>('supportEditor');
  readonly confirmation = viewChild.required<ConfirmationDialogComponent>('confirmation');
  readonly reasons = ADMIN_REASON_CODES;
  readonly detailTabs = ['review', 'photos', 'team', 'support'] as const;
  readonly checks = ['phone', 'contactPerson', 'companyDocument', 'location'] as const;
  readonly durations = [
    'reviewEvidenceRetentionDays',
    'repairRequestRetentionDays',
    'reportRetentionDays',
    'auditLogRetentionDays',
  ] as const;
  query = '';
  status = '';
  candidateQuery = '';
  targetUserId = '';
  fromUserId = '';
  requestReference = '';
  memberRole: 'owner' | 'editor' = 'editor';
  reviewReason: AdminReasonCode | '' = '';
  decisionReason: AdminReasonCode | '' = '';
  photoReason: AdminReasonCode | '' = '';
  memberReason: AdminReasonCode | '' = '';
  detailTab: (typeof this.detailTabs)[number] = 'review';
  verification: { -readonly [K in keyof VerificationChecklist]: VerificationChecklist[K] } = {
    phone: 'not_checked',
    contactPerson: 'not_checked',
    companyDocument: 'not_checked',
    location: 'not_checked',
  };
  latitude: number | null = null;
  longitude: number | null = null;
  policyVersion = '';
  approvalReference = '';
  publicReviewHandling: '' | 'delete' | 'retain_anonymized' = '';
  approvalConfirmed = false;
  policyOpen = false;
  days: Record<(typeof this.durations)[number], number | null> = {
    reviewEvidenceRetentionDays: null,
    repairRequestRetentionDays: null,
    reportRetentionDays: null,
    auditLogRetentionDays: null,
  };
  editingPosition = false;
  private generation = 0;
  private reads = 0;
  private controller = new AbortController();
  private policyBaseline = '';
  private garageBaseline = '';
  private routeContext = '';
  private returnGarageId = '';
  private returnScrollY = 0;
  private currentParams: ParamMap | null = null;
  private disconnectDraftGuard: (() => void) | null = null;
  constructor() {
    afterNextRender(() => {
      this.ready.set(true);
      void this.account.refresh();
      this.disconnectDraftGuard = this.draftGuard.connect((target) => this.canLeave(target));
      this.route.queryParamMap?.subscribe((params) => this.applyRouteContext(params));
    });
    effect(() => {
      const context = this.account.dataContext(),
        ready = this.ready(),
        allowed = this.allowed();
      this.confirmation().cancelPending();
      this.generation++;
      this.reads++;
      this.controller.abort();
      this.controller = new AbortController();
      this.clear();
      this.restoreSafeFilter();
      if (context && ready && allowed)
        untracked(() => {
          void this.applyRouteContext(this.route.snapshot.queryParamMap);
        });
    });
    effect(() => this.language.setPageText(this.label(this.section), this.label('intro'), true));
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
      this.controller.abort();
      this.disconnectDraftGuard?.();
      this.clear();
    });
  }
  label(key: string) {
    return adminLabel(key, this.language.language);
  }
  link(section: string) {
    return this.language.link('admin') + '/' + section;
  }
  applyStatusFilter(): void {
    const queryParams =
      this.section === 'privacy'
        ? this.privacyContextParams()
        : this.status
          ? { status: this.status }
          : {};
    void this.router.navigate([], { relativeTo: this.route, queryParams });
  }
  loginUrl() {
    return '/auth/login?returnTo=' + encodeURIComponent(this.safeReturnTo());
  }
  async canLeave(targetUrl?: string): Promise<boolean> {
    if (this.busy()) return false;
    if (targetUrl && this.isReadOnlyContextNavigation(targetUrl)) return true;
    if (!(await (this.editor()?.canLeave() ?? true))) return false;
    if (!this.dirty() && !this.policyDirty()) return true;
    if (!(await this.confirm(this.label('discard'), this.label('discard')))) return false;
    if (this.busy() || (!this.dirty() && !this.policyDirty())) return false;
    // The user has explicitly discarded this snapshot. A second route guard must not ask again.
    this.garageBaseline = this.garageSnapshot();
    this.policyBaseline = this.policySnapshot();
    return true;
  }
  private confirm(description: string, confirmLabel: string): Promise<boolean> {
    return this.confirmation().ask({
      title: confirmLabel,
      description,
      confirmLabel,
      cancelLabel: this.label('back'),
    });
  }
  beforeUnload(event: BeforeUnloadEvent) {
    if (this.busy() || this.dirty() || this.policyDirty()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
  private clear() {
    this.users.set([]);
    this.garages.set([]);
    this.detail.set(null);
    this.events.set([]);
    this.catalog.set(null);
    this.privacy.set(null);
    this.overview.set(null);
    this.candidateRead++;
    this.candidates.set([]);
    this.proof.set('');
    this.support.set(null);
    this.error.set('');
    this.consoleUrl.set('');
    this.loading.set(false);
    this.busy.set(false);
    this.stale.set(false);
    this.reviewReason = '';
    this.decisionReason = '';
    this.photoReason = '';
    this.memberReason = '';
    this.targetUserId = '';
    this.fromUserId = '';
    this.requestReference = '';
    this.query = '';
    this.status = '';
    this.candidateQuery = '';
    this.latitude = null;
    this.longitude = null;
    this.editingPosition = false;
    for (const key of this.checks) this.verification[key] = 'not_checked';
    this.approvalConfirmed = false;
    this.policyVersion = '';
    this.approvalReference = '';
    this.publicReviewHandling = '';
    for (const key of this.durations) this.days[key] = null;
    this.policyOpen = false;
    this.policyBaseline = this.policySnapshot();
    this.garageBaseline = this.garageSnapshot();
    this.routeContext = '';
    this.returnGarageId = '';
    this.returnScrollY = 0;
  }
  /** Equality, not a sticky event, is the draft contract for all admin inputs. */
  dirty(): boolean {
    return this.garageSnapshot() !== this.garageBaseline;
  }
  private garageSnapshot(): string {
    return JSON.stringify({
      verification: this.verification,
      latitude: this.latitude,
      longitude: this.longitude,
      reviewReason: this.reviewReason,
      decisionReason: this.decisionReason,
      photoReason: this.photoReason,
      memberReason: this.memberReason,
      targetUserId: this.targetUserId,
      fromUserId: this.fromUserId,
      memberRole: this.memberRole,
      requestReference: this.requestReference,
    });
  }
  private captureGarageBaseline(): void {
    const reviewReason = this.reviewReason,
      decisionReason = this.decisionReason,
      photoReason = this.photoReason,
      memberReason = this.memberReason,
      targetUserId = this.targetUserId,
      fromUserId = this.fromUserId,
      memberRole = this.memberRole,
      requestReference = this.requestReference;
    this.reviewReason = '';
    this.decisionReason = '';
    this.photoReason = '';
    this.memberReason = '';
    this.targetUserId = '';
    this.memberRole = 'editor';
    this.requestReference = '';
    this.garageBaseline = this.garageSnapshot();
    this.reviewReason = reviewReason;
    this.decisionReason = decisionReason;
    this.photoReason = photoReason;
    this.memberReason = memberReason;
    this.targetUserId = targetUserId;
    this.fromUserId = fromUserId;
    this.memberRole = memberRole;
    this.requestReference = requestReference;
  }
  private restoreSafeFilter(): void {
    if (this.section !== 'garages' && this.section !== 'privacy') return;
    this.status =
      this.route.snapshot.queryParamMap?.get('status') ??
      (this.section === 'privacy' ? 'submitted' : '');
  }
  private applyRouteContext(params: ParamMap): void {
    if (!this.ready() || !this.allowed() || !this.account.dataContext()) return;
    this.currentParams = params;
    const garageId = params.get('garageId') ?? '';
    const tab = params.get('tab');
    const page = Number(params.get('page') ?? '1');
    const validPage = Number.isSafeInteger(page) && page >= 1 && page <= 10000 ? page : 1;
    const validGarage = /^[A-Za-z0-9_-]{1,200}$/.test(garageId);
    const validTab = this.detailTabs.includes(tab as (typeof this.detailTabs)[number])
      ? (tab as (typeof this.detailTabs)[number])
      : 'review';
    const context = `${garageId}|${validTab}|${params.get('requestId') ?? ''}|${params.get('status') ?? ''}|${validPage}`;
    if (context === this.routeContext) return;
    this.routeContext = context;
    this.status =
      params.get('status') ?? (this.section === 'privacy' ? 'submitted' : '');
    if (this.section === 'garages' && validGarage) {
      this.page.set(validPage);
      if (this.detail()?.id === garageId) {
        this.page.set(validPage);
        this.detailTab = validTab;
        if (validTab === 'team') void this.findCandidates();
        return;
      }
      void this.openGarage(garageId, validTab, false);
      return;
    }
    if (this.detail()) {
      this.detail.set(null);
      this.proof.set('');
      this.support.set(null);
    }
    void this.load(validPage);
  }
  async load(page = 1, ownMutation = false): Promise<void> {
    if (!this.allowed() || (this.busy() && !ownMutation)) return;
    const generation = this.generation,
      read = ++this.reads;
    this.loading.set(true);
    this.error.set('');
    const q = new URLSearchParams({ page: String(page) });
    if (this.query) q.set('query', this.query);
    if (this.status && this.section === 'garages') q.set('status', this.status);
    if (this.status && this.section === 'privacy') q.set('status', this.status);
    if (this.section === 'privacy' || this.section === 'policy') {
      const requestId = this.currentParam('requestId');
      if (requestId && /^[A-Za-z0-9_-]{1,200}$/.test(requestId)) q.set('requestId', requestId);
    }
    try {
      const section =
        this.section === 'support'
          ? 'users'
          : this.section === 'policy'
            ? 'privacy'
            : this.section;
      const data = await this.json<
        AdminPage<AdminUser> &
          AdminPage<AdminGarageSummary> &
          AdminPage<AdminAuditEvent> &
          AdminPrivacy &
          AdminCatalog
      >(await this.request('/api/admin/management/' + section + '?' + q));
      if (generation !== this.generation || read !== this.reads) return;
      this.page.set(page);
      this.hasMore.set(data.hasMore ?? false);
      if (section === 'users') {
        this.users.set(data.items);
        this.candidates.set(data.items);
      }
      if (section === 'garages') {
        this.garages.set(data.items);
        this.restoreGarageFocus();
      }
      if (section === 'privacy') {
        this.privacy.set(data);
        if (data.selected)
          afterNextRender(
            () => this.document.querySelector<HTMLElement>('[data-privacy-context]')?.focus(),
            { injector: this.injector },
          );
        if (this.currentParam('requestId') && !data.selected)
          this.error.set(this.label('requestUnavailable'));
      }
      if (section === 'audit') this.events.set(data.items);
      if (section === 'catalog') this.catalog.set(data);
      if (section === 'users') {
        const provider = await this.json<{ consoleUrl?: string }>(
          await this.request('/api/admin/management/provider'),
        );
        if (generation === this.generation && read === this.reads)
          this.consoleUrl.set(provider.consoleUrl ?? '');
      }
    } catch (error) {
      if (generation === this.generation && read === this.reads) this.failure(error);
    } finally {
      if (generation === this.generation && read === this.reads) this.loading.set(false);
    }
  }
  async openGarage(
    id: string,
    tab: (typeof this.detailTabs)[number] = 'review',
    navigate = true,
    ownMutation = false,
  ): Promise<void> {
    if ((this.busy() && !ownMutation) || (navigate && !(await this.canLeave()))) return;
    if (!this.detail()) {
      this.returnGarageId = id;
      if (navigate) this.returnScrollY = this.document.defaultView?.scrollY ?? 0;
    }
    const generation = this.generation,
      read = ++this.reads;
    this.loading.set(true);
    this.error.set('');
    this.proof.set('');
    this.support.set(null);
    try {
      const value = await this.json<AdminGarageDetail>(
        await this.request('/api/admin/management/garages/' + encodeURIComponent(id)),
      );
      if (generation !== this.generation || read !== this.reads) return;
      this.detail.set(value);
      this.stale.set(false);
      this.detailTab = tab;
      if (!ownMutation) {
        this.reviewReason = '';
        this.decisionReason = '';
        this.photoReason = '';
        this.memberReason = '';
        this.targetUserId = '';
        this.candidateQuery = '';
        this.memberRole = 'editor';
        this.requestReference = '';
      }
      for (const key of this.checks)
        this.verification[key] = value.verification[key] ?? 'not_checked';
      this.latitude = value.profile.locationPoint?.latitude ?? null;
      this.longitude = value.profile.locationPoint?.longitude ?? null;
      const owners = value.members.filter((m) => m.role === 'owner' && m.state === 'active');
      if (!ownMutation || !owners.some((owner) => owner.userId === this.fromUserId))
        this.fromUserId = owners.length === 1 ? owners[0].userId : '';
      this.captureGarageBaseline();
      if (tab === 'team') await this.findCandidates();
      if (navigate)
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: this.garageContextParams(value.id, tab),
        });
      afterNextRender(
        () => this.document.querySelector<HTMLElement>('[data-admin-detail-heading]')?.focus(),
        { injector: this.injector },
      );
    } catch (error) {
      if (generation === this.generation && read === this.reads) this.failure(error);
    } finally {
      if (generation === this.generation && read === this.reads) this.loading.set(false);
    }
  }
  async back() {
    if (!(await this.canLeave())) return;
    this.detail.set(null);
    this.proof.set('');
    this.support.set(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        ...(this.status ? { status: this.status } : {}),
        ...(this.page() > 1 ? { page: this.page() } : {}),
      },
    });
  }
  private restoreGarageFocus(): void {
    if (this.detail() || !this.returnGarageId) return;
    const id = this.returnGarageId,
      scrollY = this.returnScrollY;
    this.returnGarageId = '';
    afterNextRender(
      () => {
        const selector = `[data-admin-garage-id=${JSON.stringify(id)}] [data-admin-open-garage]`;
        this.document.defaultView?.scrollTo({ top: scrollY });
        (
          this.document.querySelector<HTMLElement>(selector) ??
          this.document.querySelector<HTMLElement>('h1')
        )?.focus({ preventScroll: scrollY > 0 });
      },
      { injector: this.injector },
    );
  }
  setDetailTab(tab: (typeof this.detailTabs)[number]) {
    if (tab === this.detailTab) return;
    if (this.busy()) return;
    const current = this.detail();
    if (current) {
      if (tab === 'team') void this.findCandidates();
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: this.garageContextParams(current.id, tab),
      });
    }
  }
  private garageContextParams(id: string, tab: (typeof this.detailTabs)[number]) {
    const returnRequest = this.currentParam('returnRequest');
    return {
      garageId: id,
      tab,
      ...(this.status ? { status: this.status } : {}),
      ...(this.page() > 1 ? { page: this.page() } : {}),
      ...(returnRequest && /^[A-Za-z0-9_-]{1,200}$/.test(returnRequest) ? { returnRequest } : {}),
    };
  }
  async findCandidates() {
    const generation = this.generation,
      request = ++this.candidateRead;
    try {
      const result = await this.json<AdminPage<AdminUser>>(
        await this.request(
          '/api/admin/management/users?query=' + encodeURIComponent(this.candidateQuery),
        ),
      );
      if (
        generation === this.generation &&
        request === this.candidateRead &&
        this.detailTab === 'team'
      )
        this.candidates.set(result.items.filter((u) => u.status === 'active'));
    } catch (error) {
      if (generation === this.generation && request === this.candidateRead) this.failure(error);
    }
  }
  async saveVerification() {
    const detail = this.detail();
    if (!detail || !this.reviewReason) return;
    await this.garageMutation(
      'verification',
      this.reviewReason,
      {
        verification: this.verification,
        ...(this.pointChanged() && this.latitude !== null && this.longitude !== null
          ? { locationPoint: { latitude: this.latitude, longitude: this.longitude } }
          : {}),
      },
      'verificationSaved',
    );
  }
  async decide(decision: 'published' | 'rejected' | 'suspended' | 'restore') {
    const reason = decision === 'published' ? 'company_verified' : this.decisionReason;
    const detail = this.detail();
    if (
      !detail ||
      !reason ||
      !(await this.confirm(this.decisionConfirmation(detail.name, decision), this.label(decision)))
    )
      return;
    if (this.detail() !== detail || this.busy() || !this.allowed() || this.stale()) return;
    await this.garageMutation(
      'decision',
      reason,
      {
        decision,
        verification: this.verification,
        ...(this.pointChanged() && this.latitude !== null && this.longitude !== null
          ? { locationPoint: { latitude: this.latitude, longitude: this.longitude } }
          : {}),
      },
      decision === 'published'
        ? 'garagePublished'
        : decision === 'rejected'
          ? 'garageRejected'
          : decision === 'suspended'
            ? 'garageSuspended'
            : 'garageRestored',
    );
  }
  canPublish(detail: AdminGarageDetail): boolean {
    return (
      !this.busy() &&
      !this.stale() &&
      this.publishBlockers(detail).length === 0 &&
      this.latitude !== null &&
      this.longitude !== null &&
      (!this.pointChanged() || this.validEditedPoint()) &&
      this.checks.every((check) => this.verification[check] === 'verified')
    );
  }
  publishBlockers(detail: AdminGarageDetail) {
    const correctedPoint = this.pointChanged() && this.validEditedPoint();
    const blockers = detail.prerequisites.blockers.filter(
      (blocker) =>
        (blocker !== 'point' || !correctedPoint) &&
        (blocker !== 'checks' ||
          !this.checks.every((check) => this.verification[check] === 'verified')),
    );
    return this.pointChanged() && !this.validEditedPoint() && !blockers.includes('point')
      ? [...blockers, 'point']
      : blockers;
  }
  restoreBlockers(detail: AdminGarageDetail) {
    const blockers = detail.prerequisites.restoreBlockers.filter(
      (blocker) =>
        blocker !== 'checks' ||
        !this.checks.every((check) => this.verification[check] === 'verified'),
    );
    return this.pointChanged() && !this.validEditedPoint() && !blockers.includes('point')
      ? [...blockers, 'point']
      : blockers;
  }
  canRestore(detail: AdminGarageDetail): boolean {
    return !this.busy() && !this.stale() && this.restoreBlockers(detail).length === 0;
  }
  private pointChanged(): boolean {
    const point = this.detail()?.profile.locationPoint;
    return (
      (point?.latitude ?? null) !== this.latitude || (point?.longitude ?? null) !== this.longitude
    );
  }
  private validEditedPoint(): boolean {
    return (
      this.latitude !== null &&
      this.longitude !== null &&
      Number.isFinite(this.latitude) &&
      Number.isFinite(this.longitude) &&
      this.latitude >= -90 &&
      this.latitude <= 90 &&
      this.longitude >= -180 &&
      this.longitude <= 180
    );
  }
  async member(
    userId = this.targetUserId,
    role = this.memberRole,
    state: 'active' | 'revoked' = 'active',
  ) {
    const detail = this.detail();
    if (!detail || !userId || !this.memberReason) return;
    const target = this.memberLabel(userId);
    if (
      !(await this.confirm(
        this.membershipConfirmation(detail.name, target, role, state),
        this.label('save'),
      ))
    )
      return;
    if (
      this.detail() !== detail ||
      this.busy() ||
      !this.allowed() ||
      this.stale() ||
      !this.memberReason
    )
      return;
    await this.garageMutation(
      'membership',
      this.memberReason,
      { userId, role, state },
      'membershipSaved',
    );
  }
  async transfer() {
    const detail = this.detail();
    if (!detail || !this.fromUserId || !this.targetUserId || this.fromUserId === this.targetUserId)
      return;
    const transfer = {
      context: this.account.dataContext(),
      detail,
      fromUserId: this.fromUserId,
      targetUserId: this.targetUserId,
    };
    if (
      !(await this.confirm(
        this.transferConfirmation(
          transfer.detail.name,
          this.memberLabel(transfer.fromUserId),
          this.memberLabel(transfer.targetUserId),
        ),
        this.label('transfer'),
      ))
    )
      return;
    if (
      this.account.dataContext() !== transfer.context ||
      this.detail() !== transfer.detail ||
      this.busy() ||
      !this.allowed() ||
      this.stale() ||
      this.fromUserId !== transfer.fromUserId ||
      this.targetUserId !== transfer.targetUserId
    )
      return;
    await this.garageMutation(
      'ownership',
      'ownership_change',
      {
        fromUserId: transfer.fromUserId,
        toUserId: transfer.targetUserId,
      },
      'ownershipTransferred',
    );
  }
  async setPhoto(id: string, approved: boolean) {
    const detail = this.detail();
    if (
      !detail ||
      !this.photoReason ||
      !(await this.confirm(
        this.photoConfirmation(detail.name, approved),
        this.label(approved ? 'approvePhoto' : 'rejectPhoto'),
      ))
    )
      return;
    if (
      this.detail() !== detail ||
      this.busy() ||
      !this.allowed() ||
      this.stale() ||
      !this.photoReason
    )
      return;
    await this.garageMutation(
      'photos/' + encodeURIComponent(id) + '/decision',
      this.photoReason,
      {
        approved,
      },
      approved ? 'photoApproved' : 'photoRejected',
    );
  }
  changeCandidateQuery(value: string): void {
    this.candidateQuery = value;
    this.targetUserId = '';
    this.candidates.set([]);
    void this.findCandidates();
  }
  selectCandidate(account: AdminUser) {
    this.targetUserId = account.id;
    this.candidateQuery = account.label;
  }
  private async garageMutation(
    action: string,
    reason: AdminReasonCode,
    body: Record<string, unknown>,
    result: string,
  ) {
    const detail = this.detail();
    if (!detail) return;
    await this.mutate(
      '/api/admin/management/garages/' + encodeURIComponent(detail.id) + '/' + action,
      { ...body, revision: detail.revision, reason },
      async () => {
        this.clearSubmittedGarageInput(action);
        await this.openGarage(detail.id, this.detailTab, false, true);
        if (!this.error()) {
          this.toast.show(this.label(result));
          this.focusResult();
        } else if (this.detail()) this.stale.set(true);
      },
    );
  }
  private clearSubmittedGarageInput(action: string): void {
    if (action === 'verification') this.reviewReason = '';
    if (action === 'decision') this.decisionReason = '';
    if (action.startsWith('photos/')) this.photoReason = '';
    if (action === 'membership') {
      this.memberReason = '';
      this.targetUserId = '';
    }
    if (action === 'ownership') this.targetUserId = '';
    if (action === 'submit') this.requestReference = '';
  }
  memberLabel(userId: string): string {
    return (
      this.detail()?.members.find((member) => member.userId === userId)?.label ??
      this.candidates().find((candidate) => candidate.id === userId)?.label ??
      this.label('unavailable')
    );
  }
  activeOwners(detail: AdminGarageDetail) {
    return detail.members.filter((member) => member.role === 'owner' && member.state === 'active');
  }
  private decisionConfirmation(
    name: string,
    decision: 'published' | 'rejected' | 'suspended' | 'restore',
  ) {
    const subject = `„${name}“`;
    if (decision === 'published')
      return `${subject}: ${this.label('publish')}? ${this.label('company_verified')}.`;
    if (decision === 'rejected') return `${subject}: ${this.label('reject')}?`;
    if (decision === 'suspended') return `${subject}: ${this.label('suspend')}?`;
    return `${subject}: ${this.label('restore')}?`;
  }
  private membershipConfirmation(
    name: string,
    target: string,
    role: string,
    state: string,
  ): string {
    return `„${name}“: ${target} → ${this.label(role)} (${this.label(state)})?`;
  }
  private transferConfirmation(name: string, source: string, target: string): string {
    return `„${name}“: ${source} → ${target}. ${this.label('transferHint')}`;
  }
  private photoConfirmation(name: string, approved: boolean): string {
    return `„${name}“: ${this.label(approved ? 'approvePhoto' : 'rejectPhoto')}?`;
  }
  async openDocument(fileId: string) {
    const detail = this.detail();
    if (!detail || this.busy()) return;
    const generation = this.generation;
    this.busy.set(true);
    this.error.set('');
    this.proof.set('');
    try {
      const grant = await this.json<{ fileId: string; grantId: string; localFixture?: boolean }>(
        await this.request(
          '/api/admin/management/garages/' +
            encodeURIComponent(detail.id) +
            '/documents/' +
            encodeURIComponent(fileId) +
            '/grant',
        ),
      );
      if (!grant.localFixture) throw 503;
      const response = await this.request(
        '/api/local-demo/files/' + encodeURIComponent(grant.fileId) + '/content',
        { headers: { 'x-file-grant': grant.grantId } },
      );
      if (!response.ok) throw await this.responseError(response);
      const text = await response.text();
      if (generation === this.generation && this.detail()?.id === detail.id) this.proof.set(text);
    } catch (error) {
      if (generation === this.generation) this.failure(error);
    } finally {
      if (generation === this.generation) this.busy.set(false);
    }
  }
  startSupport(correction = false) {
    if (!this.allowed() || this.requestReference.trim().length < 5) return;
    const detail = this.detail();
    const applicant = correction
      ? detail?.members.find((m) => m.state === 'active' && m.role === 'owner')?.userId
      : this.targetUserId;
    if (!applicant) return;
    this.support.set({
      applicantUserId: applicant,
      requestReference: this.requestReference.trim(),
      ...(correction && detail ? { garageId: detail.id, revision: detail.revision } : {}),
    });
  }
  async submitSupport() {
    const detail = this.detail();
    const reference = this.requestReference.trim();
    if (
      !detail ||
      reference.length < 5 ||
      !(await this.confirm(this.label('supportHint'), this.label('save')))
    )
      return;
    if (
      this.detail() !== detail ||
      this.busy() ||
      !this.allowed() ||
      this.stale() ||
      this.requestReference.trim() !== reference
    )
      return;
    await this.garageMutation(
      'submit',
      'documented_support',
      {
        requestReference: this.requestReference.trim(),
      },
      'verificationSaved',
    );
  }
  async supportSaved(id: string) {
    this.support.set(null);
    await this.openGarage(id, this.detailTab, false, true);
    this.toast.show(this.label('saved'));
  }
  validPolicy() {
    return (
      this.approvalConfirmed &&
      this.policyVersion.trim().length > 0 &&
      this.approvalReference.trim().length > 0 &&
      !!this.publicReviewHandling &&
      Object.values(this.days).every(
        (value) => Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= 3650,
      )
    );
  }
  policyDirty(): boolean {
    return this.policySnapshot() !== this.policyBaseline;
  }
  policyChanged(): void {
    // Kept as a template target: equality against the baseline, rather than a sticky flag,
    // is what protects tab, query, language and browser navigation.
  }
  private policySnapshot(): string {
    return JSON.stringify({
      version: this.policyVersion,
      approval: this.approvalReference,
      handling: this.publicReviewHandling,
      confirmed: this.approvalConfirmed,
      days: this.days,
    });
  }
  private privacyContextParams(requestId = this.currentParam('requestId') ?? '') {
    const focus = this.currentParam('focus');
    return {
      ...(this.status ? { status: this.status } : {}),
      ...(this.page() > 1 ? { page: this.page() } : {}),
      ...(requestId && /^[A-Za-z0-9_-]{1,200}$/.test(requestId) ? { requestId } : {}),
      ...(focus === 'privacy-context' ? { focus } : {}),
    };
  }
  async openPrivacyRequest(id: string): Promise<void> {
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(id) || !(await this.canLeave())) return;
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.privacyContextParams(id),
    });
  }
  privacyGarageUrl(garageId: string, requestId: string): string {
    return `${this.link('garages')}?garageId=${encodeURIComponent(garageId)}&tab=team&returnRequest=${encodeURIComponent(requestId)}`;
  }
  privacyReturnUrl(): string | null {
    const requestId = this.currentParam('returnRequest');
    if (!requestId || !/^[A-Za-z0-9_-]{1,200}$/.test(requestId)) return null;
    const page = this.currentParam('page');
    const status = this.currentParam('status');
    const query = new URLSearchParams({ requestId, focus: 'privacy-context' });
    if (page && /^\d{1,5}$/.test(page)) query.set('page', page);
    if (status && ['submitted', 'blocked', 'completed'].includes(status))
      query.set('status', status);
    return `${this.link('privacy')}?${query}`;
  }
  async savePolicy() {
    if (!this.validPolicy()) return;
    const policy = {
      context: this.account.dataContext(),
      version: this.policyVersion.trim(),
      approvalReference: this.approvalReference.trim(),
      publicReviewHandling: this.publicReviewHandling,
      days: { ...this.days },
    };
    if (!(await this.confirm(this.label('approvalAttestation'), this.label('savePolicy')))) return;
    if (
      this.account.dataContext() !== policy.context ||
      this.busy() ||
      !this.allowed() ||
      this.stale() ||
      this.policyVersion.trim() !== policy.version ||
      this.approvalReference.trim() !== policy.approvalReference ||
      this.publicReviewHandling !== policy.publicReviewHandling ||
      this.policySnapshot() !==
        JSON.stringify({
          version: policy.version,
          approval: policy.approvalReference,
          handling: policy.publicReviewHandling,
          confirmed: true,
          days: policy.days,
        })
    )
      return;
    await this.mutate(
      '/api/admin/lifecycle/retention-policy',
      {
        version: policy.version,
        operatorApprovalReference: policy.approvalReference,
        publicReviewHandling: policy.publicReviewHandling,
        ...policy.days,
      },
      async () => {
        this.approvalConfirmed = false;
        this.policyBaseline = this.policySnapshot();
        await this.load(this.page(), true);
        if (!this.error()) {
          this.toast.show(this.label('policySaved'));
          this.focusResult();
        }
      },
    );
  }
  async refreshDeletion(id: string) {
    await this.mutate(
      '/api/admin/management/privacy/' + encodeURIComponent(id) + '/refresh',
      {},
      async () => {
        await this.load(this.page(), true);
        if (!this.error()) {
          this.toast.show(this.label('refreshDone'));
          this.focusResult();
        }
      },
    );
  }
  async processDeletion(id: string, version?: string) {
    if (
      !version ||
      !(await this.confirm(
        this.label('deletionConfirm') + '\n' + this.label('policyVersion') + ': ' + version,
        this.label('delete'),
      ))
    )
      return;
    if (this.busy() || !this.allowed() || this.stale()) return;
    await this.mutate(
      '/api/admin/lifecycle/data-deletion-requests/' + encodeURIComponent(id) + '/process',
      { policyVersion: version },
      async () => {
        await this.load(this.page(), true);
        if (!this.error()) {
          this.toast.show(this.label('deletionProcessed'));
          this.focusResult();
        }
      },
    );
  }
  async revokeSessions(id: string) {
    if (!(await this.confirm(this.label('sessionConfirm'), this.label('save')))) return;
    if (this.busy() || !this.allowed() || this.stale()) return;
    await this.mutate(
      '/api/admin/management/users/' + encodeURIComponent(id) + '/revoke-sessions',
      {},
      async () => {
        await this.account.refresh();
      },
    );
  }
  private async mutate(path: string, body: unknown, after: () => Promise<void>): Promise<void> {
    if (this.busy() || this.stale() || !this.allowed()) return;
    const generation = this.generation;
    this.busy.set(true);
    this.error.set('');
    try {
      const csrf =
        this.document.cookie
          .split('; ')
          .find((value) => value.startsWith('autokosova_csrf='))
          ?.split('=')[1] ?? '';
      const response = await this.request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw await this.responseError(response);
      if (generation !== this.generation) return;
      await after();
    } catch (error) {
      if (generation === this.generation) this.failure(error);
    } finally {
      if (generation === this.generation) this.busy.set(false);
    }
  }
  private request(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: this.controller.signal,
      ...init,
    });
  }
  private async json<T>(response: Response): Promise<T> {
    if (!response.ok) throw await this.responseError(response);
    return response.json() as Promise<T>;
  }
  private async responseError(response: Response): Promise<{ status: number; code?: string }> {
    let code: string | undefined;
    try {
      code = ((await response.json()) as { code?: unknown }).code as string | undefined;
    } catch {
      // The status itself is enough for a safe, localized fallback.
    }
    return { status: response.status, ...(typeof code === 'string' ? { code } : {}) };
  }
  private failure(error: unknown) {
    const status = typeof error === 'number' ? error : (error as { status?: number })?.status;
    const code = typeof error === 'object' && error ? (error as { code?: string }).code : undefined;
    if (status === 401) {
      this.account.invalidate();
      return;
    }
    if (status === 403 && code !== 'admin_blocked') {
      this.invalidateContext();
      this.error.set(this.label('denied'));
      return;
    }
    if (status === 404) {
      this.detail.set(null);
      this.proof.set('');
    }
    if (code === 'admin_conflict' || (status === 409 && !code)) this.stale.set(true);
    this.error.set(
      code === 'admin_conflict'
        ? this.label('conflict')
        : code === 'privacy_policy_changed'
          ? this.label('privacyPolicyChanged')
          : code === 'privacy_policy_missing'
            ? this.label('privacyPolicyMissing')
            : code === 'privacy_ownership_blocked'
              ? this.label('privacyOwnershipBlocked')
              : code === 'admin_blocked'
                ? this.label('publishBlocked')
                : status === 422 || status === 400
                  ? this.label('invalid')
                  : this.label('error'),
    );
  }
  private currentParam(name: string): string | null {
    return this.currentParams?.get(name) ?? this.route.snapshot.queryParamMap?.get(name) ?? null;
  }
  private invalidateContext(): void {
    this.generation++;
    this.reads++;
    this.candidateRead++;
    this.controller.abort();
    this.controller = new AbortController();
    this.clear();
  }
  private safeReturnTo(): string {
    const tree = this.router.parseUrl(this.router.url);
    const path =
      tree.root.children['primary']?.segments.map((segment) => segment.path).join('/') ?? '';
    if (!/^(?:(?:sq|en)\/)?admin\/(?:garages|users|privacy|audit|catalog|support)$/.test(path))
      return this.link(this.section);
    const allowed = new Set([
      'garageId',
      'tab',
      'requestId',
      'status',
      'page',
      'focus',
      'returnRequest',
    ]);
    const query = Object.entries(tree.queryParams).filter(
      ([key, value]) => allowed.has(key) && typeof value === 'string',
    );
    const params = new URLSearchParams(query as [string, string][]);
    return '/' + path + (params.size ? '?' + params : '');
  }
  private focusResult(): void {
    afterNextRender(
      () =>
        this.document
          .querySelector<HTMLElement>('[data-admin-result], [data-privacy-result]')
          ?.focus(),
      { injector: this.injector },
    );
  }
  private isReadOnlyContextNavigation(targetUrl: string): boolean {
    const target = this.router.parseUrl(targetUrl);
    const path =
      target.root.children['primary']?.segments.map((segment) => segment.path).join('/') ?? '';
    const current = this.router.parseUrl(this.router.url);
    const currentPath =
      current.root.children['primary']?.segments.map((segment) => segment.path).join('/') ?? '';
    // Locale changes recreate this component; only same-path query navigation retains RAM drafts.
    if (path !== currentPath) return false;
    const garageId = target.queryParams['garageId'];
    if (this.section === 'privacy') return true;
    return (
      this.section === 'garages' && typeof garageId === 'string' && garageId === this.detail()?.id
    );
  }
}
