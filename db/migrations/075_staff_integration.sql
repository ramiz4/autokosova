-- This projection deliberately exposes only the history of an accessible case, not global audit.
CREATE OR REPLACE VIEW staff_case_event WITH (security_barrier=true) AS
SELECT c.id AS case_id,e.id,e.event_type,e.created_at
FROM moderation_case c JOIN moderation_event e ON
  (e.subject_type='moderation_case' AND e.subject_id=c.id)
  OR (c.kind='review_submission' AND e.subject_type='review' AND e.subject_id=c.subject_id)
WHERE current_setting('app.system_role',true)='admin' OR
  (current_setting('app.system_role',true)='moderator'
    AND c.assigned_moderator_user_id=current_setting('app.user_id',true) AND c.escalation_reason IS NULL);

CREATE TABLE local_demo_staff_binding (
  purpose text PRIMARY KEY CHECK (purpose IN ('admin','moderator')),
  subject_id text NOT NULL UNIQUE REFERENCES app_user(id)
);
ALTER TABLE local_demo_staff_binding ENABLE ROW LEVEL SECURITY;
CREATE POLICY local_demo_staff_binding_admin ON local_demo_staff_binding USING (current_setting('app.system_role',true)='admin');

-- SELECT FOR SHARE needs the UPDATE visibility policy, but never permission to change a role.
-- WITH CHECK(false) permits locking only; the verified-OIDC policy alone permits writes.
CREATE POLICY staff_identity_lock_only ON staff_identity FOR UPDATE USING (
  user_id=current_setting('app.user_id',true) OR current_setting('app.system_role',true)='admin'
) WITH CHECK (false);

-- A moderator may lock the checked proof during a decision, but may not alter its bytes/scan.
CREATE POLICY file_evidence_staff_lock ON file_object FOR UPDATE USING (
  current_setting('app.system_role',true)='admin' OR EXISTS (
    SELECT 1 FROM visit_evidence e WHERE e.private_file_id=file_object.id AND staff_assigned_subject('review',e.review_id)
  )
) WITH CHECK (current_setting('app.system_role',true)='admin');

-- A garage owner may submit or revise their own profile, never write arbitrary moderation cases.
-- Definer rights are confined to the row-derived canonical submission; no arguments or dynamic SQL.
CREATE FUNCTION staff_garage_case_sync() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
BEGIN
  IF NEW.publication_state='pending_review' AND NEW.deleted_at IS NULL THEN
    INSERT INTO moderation_case(id,kind,subject_type,subject_id,requester_user_id,priority,status)
    VALUES('garage:'||NEW.id,'garage_submission','garage_profile',NEW.id,NEW.created_by_user_id,'normal','submitted')
    ON CONFLICT(id) DO UPDATE SET status='submitted';
  ELSE
    UPDATE moderation_case SET status=CASE NEW.publication_state WHEN 'draft' THEN 'waiting_for_subject'
      WHEN 'rejected' THEN 'rejected' ELSE 'resolved' END WHERE id='garage:'||NEW.id AND kind='garage_submission';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER staff_garage_case_sync AFTER UPDATE OF publication_state,deleted_at ON garage
  FOR EACH ROW EXECUTE FUNCTION staff_garage_case_sync();
