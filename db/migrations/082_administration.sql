-- Existing garage aggregate: a separate revision, not another publication lifecycle.
ALTER TABLE garage ADD COLUMN admin_revision integer NOT NULL DEFAULT 1 CHECK(admin_revision>0);
ALTER TABLE garage ADD COLUMN admin_suspended boolean NOT NULL DEFAULT false;
ALTER TABLE garage ADD COLUMN admin_last_reason text;
ALTER TABLE garage ADD CONSTRAINT garage_admin_reason CHECK(admin_last_reason IS NULL OR
  admin_last_reason IN ('company_verified','missing_information','policy_violation','ownership_change','documented_support','privacy_request'));
CREATE FUNCTION admin_garage_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.admin_revision=OLD.admin_revision+1; RETURN NEW; END;
$$;
CREATE TRIGGER admin_garage_revision BEFORE UPDATE ON garage FOR EACH ROW EXECUTE FUNCTION admin_garage_revision();
-- Changing membership, verification or attached material invalidates the admin's loaded decision.
CREATE FUNCTION admin_garage_child_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
BEGIN
  UPDATE garage SET admin_revision=admin_revision WHERE id=COALESCE(NEW.garage_id,OLD.garage_id);
  RETURN NULL;
END;
$$;
CREATE TRIGGER admin_membership_revision AFTER INSERT OR UPDATE OR DELETE ON membership FOR EACH ROW EXECUTE FUNCTION admin_garage_child_revision();
CREATE TRIGGER admin_verification_revision AFTER INSERT OR UPDATE OR DELETE ON garage_verification FOR EACH ROW EXECUTE FUNCTION admin_garage_child_revision();
CREATE TRIGGER admin_document_revision AFTER INSERT OR UPDATE OR DELETE ON garage_verification_document FOR EACH ROW EXECUTE FUNCTION admin_garage_child_revision();
CREATE TRIGGER admin_photo_revision AFTER INSERT OR UPDATE OR DELETE ON garage_photo FOR EACH ROW EXECUTE FUNCTION admin_garage_child_revision();

-- Only a bound synthetic photo key may use an existing harmless demo image. No storage path input.
CREATE TABLE local_demo_admin_photo (
  photo_id text PRIMARY KEY REFERENCES garage_photo(id) ON DELETE CASCADE,
  fixture_key text NOT NULL CHECK(fixture_key IN ('demo-garage-overview','demo-engine-service','demo-reception','demo-garage-suv'))
);
ALTER TABLE local_demo_admin_photo ENABLE ROW LEVEL SECURITY;
CREATE POLICY local_demo_admin_photo_admin ON local_demo_admin_photo FOR SELECT
  USING(current_setting('app.system_role',true)='admin');

-- Case-scoped/owner-only policies for private customer requests, vehicles and favorites are unchanged.

CREATE VIEW public_demo_admin_photo WITH (security_barrier=true) AS
SELECT p.id AS photo_id,p.garage_id,f.fixture_key
FROM garage_photo p JOIN local_demo_admin_photo f ON f.photo_id=p.id
JOIN public_garage_profile g ON g.id=p.garage_id
WHERE p.visibility='approved';

CREATE TABLE garage_support_request (
  id text PRIMARY KEY,
  garage_id text NOT NULL REFERENCES garage(id),
  request_reference text NOT NULL CHECK(char_length(btrim(request_reference)) BETWEEN 5 AND 200),
  recorded_by_user_id text NOT NULL REFERENCES app_user(id),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE garage_support_request ENABLE ROW LEVEL SECURITY;
CREATE POLICY garage_support_read ON garage_support_request FOR SELECT USING(current_setting('app.system_role',true)='admin');
CREATE POLICY garage_support_insert ON garage_support_request FOR INSERT WITH CHECK(current_setting('app.system_role',true)='admin');
