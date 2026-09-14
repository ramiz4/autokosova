import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AccountSessionService {
  readonly signedIn = signal(false);
  readonly busy = signal(false);
  private version = 0;
  private refreshInFlight?: Promise<void>;

  refresh(): Promise<void> {
    return (this.refreshInFlight ??= this.readSession().finally(() => {
      this.refreshInFlight = undefined;
    }));
  }

  private async readSession(): Promise<void> {
    const version = ++this.version;
    try {
      const response = await fetch('/api/session', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as { authenticated?: boolean };
      if (version === this.version) this.signedIn.set(data.authenticated === true);
    } catch {
      if (version === this.version) this.signedIn.set(false);
    }
  }
  invalidate(): void {
    this.version++;
    this.signedIn.set(false);
  }
  async logout(): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    try {
      const csrf =
        document.cookie
          .split('; ')
          .find((cookie) => cookie.startsWith('autokosova_csrf='))
          ?.split('=')[1] ?? '';
      const response = await fetch('/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'x-csrf-token': csrf },
      });
      if (!response.ok && response.status !== 401) return false;
      this.invalidate();
      return true;
    } catch {
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
