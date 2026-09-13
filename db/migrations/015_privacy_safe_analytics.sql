-- #16: Only daily aggregate counters are retained. There is no visitor, session, URL, query,
-- workshop, vehicle, travel, free-text, IP-address, or user-agent column in this table.
CREATE TABLE IF NOT EXISTS public_analytics_daily_count (
  metric_date date NOT NULL,
  event_name text NOT NULL CHECK (
    event_name IN (
      'search_started',
      'search_results_displayed',
      'workshop_profile_opened',
      'contact_channel_opened'
    )
  ),
  event_count bigint NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  PRIMARY KEY (metric_date, event_name)
);

REVOKE ALL ON public_analytics_daily_count FROM PUBLIC;
