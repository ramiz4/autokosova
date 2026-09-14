-- A review and its proof deliberately have independent states. The public model never contains a
-- file identifier, reviewer notes, author identity or a full vehicle description.
ALTER TABLE file_object
  ADD COLUMN IF NOT EXISTS retention_state text NOT NULL DEFAULT 'active'
  CHECK (retention_state IN ('active', 'deleted_after_retention'));

CREATE TABLE IF NOT EXISTS garage_review (
  id text PRIMARY KEY,
  author_user_id text NOT NULL REFERENCES app_user(id),
  garage_id text NOT NULL REFERENCES garage(id),
  service_category_id text NOT NULL REFERENCES service_category(id),
  vehicle_make_id text REFERENCES vehicle_make(id),
  visit_month date NOT NULL CHECK (visit_month = date_trunc('month', visit_month)::date),
  work_quality smallint NOT NULL CHECK (work_quality BETWEEN 1 AND 5),
  communication smallint NOT NULL CHECK (communication BETWEEN 1 AND 5),
  price_transparency smallint NOT NULL CHECK (price_transparency BETWEEN 1 AND 5),
  punctuality smallint NOT NULL CHECK (punctuality BETWEEN 1 AND 5),
  overall_rating numeric(2, 1) GENERATED ALWAYS AS (
    round(
      (work_quality + communication + price_transparency + punctuality)::numeric / 4,
      1
    )
  ) STORED,
  review_text text NOT NULL CHECK (char_length(btrim(review_text)) BETWEEN 20 AND 2000),
  publication_state text NOT NULL
    CHECK (publication_state IN ('submitted', 'under_review', 'published', 'rejected', 'withdrawn')),
  rejection_reason_code text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  CHECK (
    (publication_state = 'rejected' AND rejection_reason_code IS NOT NULL)
    OR (publication_state <> 'rejected' AND rejection_reason_code IS NULL)
  ),
  CHECK ((publication_state = 'published') = (published_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS visit_evidence (
  id text PRIMARY KEY,
  review_id text NOT NULL UNIQUE REFERENCES garage_review(id),
  owner_user_id text NOT NULL REFERENCES app_user(id),
  private_file_id text NOT NULL UNIQUE REFERENCES file_object(id),
  evidence_kind text NOT NULL CHECK (
    evidence_kind IN (
      'invoice',
      'work_order',
      'payment_confirmation',
      'garage_confirmation',
      'other_service_proof'
    )
  ),
  verification_state text NOT NULL CHECK (
    verification_state IN (
      'submitted',
      'under_review',
      'verified',
      'not_verified',
      'deleted_after_retention'
    )
  ),
  service_matches boolean,
  visit_month_matches boolean,
  garage_matches boolean,
  reviewed_by_user_id text REFERENCES app_user(id),
  reviewed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (reviewed_by_user_id IS NULL) = (reviewed_at IS NULL)
  ),
  CHECK (
    verification_state <> 'verified'
    OR (service_matches AND visit_month_matches AND garage_matches)
  )
);

CREATE TABLE IF NOT EXISTS review_moderator_assignment (
  review_id text PRIMARY KEY REFERENCES garage_review(id),
  moderator_user_id text NOT NULL REFERENCES app_user(id),
  assigned_by_user_id text NOT NULL REFERENCES app_user(id),
  assigned_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS review_garage_response (
  review_id text PRIMARY KEY REFERENCES garage_review(id),
  garage_id text NOT NULL REFERENCES garage(id),
  author_user_id text NOT NULL REFERENCES app_user(id),
  response_text text NOT NULL CHECK (char_length(btrim(response_text)) BETWEEN 20 AND 1200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS review_update (
  id text PRIMARY KEY,
  review_id text NOT NULL REFERENCES garage_review(id),
  author_user_id text NOT NULL REFERENCES app_user(id),
  update_kind text NOT NULL CHECK (update_kind IN ('complaint', 'rework')),
  update_text text NOT NULL CHECK (char_length(btrim(update_text)) BETWEEN 20 AND 1200),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS garage_review_public_idx
  ON garage_review (garage_id, visit_month DESC, submitted_at DESC)
  WHERE publication_state = 'published';
CREATE INDEX IF NOT EXISTS review_update_review_idx ON review_update (review_id, created_at);

ALTER TABLE garage_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_moderator_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_garage_response ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_update ENABLE ROW LEVEL SECURITY;

CREATE POLICY garage_review_author_or_moderator ON garage_review
  USING (
    author_user_id = current_setting('app.user_id', true)
    OR current_setting('app.system_role', true) = 'admin'
    OR EXISTS (
      SELECT 1 FROM review_moderator_assignment
      WHERE review_moderator_assignment.review_id = garage_review.id
        AND review_moderator_assignment.moderator_user_id = current_setting('app.user_id', true)
        AND current_setting('app.system_role', true) = 'moderator'
    )
  )
  WITH CHECK (author_user_id = current_setting('app.user_id', true));

CREATE POLICY visit_evidence_author_or_assigned_moderator ON visit_evidence
  USING (
    owner_user_id = current_setting('app.user_id', true)
    OR current_setting('app.system_role', true) = 'admin'
    OR EXISTS (
      SELECT 1 FROM review_moderator_assignment
      WHERE review_moderator_assignment.review_id = visit_evidence.review_id
        AND review_moderator_assignment.moderator_user_id = current_setting('app.user_id', true)
        AND current_setting('app.system_role', true) = 'moderator'
    )
  );

CREATE POLICY review_assignment_admin_or_assignee ON review_moderator_assignment
  USING (
    current_setting('app.system_role', true) = 'admin'
    OR (
      moderator_user_id = current_setting('app.user_id', true)
      AND current_setting('app.system_role', true) = 'moderator'
    )
  )
  WITH CHECK (current_setting('app.system_role', true) = 'admin');

CREATE POLICY review_response_active_member_or_admin ON review_garage_response
  USING (
    current_setting('app.system_role', true) = 'admin'
    OR EXISTS (
      SELECT 1 FROM membership
      WHERE membership.garage_id = review_garage_response.garage_id
        AND membership.user_id = current_setting('app.user_id', true)
        AND membership.state = 'active'
    )
  );

CREATE POLICY review_update_author_or_admin ON review_update
  USING (
    author_user_id = current_setting('app.user_id', true)
    OR current_setting('app.system_role', true) = 'admin'
  )
  WITH CHECK (author_user_id = current_setting('app.user_id', true));

CREATE OR REPLACE VIEW public_garage_review AS
SELECT
  review.id,
  review.garage_id,
  review.service_category_id,
  review.vehicle_make_id,
  review.visit_month,
  review.work_quality,
  review.communication,
  review.price_transparency,
  review.punctuality,
  review.overall_rating,
  review.review_text,
  review.published_at,
  'Besuch belegt'::text AS evidence_label
FROM garage_review AS review
JOIN visit_evidence AS evidence ON evidence.review_id = review.id
WHERE review.publication_state = 'published'
  AND evidence.verification_state IN ('verified', 'deleted_after_retention');

CREATE OR REPLACE VIEW public_garage_review_summary AS
SELECT
  garage_id,
  count(*)::integer AS review_count,
  round(avg(overall_rating), 1)::numeric(2, 1) AS average_rating,
  max(visit_month) AS latest_visit_month,
  count(*)::integer AS verified_visit_count
FROM public_garage_review
GROUP BY garage_id;

CREATE OR REPLACE VIEW public_review_garage_response AS
SELECT
  response.review_id,
  response.response_text,
  response.created_at
FROM review_garage_response AS response
JOIN public_garage_review AS review ON review.id = response.review_id;

CREATE OR REPLACE VIEW public_review_update AS
SELECT
  update_entry.id,
  update_entry.review_id,
  update_entry.update_kind,
  update_entry.update_text,
  update_entry.created_at
FROM review_update AS update_entry
JOIN public_garage_review AS review ON review.id = update_entry.review_id;
