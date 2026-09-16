import { Injectable } from '@angular/core';

/**
 * Keeps an in-memory admin draft behind the router boundary when Angular reuses an
 * admin component for a query-only navigation. It stores no draft values itself.
 */
@Injectable({ providedIn: 'root' })
export class AdminDraftGuardService {
  private confirm: ((targetUrl?: string) => boolean) | null = null;

  connect(confirm: (targetUrl?: string) => boolean): () => void {
    this.confirm = confirm;
    return () => {
      if (this.confirm === confirm) this.confirm = null;
    };
  }

  confirmContextChange(targetUrl?: string): boolean {
    return this.confirm?.(targetUrl) ?? true;
  }
}
