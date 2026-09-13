import pg from 'pg';

export const PUBLIC_ANALYTICS_EVENTS = [
  'search_started',
  'search_results_displayed',
  'workshop_profile_opened',
  'contact_channel_opened',
] as const;

export type PublicAnalyticsEvent = (typeof PUBLIC_ANALYTICS_EVENTS)[number];

export interface AnalyticsStore {
  close?(): Promise<void>;
  record(event: PublicAnalyticsEvent, occurredOn: string): Promise<void> | void;
}

export class InMemoryAnalyticsStore implements AnalyticsStore {
  readonly counts = new Map<string, number>();

  record(event: PublicAnalyticsEvent, occurredOn: string): void {
    const key = `${occurredOn}:${event}`;
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }
}

export class PostgresAnalyticsStore implements AnalyticsStore {
  private readonly pool: pg.Pool;

  constructor(databaseUrl: string) {
    this.pool = new pg.Pool({ connectionString: databaseUrl });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async record(event: PublicAnalyticsEvent, occurredOn: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO public_analytics_daily_count (metric_date, event_name, event_count)
       VALUES ($1::date, $2, 1)
       ON CONFLICT (metric_date, event_name)
       DO UPDATE SET event_count = public_analytics_daily_count.event_count + 1`,
      [occurredOn, event],
    );
  }
}

export function isPublicAnalyticsEvent(value: unknown): value is PublicAnalyticsEvent {
  return (
    typeof value === 'string' && PUBLIC_ANALYTICS_EVENTS.includes(value as PublicAnalyticsEvent)
  );
}

export function isAutomatedRequest(userAgent: string | undefined): boolean {
  return Boolean(userAgent && /bot|crawler|spider|headless|lighthouse/i.test(userAgent));
}
