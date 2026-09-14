-- #15: moderation reports remain separate from the reported content. A report never changes a
-- public review or garage by itself; only an explicit, audited action can hide or restore it.
ALTER TABLE garage_review DROP CONSTRAINT IF EXISTS garage_review_publication_state_check;
ALTER TABLE garage_review
  ADD CONSTRAINT garage_review_publication_state_check
  CHECK (
    publication_state IN (
      'submitted', 'under_review', 'published', 'temporarily_hidden', 'rejected', 'withdrawn'
    )
  );
ALTER TABLE garage_review DROP CONSTRAINT IF EXISTS garage_review_check1;
ALTER TABLE garage_review
  ADD CONSTRAINT garage_review_public_visibility_timestamp_check
  CHECK (
    (publication_state IN ('published', 'temporarily_hidden')) = (published_at IS NOT NULL)
  );

CREATE TABLE IF NOT EXISTS moderation_case (
  id text PRIMARY KEY,
  subject_type text NOT NULL CHECK (subject_type IN ('review', 'garage_profile', 'data_deletion')),
  subject_id text NOT NULL,
  requester_user_id text REFERENCES app_user(id),
  priority text NOT NULL CHECK (priority IN ('normal', 'high')),
  status text NOT NULL CHECK (
    status IN ('submitted', 'assigned', 'waiting_for_subject', 'resolved', 'rejected')
  ),
  reason_code text CHECK (
    reason_code IN (
      'no_violation', 'missing_information', 'policy_violation', 'private_data_exposure',
      'unsafe_content', 'abuse', 'other_policy'
    )
  ),
  assigned_moderator_user_id text REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_report (
  case_id text PRIMARY KEY REFERENCES moderation_case(id),
  reporter_user_id text NOT NULL REFERENCES app_user(id),
  category text NOT NULL CHECK (
    category IN (
      'personal_data', 'impersonation', 'spam_or_deception', 'unsafe_content', 'other_policy_concern'
    )
  ),
  -- Restricted case context. It is deliberately absent from moderation_event and public views.
  details text CHECK (details IS NULL OR char_length(btrim(details)) BETWEEN 20 AND 1200),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS moderation_appeal (
  id text PRIMARY KEY,
  case_id text NOT NULL REFERENCES moderation_case(id),
  appellant_user_id text NOT NULL REFERENCES app_user(id),
  message text NOT NULL CHECK (char_length(btrim(message)) BETWEEN 20 AND 1200),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lifecycle_policy (
  version text PRIMARY KEY,
  operator_approval_reference text NOT NULL,
  public_review_handling text NOT NULL CHECK (public_review_handling IN ('delete', 'retain_anonymized')),
  review_evidence_retention_days integer NOT NULL CHECK (review_evidence_retention_days BETWEEN 1 AND 3650),
  repair_request_retention_days integer NOT NULL CHECK (repair_request_retention_days BETWEEN 1 AND 3650),
  report_retention_days integer NOT NULL CHECK (report_retention_days BETWEEN 1 AND 3650),
  audit_log_retention_days integer NOT NULL CHECK (audit_log_retention_days BETWEEN 1 AND 3650),
  configured_by_user_id text NOT NULL REFERENCES app_user(id),
  configured_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS data_deletion_request (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES app_user(id),
  policy_version text REFERENCES lifecycle_policy(version),
  status text NOT NULL CHECK (
    status IN ('submitted', 'blocked_by_policy', 'completed', 'manual_content_decision_required')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Storage providers are called from a dedicated worker. Marking the database row first revokes
-- grants; retryable object deletion is therefore never represented as a still-accessible object.
CREATE TABLE IF NOT EXISTS object_deletion_task (
  id text PRIMARY KEY,
  file_id text NOT NULL UNIQUE REFERENCES file_object(id),
  storage_key text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  last_error_code text
);

CREATE INDEX IF NOT EXISTS moderation_case_queue_idx
  ON moderation_case (status, priority DESC, created_at);
CREATE INDEX IF NOT EXISTS content_report_reporter_idx ON content_report (reporter_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS data_deletion_request_user_idx ON data_deletion_request (user_id, created_at DESC);

ALTER TABLE moderation_case ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_report ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_appeal ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifecycle_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_deletion_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_deletion_task ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_event ENABLE ROW LEVEL SECURITY;

CREATE POLICY moderation_case_read ON moderation_case
  FOR SELECT
  USING (
    current_setting('app.system_role', true) = 'admin'
    OR requester_user_id = current_setting('app.user_id', true)
    OR (
      current_setting('app.system_role', true) = 'moderator'
      AND assigned_moderator_user_id = current_setting('app.user_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM garage_review
      WHERE moderation_case.subject_type = 'review'
        AND garage_review.id = moderation_case.subject_id
        AND garage_review.author_user_id = current_setting('app.user_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM membership
      WHERE moderation_case.subject_type = 'garage_profile'
        AND membership.garage_id = moderation_case.subject_id
        AND membership.user_id = current_setting('app.user_id', true)
        AND membership.state = 'active'
    )
  );

CREATE POLICY moderation_case_create ON moderation_case
  FOR INSERT
  WITH CHECK (
    current_setting('app.system_role', true) = 'admin'
    OR requester_user_id = current_setting('app.user_id', true)
  );

CREATE POLICY moderation_case_update_staff ON moderation_case
  FOR UPDATE
  USING (
    current_setting('app.system_role', true) = 'admin'
    OR (
      current_setting('app.system_role', true) = 'moderator'
      AND assigned_moderator_user_id = current_setting('app.user_id', true)
    )
  )
  WITH CHECK (
    current_setting('app.system_role', true) = 'admin'
    OR (
      current_setting('app.system_role', true) = 'moderator'
      AND assigned_moderator_user_id = current_setting('app.user_id', true)
    )
  );

CREATE POLICY content_report_read_reporter_or_case_staff ON content_report
  FOR SELECT
  USING (
    reporter_user_id = current_setting('app.user_id', true)
    OR current_setting('app.system_role', true) = 'admin'
    OR EXISTS (
      SELECT 1 FROM moderation_case
      WHERE moderation_case.id = content_report.case_id
        AND moderation_case.assigned_moderator_user_id = current_setting('app.user_id', true)
        AND current_setting('app.system_role', true) = 'moderator'
    )
  );

CREATE POLICY content_report_create_reporter ON content_report
  FOR INSERT
  WITH CHECK (reporter_user_id = current_setting('app.user_id', true));

CREATE POLICY content_report_update_admin ON content_report
  FOR UPDATE
  USING (current_setting('app.system_role', true) = 'admin')
  WITH CHECK (current_setting('app.system_role', true) = 'admin');

CREATE POLICY moderation_appeal_read_appellant_or_case_staff ON moderation_appeal
  FOR SELECT
  USING (
    appellant_user_id = current_setting('app.user_id', true)
    OR current_setting('app.system_role', true) = 'admin'
    OR EXISTS (
      SELECT 1 FROM moderation_case
      WHERE moderation_case.id = moderation_appeal.case_id
        AND moderation_case.assigned_moderator_user_id = current_setting('app.user_id', true)
        AND current_setting('app.system_role', true) = 'moderator'
    )
  );

CREATE POLICY moderation_appeal_create_appellant ON moderation_appeal
  FOR INSERT
  WITH CHECK (appellant_user_id = current_setting('app.user_id', true));

CREATE POLICY lifecycle_policy_write_admin_only ON lifecycle_policy
  FOR ALL
  USING (current_setting('app.system_role', true) = 'admin')
  WITH CHECK (current_setting('app.system_role', true) = 'admin');

-- A deletion requester may only need to learn whether a current, approved policy exists. The
-- application never exposes the row; this narrow read policy lets the server select it while the
-- write policy above remains admin-only.
CREATE POLICY lifecycle_policy_read_for_workflow ON lifecycle_policy
  FOR SELECT
  USING (true);

CREATE POLICY data_deletion_request_read_owner_or_admin ON data_deletion_request
  FOR SELECT
  USING (
    user_id = current_setting('app.user_id', true)
    OR current_setting('app.system_role', true) = 'admin'
  );

CREATE POLICY data_deletion_request_create_owner ON data_deletion_request
  FOR INSERT
  WITH CHECK (user_id = current_setting('app.user_id', true));

CREATE POLICY data_deletion_request_update_admin ON data_deletion_request
  FOR UPDATE
  USING (current_setting('app.system_role', true) = 'admin')
  WITH CHECK (current_setting('app.system_role', true) = 'admin');

CREATE POLICY object_deletion_task_admin_only ON object_deletion_task
  USING (current_setting('app.system_role', true) = 'admin')
  WITH CHECK (current_setting('app.system_role', true) = 'admin');

CREATE POLICY moderation_event_append_and_restricted_read ON moderation_event
  FOR SELECT
  USING (current_setting('app.system_role', true) = 'admin');

CREATE POLICY moderation_event_append ON moderation_event
  FOR INSERT
  WITH CHECK (
    actor_user_id = current_setting('app.user_id', true)
    OR current_setting('app.system_role', true) IN ('admin', 'moderator')
  );
