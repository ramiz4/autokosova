-- Private organization state, independent of the legacy draft/matching workflow.
ALTER TABLE repair_request ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE repair_request ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0);
ALTER TABLE repair_request ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE repair_request SET updated_at = created_at;
CREATE INDEX repair_request_owner_activity_created_idx
  ON repair_request (owner_user_id, active, created_at DESC, id DESC);
