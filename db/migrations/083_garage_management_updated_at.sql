-- The private garage-management list sorts on an honest business timestamp.
-- A database trigger covers profile edits, publication decisions and soft deletion alike.
ALTER TABLE garage ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION garage_management_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER garage_management_updated_at
  BEFORE UPDATE ON garage
  FOR EACH ROW EXECUTE FUNCTION garage_management_updated_at();
