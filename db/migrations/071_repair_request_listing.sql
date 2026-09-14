-- Owner-bound keyset pagination for private saved inquiries; no change to RLS or request state.
CREATE INDEX repair_request_owner_created_id_idx
  ON repair_request (owner_user_id, created_at DESC, id DESC);
