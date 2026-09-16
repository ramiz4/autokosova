import type pg from 'pg';
import type { AccountProfile } from '../shared/account';
import { AccessError, type Principal } from './access';

/** Only call after the normal OIDC signature/issuer/audience/nonce checks, never from a request body. */
export async function recordVerifiedStaffIdentity(
  client: pg.PoolClient,
  userId: string,
  roles: readonly ('admin' | 'moderator')[],
  profile: AccountProfile,
): Promise<void> {
  await client.query(
    "SELECT set_config('app.user_id',$1,true), set_config('app.identity_sync','verified_oidc',true)",
    [userId],
  );
  await client.query(
    "INSERT INTO app_user(id,oidc_subject,status) VALUES($1,$1,'active') ON CONFLICT(id) DO NOTHING",
    [userId],
  );
  const user = await client.query('SELECT status FROM app_user WHERE id=$1 FOR UPDATE', [userId]);
  if (user.rows[0]?.status !== 'active') throw new AccessError(403, 'Account is not active');
  const label =
    (profile.displayName || profile.username || 'Mitarbeitende').trim().slice(0, 200) ||
    'Mitarbeitende';
  await client.query(
    `INSERT INTO staff_identity(user_id,display_name,verified_roles) VALUES($1,$2,$3)
    ON CONFLICT(user_id) DO UPDATE SET display_name=EXCLUDED.display_name,
      verified_roles=EXCLUDED.verified_roles,verified_at=now()`,
    [userId, label, [...new Set(roles)]],
  );
}

/** The directory is a mirror of verified claims, not a local role editor or a seed privilege. */
export async function assertStaffCandidate(client: pg.PoolClient, userId: string): Promise<void> {
  const result = await client.query(
    `SELECT 1 FROM staff_identity s JOIN app_user u ON u.id=s.user_id
    WHERE s.user_id=$1 AND u.status='active' AND s.verified_roles && ARRAY['moderator','admin']::text[] FOR SHARE OF s,u`,
    [userId],
  );
  if (!result.rowCount)
    throw new AccessError(422, 'A case can only be assigned to verified moderation staff');
}

export async function assertCurrentStaffIdentity(
  client: pg.PoolClient,
  principal: Principal,
): Promise<void> {
  if (!principal.roles.has('admin') && !principal.roles.has('moderator')) return;
  const result = await client.query(
    `SELECT s.verified_roles FROM staff_identity s JOIN app_user u ON u.id=s.user_id
    WHERE s.user_id=$1 AND u.status='active' FOR SHARE OF s,u`,
    [principal.userId],
  );
  const roles: string[] = result.rows[0]?.verified_roles ?? [];
  const needed = principal.roles.has('admin') ? 'admin' : 'moderator';
  if (!roles.includes(needed))
    throw new AccessError(403, 'Staff permission was withdrawn or has not been verified');
}
