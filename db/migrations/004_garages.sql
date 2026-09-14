ALTER TABLE garage DROP CONSTRAINT IF EXISTS garage_publication_state_check;
ALTER TABLE garage
  ADD CONSTRAINT garage_publication_state_check
  CHECK (publication_state IN ('draft', 'pending_review', 'published', 'rejected', 'suspended'));

ALTER TABLE garage ADD COLUMN IF NOT EXISTS created_by_user_id text REFERENCES app_user(id);
ALTER TABLE garage ADD COLUMN IF NOT EXISTS place_id text REFERENCES place(id);
ALTER TABLE garage ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE garage ADD COLUMN IF NOT EXISTS public_phone text;
ALTER TABLE garage ADD COLUMN IF NOT EXISTS contact_person text;
ALTER TABLE garage ADD COLUMN IF NOT EXISTS contact_phone text;
ALTER TABLE garage ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE garage ADD COLUMN IF NOT EXISTS languages text[] NOT NULL DEFAULT '{}';
ALTER TABLE garage ADD COLUMN IF NOT EXISTS self_reported_specializations text[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS garage_consent (
  id text PRIMARY KEY,
  garage_id text NOT NULL UNIQUE REFERENCES garage(id),
  applicant_user_id text NOT NULL REFERENCES app_user(id),
  recorded_by_user_id text NOT NULL REFERENCES app_user(id),
  source text NOT NULL CHECK (source IN ('self_service', 'documented_support_request')),
  consent_version text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS garage_verification (
  garage_id text PRIMARY KEY REFERENCES garage(id),
  phone_state text NOT NULL CHECK (phone_state IN ('not_checked', 'verified', 'failed')),
  contact_person_state text NOT NULL CHECK (contact_person_state IN ('not_checked', 'verified', 'failed')),
  company_document_state text NOT NULL CHECK (company_document_state IN ('not_checked', 'verified', 'failed')),
  location_state text NOT NULL CHECK (location_state IN ('not_checked', 'verified', 'failed')),
  checked_by_user_id text REFERENCES app_user(id),
  checked_at timestamptz,
  CHECK ((checked_by_user_id IS NULL) = (checked_at IS NULL))
);

CREATE TABLE IF NOT EXISTS garage_service_category (
  garage_id text NOT NULL REFERENCES garage(id),
  service_category_id text NOT NULL REFERENCES service_category(id),
  PRIMARY KEY (garage_id, service_category_id)
);

CREATE TABLE IF NOT EXISTS garage_vehicle_make (
  garage_id text NOT NULL REFERENCES garage(id),
  vehicle_make_id text NOT NULL REFERENCES vehicle_make(id),
  PRIMARY KEY (garage_id, vehicle_make_id)
);

CREATE TABLE IF NOT EXISTS garage_verification_document (
  file_id text PRIMARY KEY REFERENCES file_object(id),
  garage_id text NOT NULL REFERENCES garage(id),
  uploaded_by_user_id text NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS garage_photo (
  id text PRIMARY KEY,
  garage_id text NOT NULL REFERENCES garage(id),
  uploaded_by_user_id text NOT NULL REFERENCES app_user(id),
  storage_key text NOT NULL UNIQUE,
  content_type text NOT NULL CHECK (content_type = 'image/webp'),
  width integer NOT NULL CHECK (width > 0 AND width <= 1600),
  height integer NOT NULL CHECK (height > 0 AND height <= 1600),
  visibility text NOT NULL CHECK (visibility IN ('pending_review', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW public_garage_profile AS
SELECT
  garage.id,
  garage.name,
  garage.place_id,
  garage.description,
  garage.public_phone,
  garage.languages,
  garage.self_reported_specializations,
  ARRAY_AGG(DISTINCT garage_service_category.service_category_id)
    FILTER (WHERE garage_service_category.service_category_id IS NOT NULL) AS service_category_ids,
  ARRAY_AGG(DISTINCT garage_vehicle_make.vehicle_make_id)
    FILTER (WHERE garage_vehicle_make.vehicle_make_id IS NOT NULL) AS vehicle_make_ids,
  BOOL_AND(garage_verification.phone_state = 'verified')
    AND BOOL_AND(garage_verification.contact_person_state = 'verified')
    AND BOOL_AND(garage_verification.company_document_state = 'verified')
    AND BOOL_AND(garage_verification.location_state = 'verified') AS company_data_verified
FROM garage
LEFT JOIN garage_verification ON garage_verification.garage_id = garage.id
LEFT JOIN garage_service_category ON garage_service_category.garage_id = garage.id
LEFT JOIN garage_vehicle_make ON garage_vehicle_make.garage_id = garage.id
WHERE garage.publication_state = 'published'
GROUP BY
  garage.id,
  garage.name,
  garage.place_id,
  garage.description,
  garage.public_phone,
  garage.languages,
  garage.self_reported_specializations;

ALTER TABLE garage ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE garage_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE garage_verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE garage_verification_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE garage_photo ENABLE ROW LEVEL SECURITY;

CREATE POLICY garage_active_member ON garage
  USING (
    EXISTS (
      SELECT 1 FROM membership
      WHERE membership.garage_id = garage.id
        AND membership.user_id = current_setting('app.user_id', true)
        AND membership.state = 'active'
    )
    OR current_setting('app.system_role', true) = 'admin'
  );

CREATE POLICY membership_self_or_admin ON membership
  USING (
    membership.user_id = current_setting('app.user_id', true)
    OR current_setting('app.system_role', true) = 'admin'
  )
  WITH CHECK (current_setting('app.system_role', true) = 'admin');

CREATE POLICY garage_consent_admin_or_member ON garage_consent
  USING (
    current_setting('app.system_role', true) = 'admin'
    OR EXISTS (
      SELECT 1 FROM membership
      WHERE membership.garage_id = garage_consent.garage_id
        AND membership.user_id = current_setting('app.user_id', true)
        AND membership.state = 'active'
    )
  );

CREATE POLICY garage_verification_admin_or_member ON garage_verification
  USING (
    current_setting('app.system_role', true) = 'admin'
    OR EXISTS (
      SELECT 1 FROM membership
      WHERE membership.garage_id = garage_verification.garage_id
        AND membership.user_id = current_setting('app.user_id', true)
        AND membership.state = 'active'
    )
  );

CREATE POLICY garage_document_admin_or_member ON garage_verification_document
  USING (
    current_setting('app.system_role', true) = 'admin'
    OR EXISTS (
      SELECT 1 FROM membership
      WHERE membership.garage_id = garage_verification_document.garage_id
        AND membership.user_id = current_setting('app.user_id', true)
        AND membership.state = 'active'
    )
  );

CREATE POLICY garage_photo_admin_or_member ON garage_photo
  USING (
    current_setting('app.system_role', true) = 'admin'
    OR EXISTS (
      SELECT 1 FROM membership
      WHERE membership.garage_id = garage_photo.garage_id
        AND membership.user_id = current_setting('app.user_id', true)
        AND membership.state = 'active'
    )
  );

DROP POLICY IF EXISTS file_object_owner ON file_object;
CREATE POLICY file_object_owner_or_garage_member ON file_object
  USING (
    file_object.owner_user_id = current_setting('app.user_id', true)
    OR current_setting('app.system_role', true) = 'admin'
    OR EXISTS (
      SELECT 1
      FROM garage_verification_document
      JOIN membership ON membership.garage_id = garage_verification_document.garage_id
      WHERE garage_verification_document.file_id = file_object.id
        AND membership.user_id = current_setting('app.user_id', true)
        AND membership.state = 'active'
    )
  );
