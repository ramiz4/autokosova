-- Existing installations used the former domain identifier. This additive transition preserves
-- every row and foreign-key relation while moving active schema names to garage/garages.
DO $$
DECLARE _table text;
BEGIN
  IF to_regclass('public.workshop') IS NOT NULL AND to_regclass('public.garage') IS NULL THEN
    ALTER TABLE workshop RENAME TO garage;
  END IF;
  IF to_regclass('public.workshop_consent') IS NOT NULL AND to_regclass('public.garage_consent') IS NULL THEN
    ALTER TABLE workshop_consent RENAME TO garage_consent;
  END IF;
  IF to_regclass('public.workshop_verification') IS NOT NULL AND to_regclass('public.garage_verification') IS NULL THEN
    ALTER TABLE workshop_verification RENAME TO garage_verification;
  END IF;
  IF to_regclass('public.workshop_service_category') IS NOT NULL AND to_regclass('public.garage_service_category') IS NULL THEN
    ALTER TABLE workshop_service_category RENAME TO garage_service_category;
  END IF;
  IF to_regclass('public.workshop_vehicle_make') IS NOT NULL AND to_regclass('public.garage_vehicle_make') IS NULL THEN
    ALTER TABLE workshop_vehicle_make RENAME TO garage_vehicle_make;
  END IF;
  IF to_regclass('public.workshop_verification_document') IS NOT NULL AND to_regclass('public.garage_verification_document') IS NULL THEN
    ALTER TABLE workshop_verification_document RENAME TO garage_verification_document;
  END IF;
  IF to_regclass('public.workshop_photo') IS NOT NULL AND to_regclass('public.garage_photo') IS NULL THEN
    ALTER TABLE workshop_photo RENAME TO garage_photo;
  END IF;
  IF to_regclass('public.workshop_review') IS NOT NULL AND to_regclass('public.garage_review') IS NULL THEN
    ALTER TABLE workshop_review RENAME TO garage_review;
  END IF;
  IF to_regclass('public.review_workshop_response') IS NOT NULL AND to_regclass('public.review_garage_response') IS NULL THEN
    ALTER TABLE review_workshop_response RENAME TO review_garage_response;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membership' AND column_name = 'workshop_id') THEN
    ALTER TABLE membership RENAME COLUMN workshop_id TO garage_id;
  END IF;
  FOREACH _table IN ARRAY ARRAY['garage_consent','garage_verification','garage_service_category','garage_vehicle_make','garage_verification_document','garage_photo','garage_review','review_garage_response']
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = _table AND column_name = 'workshop_id') THEN
      EXECUTE format('ALTER TABLE %I RENAME COLUMN workshop_id TO garage_id', _table);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'visit_evidence' AND column_name = 'workshop_matches') THEN
    ALTER TABLE visit_evidence RENAME COLUMN workshop_matches TO garage_matches;
  END IF;

END $$;

-- Views are derived read models. Recreate them under their new public names after every source
-- table and key column has moved; no profile, review, or evidence row is deleted.
DROP VIEW IF EXISTS public_review_workshop_response;
DROP VIEW IF EXISTS public_review_garage_response;
DROP VIEW IF EXISTS public_review_update;
DROP VIEW IF EXISTS public_workshop_review_summary;
DROP VIEW IF EXISTS public_garage_review_summary;
DROP VIEW IF EXISTS public_workshop_review;
DROP VIEW IF EXISTS public_garage_review;
DROP VIEW IF EXISTS public_workshop_profile;
DROP VIEW IF EXISTS public_garage_profile;

DO $$
BEGIN
  IF to_regclass('public.garage') IS NOT NULL THEN
    ALTER TABLE garage RENAME CONSTRAINT workshop_publication_state_check TO garage_publication_state_check;
  END IF;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Renaming the enum value is explicit: old proof records continue to mean the same thing.
DO $$
BEGIN
  ALTER TABLE visit_evidence DROP CONSTRAINT IF EXISTS visit_evidence_evidence_kind_check;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
UPDATE visit_evidence SET evidence_kind = 'garage_confirmation' WHERE evidence_kind = 'workshop_confirmation';
DO $$
BEGIN
  ALTER TABLE visit_evidence
    ADD CONSTRAINT visit_evidence_evidence_kind_check
    CHECK (evidence_kind IN ('invoice','work_order','payment_confirmation','garage_confirmation','other_service_proof'));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

UPDATE moderation_case SET subject_type = 'garage_profile' WHERE subject_type = 'workshop_profile';
ALTER TABLE moderation_case DROP CONSTRAINT IF EXISTS moderation_case_subject_type_check;
ALTER TABLE moderation_case
  ADD CONSTRAINT moderation_case_subject_type_check
  CHECK (subject_type IN ('review','garage_profile','data_deletion'));

UPDATE public_analytics_daily_count SET event_name = 'garage_profile_opened' WHERE event_name = 'workshop_profile_opened';
ALTER TABLE public_analytics_daily_count DROP CONSTRAINT IF EXISTS public_analytics_daily_count_event_name_check;
ALTER TABLE public_analytics_daily_count
  ADD CONSTRAINT public_analytics_daily_count_event_name_check
  CHECK (event_name IN ('search_started','search_results_displayed','garage_profile_opened','contact_channel_opened'));

UPDATE local_demo_seed_entity SET entity_type = 'garage_review' WHERE entity_type = 'workshop_review';
ALTER TABLE local_demo_seed_entity DROP CONSTRAINT IF EXISTS local_demo_seed_entity_entity_type_check;
ALTER TABLE local_demo_seed_entity
  ADD CONSTRAINT local_demo_seed_entity_entity_type_check
  CHECK (entity_type IN ('app_user','file_object','repair_request','request_search_area','visit_evidence','garage_review'));

UPDATE moderation_event SET event_type = replace(event_type, 'workshop-', 'garage-') WHERE event_type LIKE 'workshop-%';
UPDATE moderation_case SET subject_id = substring(subject_id FROM 10) WHERE subject_id LIKE 'workshop:%';

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
  place.point AS place_point, place.label AS place_label,
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

CREATE OR REPLACE VIEW public_garage_review AS
SELECT review.id, review.garage_id, review.service_category_id, review.vehicle_make_id,
  review.visit_month, review.work_quality, review.communication, review.price_transparency,
  review.punctuality, review.overall_rating, review.review_text, review.published_at,
  'Besuch belegt'::text AS evidence_label
FROM garage_review AS review
JOIN visit_evidence AS evidence ON evidence.review_id = review.id
WHERE review.publication_state = 'published'
  AND evidence.verification_state IN ('verified','deleted_after_retention');

CREATE OR REPLACE VIEW public_garage_review_summary AS
SELECT garage_id, count(*)::integer AS review_count,
  round(avg(overall_rating), 1)::numeric(2, 1) AS average_rating,
  max(visit_month) AS latest_visit_month, count(*)::integer AS verified_visit_count
FROM public_garage_review GROUP BY garage_id;

CREATE OR REPLACE VIEW public_review_garage_response AS
SELECT response.review_id, response.response_text, response.created_at
FROM review_garage_response AS response
JOIN public_garage_review AS review ON review.id = response.review_id;

CREATE OR REPLACE VIEW public_review_update AS
SELECT update_entry.id, update_entry.review_id, update_entry.update_kind, update_entry.update_text,
  update_entry.created_at
FROM review_update AS update_entry
JOIN public_garage_review AS review ON review.id = update_entry.review_id;

DROP FUNCTION IF EXISTS invalidate_workshop_location_check();
CREATE OR REPLACE FUNCTION invalidate_garage_location_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.place_id IS DISTINCT FROM NEW.place_id
    OR OLD.business_address IS DISTINCT FROM NEW.business_address
    OR OLD.location_point::text IS DISTINCT FROM NEW.location_point::text THEN
    UPDATE garage_verification SET location_state = 'not_checked', checked_by_user_id = NULL, checked_at = NULL
    WHERE garage_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS workshop_location_change ON garage;
DROP TRIGGER IF EXISTS garage_location_change ON garage;
CREATE TRIGGER garage_location_change AFTER UPDATE ON garage
  FOR EACH ROW EXECUTE FUNCTION invalidate_garage_location_check();
