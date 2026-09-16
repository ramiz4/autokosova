-- Follow-up also upgrades local databases which already applied draft migration 076.
-- Keep the cross-table check in a bounded predicate, like staff_assigned_subject. Otherwise
-- PostgreSQL checks unrelated review-table grants even for a nonstaff garage owner updating
-- their own location verification. No document data or verification write is exposed.
CREATE FUNCTION staff_restore_verification_subject(garage_key text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path FROM CURRENT AS $$
  SELECT current_setting('app.system_role',true)='moderator' AND EXISTS (
    SELECT 1 FROM garage g JOIN moderation_case c ON c.id=g.moderation_hidden_case_id
    WHERE g.id=garage_key AND g.publication_state='suspended' AND g.deleted_at IS NULL
      AND c.kind='report' AND c.subject_type='garage_profile' AND c.subject_id=g.id
      AND c.assigned_moderator_user_id=current_setting('app.user_id',true)
      AND c.escalation_reason IS NULL
  );
$$;
DROP POLICY garage_verified_restore_read ON garage_verification;
CREATE POLICY garage_verified_restore_read ON garage_verification FOR SELECT USING (
  phone_state='verified' AND contact_person_state='verified'
  AND company_document_state='verified' AND location_state='verified'
  AND staff_restore_verification_subject(garage_id)
);

