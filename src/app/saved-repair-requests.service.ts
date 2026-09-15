import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  DestroyRef,
  Injectable,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import type { OwnAccount } from '../shared/account';
import {
  isRepairRequestPage,
  isSavedRepairRequest,
} from '../shared/saved-repair-request-validation';
import {
  REPAIR_REQUEST_PAGE_LIMIT,
  type RepairRequestMutation,
  type RepairRequestSummary,
  type SavedRepairRequest,
} from '../shared/saved-repair-request';
import { AccountSessionService } from './account-session.service';

/** Page-scoped, memory-only private data. It never reads or writes the browser inquiry draft. */
@Injectable()
export class SavedRepairRequestsService {
  private readonly storedRequests = signal<readonly RepairRequestSummary[]>([]);
  readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  readonly nextCursor = signal<string | null>(null);
  readonly cursorUnavailable = signal(false);
  readonly expired = signal(false);
  readonly activity = signal<'all' | 'active' | 'inactive'>('all');
  readonly writeState = signal<
    'idle' | 'saving' | 'conflict' | 'error' | 'missing' | 'forbidden' | 'csrf'
  >('idle');
  readonly writeErrorKey = computed(() => {
    const state = this.writeState();
    if (state === 'conflict' || state === 'missing' || state === 'forbidden') return state;
    if (state === 'csrf') return 'csrfError' as const;
    return state === 'error' ? ('writeError' as const) : null;
  });
  readonly notice = signal<'updated' | 'deactivated' | 'reactivated' | 'deleted' | null>(null);
  private readonly document = inject(DOCUMENT);
  private writeController?: AbortController;
  readonly selectedId = signal<string | null>(null);
  private readonly storedDetail = signal<SavedRepairRequest | null>(null);
  readonly detailState = signal<'loading' | 'ready' | 'error' | 'missing'>('loading');
  private readonly account = inject(AccountSessionService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly owner = signal<OwnAccount | null>(null);
  private readonly visible = computed(
    () =>
      this.owner() !== null &&
      this.owner() === this.account.identity() &&
      this.account.state() === 'ready' &&
      !this.account.busy(),
  );
  readonly requests = computed(() => (this.visible() ? this.storedRequests() : []));
  readonly detail = computed(() => (this.visible() ? this.storedDetail() : null));
  private generation = 0;
  private listController?: AbortController;
  private detailController?: AbortController;
  private hadSession = false;

  constructor() {
    effect(() => {
      const identity = this.account.identity();
      const state = this.account.state();
      const busy = this.account.busy();
      untracked(() => {
        this.clear();
        if (state === 'guest' && this.hadSession) this.expired.set(true);
        if (this.browser && identity && state === 'ready' && !busy) {
          this.hadSession = true;
          this.expired.set(false);
          void this.loadPage();
        }
      });
    });
    inject(DestroyRef).onDestroy(() => this.clear());
  }

  filter(activity: 'all' | 'active' | 'inactive'): void {
    if (activity === this.activity() || this.writeState() === 'saving') return;
    this.activity.set(activity);
    this.reload();
  }

  reload(): void {
    this.clear();
    void this.loadPage();
  }

  retry(): void {
    if (this.cursorUnavailable()) this.reload();
    else void this.loadPage(this.nextCursor() ?? undefined);
  }

  loadMore(): void {
    const cursor = this.nextCursor();
    if (this.state() !== 'loading' && cursor) void this.loadPage(cursor);
  }

  toggleDetail(id: string): void {
    if (this.selectedId() === id) this.closeDetail();
    else void this.openDetail(id);
  }

  async openDetail(id: string): Promise<void> {
    const identity = this.account.identity();
    if (!this.browser || !identity || this.account.state() !== 'ready' || this.account.busy())
      return;
    this.detailController?.abort();
    const controller = new AbortController();
    this.detailController = controller;
    const generation = this.generation;
    this.selectedId.set(id);
    this.storedDetail.set(null);
    this.detailState.set('loading');
    try {
      const response = await fetch(`/api/me/repair-requests/${encodeURIComponent(id)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!this.current(identity, generation, controller)) return;
      if (response.status === 401) return this.expire();
      if (response.status === 404) {
        this.detailState.set('missing');
        return;
      }
      if (!response.ok) throw new Error('Private request unavailable');
      const detail: unknown = await response.json();
      if (!this.current(identity, generation, controller)) return;
      if (!isSavedRepairRequest(detail) || detail.id !== id)
        throw new Error('Invalid private response');
      this.storedDetail.set(detail);
      this.detailState.set('ready');
    } catch {
      if (this.current(identity, generation, controller)) this.detailState.set('error');
    }
  }

  private async loadPage(cursor?: string): Promise<void> {
    const identity = this.account.identity();
    if (!this.browser || !identity || this.account.state() !== 'ready' || this.account.busy())
      return;
    this.owner.set(identity);
    this.listController?.abort();
    const controller = new AbortController();
    this.listController = controller;
    const generation = this.generation;
    this.state.set('loading');
    this.cursorUnavailable.set(false);
    const query = new URLSearchParams({ limit: String(REPAIR_REQUEST_PAGE_LIMIT) });
    if (this.activity() !== 'all') query.set('activity', this.activity());
    if (cursor) query.set('cursor', cursor);
    try {
      const response = await fetch(`/api/me/repair-requests?${query}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!this.current(identity, generation, controller)) return;
      if (response.status === 401) return this.expire();
      if (response.status === 404 && cursor) this.cursorUnavailable.set(true);
      if (!response.ok) throw new Error('Private requests unavailable');
      const page: unknown = await response.json();
      if (!this.current(identity, generation, controller)) return;
      if (!isRepairRequestPage(page) || page.nextCursor === cursor)
        throw new Error('Invalid private page');
      const previous = cursor ? this.requests() : [];
      const seen = new Set(previous.map((item) => item.id));
      this.storedRequests.set([...previous, ...page.requests.filter((item) => !seen.has(item.id))]);
      this.nextCursor.set(page.nextCursor);
      this.state.set('ready');
    } catch {
      if (this.current(identity, generation, controller)) this.state.set('error');
    }
  }

  async mutate(
    request: Pick<SavedRepairRequest, 'id' | 'revision'>,
    mutation: RepairRequestMutation,
  ): Promise<boolean> {
    const identity = this.account.identity();
    if (
      !this.browser ||
      !identity ||
      this.account.state() !== 'ready' ||
      this.account.busy() ||
      this.writeState() === 'saving'
    )
      return false;
    // Invalidate older list/detail reads before writing; no optimistic success or stale overwrite.
    this.generation++;
    this.listController?.abort();
    this.detailController?.abort();
    this.writeController?.abort();
    const controller = new AbortController();
    this.writeController = controller;
    const generation = this.generation;
    this.writeState.set('saving');
    this.notice.set(null);
    try {
      const csrf =
        this.document.cookie
          .split('; ')
          .find((cookie) => cookie.startsWith('autokosova_csrf='))
          ?.split('=')[1] ?? '';
      const response = await fetch(`/api/me/repair-requests/${encodeURIComponent(request.id)}`, {
        method:
          mutation.kind === 'delete' ? 'DELETE' : mutation.kind === 'update' ? 'PUT' : 'PATCH',
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          'x-csrf-token': csrf,
          'if-match': `"${request.revision}"`,
          ...(mutation.kind === 'delete' ? {} : { 'content-type': 'application/json' }),
        },
        ...(mutation.kind === 'delete'
          ? {}
          : {
              body: JSON.stringify(
                mutation.kind === 'update' ? mutation.input : { active: mutation.active },
              ),
            }),
      });
      if (!this.current(identity, generation, controller)) return false;
      if (response.status === 401) {
        this.expire();
        return false;
      }
      if (response.status === 403) {
        const body = (await response.json().catch(() => ({}))) as { code?: unknown } | null;
        if (this.current(identity, generation, controller))
          this.writeState.set(body?.code === 'csrf_invalid' ? 'csrf' : 'forbidden');
        return false;
      }
      if (response.status === 409 || response.status === 404) {
        this.writeState.set(response.status === 409 ? 'conflict' : 'missing');
        return false;
      }
      if (!response.ok) throw new Error('Private change not confirmed');
      if (mutation.kind === 'delete') {
        if (response.status !== 204) throw new Error('Deletion not confirmed');
      } else {
        const result: unknown = await response.json();
        if (!this.current(identity, generation, controller)) return false;
        if (
          !isSavedRepairRequest(result) ||
          result.id !== request.id ||
          result.revision !== request.revision + 1
        )
          throw new Error('Invalid private change response');
      }
      this.writeState.set('idle');
      this.closeDetail();
      this.storedRequests.set([]);
      this.nextCursor.set(null);
      void this.loadPage();
      this.notice.set(
        mutation.kind === 'update'
          ? 'updated'
          : mutation.kind === 'delete'
            ? 'deleted'
            : mutation.active
              ? 'reactivated'
              : 'deactivated',
      );
      return true;
    } catch {
      if (this.current(identity, generation, controller)) this.writeState.set('error');
      return false;
    }
  }

  private current(identity: OwnAccount, generation: number, controller: AbortController): boolean {
    // Check the identity synchronously, too: an effect may not have run yet after logout/change.
    return (
      generation === this.generation &&
      !controller.signal.aborted &&
      this.account.identity() === identity &&
      this.account.state() === 'ready' &&
      !this.account.busy()
    );
  }

  private expire(): void {
    this.expired.set(true);
    this.clear();
    this.account.invalidate();
  }

  private closeDetail(): void {
    this.detailController?.abort();
    this.detailController = undefined;
    this.selectedId.set(null);
    this.storedDetail.set(null);
    this.detailState.set('loading');
  }

  private clear(): void {
    this.generation++;
    this.writeController?.abort();
    this.writeController = undefined;
    this.writeState.set('idle');
    this.notice.set(null);
    this.owner.set(null);
    this.listController?.abort();
    this.listController = undefined;
    this.closeDetail();
    this.storedRequests.set([]);
    this.nextCursor.set(null);
    this.cursorUnavailable.set(false);
    this.state.set('loading');
  }
}
