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
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AccountSessionService } from './account-session.service';
import { LanguageService } from './language.service';
import { StaffLayoutComponent } from './staff-layout.component';
import { GarageOnboardingComponent } from './garage-onboarding.component';
import { ButtonDirective } from './ui/button.directive';
import { AdminAccountComboboxComponent } from './admin-account-combobox.component';
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
  ],
  templateUrl: './admin-console.component.html',
  host: { '(window:beforeunload)': 'beforeUnload($event)' },
})
export class AdminConsoleComponent {
  readonly account = inject(AccountSessionService);
  readonly language = inject(LanguageService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly section = this.route.snapshot.data['adminSection'] as string;
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private candidateRead = 0;
  readonly allowed = computed(() => this.account.identity()?.roles.includes('admin') === true);
  readonly ready = signal(false);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly stale = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly page = signal(1);
  readonly hasMore = signal(false);
  readonly users = signal<readonly AdminUser[]>([]);
  readonly garages = signal<readonly AdminGarageSummary[]>([]);
  readonly detail = signal<AdminGarageDetail | null>(null);
  readonly privacy = signal<AdminPrivacy | null>(null);
  readonly events = signal<readonly AdminAuditEvent[]>([]);
  readonly catalog = signal<AdminCatalog | null>(null);
  readonly overview = signal<AdminOverview | null>(null);
  readonly consoleUrl = signal('');
  readonly candidates = signal<readonly AdminUser[]>([]);
  readonly proof = signal('');
  readonly support = signal<AdminSupportContext | null>(null);
  readonly editor = viewChild<GarageOnboardingComponent>('supportEditor');
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
  photoReason: AdminReasonCode | '' = '';
  memberReason: AdminReasonCode | '' = '';
  supportReason: AdminReasonCode | '' = '';
  detailTab: (typeof this.detailTabs)[number] = 'review';
  /** Temporary test-facing alias; UI actions use their own local reason fields. */
  get reason(): AdminReasonCode | '' {
    return this.reviewReason;
  }
  set reason(value: AdminReasonCode | '') {
    this.reviewReason = value;
  }
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
  days: Record<(typeof this.durations)[number], number | null> = {
    reviewEvidenceRetentionDays: null,
    repairRequestRetentionDays: null,
    reportRetentionDays: null,
    auditLogRetentionDays: null,
  };
  dirty = false;
  editingPosition = false;
  private generation = 0;
  private reads = 0;
  private controller = new AbortController();
  constructor() {
    afterNextRender(() => {
      this.ready.set(true);
      void this.account.refresh();
      const garageId = this.route.snapshot.queryParamMap?.get('garageId');
      const tab = this.route.snapshot.queryParamMap?.get('tab');
      if (
        this.section === 'garages' &&
        garageId &&
        /^[A-Za-z0-9_-]{1,200}$/.test(garageId) &&
        this.detailTabs.includes(tab as (typeof this.detailTabs)[number])
      )
        this.detailTab = tab as (typeof this.detailTabs)[number];
    });
    effect(() => {
      const context = this.account.dataContext(),
        ready = this.ready(),
        allowed = this.allowed();
      this.generation++;
      this.reads++;
      this.controller.abort();
      this.controller = new AbortController();
      this.clear();
      this.restoreSafeFilter();
      if (context && ready && allowed)
        untracked(() => {
          const garageId = this.route.snapshot.queryParamMap?.get('garageId');
          if (this.section === 'garages' && garageId && /^[A-Za-z0-9_-]{1,200}$/.test(garageId))
            void this.openGarage(garageId, this.detailTab);
          else void this.load();
        });
    });
    effect(() => this.language.setPageText(this.label(this.section), this.label('intro'), true));
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
      this.controller.abort();
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
    const queryParams = this.status ? { status: this.status } : {};
    void this.router.navigate([], { relativeTo: this.route, queryParams });
    void this.load(1);
  }
  loginUrl() {
    return '/auth/login?returnTo=' + encodeURIComponent(this.link(this.section));
  }
  canLeave(): boolean {
    return (
      !this.busy() &&
      (this.editor()?.canLeave() ?? true) &&
      (!this.dirty || window.confirm(this.label('discard')))
    );
  }
  beforeUnload(event: BeforeUnloadEvent) {
    if (this.busy() || this.dirty) {
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
    this.success.set('');
    this.consoleUrl.set('');
    this.loading.set(false);
    this.busy.set(false);
    this.stale.set(false);
    this.dirty = false;
    this.reviewReason = '';
    this.photoReason = '';
    this.memberReason = '';
    this.supportReason = '';
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
  }
  private restoreSafeFilter(): void {
    if (this.section !== 'garages' && this.section !== 'privacy') return;
    this.status = this.route.snapshot.queryParamMap?.get('status') ?? '';
  }
  async load(page = 1): Promise<void> {
    if (!this.allowed() || this.busy()) return;
    const generation = this.generation,
      read = ++this.reads;
    this.loading.set(true);
    this.error.set('');
    const q = new URLSearchParams({ page: String(page) });
    if (this.query) q.set('query', this.query);
    if (this.status && this.section === 'garages') q.set('status', this.status);
    try {
      const section = this.section === 'support' ? 'users' : this.section;
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
      if (section === 'garages') this.garages.set(data.items);
      if (section === 'privacy') this.privacy.set(data);
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
    tab: (typeof this.detailTabs)[number] = this.detailTab,
  ): Promise<void> {
    if (this.busy() || !this.canLeave()) return;
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
      this.reviewReason = '';
      this.photoReason = '';
      this.memberReason = '';
      this.supportReason = '';
      this.dirty = false;
      this.requestReference = '';
      for (const key of this.checks)
        this.verification[key] = value.verification[key] ?? 'not_checked';
      this.latitude = value.profile.locationPoint?.latitude ?? null;
      this.longitude = value.profile.locationPoint?.longitude ?? null;
      this.fromUserId =
        value.members.find((m) => m.role === 'owner' && m.state === 'active')?.userId ?? '';
      if (tab === 'team') await this.findCandidates();
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
  back() {
    if (!this.canLeave()) return;
    this.detail.set(null);
    this.proof.set('');
    this.support.set(null);
    this.dirty = false;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.status ? { status: this.status } : {},
    });
    void this.load(this.page());
  }
  setDetailTab(tab: (typeof this.detailTabs)[number]) {
    if (tab === this.detailTab || !this.canLeave()) return;
    this.detailTab = tab;
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
    const returnRequest = this.route.snapshot.queryParamMap?.get('returnRequest');
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
      if (generation === this.generation && request === this.candidateRead)
        this.candidates.set(result.items.filter((u) => u.status === 'active'));
    } catch (error) {
      if (generation === this.generation && request === this.candidateRead) this.failure(error);
    }
  }
  async saveVerification() {
    const detail = this.detail();
    if (!detail || !this.reviewReason) return;
    await this.garageMutation('verification', this.reviewReason, {
      verification: this.verification,
      ...(this.latitude !== null && this.longitude !== null
        ? { locationPoint: { latitude: this.latitude, longitude: this.longitude } }
        : {}),
    });
  }
  async decide(decision: 'published' | 'rejected' | 'suspended' | 'restore') {
    const reason = decision === 'published' ? 'company_verified' : this.reviewReason;
    if (!reason || !window.confirm(this.label('decisionConfirm'))) return;
    await this.garageMutation('decision', reason, {
      decision,
      verification: this.verification,
      ...(this.editingPosition && this.latitude !== null && this.longitude !== null
        ? { locationPoint: { latitude: this.latitude, longitude: this.longitude } }
        : {}),
    });
  }
  canPublish(detail: AdminGarageDetail): boolean {
    return (
      !this.busy() &&
      !this.stale() &&
      this.publishBlockers(detail).length === 0 &&
      this.latitude !== null &&
      this.longitude !== null &&
      this.checks.every((check) => this.verification[check] === 'verified')
    );
  }
  publishBlockers(detail: AdminGarageDetail) {
    const correctedPoint =
      this.editingPosition &&
      this.latitude !== null &&
      this.longitude !== null &&
      Number.isFinite(this.latitude) &&
      Number.isFinite(this.longitude) &&
      this.latitude >= -90 &&
      this.latitude <= 90 &&
      this.longitude >= -180 &&
      this.longitude <= 180;
    return detail.prerequisites.blockers.filter(
      (blocker) => blocker !== 'point' || !correctedPoint,
    );
  }
  async member(
    userId = this.targetUserId,
    role = this.memberRole,
    state: 'active' | 'revoked' = 'active',
  ) {
    if (!userId || !this.memberReason || !window.confirm(this.label('membershipConfirm'))) return;
    await this.garageMutation('membership', this.memberReason, { userId, role, state });
  }
  async transfer() {
    if (
      !this.fromUserId ||
      !this.targetUserId ||
      this.fromUserId === this.targetUserId ||
      !window.confirm(this.label('transferHint'))
    )
      return;
    await this.garageMutation('ownership', 'ownership_change', {
      fromUserId: this.fromUserId,
      toUserId: this.targetUserId,
    });
  }
  async setPhoto(id: string, approved: boolean) {
    if (
      !this.photoReason ||
      !window.confirm(this.label(approved ? 'approvePhoto' : 'rejectPhoto') + '?')
    )
      return;
    await this.garageMutation('photos/' + encodeURIComponent(id) + '/decision', this.photoReason, {
      approved,
    });
  }
  selectCandidate(account: AdminUser) {
    this.targetUserId = account.id;
    this.candidateQuery = account.label;
  }
  private async garageMutation(
    action: string,
    reason: AdminReasonCode,
    body: Record<string, unknown>,
  ) {
    const detail = this.detail();
    if (!detail) return;
    await this.mutate(
      '/api/admin/management/garages/' + encodeURIComponent(detail.id) + '/' + action,
      { ...body, revision: detail.revision, reason },
      async () => {
        this.dirty = false;
        await this.openGarage(detail.id, this.detailTab);
      },
    );
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
    if (
      !this.detail() ||
      this.requestReference.trim().length < 5 ||
      !window.confirm(this.label('supportHint'))
    )
      return;
    await this.garageMutation('submit', 'documented_support', {
      requestReference: this.requestReference.trim(),
    });
  }
  async supportSaved(id: string) {
    this.support.set(null);
    this.dirty = false;
    await this.openGarage(id);
    this.success.set(this.label('saved'));
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
  async savePolicy() {
    if (!this.validPolicy() || !window.confirm(this.label('approvalAttestation'))) return;
    await this.mutate(
      '/api/admin/lifecycle/retention-policy',
      {
        version: this.policyVersion.trim(),
        operatorApprovalReference: this.approvalReference.trim(),
        publicReviewHandling: this.publicReviewHandling,
        ...this.days,
      },
      async () => {
        this.dirty = false;
        this.approvalConfirmed = false;
        await this.load(this.page());
      },
    );
  }
  async refreshDeletion(id: string) {
    await this.mutate(
      '/api/admin/management/privacy/' + encodeURIComponent(id) + '/refresh',
      {},
      () => this.load(this.page()),
    );
  }
  async processDeletion(id: string, version?: string) {
    if (
      !version ||
      !window.confirm(
        this.label('deletionConfirm') + '\n' + this.label('policyVersion') + ': ' + version,
      )
    )
      return;
    await this.mutate(
      '/api/admin/lifecycle/data-deletion-requests/' + encodeURIComponent(id) + '/process',
      { policyVersion: version },
      () => this.load(this.page()),
    );
  }
  async revokeSessions(id: string) {
    if (!window.confirm(this.label('sessionConfirm'))) return;
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
    this.success.set('');
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
      this.success.set(this.label('saved'));
      this.busy.set(false);
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
    if (status === 403) {
      this.clear();
      this.error.set(this.label('denied'));
      return;
    }
    if (status === 404) {
      this.detail.set(null);
      this.proof.set('');
    }
    if (status === 409) this.stale.set(true);
    this.error.set(
      code === 'admin_conflict' || status === 409
        ? this.label('conflict')
        : code === 'admin_blocked'
          ? this.label('publishBlocked')
          : status === 422 || status === 400
            ? this.label('invalid')
            : this.label('error'),
    );
  }
}
