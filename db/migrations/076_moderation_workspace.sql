-- #95: contextual reads are restricted to the assigned case. They never confer authoring,
-- membership, company-document or global audit permissions on a moderator.
CREATE POLICY review_response_case_read ON review_garage_response FOR SELECT
  USING (staff_assigned_subject('review',review_id));
CREATE POLICY review_update_case_read ON review_update FOR SELECT
  USING (staff_assigned_subject('review',review_id));

-- REPORT-4: restoration needs the historical positive verification fact, not a new company
-- verification. Only the existing positive checklist of this moderator's hidden report subject
-- can be read; no verification writes or garage_verification_document/file grants are added.
CREATE POLICY garage_verified_restore_read ON garage_verification FOR SELECT USING (
  current_setting('app.system_role',true)='moderator'
  AND phone_state='verified' AND contact_person_state='verified'
  AND company_document_state='verified' AND location_state='verified'
  AND EXISTS (
    SELECT 1 FROM garage g JOIN moderation_case c ON c.id=g.moderation_hidden_case_id
    WHERE g.id=garage_verification.garage_id AND g.publication_state='suspended'
      AND g.deleted_at IS NULL AND c.kind='report' AND c.subject_type='garage_profile'
      AND c.subject_id=g.id AND c.assigned_moderator_user_id=current_setting('app.user_id',true)
      AND c.escalation_reason IS NULL
  )
);

-- Append only a staff display label to the already case-restricted audit projection. Raw
-- identity subjects, reporter identity, notes and private evidence are deliberately absent.
CREATE OR REPLACE VIEW staff_case_event WITH (security_barrier=true) AS
SELECT c.id AS case_id,e.id,e.event_type,e.created_at,COALESCE(s.display_name,'') AS actor_label
FROM moderation_case c JOIN moderation_event e ON
  (e.subject_type='moderation_case' AND e.subject_id=c.id)
  OR (c.kind='review_submission' AND e.subject_type='review' AND e.subject_id=c.subject_id)
LEFT JOIN staff_identity s ON s.user_id=e.actor_user_id
WHERE current_setting('app.system_role',true)='admin' OR
  (current_setting('app.system_role',true)='moderator'
    AND c.assigned_moderator_user_id=current_setting('app.user_id',true) AND c.escalation_reason IS NULL);

-- Keep a pending appeal independent from public visibility changes in another report case.
-- The review decision store explicitly closes an appeal, including an upheld decision whose
-- public state does not change. This does not alter the original review text or ratings.
CREATE OR REPLACE FUNCTION staff_review_case_sync() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE next_status text;
BEGIN
  next_status=CASE NEW.publication_state WHEN 'submitted' THEN 'submitted' WHEN 'under_review' THEN 'assigned'
    WHEN 'rejected' THEN 'rejected' ELSE 'resolved' END;
  IF TG_OP='INSERT' THEN
    INSERT INTO moderation_case(id,kind,subject_type,subject_id,requester_user_id,priority,status,created_at)
    VALUES('review:'||NEW.id,'review_submission','review',NEW.id,NEW.author_user_id,'normal',next_status,NEW.submitted_at);
  ELSIF NEW.publication_state IS DISTINCT FROM OLD.publication_state THEN
    UPDATE moderation_case SET status=CASE
      WHEN appeal_against_user_id IS NOT NULL AND status IN ('submitted','assigned','waiting_for_subject')
      THEN status ELSE next_status END
    WHERE id='review:'||NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
