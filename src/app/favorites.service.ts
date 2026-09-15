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
import { AccountSessionService } from './account-session.service';

type FavoriteMessage = 'saved' | 'removed' | 'signIn' | 'error' | null;
const emptyIds: ReadonlySet<string> = new Set();

/** One transient view of the existing account API, shared by search, profile and overview. */
@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private readonly account = inject(AccountSessionService);
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly owner = signal<OwnAccount | null>(null);
  private readonly ids = signal<ReadonlySet<string>>(emptyIds);
  private readonly loadingState = signal<'loading' | 'ready' | 'error'>('loading');
  private readonly writes = signal<ReadonlySet<string>>(emptyIds);
  private readonly failures = signal<ReadonlySet<string>>(emptyIds);
  private readonly visible = computed(
    () =>
      this.owner() !== null &&
      this.owner() === this.account.identity() &&
      this.account.state() === 'ready' &&
      !this.account.busy(),
  );
  readonly garageIds = computed(() => (this.visible() ? this.ids() : emptyIds));
  readonly pending = computed(() => (this.visible() ? this.writes() : emptyIds));
  readonly failedIds = computed(() => (this.visible() ? this.failures() : emptyIds));
  readonly state = computed(() =>
    this.account.state() === 'guest'
      ? 'guest'
      : this.account.state() === 'error'
        ? 'error'
        : this.visible()
          ? this.loadingState()
          : 'loading',
  );
  private readonly messageState = signal<FavoriteMessage>(null);
  readonly message = this.messageState.asReadonly();
  private dismissTimer?: ReturnType<typeof setTimeout>;
  private refreshInFlight?: Promise<boolean>;
  private readInFlight?: Promise<boolean>;
  private readonly controllers = new Set<AbortController>();
  private generation = 0;
  private destroyed = false;
  private channel?: BroadcastChannel;

  constructor() {
    effect(() => {
      const identity = this.account.identity();
      const ready = this.account.state() === 'ready' && !this.account.busy();
      untracked(() => {
        if (identity !== this.owner() || (!ready && this.owner() !== null)) this.clear();
        if (this.browser && ready && identity) void this.read(identity);
      });
    });
    if (this.browser && typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('autokosova-favorites');
      this.channel.onmessage = () => {
        void this.load();
      };
    }
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.clear();
      this.channel?.close();
    });
  }

  dismiss(): void {
    clearTimeout(this.dismissTimer);
    this.dismissTimer = undefined;
    this.messageState.set(null);
  }
  private notify(message: Exclude<FavoriteMessage, null>): void {
    this.dismiss();
    this.messageState.set(message);
    this.dismissTimer = setTimeout(
      () => this.dismiss(),
      message === 'saved' || message === 'removed' ? 5000 : 8000,
    );
  }
  load(): Promise<boolean> {
    if (!this.browser || this.destroyed) return Promise.resolve(false);
    if (this.refreshInFlight) return this.refreshInFlight;
    const task = (async () => {
      await this.account.refresh();
      const identity = this.account.identity();
      if (!identity || this.account.state() !== 'ready' || this.account.busy()) {
        this.clear();
        return false;
      }
      return this.read(identity);
    })().finally(() => {
      if (this.refreshInFlight === task) this.refreshInFlight = undefined;
    });
    this.refreshInFlight = task;
    return task;
  }
  private read(identity: OwnAccount): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    if (identity === this.owner() && this.readInFlight) return this.readInFlight;
    if (identity === this.owner() && this.loadingState() === 'ready') return Promise.resolve(true);
    if (identity !== this.owner()) {
      this.clear();
      this.owner.set(identity);
    }
    const version = this.generation;
    const controller = this.controller();
    this.loadingState.set('loading');
    const task = (async () => {
      try {
        const response = await fetch('/api/me/favorites', {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!this.current(identity, version, controller)) return false;
        if (response.status === 401) {
          this.account.invalidate();
          return false;
        }
        if (!response.ok) throw new Error('Favorites unavailable');
        const data = (await response.json()) as { garageIds?: unknown };
        if (!this.current(identity, version, controller)) return false;
        if (
          !Array.isArray(data.garageIds) ||
          !data.garageIds.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 128)
        )
          throw new Error('Invalid favorite IDs');
        this.ids.set(new Set(data.garageIds));
        this.loadingState.set('ready');
        return true;
      } catch {
        if (this.current(identity, version, controller)) {
          this.ids.set(emptyIds);
          this.loadingState.set('error');
        }
        return false;
      } finally {
        this.controllers.delete(controller);
      }
    })().finally(() => {
      if (this.readInFlight === task) this.readInFlight = undefined;
    });
    this.readInFlight = task;
    return task;
  }
  async toggle(garageId: string): Promise<void> {
    await this.change(garageId);
  }
  remove(garageId: string): Promise<boolean> {
    return this.change(garageId, false);
  }
  private readonly starting = new Set<string>();
  private async change(garageId: string, desired?: boolean): Promise<boolean> {
    if (
      !this.browser ||
      this.destroyed ||
      this.starting.has(garageId) ||
      this.pending().has(garageId)
    )
      return false;
    const initiatingOwner = this.account.identity()?.userId;
    this.starting.add(garageId);
    if (this.state() !== 'ready' && !(await this.load())) {
      this.starting.delete(garageId);
      if (!this.destroyed) this.notify(this.state() === 'guest' ? 'signIn' : 'error');
      return false;
    }
    this.starting.delete(garageId);
    const identity = this.account.identity();
    if (!identity || !this.visible() || (initiatingOwner && initiatingOwner !== identity.userId))
      return false;
    const version = this.generation,
      controller = this.controller();
    const saved = desired ?? !this.garageIds().has(garageId);
    this.writes.set(new Set([...this.writes(), garageId]));
    this.failures.update((ids) => new Set([...ids].filter((id) => id !== garageId)));
    this.dismiss();
    try {
      const csrf =
        this.document.cookie
          .split('; ')
          .find((cookie) => cookie.startsWith('autokosova_csrf='))
          ?.split('=')[1] ?? '';
      const response = await fetch(`/api/me/favorites/${encodeURIComponent(garageId)}`, {
        method: saved ? 'PUT' : 'DELETE',
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'x-csrf-token': csrf },
      });
      if (!this.current(identity, version, controller)) return false;
      if (response.status === 401) {
        this.clear();
        this.account.invalidate();
        this.notify('signIn');
        return false;
      }
      if (!response.ok) throw new Error('Favorite write failed');
      const next = new Set(this.ids());
      if (saved) next.add(garageId);
      else next.delete(garageId);
      this.ids.set(next);
      this.notify(saved ? 'saved' : 'removed');
      this.channel?.postMessage('changed'); // No IDs or identities cross tabs.
      return true;
    } catch {
      if (this.current(identity, version, controller)) {
        this.failures.update((ids) => new Set([...ids, garageId]));
        this.notify('error');
      }
      return false;
    } finally {
      this.controllers.delete(controller);
      if (this.current(identity, version, controller))
        this.writes.update((ids) => new Set([...ids].filter((id) => id !== garageId)));
    }
  }
  private controller(): AbortController {
    const controller = new AbortController();
    this.controllers.add(controller);
    return controller;
  }
  private current(identity: OwnAccount, version: number, controller: AbortController): boolean {
    return (
      !this.destroyed &&
      !controller.signal.aborted &&
      version === this.generation &&
      identity === this.account.identity() &&
      this.account.state() === 'ready' &&
      !this.account.busy() &&
      Date.parse(identity.expiresAt) > Date.now()
    );
  }
  private clear(): void {
    this.generation++;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    this.readInFlight = undefined;
    this.owner.set(null);
    this.ids.set(emptyIds);
    this.writes.set(emptyIds);
    this.failures.set(emptyIds);
    this.loadingState.set('loading');
    this.dismiss();
  }
}
