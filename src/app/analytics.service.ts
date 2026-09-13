import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';

export const ANALYTICS_EVENTS = [
  'search_started',
  'search_results_displayed',
  'workshop_profile_opened',
  'contact_channel_opened',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

const consentKey = 'autokosova_analytics_consent_v1';

/**
 * The client submits only an event name after explicit local consent. It deliberately has no
 * visitor ID, URL, query, workshop ID, text, vehicle or travel field. The server remains disabled
 * until an operator enables the aggregate-only endpoint after its legal review.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  get consented(): boolean {
    return this.storage()?.getItem(consentKey) === 'granted';
  }

  setConsent(consented: boolean): void {
    const storage = this.storage();
    if (!storage) return;
    if (consented) storage.setItem(consentKey, 'granted');
    else storage.removeItem(consentKey);
  }

  track(name: AnalyticsEventName): void {
    if (!this.consented || !this.browser) return;
    void fetch('/api/public/analytics/events', {
      body: JSON.stringify({ name }),
      credentials: 'omit',
      headers: { 'content-type': 'application/json' },
      keepalive: true,
      method: 'POST',
    }).catch(() => undefined);
  }

  private storage(): Storage | undefined {
    if (!this.browser || typeof globalThis.localStorage === 'undefined') return undefined;
    return globalThis.localStorage;
  }
}
