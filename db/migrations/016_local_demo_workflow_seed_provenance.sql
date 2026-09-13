-- Workflow demo rows remain local-only. Their provenance prevents a stable fixture ID from
-- overwriting a manually created local entity when the explicit workflow profile runs again.
CREATE TABLE IF NOT EXISTS local_demo_seed_entity (
  entity_type text NOT NULL CHECK (
    entity_type IN (
      'app_user', 'file_object', 'repair_request', 'request_search_area',
      'visit_evidence', 'workshop_review'
    )
  ),
  entity_id text NOT NULL,
  seed_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_type, entity_id)
);
