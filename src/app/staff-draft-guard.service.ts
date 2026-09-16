import { Injectable, signal } from '@angular/core';

/**
 * A deliberately tiny route boundary for in-memory staff drafts. It owns no draft data and is
 * shared only so a reused `:caseId` route can be stopped before Angular replaces its parameters.
 */
@Injectable({ providedIn: 'root' })
export class StaffDraftGuardService {
  private confirm: (() => Promise<boolean>) | null = null;
  readonly dirty = signal(false);
  readonly discardVersion = signal(0);

  setDirty(value: boolean): void {
    this.dirty.set(value);
  }

  connect(confirm: () => Promise<boolean>): () => void {
    this.confirm = confirm;
    return () => {
      if (this.confirm === confirm) this.confirm = null;
    };
  }

  async confirmDiscard(): Promise<boolean> {
    if (!this.dirty()) return true;
    if (!((await this.confirm?.()) ?? false) || !this.dirty()) return false;
    this.dirty.set(false);
    this.discardVersion.update((value) => value + 1);
    return true;
  }
}
