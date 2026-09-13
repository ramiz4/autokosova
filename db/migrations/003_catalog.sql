CREATE TABLE IF NOT EXISTS service_category (
  id text PRIMARY KEY,
  label_de text NOT NULL,
  label_sq text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  retired_at timestamptz
);

CREATE TABLE IF NOT EXISTS vehicle_make (
  id text PRIMARY KEY,
  label text NOT NULL,
  retired_at timestamptz
);

CREATE TABLE IF NOT EXISTS place (
  id text PRIMARY KEY,
  geonames_id integer NOT NULL UNIQUE,
  label text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  country_code text NOT NULL CHECK (country_code = 'XK'),
  point geography(Point, 4326) NOT NULL,
  source_name text NOT NULL,
  source_url text NOT NULL,
  source_license text NOT NULL,
  source_checked_at date NOT NULL,
  retired_at timestamptz
);

CREATE INDEX IF NOT EXISTS place_point_gist_idx ON place USING GIST (point);

ALTER TABLE vehicle ADD COLUMN IF NOT EXISTS make_id text REFERENCES vehicle_make(id);
ALTER TABLE vehicle ADD COLUMN IF NOT EXISTS model text;

ALTER TABLE vehicle ADD CONSTRAINT vehicle_model_length_check CHECK (char_length(model) <= 120);
