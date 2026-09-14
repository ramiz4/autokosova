-- A municipality reference point is not a garage address. Existing rows deliberately stay
-- unconfirmed until a responsible reviewer has checked a supplied garage position.
ALTER TABLE garage
  ADD COLUMN IF NOT EXISTS location_point geography(Point, 4326),
  ADD COLUMN IF NOT EXISTS location_source text;

ALTER TABLE garage DROP CONSTRAINT IF EXISTS garage_location_source_check;
ALTER TABLE garage
  ADD CONSTRAINT garage_location_source_check
  CHECK ((location_point IS NULL AND location_source IS NULL)
    OR (location_point IS NOT NULL AND location_source IN ('self_reported', 'operator_entered', 'local_demo')));

CREATE INDEX IF NOT EXISTS garage_location_point_gist_idx
  ON garage USING GIST (location_point)
  WHERE location_point IS NOT NULL;

-- The point is available only to server-side search after a separate location verification.
-- The public API returns a derived air distance and never exposes coordinates.
CREATE OR REPLACE VIEW public_garage_profile AS
SELECT
  garage.id, garage.name, garage.place_id, garage.description, garage.public_phone,
  garage.languages, garage.self_reported_specializations,
  ARRAY_AGG(DISTINCT garage_service_category.service_category_id)
    FILTER (WHERE garage_service_category.service_category_id IS NOT NULL) AS service_category_ids,
  ARRAY_AGG(DISTINCT garage_vehicle_make.vehicle_make_id)
    FILTER (WHERE garage_vehicle_make.vehicle_make_id IS NOT NULL) AS vehicle_make_ids,
  COALESCE(BOOL_AND(garage_verification.phone_state = 'verified')
    AND BOOL_AND(garage_verification.contact_person_state = 'verified')
    AND BOOL_AND(garage_verification.company_document_state = 'verified')
    AND BOOL_AND(garage_verification.location_state = 'verified'), false) AS company_data_verified,
  -- Retained for view compatibility only. Search never uses this municipality reference point
  -- as a garage position.
  place.point AS place_point,
  place.label AS place_label,
  CASE WHEN garage_verification.location_state = 'verified' THEN garage.location_point ELSE NULL END AS garage_point
FROM garage
LEFT JOIN place ON place.id = garage.place_id
LEFT JOIN garage_verification ON garage_verification.garage_id = garage.id
LEFT JOIN garage_service_category ON garage_service_category.garage_id = garage.id
LEFT JOIN garage_vehicle_make ON garage_vehicle_make.garage_id = garage.id
WHERE garage.publication_state = 'published'
GROUP BY garage.id, garage.name, garage.place_id, garage.description, garage.public_phone,
  garage.languages, garage.self_reported_specializations, place.point, place.label,
  garage.location_point, garage_verification.location_state;
