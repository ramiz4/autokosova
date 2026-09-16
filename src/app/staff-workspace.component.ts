import { adminLabel } from '../shared/admin-copy';
import type { AdminOverview } from '../shared/administration';
import { StaffDecisionFormComponent } from './staff-decision-form.component';
import type { StaffCaseDecision } from '../shared/staff-decision';
import { DOCUMENT, DatePipe } from '@angular/common';
import {
  Component,
  Injector,
  DestroyRef,
  HostListener,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AccountSessionService } from './account-session.service';
import { LanguageService } from './language.service';
import { StaffLayoutComponent } from './staff-layout.component';
import { StaffDraftGuardService } from './staff-draft-guard.service';
import { ButtonDirective } from './ui/button.directive';
import { staffCopy, staffLabel } from '../shared/staff-copy';
import {
  STAFF_ESCALATION_REASONS,
  type StaffCaseDetail,
  type StaffCaseSummary,
  type StaffModerator,
  type StaffQueuePage,
  type StaffEscalationReason,
} from '../shared/moderation';

interface StaffHttpError {
  readonly status: number;
  readonly code?: string;
}

@Component({
  selector: 'app-staff-workspace',
  imports: [
    StaffDecisionFormComponent,
    StaffLayoutComponent,
    RouterLink,
    FormsModule,
    DatePipe,
    ButtonDirective,
  ],
  templateUrl: './staff-workspace.component.html',
})
export class StaffWorkspaceComponent {
  readonly account = inject(AccountSessionService);
  readonly language = inject(LanguageService);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly draftGuard = inject(StaffDraftGuardService);
  private previousCase = '';
  private listScrollY = 0;
  readonly adminOnly = inject(ActivatedRoute).snapshot.data['adminOnly'] === true;
  readonly copy = computed(() => staffCopy(this.language.language));
  readonly isAdmin = computed(() => this.account.identity()?.roles.includes('admin') ?? false);
  /** `/moderation` stays compatible for admins as the same queue narrowed to their assignments. */
  readonly myCases = computed(() => !this.adminOnly && this.isAdmin());
  readonly allowed = computed(
    () =>
      this.isAdmin() ||
      (!this.adminOnly && (this.account.identity()?.roles.includes('moderator') ?? false)),
  );
  readonly adminOverview = signal<AdminOverview | null>(null);
  adminLabel(key: string) {
    return adminLabel(key, this.language.language);
  }
  readonly ready = signal(false);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly resultAvailable = signal(false);
  readonly cases = signal<readonly StaffCaseSummary[]>([]);
  readonly detail = signal<StaffCaseDetail | null>(null);
  readonly moderators = signal<readonly StaffModerator[]>([]);
  readonly page = signal(1);
  readonly hasMore = signal(false);
  readonly reasons = STAFF_ESCALATION_REASONS;
  readonly evidenceText = signal<string | null>(null);
  readonly draftDirty = signal(false);
  filterStatus = '';
  actionableOnly = true;
  queue: '' | 'todo' | 'waiting' | 'done' = 'todo';
  filterAssignee = '';
  filterKind = '';
  filterPriority = '';
  onlyEscalated = false;
  onlyUnassigned = false;
  onlyAppeal = false;
  moderatorId = '';
  escalationReason: StaffEscalationReason = 'requires_admin';
  private generation = 0;
  private controller?: AbortController;
  private detailController?: AbortController;
  private detailVersion = 0;
  private assignmentInitial = '';
  private escalationInitial: StaffEscalationReason = 'requires_admin';
  constructor() {
    afterNextRender(() => {
      this.ready.set(true);
      void this.account.refresh();
    });
    this.route.paramMap.subscribe((params) => {
      const caseId = params.get('caseId');
      if (caseId && this.ready() && this.allowed()) void this.open(caseId, false);
    });
    this.applyRouteQuery(this.route.snapshot.queryParamMap);
    this.route.queryParamMap.subscribe((query) => {
      this.applyRouteQuery(query);
      if (this.ready() && this.allowed() && !this.route.snapshot.paramMap.get('caseId'))
        void this.load(this.page());
    });
    effect(() => this.draftGuard.setDirty(this.hasUnsavedInput()));
    effect(() => {
      if (!this.account.dataContext()) this.clearPrivate();
    });
    effect(() => {
      if (this.allowed()) return;
      this.clearPrivate();
    });
    this.initialize();
    /* Query values are intentionally technical, bounded route context only. */
  }
  private applyRouteQuery(query: import('@angular/router').ParamMap): void {
    this.filterStatus = query.get('status') ?? '';
    this.filterKind = query.get('kind') ?? '';
    this.filterPriority = query.get('priority') ?? '';
    this.filterAssignee = query.get('assignedUserId') ?? '';
    this.onlyEscalated = query.get('escalated') === 'true';
    this.onlyUnassigned = query.get('unassigned') === 'true';
    this.onlyAppeal = query.get('appeal') === 'true';
    this.actionableOnly = query.get('actionable') !== 'false';
    const requestedPage = Number(query.get('page'));
    this.page.set(Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1);
    const requestedQueue = query.get('queue');
    this.queue =
      requestedQueue === 'waiting' || requestedQueue === 'done' ? requestedQueue : 'todo';
  }
  private initialize(): void {
    effect(() => {
      const context = this.account.dataContext();
      const ready = this.ready();
      const allowed = this.allowed();
      this.generation++;
      this.controller?.abort();
      this.detailController?.abort();
      this.detailVersion++;
      this.adminOverview.set(null);
      this.cases.set([]);
      this.detail.set(null);
      this.evidenceText.set(null);
      this.moderators.set([]);
      this.error.set('');
      this.success.set('');
      this.resultAvailable.set(false);
      this.loading.set(false);
      this.busy.set(false);
      this.moderatorId = '';
      this.assignmentInitial = '';
      this.escalationInitial = 'requires_admin';
      if (context && ready && allowed)
        untracked(() => {
          const caseId = this.route.snapshot.paramMap.get('caseId');
          void (caseId ? this.open(caseId, false) : this.load(this.page()));
        });
    });
    effect(() =>
      this.language.setPageText(
        this.adminOnly ? this.copy().admin : this.copy().moderation,
        this.copy().intro,
        true,
      ),
    );
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
      this.controller?.abort();
      this.detailController?.abort();
      this.clearPrivate();
    });
  }
  label(value: string): string {
    return staffLabel(value, this.language.language);
  }
  queueLabel(value: 'todo' | 'waiting' | 'done'): string {
    return this.copy()[value];
  }
  loginUrl(): string {
    // Angular serializes `:` in a technical case id. Decode that one router serialization before
    // handing the entire local URL to the server; a double-encoded attacker value remains encoded
    // and is rejected by `safeReturnTo`.
    let target = this.router.url;
    try {
      target = decodeURIComponent(target);
    } catch {
      // Keep malformed input encoded; the server's strict whitelist will fall back safely.
    }
    return '/auth/login?returnTo=' + encodeURIComponent(target);
  }
  async load(page = 1): Promise<void> {
    if (!this.allowed() || this.busy()) return;
    const generation = ++this.generation;
    this.controller?.abort();
    this.controller = new AbortController();
    const context = this.account.dataContext();
    this.loading.set(true);
    this.error.set('');
    const query = new URLSearchParams({ page: String(page) });
    if (this.filterStatus) query.set('status', this.filterStatus);
    if (this.queue && !this.filterStatus) query.set('queue', this.queue);
    const assignee = this.myCases() ? this.account.identity()?.userId : this.filterAssignee;
    if (this.isAdmin() && assignee) query.set('assignedUserId', assignee);
    if (this.filterKind) query.set('kind', this.filterKind);
    if (this.filterPriority) query.set('priority', this.filterPriority);
    if (this.onlyEscalated && this.isAdmin()) query.set('escalated', 'true');
    if (this.onlyUnassigned && this.isAdmin()) query.set('unassigned', 'true');
    if (this.onlyAppeal) query.set('appeal', 'true');
    try {
      const response = await fetch('/api/staff/cases?' + query, {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: this.controller.signal,
      });
      const data = await this.json<StaffQueuePage>(response);
      const candidates = this.isAdmin()
        ? await this.json<{ moderators: StaffModerator[] }>(
            await fetch('/api/staff/moderators', {
              credentials: 'same-origin',
              cache: 'no-store',
              signal: this.controller.signal,
            }),
          )
        : null;
      if (generation !== this.generation || context !== this.account.dataContext()) return;
      if (!Array.isArray(data.cases) || typeof data.hasMore !== 'boolean')
        throw new Error('Invalid case list');
      this.cases.set(data.cases);
      this.page.set(data.page);
      this.hasMore.set(data.hasMore);
      this.moderators.set(candidates?.moderators ?? []);
      if (this.isAdmin()) {
        const overview = await fetch('/api/admin/management/overview', {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: this.controller.signal,
        });
        if (overview.ok) {
          const value = (await overview.json()) as AdminOverview;
          if (generation === this.generation && context === this.account.dataContext())
            this.adminOverview.set(value);
        }
      }
    } catch (error) {
      if (generation === this.generation && context === this.account.dataContext()) {
        this.cases.set([]);
        this.failure(error);
      }
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
  applyFilters(): void {
    const queryParams: Record<string, string> = {};
    if (this.filterStatus) queryParams['status'] = this.filterStatus;
    if (this.filterKind) queryParams['kind'] = this.filterKind;
    if (this.filterPriority) queryParams['priority'] = this.filterPriority;
    if (this.isAdmin() && this.filterAssignee) queryParams['assignedUserId'] = this.filterAssignee;
    if (this.isAdmin() && this.onlyEscalated) queryParams['escalated'] = 'true';
    if (this.isAdmin() && this.onlyUnassigned) queryParams['unassigned'] = 'true';
    if (this.onlyAppeal) queryParams['appeal'] = 'true';
    if (this.queue !== 'todo') queryParams['queue'] = this.queue;
    void this.router.navigate([], { relativeTo: this.route, queryParams });
    void this.load();
  }
  setQueue(queue: '' | 'todo' | 'waiting' | 'done'): void {
    this.queue = queue;
    this.filterStatus = '';
    this.applyFilters();
  }
  resetFilters(): void {
    this.filterStatus = '';
    this.filterAssignee = '';
    this.filterKind = '';
    this.filterPriority = '';
    this.onlyEscalated = false;
    this.onlyUnassigned = false;
    this.onlyAppeal = false;
    this.queue = 'todo';
    this.applyFilters();
  }
  goPage(page: number): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page },
      queryParamsHandling: 'merge',
    });
    void this.load(page);
  }
  async open(id: string, updateUrl = true): Promise<void> {
    if (this.busy()) return;
    if (updateUrl && this.route.snapshot.paramMap.get('caseId') !== id) {
      this.listScrollY = this.document.defaultView?.scrollY ?? 0;
      const query = this.router.url.includes('?')
        ? this.router.url.slice(this.router.url.indexOf('?'))
        : '';
      void this.router.navigateByUrl(
        this.language.link(this.adminOnly ? 'admin' : 'moderation') +
          '/cases/' +
          encodeURIComponent(id) +
          query,
      );
      return;
    }
    const context = this.account.dataContext(),
      version = ++this.detailVersion;
    this.detailController?.abort();
    this.detailController = new AbortController();
    this.loading.set(true);
    this.error.set('');
    this.success.set('');
    this.detail.set(null);
    this.evidenceText.set(null);
    this.moderatorId = '';
    try {
      const [data, candidates] = await Promise.all([
        this.json<StaffCaseDetail>(
          await fetch('/api/staff/cases/' + encodeURIComponent(id), {
            credentials: 'same-origin',
            cache: 'no-store',
            signal: this.detailController.signal,
          }),
        ),
        this.isAdmin()
          ? this.json<{ moderators: StaffModerator[] }>(
              await fetch('/api/staff/moderators', {
                credentials: 'same-origin',
                cache: 'no-store',
                signal: this.detailController.signal,
              }),
            )
          : Promise.resolve(null),
      ]);
      if (version === this.detailVersion && context === this.account.dataContext()) {
        this.detail.set(data);
        this.moderators.set(candidates?.moderators ?? []);
        this.previousCase = id;
        this.focus('[data-case-heading]');
        this.moderatorId = data.assignedModeratorUserId ?? '';
        this.assignmentInitial = this.moderatorId;
        this.escalationReason = 'requires_admin';
        this.escalationInitial = this.escalationReason;
        this.syncDraftGuard();
      }
    } catch (error) {
      if (version === this.detailVersion) this.failure(error);
    } finally {
      if (version === this.detailVersion) this.loading.set(false);
    }
  }
  back(): void {
    if (this.busy()) return;
    if (this.route.snapshot.paramMap.get('caseId')) {
      void this.router.navigateByUrl(this.listUrl()).then((left) => {
        if (left)
          void this.load(this.page()).then(() => {
            this.document.defaultView?.scrollTo({ top: this.listScrollY });
            this.focusList();
          });
      });
    }
  }
  async decide(input: StaffCaseDecision): Promise<void> {
    if (input.revision !== this.detail()?.revision) return;
    await this.mutate('decide', input);
  }
  async nextEligibleCase(): Promise<void> {
    await this.load(1);
    const next = this.cases().find((item) => item.id !== this.detail()?.id);
    if (next) await this.open(next.id, true);
    else if (this.route.snapshot.paramMap.get('caseId'))
      await this.router.navigateByUrl(this.listUrl());
    else this.success.set(this.copy().empty);
  }
  private focus(selector: string): void {
    afterNextRender(() => this.document.querySelector<HTMLElement>(selector)?.focus(), {
      injector: this.injector,
    });
  }
  private focusList(): void {
    this.focus(
      this.document.querySelector('[data-case-id=' + JSON.stringify(this.previousCase) + ']')
        ? '[data-case-id=' + JSON.stringify(this.previousCase) + '] [data-open-case]'
        : 'h1',
    );
  }
  async takeOver(): Promise<void> {
    if (!this.isAdmin() || !this.detail()?.canAssign || this.detail()?.conflictOfInterest) return;
    this.moderatorId = this.account.identity()?.userId ?? '';
    await this.assign();
  }
  async assign(): Promise<void> {
    if (this.moderatorId) await this.mutate('assign', { moderatorUserId: this.moderatorId });
  }
  async escalate(): Promise<void> {
    if (window.confirm(`${this.copy().escalationConfirm}\n\n${this.detail()?.label ?? ''}`))
      await this.mutate('escalate', { reason: this.escalationReason });
  }
  async openEvidence(): Promise<void> {
    const detail = this.detail();
    if (!detail?.review || this.busy()) return;
    const generation = this.generation,
      version = this.detailVersion,
      context = this.account.dataContext();
    this.busy.set(true);
    this.error.set('');
    this.evidenceText.set(null);
    try {
      const grant = await this.json<{ fileId: string; grantId: string; localFixture?: boolean }>(
        await fetch(
          `/api/reviews/${encodeURIComponent(detail.subjectId)}/evidence/download-grant`,
          { credentials: 'same-origin', cache: 'no-store', signal: this.detailController?.signal },
        ),
      );
      if (
        generation !== this.generation ||
        version !== this.detailVersion ||
        context !== this.account.dataContext()
      )
        return;
      if (!grant.localFixture) throw 503;
      const response = await fetch(
        `/api/local-demo/files/${encodeURIComponent(grant.fileId)}/content`,
        {
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'x-file-grant': grant.grantId },
          signal: this.detailController?.signal,
        },
      );
      if (!response.ok) throw await this.httpError(response);
      const text = await response.text();
      if (
        generation === this.generation &&
        version === this.detailVersion &&
        context === this.account.dataContext()
      )
        this.evidenceText.set(text);
    } catch (error) {
      if (generation === this.generation && version === this.detailVersion) this.failure(error);
    } finally {
      if (generation === this.generation) this.busy.set(false);
    }
  }

  private async mutate(
    action: 'assign' | 'escalate' | 'decide',
    body: Record<string, unknown>,
  ): Promise<void> {
    const detail = this.detail();
    if (!detail || this.busy()) return;
    const generation = this.generation,
      context = this.account.dataContext();
    this.busy.set(true);
    this.error.set('');
    this.success.set('');
    try {
      const csrf =
        this.document.cookie
          .split('; ')
          .find((value) => value.startsWith('autokosova_csrf='))
          ?.split('=')[1] ?? '';
      const response = await fetch(`/api/staff/cases/${encodeURIComponent(detail.id)}/${action}`, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ ...body, revision: detail.revision }),
        signal: this.detailController?.signal,
      });
      if (!response.ok) throw await this.httpError(response);
      if (generation !== this.generation || context !== this.account.dataContext()) return;
      if (action === 'assign') {
        await this.open(detail.id, false);
      } else if (action === 'decide') {
        await this.open(detail.id, false);
        this.resultAvailable.set(true);
      } else {
        this.clearPrivate();
      }
      this.success.set(this.label('outcome_' + action));
    } catch (error) {
      if (generation === this.generation && context === this.account.dataContext())
        this.failure(error);
    } finally {
      if (generation === this.generation) this.busy.set(false);
    }
  }
  private listUrl(): string {
    const query = this.router.url.includes('?')
      ? this.router.url.slice(this.router.url.indexOf('?'))
      : '';
    return this.language.link(this.adminOnly ? 'admin' : 'moderation') + query;
  }
  onDecisionDirty(dirty: boolean): void {
    this.draftDirty.set(dirty);
    this.syncDraftGuard();
  }
  onAssignmentChange(): void {
    this.syncDraftGuard();
  }
  onEscalationChange(): void {
    this.syncDraftGuard();
  }
  canLeave(): boolean {
    return this.draftGuard.confirmDiscard();
  }
  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (!this.hasUnsavedInput()) return;
    event.preventDefault();
    event.returnValue = '';
  }
  private hasUnsavedInput(): boolean {
    return (
      this.draftDirty() ||
      this.moderatorId !== this.assignmentInitial ||
      this.escalationReason !== this.escalationInitial
    );
  }
  private syncDraftGuard(): void {
    this.draftGuard.setDirty(this.hasUnsavedInput());
  }
  private clearPrivate(): void {
    this.generation++;
    this.detailVersion++;
    this.controller?.abort();
    this.detailController?.abort();
    this.detail.set(null);
    this.evidenceText.set(null);
    this.moderators.set([]);
    this.cases.set([]);
    this.busy.set(false);
    this.resultAvailable.set(false);
    this.moderatorId = '';
    this.assignmentInitial = '';
    this.escalationReason = 'requires_admin';
    this.escalationInitial = 'requires_admin';
    this.draftDirty.set(false);
    this.draftGuard.setDirty(false);
  }
  private async json<T>(response: Response): Promise<T> {
    if (!response.ok) throw await this.httpError(response);
    return response.json() as Promise<T>;
  }
  private async httpError(response: Response): Promise<StaffHttpError> {
    try {
      const body = (await response.json()) as { code?: unknown };
      return {
        status: response.status,
        ...(typeof body.code === 'string' ? { code: body.code } : {}),
      };
    } catch {
      return { status: response.status };
    }
  }
  private failure(error: unknown): void {
    const status = typeof error === 'number' ? error : (error as StaffHttpError).status;
    const code = typeof error === 'object' && error ? (error as StaffHttpError).code : undefined;
    if (status === 401 || code === 'staff_access_revoked') {
      this.account.invalidate();
      return;
    }
    if (status === 403 || status === 404) {
      if (code === 'case_interest_conflict') {
        this.error.set(this.copy().interest);
        return;
      }
      if (status === 403) {
        this.cases.set([]);
        this.moderators.set([]);
      }
      this.detail.set(null);
      this.evidenceText.set(null);
      this.error.set(status === 403 ? this.copy().denied : this.copy().unavailable);
      return;
    }
    this.error.set(
      status === 409
        ? this.copy().conflict
        : status === 422
          ? this.label('invalidDecision')
          : this.copy().error,
    );
  }
}
