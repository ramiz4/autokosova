CREATE TABLE IF NOT EXISTS app_user (
  id text PRIMARY KEY,
  oidc_subject text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workshop (
  id text PRIMARY KEY,
  publication_state text NOT NULL CHECK (publication_state IN ('draft', 'published', 'suspended')),
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS membership (
  user_id text NOT NULL REFERENCES app_user(id),
  workshop_id text NOT NULL REFERENCES workshop(id),
  role text NOT NULL CHECK (role IN ('editor', 'owner')),
  state text NOT NULL CHECK (state IN ('active', 'revoked')),
  granted_by text NOT NULL REFERENCES app_user(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, workshop_id)
);

CREATE TABLE IF NOT EXISTS vehicle (
  id text PRIMARY KEY,
  owner_user_id text NOT NULL REFERENCES app_user(id),
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS repair_request (
  id text PRIMARY KEY,
  owner_user_id text NOT NULL REFERENCES app_user(id),
  vehicle_id text REFERENCES vehicle(id),
  description text,
  travel_window tstzrange,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS file_object (
  id text PRIMARY KEY,
  owner_user_id text NOT NULL REFERENCES app_user(id),
  storage_key text NOT NULL UNIQUE,
  content_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  scan_state text NOT NULL CHECK (scan_state IN ('pending', 'clean', 'rejected', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS moderation_event (
  id text PRIMARY KEY,
  actor_user_id text NOT NULL REFERENCES app_user(id),
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  event_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vehicle ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_object ENABLE ROW LEVEL SECURITY;

CREATE POLICY vehicle_owner ON vehicle
  USING (owner_user_id = current_setting('app.user_id', true));

CREATE POLICY repair_request_owner ON repair_request
  USING (owner_user_id = current_setting('app.user_id', true));

CREATE POLICY file_object_owner ON file_object
  USING (owner_user_id = current_setting('app.user_id', true));
