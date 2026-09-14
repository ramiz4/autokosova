CREATE TABLE garage_favorite (
  owner_user_id text NOT NULL REFERENCES app_user(id),
  garage_id text NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_user_id, garage_id)
);
ALTER TABLE garage_favorite ENABLE ROW LEVEL SECURITY;
CREATE POLICY garage_favorite_owner ON garage_favorite
  USING (owner_user_id = current_setting('app.user_id', true))
  WITH CHECK (owner_user_id = current_setting('app.user_id', true));
