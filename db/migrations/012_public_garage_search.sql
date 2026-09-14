-- The public view stays an explicit allow-list. The only geometry it exposes is the
-- source-checked municipality reference point selected for a published garage.
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
  COALESCE(
    BOOL_AND(garage_verification.phone_state = 'verified')
      AND BOOL_AND(garage_verification.contact_person_state = 'verified')
      AND BOOL_AND(garage_verification.company_document_state = 'verified')
      AND BOOL_AND(garage_verification.location_state = 'verified'),
    false
  ) AS company_data_verified,
  place.point AS place_point,
  place.label AS place_label
FROM garage
LEFT JOIN place ON place.id = garage.place_id
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
  garage.self_reported_specializations,
  place.point,
  place.label;

-- This lets a public server-side radius query use ST_DWithin on the published search model.
CREATE INDEX IF NOT EXISTS garage_published_place_idx
  ON garage (place_id)
  WHERE publication_state = 'published';
