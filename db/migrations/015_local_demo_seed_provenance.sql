-- Local demo seeds may update only rows that this seed already created. The table remains empty in
-- every non-demo environment and prevents a stable demo ID from overwriting a manually created row.
CREATE TABLE IF NOT EXISTS local_demo_seed_workshop (
  workshop_id text PRIMARY KEY REFERENCES workshop(id) ON DELETE CASCADE,
  seed_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
