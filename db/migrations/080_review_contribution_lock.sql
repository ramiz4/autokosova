-- Serialize a public contribution with staff decisions, in the same case-before-review lock order.
-- The function returns no private fields and never grants direct UPDATE rights on the review.
CREATE FUNCTION review_lock_contribution(review_key text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE garage_key text;
BEGIN
  SELECT r.garage_id INTO garage_key FROM garage_review r WHERE r.id=review_key
    AND r.publication_state='published' AND (r.author_user_id=current_setting('app.user_id',true)
      OR EXISTS(SELECT 1 FROM membership m WHERE m.garage_id=r.garage_id
        AND m.user_id=current_setting('app.user_id',true) AND m.state='active'));
  IF garage_key IS NULL THEN RETURN false; END IF;
  PERFORM 1 FROM moderation_case WHERE id='review:'||review_key FOR UPDATE;
  PERFORM 1 FROM garage_review WHERE id=review_key AND publication_state='published' FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN review_lock_public_garage(garage_key);
END;
$$;
