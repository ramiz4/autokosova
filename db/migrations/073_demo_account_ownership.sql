-- Account purpose is not a system privilege. Object access still requires ownership/membership.
ALTER TABLE app_user ADD COLUMN account_type text NOT NULL DEFAULT 'customer'
  CHECK (account_type IN ('customer', 'garage'));
UPDATE app_user SET account_type='garage' WHERE id IN
  (SELECT user_id FROM membership WHERE state='active');

-- A deletion hides the business without destroying independently owned reviews or evidence.
ALTER TABLE garage ADD COLUMN deleted_at timestamptz;
ALTER TABLE garage ADD CONSTRAINT garage_deleted_is_unpublished
  CHECK (deleted_at IS NULL OR publication_state='suspended');

-- Local-only bindings are populated exclusively by the explicitly authorized workflow seed.
CREATE TABLE local_demo_account_binding (
  account_type text PRIMARY KEY CHECK (account_type IN ('customer', 'garage')),
  user_id text NOT NULL UNIQUE REFERENCES app_user(id),
  oidc_issuer text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Keep provenance after a request is deleted: a restart must not resurrect it.
CREATE TABLE local_demo_account_entity (
  entity_type text NOT NULL CHECK (entity_type IN ('garage', 'repair_request')),
  entity_id text NOT NULL,
  account_type text NOT NULL REFERENCES local_demo_account_binding(account_type),
  PRIMARY KEY (entity_type, entity_id)
);
