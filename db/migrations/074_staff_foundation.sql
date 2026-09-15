-- #113: a single durable case per submission, without changing the public status vocabulary.
CREATE TABLE staff_identity (
  user_id text PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 200),
  verified_roles text[] NOT NULL CHECK (verified_roles <@ ARRAY['admin','moderator']::text[]),
  verified_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE staff_identity ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_identity_read ON staff_identity FOR SELECT USING (
  user_id = current_setting('app.user_id', true) OR current_setting('app.system_role', true) = 'admin'
);
CREATE POLICY staff_identity_sync ON staff_identity FOR ALL USING (
  current_setting('app.identity_sync', true) = 'verified_oidc'
) WITH CHECK (current_setting('app.identity_sync', true) = 'verified_oidc');

ALTER TABLE moderation_case
  ADD COLUMN kind text NOT NULL DEFAULT 'report'
    CHECK (kind IN ('report','review_submission','garage_submission','data_deletion')),
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  ADD COLUMN escalation_reason text CHECK (escalation_reason IN ('requires_admin','conflict_of_interest','missing_information')),
  ADD COLUMN escalated_at timestamptz,
  ADD COLUMN escalated_by_user_id text REFERENCES app_user(id),
  ADD COLUMN decided_by_user_id text REFERENCES app_user(id),
  ADD COLUMN appeal_against_user_id text REFERENCES app_user(id);
UPDATE moderation_case SET kind='data_deletion' WHERE subject_type='data_deletion';
ALTER TABLE garage ADD COLUMN moderation_hidden_case_id text;
ALTER TABLE garage_review ADD COLUMN moderation_hidden_case_id text;
CREATE UNIQUE INDEX moderation_submission_subject_idx ON moderation_case(kind,subject_id)
  WHERE kind IN ('review_submission','garage_submission');
CREATE INDEX moderation_staff_queue_idx ON moderation_case(assigned_moderator_user_id,kind,status,created_at,id);

-- Backfill is conservative: existing reported-content cases and decisions remain independent.
INSERT INTO moderation_case(id,kind,subject_type,subject_id,requester_user_id,priority,status,assigned_moderator_user_id,created_at)
SELECT 'review:'||r.id,'review_submission','review',r.id,r.author_user_id,'normal',
  CASE r.publication_state WHEN 'submitted' THEN 'submitted' WHEN 'under_review' THEN 'assigned'
    WHEN 'rejected' THEN 'rejected' ELSE 'resolved' END,a.moderator_user_id,r.submitted_at
FROM garage_review r LEFT JOIN review_moderator_assignment a ON a.review_id=r.id
ON CONFLICT DO NOTHING;
INSERT INTO moderation_case(id,kind,subject_type,subject_id,priority,status)
SELECT 'garage:'||id,'garage_submission','garage_profile',id,'normal','submitted'
FROM garage WHERE publication_state='pending_review' AND deleted_at IS NULL ON CONFLICT DO NOTHING;

-- A local revision covers assignment, escalation, appeals and decisions in one optimistic lock.
CREATE FUNCTION staff_case_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.revision=OLD.revision+1; NEW.updated_at=now(); RETURN NEW; END;
$$;
CREATE TRIGGER staff_case_revision BEFORE UPDATE ON moderation_case FOR EACH ROW EXECUTE FUNCTION staff_case_revision();

-- Invoker-rights triggers preserve the existing review/evidence stores as the source of facts.
CREATE FUNCTION staff_review_case_sync() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE next_status text;
BEGIN
  next_status=CASE NEW.publication_state WHEN 'submitted' THEN 'submitted' WHEN 'under_review' THEN 'assigned'
    WHEN 'rejected' THEN 'rejected' ELSE 'resolved' END;
  IF TG_OP='INSERT' THEN
    INSERT INTO moderation_case(id,kind,subject_type,subject_id,requester_user_id,priority,status,created_at)
    VALUES('review:'||NEW.id,'review_submission','review',NEW.id,NEW.author_user_id,'normal',next_status,NEW.submitted_at);
  ELSIF NEW.publication_state IS DISTINCT FROM OLD.publication_state THEN
    UPDATE moderation_case SET status=next_status WHERE id='review:'||NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER staff_review_case_sync AFTER INSERT OR UPDATE OF publication_state ON garage_review
  FOR EACH ROW EXECUTE FUNCTION staff_review_case_sync();
CREATE FUNCTION staff_review_assignment_sync() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    UPDATE moderation_case SET assigned_moderator_user_id=NULL WHERE id='review:'||OLD.review_id;
    RETURN OLD;
  END IF;
  UPDATE moderation_case SET assigned_moderator_user_id=NEW.moderator_user_id WHERE id='review:'||NEW.review_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER staff_review_assignment_sync AFTER INSERT OR UPDATE OR DELETE ON review_moderator_assignment
  FOR EACH ROW EXECUTE FUNCTION staff_review_assignment_sync();

-- Bounded authorization predicates avoid RLS recursion between cases and their subjects.
-- The captured migration search_path is trusted and also keeps isolated test schemas isolated.
CREATE FUNCTION staff_assigned_subject(subject_kind text, subject_key text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path FROM CURRENT AS $$
  SELECT current_setting('app.system_role',true)='moderator' AND EXISTS (
    SELECT 1 FROM moderation_case c
    WHERE c.subject_type=subject_kind AND c.subject_id=subject_key
      AND c.assigned_moderator_user_id=current_setting('app.user_id',true)
      AND c.escalation_reason IS NULL AND c.kind IN ('report','review_submission')
  );
$$;
DROP POLICY garage_review_author_or_moderator ON garage_review;
CREATE POLICY garage_review_read ON garage_review FOR SELECT USING (
  author_user_id=current_setting('app.user_id',true) OR current_setting('app.system_role',true)='admin'
  OR staff_assigned_subject('review',id)
);
CREATE POLICY garage_review_create ON garage_review FOR INSERT WITH CHECK (
  author_user_id=current_setting('app.user_id',true) OR current_setting('app.system_role',true)='admin'
);
CREATE POLICY garage_review_staff_update ON garage_review FOR UPDATE USING (
  current_setting('app.system_role',true)='admin' OR staff_assigned_subject('review',id)
) WITH CHECK (current_setting('app.system_role',true)='admin' OR staff_assigned_subject('review',id));
CREATE POLICY garage_review_admin_delete ON garage_review FOR DELETE USING (current_setting('app.system_role',true)='admin');
CREATE POLICY garage_case_read ON garage FOR SELECT USING (staff_assigned_subject('garage_profile',id));
CREATE POLICY garage_case_update ON garage FOR UPDATE USING (staff_assigned_subject('garage_profile',id))
  WITH CHECK (staff_assigned_subject('garage_profile',id));
CREATE POLICY file_evidence_staff_read ON file_object FOR SELECT USING (
  current_setting('app.system_role',true)='admin' OR EXISTS (
    SELECT 1 FROM visit_evidence e WHERE e.private_file_id=file_object.id AND staff_assigned_subject('review',e.review_id)
  )
);
CREATE POLICY visit_evidence_case_read ON visit_evidence FOR SELECT USING (staff_assigned_subject('review',review_id));

-- A fixture is an explicitly allowlisted synthetic document, never an arbitrary storage path.
CREATE TABLE local_demo_file_fixture (
  file_id text PRIMARY KEY REFERENCES file_object(id) ON DELETE CASCADE,
  fixture_key text NOT NULL CHECK (fixture_key IN ('visit-valid','visit-mismatch','company-valid'))
);
ALTER TABLE local_demo_file_fixture ENABLE ROW LEVEL SECURITY;
CREATE POLICY local_demo_file_fixture_read ON local_demo_file_fixture FOR SELECT USING (
  EXISTS (SELECT 1 FROM file_object f WHERE f.id=file_id)
);

