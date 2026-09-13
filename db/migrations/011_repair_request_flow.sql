ALTER TABLE vehicle ADD COLUMN IF NOT EXISTS manufacture_year smallint;
ALTER TABLE vehicle ADD COLUMN IF NOT EXISTS engine_details text;
ALTER TABLE vehicle ADD COLUMN IF NOT EXISTS transmission_details text;
ALTER TABLE vehicle ADD COLUMN IF NOT EXISTS mileage_km integer;

ALTER TABLE vehicle
  ADD CONSTRAINT vehicle_manufacture_year_range_check
  CHECK (manufacture_year IS NULL OR manufacture_year BETWEEN 1886 AND 2100);
ALTER TABLE vehicle
  ADD CONSTRAINT vehicle_mileage_range_check
  CHECK (mileage_km IS NULL OR mileage_km BETWEEN 0 AND 2000000);

ALTER TABLE repair_request
  ADD COLUMN IF NOT EXISTS service_category_id text REFERENCES service_category(id);
ALTER TABLE repair_request ADD COLUMN IF NOT EXISTS symptom text;
ALTER TABLE repair_request ADD COLUMN IF NOT EXISTS earliest_dropoff_on date;
ALTER TABLE repair_request ADD COLUMN IF NOT EXISTS stay_ends_on date;
ALTER TABLE repair_request ADD COLUMN IF NOT EXISTS latest_pickup_on date;
ALTER TABLE repair_request
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'draft'
  CHECK (state IN ('draft', 'matching'));

ALTER TABLE repair_request
  ADD CONSTRAINT repair_request_travel_date_order_check
  CHECK (
    earliest_dropoff_on IS NULL
    OR latest_pickup_on IS NULL
    OR stay_ends_on IS NULL
    OR (earliest_dropoff_on <= latest_pickup_on AND latest_pickup_on <= stay_ends_on)
  );

CREATE TABLE request_search_area (
  id text PRIMARY KEY,
  repair_request_id text NOT NULL REFERENCES repair_request(id),
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 3),
  place_id text NOT NULL REFERENCES place(id),
  radius_m integer NOT NULL CHECK (radius_m BETWEEN 5000 AND 100000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (repair_request_id, place_id),
  UNIQUE (repair_request_id, position)
);

CREATE TABLE repair_request_attachment (
  repair_request_id text NOT NULL REFERENCES repair_request(id),
  file_id text NOT NULL REFERENCES file_object(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (repair_request_id, file_id)
);

ALTER TABLE request_search_area ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_request_attachment ENABLE ROW LEVEL SECURITY;

CREATE POLICY request_search_area_owner ON request_search_area
  USING (
    EXISTS (
      SELECT 1
      FROM repair_request
      WHERE repair_request.id = request_search_area.repair_request_id
        AND repair_request.owner_user_id = current_setting('app.user_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM repair_request
      WHERE repair_request.id = request_search_area.repair_request_id
        AND repair_request.owner_user_id = current_setting('app.user_id', true)
    )
  );

CREATE POLICY repair_request_attachment_owner ON repair_request_attachment
  USING (
    EXISTS (
      SELECT 1
      FROM repair_request
      WHERE repair_request.id = repair_request_attachment.repair_request_id
        AND repair_request.owner_user_id = current_setting('app.user_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM repair_request
      JOIN file_object ON file_object.id = repair_request_attachment.file_id
      WHERE repair_request.id = repair_request_attachment.repair_request_id
        AND repair_request.owner_user_id = current_setting('app.user_id', true)
        AND file_object.owner_user_id = current_setting('app.user_id', true)
    )
  );
