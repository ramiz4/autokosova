-- #99: request keys make explicit retries idempotent without equating separate real visits.
ALTER TABLE review_update ADD COLUMN request_id text;
CREATE UNIQUE INDEX review_update_request_idx ON review_update(author_user_id,request_id)
  WHERE request_id IS NOT NULL;
ALTER TABLE review_garage_response ADD COLUMN request_id text;
ALTER TABLE review_garage_response ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision > 0);
CREATE OR REPLACE VIEW public_review_garage_response AS
SELECT response.review_id,response.response_text,response.created_at,response.updated_at,response.revision
FROM review_garage_response response JOIN public_garage_review review ON review.id=response.review_id;

-- Hold visibility stable for a submission without exposing any private garage fields to customers.
CREATE FUNCTION review_lock_public_garage(garage_key text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
BEGIN
  PERFORM 1 FROM garage WHERE id=garage_key AND publication_state='published' AND deleted_at IS NULL FOR SHARE;
  RETURN FOUND;
END;
$$;

-- Only the local allowlisted fixture adapter sets this flag after validating exact synthetic bytes.
-- It never accepts real uploads or a caller-supplied scan verdict.
CREATE POLICY local_demo_file_fixture_owner_insert ON local_demo_file_fixture FOR INSERT WITH CHECK (
  current_setting('app.local_demo_upload',true)='known_fixture' AND
  EXISTS (SELECT 1 FROM file_object f WHERE f.id=file_id AND f.owner_user_id=current_setting('app.user_id',true))
);

-- A regular customer can create the canonical submission case, but not arbitrary staff cases.
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
    UPDATE moderation_case SET status=next_status WHERE id='review:'||NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

