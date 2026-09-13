ALTER TABLE workshop DROP CONSTRAINT IF EXISTS workshop_publication_state_check;
ALTER TABLE workshop
  ADD CONSTRAINT workshop_publication_state_check
  CHECK (publication_state IN ('draft', 'pending_review', 'published', 'rejected', 'suspended'));

ALTER TABLE workshop ADD COLUMN IF NOT EXISTS created_by_user_id text REFERENCES app_user(id);
ALTER TABLE workshop ADD COLUMN IF NOT EXISTS place_id text REFERENCES place(id);
ALTER TABLE workshop ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE workshop ADD COLUMN IF NOT EXISTS public_phone text;
ALTER TABLE workshop ADD COLUMN IF NOT EXISTS contact_person text;
ALTER TABLE workshop ADD COLUMN IF NOT EXISTS contact_phone text;
ALTER TABLE workshop ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE workshop ADD COLUMN IF NOT EXISTS languages text[] NOT NULL DEFAULT '{}';
ALTER TABLE workshop ADD COLUMN IF NOT EXISTS self_reported_specializations text[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS workshop_consent (
  id text PRIMARY KEY,
  workshop_id text NOT NULL UNIQUE REFERENCES workshop(id),
  applicant_user_id text NOT NULL REFERENCES app_user(id),
  recorded_by_user_id text NOT NULL REFERENCES app_user(id),
  source text NOT NULL CHECK (source IN ('self_service', 'documented_support_request')),
  consent_version text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workshop_verification (
  workshop_id text PRIMARY KEY REFERENCES workshop(id),
  phone_state text NOT NULL CHECK (phone_state IN ('not_checked', 'verified', 'failed')),
  contact_person_state text NOT NULL CHECK (contact_person_state IN ('not_checked', 'verified', 'failed')),
  company_document_state text NOT NULL CHECK (company_document_state IN ('not_checked', 'verified', 'failed')),
  location_state text NOT NULL CHECK (location_state IN ('not_checked', 'verified', 'failed')),
  checked_by_user_id text REFERENCES app_user(id),
  checked_at timestamptz,
  CHECK ((checked_by_user_id IS NULL) = (checked_at IS NULL))
);

CREATE TABLE IF NOT EXISTS workshop_service_category (
  workshop_id text NOT NULL REFERENCES workshop(id),
  service_category_id text NOT NULL REFERENCES service_category(id),
  PRIMARY KEY (workshop_id, service_category_id)
);

CREATE TABLE IF NOT EXISTS workshop_vehicle_make (
  workshop_id text NOT NULL REFERENCES workshop(id),
  vehicle_make_id text NOT NULL REFERENCES vehicle_make(id),
  PRIMARY KEY (workshop_id, vehicle_make_id)
);

CREATE TABLE IF NOT EXISTS workshop_verification_document (
  file_id text PRIMARY KEY REFERENCES file_object(id),
  workshop_id text NOT NULL REFERENCES workshop(id),
  uploaded_by_user_id text NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workshop_photo (
  id text PRIMARY KEY,
  workshop_id text NOT NULL REFERENCES workshop(id),
  uploaded_by_user_id text NOT NULL REFERENCES app_user(id),
  storage_key text NOT NULL UNIQUE,
  content_type text NOT NULL CHECK (content_type = 'image/webp'),
  width integer NOT NULL CHECK (width > 0 AND width <= 1600),
  height integer NOT NULL CHECK (height > 0 AND height <= 1600),
  visibility text NOT NULL CHECK (visibility IN ('pending_review', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW public_workshop_profile AS
SELECT
  workshop.id,
  workshop.name,
  workshop.place_id,
  workshop.description,
  workshop.public_phone,
  workshop.languages,
  workshop.self_reported_specializations,
  ARRAY_AGG(DISTINCT workshop_service_category.service_category_id)
    FILTER (WHERE workshop_service_category.service_category_id IS NOT NULL) AS service_category_ids,
  ARRAY_AGG(DISTINCT workshop_vehicle_make.vehicle_make_id)
    FILTER (WHERE workshop_vehicle_make.vehicle_make_id IS NOT NULL) AS vehicle_make_ids,
  BOOL_AND(workshop_verification.phone_state = 'verified')
    AND BOOL_AND(workshop_verification.contact_person_state = 'verified')
    AND BOOL_AND(workshop_verification.company_document_state = 'verified')
    AND BOOL_AND(workshop_verification.location_state = 'verified') AS company_data_verified
FROM workshop
LEFT JOIN workshop_verification ON workshop_verification.workshop_id = workshop.id
LEFT JOIN workshop_service_category ON workshop_service_category.workshop_id = workshop.id
LEFT JOIN workshop_vehicle_make ON workshop_vehicle_make.workshop_id = workshop.id
WHERE workshop.publication_state = 'published'
GROUP BY
  workshop.id,
  workshop.name,
  workshop.place_id,
  workshop.description,
  workshop.public_phone,
  workshop.languages,
  workshop.self_reported_specializations;

ALTER TABLE workshop ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE workshop_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE workshop_verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE workshop_verification_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE workshop_photo ENABLE ROW LEVEL SECURITY;

CREATE POLICY workshop_active_member ON workshop
  USING (
    EXISTS (
      SELECT 1 FROM membership
      WHERE membership.workshop_id = workshop.id
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

CREATE POLICY workshop_consent_admin_or_member ON workshop_consent
  USING (
    current_setting('app.system_role', true) = 'admin'
    OR EXISTS (
      SELECT 1 FROM membership
      WHERE membership.workshop_id = workshop_consent.workshop_id
        AND membership.user_id = current_setting('app.user_id', true)
        AND membership.state = 'active'
    )
  );

CREATE POLICY workshop_verification_admin_or_member ON workshop_verification
  USING (
    current_setting('app.system_role', true) = 'admin'
    OR EXISTS (
      SELECT 1 FROM membership
      WHERE membership.workshop_id = workshop_verification.workshop_id
        AND membership.user_id = current_setting('app.user_id', true)
        AND membership.state = 'active'
    )
  );

CREATE POLICY workshop_document_admin_or_member ON workshop_verification_document
  USING (
    current_setting('app.system_role', true) = 'admin'
    OR EXISTS (
      SELECT 1 FROM membership
      WHERE membership.workshop_id = workshop_verification_document.workshop_id
        AND membership.user_id = current_setting('app.user_id', true)
        AND membership.state = 'active'
    )
  );

CREATE POLICY workshop_photo_admin_or_member ON workshop_photo
  USING (
    current_setting('app.system_role', true) = 'admin'
    OR EXISTS (
      SELECT 1 FROM membership
      WHERE membership.workshop_id = workshop_photo.workshop_id
        AND membership.user_id = current_setting('app.user_id', true)
        AND membership.state = 'active'
    )
  );

DROP POLICY IF EXISTS file_object_owner ON file_object;
CREATE POLICY file_object_owner_or_workshop_member ON file_object
  USING (
    file_object.owner_user_id = current_setting('app.user_id', true)
    OR current_setting('app.system_role', true) = 'admin'
    OR EXISTS (
      SELECT 1
      FROM workshop_verification_document
      JOIN membership ON membership.workshop_id = workshop_verification_document.workshop_id
      WHERE workshop_verification_document.file_id = file_object.id
        AND membership.user_id = current_setting('app.user_id', true)
        AND membership.state = 'active'
    )
  );
