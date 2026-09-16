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
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AccountSessionService } from './account-session.service';
import { LanguageService } from './language.service';
import { SiteHeaderComponent } from './site-header.component';
import { AdminNavigationComponent } from './admin-navigation.component';
import { GarageOnboardingComponent } from './garage-onboarding.component';
import { ButtonDirective } from './ui/button.directive';
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
    SiteHeaderComponent,
    AdminNavigationComponent,
    GarageOnboardingComponent,
    ButtonDirective,
  ],
  templateUrl: './admin-console.component.html',
  host: { '(window:beforeunload)': 'beforeUnload($event)' },
})
export class AdminConsoleComponent {
  readonly account = inject(AccountSessionService);
  readonly language = inject(LanguageService);
  readonly section = inject(ActivatedRoute).snapshot.data['adminSection'] as string;
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private candidateRead = 0;
  readonly allowed = computed(() => this.account.identity()?.roles.includes('admin') === true);
  readonly ready = signal(false);
  readonly loading = signal(false);
  readonly busy = signal(false);
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
  reason: AdminReasonCode | '' = '';
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
  private generation = 0;
  private reads = 0;
  private controller = new AbortController();
  constructor() {
    afterNextRender(() => {
      this.ready.set(true);
      void this.account.refresh();
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
      if (context && ready && allowed) untracked(() => void this.load());
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
    this.dirty = false;
    this.reason = '';
    this.targetUserId = '';
    this.fromUserId = '';
    this.requestReference = '';
    this.query = '';
    this.status = '';
    this.candidateQuery = '';
    this.latitude = null;
    this.longitude = null;
    for (const key of this.checks) this.verification[key] = 'not_checked';
    this.approvalConfirmed = false;
    this.policyVersion = '';
    this.approvalReference = '';
    this.publicReviewHandling = '';
    for (const key of this.durations) this.days[key] = null;
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
  async openGarage(id: string): Promise<void> {
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
      this.reason = '';
      this.dirty = false;
      this.requestReference = '';
      for (const key of this.checks)
        this.verification[key] = value.verification[key] ?? 'not_checked';
      this.latitude = value.profile.locationPoint?.latitude ?? null;
      this.longitude = value.profile.locationPoint?.longitude ?? null;
      this.fromUserId =
        value.members.find((m) => m.role === 'owner' && m.state === 'active')?.userId ?? '';
      await this.findCandidates();
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
    void this.load(this.page());
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
    if (!detail || !this.reason) return;
    await this.garageMutation('verification', {
      verification: this.verification,
      ...(this.latitude !== null && this.longitude !== null
        ? { locationPoint: { latitude: this.latitude, longitude: this.longitude } }
        : {}),
    });
  }
  async decide(decision: 'published' | 'rejected' | 'suspended' | 'restore') {
    if (!this.reason || !window.confirm(this.label('decisionConfirm'))) return;
    await this.garageMutation('decision', { decision, verification: this.verification });
  }
  async member(
    userId = this.targetUserId,
    role = this.memberRole,
    state: 'active' | 'revoked' = 'active',
  ) {
    if (!userId || !this.reason || !window.confirm(this.label('membershipConfirm'))) return;
    await this.garageMutation('membership', { userId, role, state });
  }
  async transfer() {
    if (
      !this.fromUserId ||
      !this.targetUserId ||
      this.fromUserId === this.targetUserId ||
      !window.confirm(this.label('transferHint'))
    )
      return;
    this.reason = 'ownership_change';
    await this.garageMutation('ownership', {
      fromUserId: this.fromUserId,
      toUserId: this.targetUserId,
    });
  }
  async setPhoto(id: string, approved: boolean) {
    if (
      !this.reason ||
      !window.confirm(this.label(approved ? 'approvePhoto' : 'rejectPhoto') + '?')
    )
      return;
    await this.garageMutation('photos/' + encodeURIComponent(id) + '/decision', { approved });
  }
  private async garageMutation(action: string, body: Record<string, unknown>) {
    const detail = this.detail();
    if (!detail || !this.reason) return;
    await this.mutate(
      '/api/admin/management/garages/' + encodeURIComponent(detail.id) + '/' + action,
      { ...body, revision: detail.revision, reason: this.reason },
      async () => {
        this.dirty = false;
        await this.openGarage(detail.id);
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
      if (!response.ok) throw response.status;
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
    this.reason = 'documented_support';
    await this.garageMutation('submit', { requestReference: this.requestReference.trim() });
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
      {},
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
    if (this.busy() || !this.allowed()) return;
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
      if (!response.ok) throw response.status;
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
    if (!response.ok) throw response.status;
    return response.json() as Promise<T>;
  }
  private failure(error: unknown) {
    if (error === 401) {
      this.account.invalidate();
      return;
    }
    if (error === 403) {
      this.clear();
      this.error.set(this.label('denied'));
      return;
    }
    if (error === 404) {
      this.detail.set(null);
      this.proof.set('');
    }
    this.error.set(
      error === 409
        ? this.label('conflict')
        : error === 422 || error === 400
          ? this.label('invalid')
          : this.label('error'),
    );
  }
}
