import { Injectable } from '@angular/core';

const storageKey = 'autokosova.repair-request-draft.v1';

@Injectable({ providedIn: 'root' })
export class RepairRequestDraft {
  clear(): void {
    sessionStorage.removeItem(storageKey);
  }

  read(): Record<string, unknown> | undefined {
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (!stored) return undefined;
      const value: unknown = JSON.parse(stored);
      return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
    } catch {
      return undefined;
    }
  }

  write(value: Record<string, unknown>): void {
    sessionStorage.setItem(storageKey, JSON.stringify(value));
  }
}
