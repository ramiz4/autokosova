import { isPlatformBrowser } from '@angular/common';
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
import { favoriteGarage, type FavoriteGarage } from '../shared/favorite-garage';
import { AccountSessionService } from './account-session.service';
import { FavoritesService } from './favorites.service';

export const FAVORITES_PAGE_SIZE = 12;
export const FAVORITES_PROFILE_CONCURRENCY = 3;
export interface FavoriteCard {
  readonly id: string;
  readonly state: 'loading' | 'ready' | 'unavailable' | 'error';
  readonly garage?: FavoriteGarage;
}
/** Resolves only a page of saved IDs through the existing public API, never search results. */
@Injectable()
export class FavoriteProfilesService {
  private readonly favorites = inject(FavoritesService);
  private readonly account = inject(AccountSessionService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly owner = signal<OwnAccount | null>(null);
  private readonly profiles = signal<ReadonlyMap<string, FavoriteCard>>(new Map());
  readonly limit = signal(FAVORITES_PAGE_SIZE);
  private readonly retryVersion = signal(0);
  private controller?: AbortController;
  readonly cards = computed<readonly FavoriteCard[]>(() =>
    this.favorites.state() !== 'ready'
      ? []
      : [...this.favorites.garageIds()]
          .slice(0, this.limit())
          .map((id) =>
            this.owner() === this.account.identity()
              ? (this.profiles().get(id) ?? { id, state: 'loading' })
              : { id, state: 'loading' },
          ),
  );
  readonly hasMore = computed(() => this.favorites.garageIds().size > this.limit());
  readonly loading = computed(() => this.cards().some((card) => card.state === 'loading'));
  constructor() {
    effect(() => {
      const identity = this.account.identity(),
        state = this.favorites.state();
      const ids = [...this.favorites.garageIds()];
      this.limit();
      this.retryVersion();
      untracked(() => {
        this.controller?.abort();
        if (identity !== this.owner()) {
          this.profiles.set(new Map());
          this.owner.set(identity);
          this.limit.set(FAVORITES_PAGE_SIZE);
        }
        if (!this.browser || !identity || state !== 'ready') {
          this.profiles.set(new Map());
          return;
        }
        const selected = ids.slice(0, this.limit());
        // Prune removed favorites and keep requests bounded, including after account refreshes.
        this.profiles.update(
          (profiles) => new Map([...profiles].filter(([id]) => selected.includes(id))),
        );
        const controller = new AbortController();
        this.controller = controller;
        void this.resolve(
          selected.filter((id) => !this.profiles().has(id)),
          identity,
          controller,
        );
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.controller?.abort();
      this.profiles.set(new Map());
      this.owner.set(null);
    });
  }
  loadMore(): void {
    if (!this.loading() && this.hasMore())
      this.limit.update((limit) => limit + FAVORITES_PAGE_SIZE);
  }
  retry(id: string): void {
    this.profiles.update((profiles) => new Map([...profiles].filter(([key]) => key !== id)));
    this.retryVersion.update((version) => version + 1);
  }
  private async resolve(
    ids: readonly string[],
    identity: OwnAccount,
    controller: AbortController,
  ): Promise<void> {
    let cursor = 0;
    const current = () =>
      !controller.signal.aborted &&
      identity === this.account.identity() &&
      this.account.state() === 'ready' &&
      !this.account.busy();
    await Promise.all(
      Array.from({ length: Math.min(FAVORITES_PROFILE_CONCURRENCY, ids.length) }, async () => {
        while (cursor < ids.length && current()) {
          const id = ids[cursor++];
          let card: FavoriteCard;
          try {
            const response = await fetch(`/api/public/garages/${encodeURIComponent(id)}`, {
              credentials: 'omit',
              cache: 'no-store',
              referrerPolicy: 'no-referrer',
              signal: controller.signal,
            });
            if (!current()) return;
            if (response.status === 404) card = { id, state: 'unavailable' };
            else {
              if (!response.ok) throw new Error('Public profile unavailable');
              const data: unknown = await response.json();
              if (!current()) return;
              card = { id, state: 'ready', garage: favoriteGarage(data, id) };
            }
          } catch {
            card = { id, state: 'error' };
          }
          if (current() && this.favorites.garageIds().has(id))
            this.profiles.update((profiles) => new Map([...profiles, [id, card]]));
        }
      }),
    );
  }
}
