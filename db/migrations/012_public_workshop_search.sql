-- The public view stays an explicit allow-list. The only geometry it exposes is the
-- source-checked municipality reference point selected for a published workshop.
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
  COALESCE(
    BOOL_AND(workshop_verification.phone_state = 'verified')
      AND BOOL_AND(workshop_verification.contact_person_state = 'verified')
      AND BOOL_AND(workshop_verification.company_document_state = 'verified')
      AND BOOL_AND(workshop_verification.location_state = 'verified'),
    false
  ) AS company_data_verified,
  place.point AS place_point,
  place.label AS place_label
FROM workshop
LEFT JOIN place ON place.id = workshop.place_id
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
  workshop.self_reported_specializations,
  place.point,
  place.label;

-- This lets a public server-side radius query use ST_DWithin on the published search model.
CREATE INDEX IF NOT EXISTS workshop_published_place_idx
  ON workshop (place_id)
  WHERE publication_state = 'published';
