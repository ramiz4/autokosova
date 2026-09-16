import { Injectable, inject, signal } from '@angular/core';
import { staffLabel } from '../shared/staff-copy';
import { LanguageService } from './language.service';

/**
 * A deliberately tiny route boundary for in-memory staff drafts. It owns no draft data and is
 * shared only so a reused `:caseId` route can be stopped before Angular replaces its parameters.
 */
@Injectable({ providedIn: 'root' })
export class StaffDraftGuardService {
  private readonly language = inject(LanguageService);
  readonly dirty = signal(false);
  readonly discardVersion = signal(0);

  setDirty(value: boolean): void {
    this.dirty.set(value);
  }

  confirmDiscard(): boolean {
    if (!this.dirty()) return true;
    if (!window.confirm(staffLabel('discardDraft', this.language.language))) return false;
    this.dirty.set(false);
    this.discardVersion.update((value) => value + 1);
    return true;
  }
}
