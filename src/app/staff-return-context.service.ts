import { Injectable } from '@angular/core';

/** Bounded navigation affordance only; no case data or drafts leave the active component. */
@Injectable({ providedIn: 'root' })
export class StaffReturnContextService {
  private value?: {
    readonly accountContext: string;
    readonly caseId: string;
    readonly scrollY: number;
  };

  remember(accountContext: string, caseId: string, scrollY?: number): void {
    if (
      scrollY === undefined &&
      this.value?.accountContext === accountContext &&
      this.value.caseId === caseId
    )
      return;
    this.value = { accountContext, caseId, scrollY: Math.max(0, Math.floor(scrollY ?? 0)) };
  }

  take(accountContext: string): { readonly caseId: string; readonly scrollY: number } | undefined {
    const value = this.value;
    this.value = undefined;
    return value?.accountContext === accountContext
      ? { caseId: value.caseId, scrollY: value.scrollY }
      : undefined;
  }

  clear(): void {
    this.value = undefined;
  }
}
