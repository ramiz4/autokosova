-- Scenario provenance has no foreign key: deleting a demo case must not resurrect it on restart.
ALTER TABLE local_demo_seed_entity DROP CONSTRAINT local_demo_seed_entity_entity_type_check;
ALTER TABLE local_demo_seed_entity ADD CONSTRAINT local_demo_seed_entity_entity_type_check
  CHECK (entity_type IN ('app_user','file_object','repair_request','request_search_area',
    'visit_evidence','garage_review','moderation_case','garage'));

-- A content change invalidates a previously loaded case. No status/assignment/decision is reset.
-- Trigger arguments cannot select arbitrary subjects: the affected row determines the case.
CREATE FUNCTION staff_report_content_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE subject_key text; subject_kind text;
BEGIN
  IF TG_TABLE_NAME='garage' THEN
    subject_kind='garage_profile'; subject_key=NEW.id;
  ELSIF TG_TABLE_NAME='garage_review' THEN
    subject_kind='review'; subject_key=NEW.id;
  ELSE
    subject_kind='review'; subject_key=COALESCE(NEW.review_id,OLD.review_id);
  END IF;
  UPDATE moderation_case SET updated_at=now()
    WHERE subject_type=subject_kind AND subject_id=subject_key
      AND status IN ('submitted','assigned','waiting_for_subject');
  RETURN NULL;
END;
$$;
CREATE TRIGGER staff_garage_content_revision AFTER UPDATE OF name,description,languages,self_reported_specializations ON garage
  FOR EACH ROW WHEN ((OLD.name,OLD.description,OLD.languages,OLD.self_reported_specializations) IS DISTINCT FROM (NEW.name,NEW.description,NEW.languages,NEW.self_reported_specializations)) EXECUTE FUNCTION staff_report_content_revision();
CREATE TRIGGER staff_review_content_revision AFTER UPDATE OF review_text,work_quality,communication,price_transparency,punctuality ON garage_review
  FOR EACH ROW EXECUTE FUNCTION staff_report_content_revision();
CREATE TRIGGER staff_response_content_revision AFTER INSERT OR UPDATE OR DELETE ON review_garage_response
  FOR EACH ROW EXECUTE FUNCTION staff_report_content_revision();
CREATE TRIGGER staff_update_content_revision AFTER INSERT OR UPDATE OR DELETE ON review_update
  FOR EACH ROW EXECUTE FUNCTION staff_report_content_revision();
