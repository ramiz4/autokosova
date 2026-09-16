-- #99: customer case creation retains the #95 independent-appeal invariant.
CREATE OR REPLACE FUNCTION staff_review_case_sync() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
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
      THEN status ELSE next_status END WHERE id='review:'||NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
