-- Existing profiles remain readable. Addresses are entered manually and never geocoded here.
ALTER TABLE workshop ADD COLUMN business_address text CHECK (length(business_address) BETWEEN 8 AND 500);

-- Coordinate and address updates invalidate the location check even when another authorized
-- writer changes the row. The existing point and origin remain the only location storage.
CREATE FUNCTION invalidate_garage_location_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.place_id IS DISTINCT FROM NEW.place_id OR OLD.business_address IS DISTINCT FROM NEW.business_address
    OR OLD.location_point::text IS DISTINCT FROM NEW.location_point::text THEN
    UPDATE workshop_verification SET location_state='not_checked', checked_by_user_id=NULL, checked_at=NULL
    WHERE workshop_id=NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER garage_location_change AFTER UPDATE ON workshop
  FOR EACH ROW EXECUTE FUNCTION invalidate_garage_location_check();

-- The initial private row must exist before its owner membership can reference it.
CREATE POLICY workshop_self_registration ON workshop FOR INSERT
  WITH CHECK (created_by_user_id=current_setting('app.user_id',true) AND publication_state='draft');
CREATE POLICY workshop_own_draft ON workshop FOR SELECT
  USING (created_by_user_id=current_setting('app.user_id',true) AND publication_state='draft'
    AND NOT EXISTS (SELECT 1 FROM membership m WHERE m.workshop_id=workshop.id));
CREATE POLICY membership_self_registration ON membership FOR INSERT
  WITH CHECK (user_id=current_setting('app.user_id',true) AND granted_by=user_id AND role='owner' AND state='active'
    AND EXISTS (SELECT 1 FROM workshop w WHERE w.id=workshop_id AND w.created_by_user_id=user_id AND w.publication_state='draft'));
