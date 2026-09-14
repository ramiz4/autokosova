import { AccountSessionService } from './account-session.service';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';

type FavoriteMessage = 'saved' | 'removed' | 'signIn' | 'error' | null;

@Injectable()
export class FavoritesService {
  private readonly account = inject(AccountSessionService);
  readonly garageIds = signal<ReadonlySet<string>>(new Set());
  readonly state = signal<'loading' | 'guest' | 'ready' | 'error'>('loading');
  readonly pending = signal<ReadonlySet<string>>(new Set());
  private readonly messageState = signal<FavoriteMessage>(null);
  readonly message = this.messageState.asReadonly();
  private dismissTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.dismiss());
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

  async load(): Promise<boolean> {
    try {
      await this.account.refresh();
      if (!this.account.signedIn()) {
        this.garageIds.set(new Set());
        this.state.set('guest');
        return false;
      }
      const response = await fetch('/api/me/favorites', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (response.status === 401) {
        this.garageIds.set(new Set());
        this.state.set('guest');
        this.account.invalidate();
        return false;
      }
      if (!response.ok) throw new Error();
      const data = (await response.json()) as { garageIds: unknown };
      if (!Array.isArray(data.garageIds) || !data.garageIds.every((id) => typeof id === 'string'))
        throw new Error();
      this.garageIds.set(new Set(data.garageIds));
      this.state.set('ready');
      return true;
    } catch {
      this.garageIds.set(new Set());
      this.state.set('error');
      return false;
    }
  }

  async toggle(garageId: string): Promise<void> {
    if (this.pending().has(garageId)) return;
    this.pending.set(new Set([...this.pending(), garageId]));
    this.dismiss();
    try {
      if (this.state() !== 'ready' && !(await this.load())) {
        this.notify(this.state() === 'guest' ? 'signIn' : 'error');
        return;
      }
      const saved = this.garageIds().has(garageId);
      const csrf =
        document.cookie
          .split('; ')
          .find((cookie) => cookie.startsWith('autokosova_csrf='))
          ?.split('=')[1] ?? '';
      const response = await fetch(`/api/me/favorites/${encodeURIComponent(garageId)}`, {
        method: saved ? 'DELETE' : 'PUT',
        credentials: 'same-origin',
        headers: { 'x-csrf-token': csrf },
      });
      if (response.status === 401) {
        this.garageIds.set(new Set());
        this.state.set('guest');
        this.account.invalidate();
        this.notify('signIn');
        return;
      }
      if (!response.ok) throw new Error();
      const next = new Set(this.garageIds());
      if (saved) next.delete(garageId);
      else next.add(garageId);
      this.garageIds.set(next);
      this.notify(saved ? 'removed' : 'saved');
    } catch {
      this.notify('error');
    } finally {
      const pending = new Set(this.pending());
      pending.delete(garageId);
      this.pending.set(pending);
    }
  }
}
