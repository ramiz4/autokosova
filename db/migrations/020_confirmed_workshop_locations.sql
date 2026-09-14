-- A municipality reference point is not a workshop address. Existing rows deliberately stay
-- unconfirmed until a responsible reviewer has checked a supplied workshop position.
ALTER TABLE workshop
  ADD COLUMN IF NOT EXISTS location_point geography(Point, 4326),
  ADD COLUMN IF NOT EXISTS location_source text;

ALTER TABLE workshop DROP CONSTRAINT IF EXISTS workshop_location_source_check;
ALTER TABLE workshop
  ADD CONSTRAINT workshop_location_source_check
  CHECK ((location_point IS NULL AND location_source IS NULL)
    OR (location_point IS NOT NULL AND location_source IN ('self_reported', 'operator_entered', 'local_demo')));

CREATE INDEX IF NOT EXISTS workshop_location_point_gist_idx
  ON workshop USING GIST (location_point)
  WHERE location_point IS NOT NULL;

-- The point is available only to server-side search after a separate location verification.
-- The public API returns a derived air distance and never exposes coordinates.
CREATE OR REPLACE VIEW public_workshop_profile AS
SELECT
  workshop.id, workshop.name, workshop.place_id, workshop.description, workshop.public_phone,
  workshop.languages, workshop.self_reported_specializations,
  ARRAY_AGG(DISTINCT workshop_service_category.service_category_id)
    FILTER (WHERE workshop_service_category.service_category_id IS NOT NULL) AS service_category_ids,
  ARRAY_AGG(DISTINCT workshop_vehicle_make.vehicle_make_id)
    FILTER (WHERE workshop_vehicle_make.vehicle_make_id IS NOT NULL) AS vehicle_make_ids,
  COALESCE(BOOL_AND(workshop_verification.phone_state = 'verified')
    AND BOOL_AND(workshop_verification.contact_person_state = 'verified')
    AND BOOL_AND(workshop_verification.company_document_state = 'verified')
    AND BOOL_AND(workshop_verification.location_state = 'verified'), false) AS company_data_verified,
  -- Retained for view compatibility only. Search never uses this municipality reference point
  -- as a workshop position.
  place.point AS place_point,
  place.label AS place_label,
  CASE WHEN workshop_verification.location_state = 'verified' THEN workshop.location_point ELSE NULL END AS workshop_point
FROM workshop
LEFT JOIN place ON place.id = workshop.place_id
LEFT JOIN workshop_verification ON workshop_verification.workshop_id = workshop.id
LEFT JOIN workshop_service_category ON workshop_service_category.workshop_id = workshop.id
LEFT JOIN workshop_vehicle_make ON workshop_vehicle_make.workshop_id = workshop.id
WHERE workshop.publication_state = 'published'
GROUP BY workshop.id, workshop.name, workshop.place_id, workshop.description, workshop.public_phone,
  workshop.languages, workshop.self_reported_specializations, place.point, place.label,
  workshop.location_point, workshop_verification.location_state;
