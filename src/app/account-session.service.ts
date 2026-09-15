import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  DestroyRef,
  Injectable,
  InjectionToken,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { accountType, accountName, isOwnAccount, type OwnAccount } from '../shared/account';

export const AUTH_NAVIGATE = new InjectionToken<(path: string) => void>('AUTH_NAVIGATE', {
  providedIn: 'root',
  factory: () => (path) => window.location.assign(path),
});

type AccountState = 'loading' | 'guest' | 'ready' | 'error';

@Injectable({ providedIn: 'root' })
export class AccountSessionService {
  readonly signedIn = signal(false);
  readonly busy = signal(false);
  readonly state = signal<AccountState>('loading');
  readonly identity = signal<OwnAccount | null>(null);
  readonly loginAvailable = signal<boolean | null>(null);
  private readonly contextEpoch = signal(0);
  // Private list lifetime is not the lifetime of a freshly parsed /api/me object.
  // Metadata/expiry can update independently; ownership, rights or invalidation cannot.
  readonly dataContext = computed(() => {
    const identity = this.identity();
    return identity
      ? JSON.stringify([
          this.contextEpoch(),
          identity.userId,
          accountType(identity),
          [...identity.roles].sort(),
          identity.garageMemberships
            .map(({ garageId, role }) => JSON.stringify([garageId, role]))
            .sort(),
        ])
      : null;
  });
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly navigate = inject(AUTH_NAVIGATE);
  private departing = false;
  private version = 0;
  private refreshInFlight?: Promise<void>;
  private controller?: AbortController;
  private expiryTimer?: ReturnType<typeof setTimeout>;
  private channel?: BroadcastChannel;

  constructor() {
    const destroyRef = inject(DestroyRef);
    if (!this.browser) return;
    const refresh = () => {
      void this.refresh();
    };
    const forget = () => this.clear('loading');
    const visibility = () => {
      if (this.document.visibilityState === 'hidden') forget();
      else refresh();
    };
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) refresh();
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('pagehide', forget);
    window.addEventListener('pageshow', restore);
    this.document.addEventListener('visibilitychange', visibility);
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('autokosova-session');
      this.channel.onmessage = () => {
        this.clear('loading');
        if (this.document.visibilityState !== 'hidden') refresh();
      };
    }
    destroyRef.onDestroy(() => {
      this.clear('loading');
      this.channel?.close();
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pagehide', forget);
      window.removeEventListener('pageshow', restore);
      this.document.removeEventListener('visibilitychange', visibility);
    });
  }

  displayName(): string {
    const identity = this.identity();
    return identity ? accountName(identity) : '';
  }

  refresh(): Promise<void> {
    // No private fetch during SSR, and no refresh may overtake an in-flight logout.
    if (!this.browser || this.busy() || this.departing) return Promise.resolve();
    if (this.refreshInFlight) return this.refreshInFlight;
    const task = this.readAccount().finally(() => {
      if (this.refreshInFlight === task) this.refreshInFlight = undefined;
    });
    this.refreshInFlight = task;
    return task;
  }

  private async readAccount(): Promise<void> {
    // Revalidation must not unmount a confirmed session's UI or cancel its expiry.
    // Check the clock as well: background browsers can delay the expiry timer.
    const current = this.identity();
    if (current && Date.parse(current.expiresAt) <= Date.now()) this.invalidate();
    if (this.state() === 'error') this.state.set('loading');
    const version = this.version;
    const controller = new AbortController();
    this.controller = controller;
    try {
      const response = await fetch('/api/me', {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (version !== this.version) return;
      if (response.status === 401) {
        // Remove private fields on the status, without aborting the optional response body.
        this.clearIdentity('guest');
        this.loginAvailable.set(null);
        const data: unknown = await response.json().catch(() => null);
        if (version !== this.version) return;
        this.loginAvailable.set(
          data !== null &&
            typeof data === 'object' &&
            'loginAvailable' in data &&
            typeof data.loginAvailable === 'boolean'
            ? data.loginAvailable
            : null,
        );
        return;
      }
      if (!response.ok) throw new Error('Account unavailable');
      const data: unknown = await response.json();
      if (version !== this.version) return;
      if (!isOwnAccount(data)) throw new Error('Invalid account response');
      const remaining = Date.parse(data.expiresAt) - Date.now();
      if (remaining <= 0) {
        this.invalidate();
        return;
      }
      const previousContext = this.dataContext();
      this.identity.set(data);
      // Returning to previous rights must not revive requests from before the change.
      if (this.dataContext() !== previousContext) this.contextEpoch.update((epoch) => epoch + 1);
      this.signedIn.set(true);
      this.loginAvailable.set(true);
      this.state.set('ready');
      clearTimeout(this.expiryTimer);
      this.expiryTimer = setTimeout(() => this.invalidate(), Math.min(remaining, 2_147_483_647));
    } catch {
      if (version === this.version) this.clear('error');
    } finally {
      if (this.controller === controller) this.controller = undefined;
    }
  }

  private clear(state: AccountState): void {
    this.version++;
    this.controller?.abort();
    this.controller = undefined;
    this.refreshInFlight = undefined;
    this.clearIdentity(state);
  }

  private clearIdentity(state: AccountState): void {
    // A later login with the same subject must not revive an earlier session's data.
    this.contextEpoch.update((epoch) => epoch + 1);
    clearTimeout(this.expiryTimer);
    this.expiryTimer = undefined;
    this.identity.set(null);
    this.signedIn.set(false);
    this.state.set(state);
  }

  invalidate(): void {
    this.clear('guest');
  }

  async logout(locale = 'de'): Promise<boolean | 'redirect'> {
    if (!this.browser || this.busy()) return false;
    this.busy.set(true);
    // Drop personal fields immediately; late reads cannot repopulate an old identity.
    this.clear('loading');
    try {
      const csrf =
        this.document.cookie
          .split('; ')
          .find((cookie) => cookie.startsWith('autokosova_csrf='))
          ?.split('=')[1] ?? '';
      const version = this.version;
      const language = locale === 'sq' || locale === 'en' ? locale : 'de';
      const response = await fetch(`/auth/logout?locale=${language}`, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'x-csrf-token': csrf, accept: 'application/json' },
      });
      if (version !== this.version) return false;
      if (!response.ok && response.status !== 401) {
        this.state.set('error');
        return false;
      }
      let redirectTo: string | undefined;
      if (response.status === 200) {
        const payload: unknown = await response.json();
        if (version !== this.version) return false;
        if (
          !payload ||
          typeof payload !== 'object' ||
          !('redirectTo' in payload) ||
          typeof payload.redirectTo !== 'string' ||
          !/^\/auth\/(?:logout\/provider|logged-out\?locale=(?:de|sq|en))$/.test(payload.redirectTo)
        )
          throw new Error('Invalid logout navigation');
        redirectTo = payload.redirectTo;
      }
      this.invalidate();
      // Only an invalidation signal crosses tabs, never account data or credentials.
      this.channel?.postMessage('changed');
      if (redirectTo) {
        this.departing = true;
        this.navigate(redirectTo);
        return 'redirect';
      }
      return true;
    } catch {
      this.departing = false;
      this.state.set('error');
      return false;
    } finally {
      this.busy.set(this.departing);
    }
  }
}
