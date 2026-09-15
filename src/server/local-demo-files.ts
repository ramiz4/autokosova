import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { AccessError, type Principal, type FileGrant } from './access';
import { assertCurrentStaffIdentity } from './staff-identity';
import { staffDemoFixtures } from '../../db/staff-demo-data.mjs';

interface Grant {
  readonly fileId: string;
  readonly sessionId: string;
  readonly expires: number;
}
/** Only allowlisted, versioned fictitious bytes; not an upload store or a scanner. */
export class LocalDemoFileStore {
  private readonly pool: pg.Pool;
  private readonly grants = new Map<string, Grant>();
  constructor(databaseUrl: string, environment: NodeJS.ProcessEnv = process.env) {
    const target = new URL(databaseUrl);
    if (
      environment['NODE_ENV'] === 'production' ||
      environment['AUTOKOSOVA_LOCAL_DEMO_FILES'] !== '1' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
      decodeURIComponent(target.pathname) !== '/autokosova'
    )
      throw new Error('Local demo files require an explicitly enabled local test database');
    this.pool = new pg.Pool({ connectionString: databaseUrl });
  }
  async close(): Promise<void> {
    this.grants.clear();
    await this.pool.end();
  }
  async issue(
    principal: Principal,
    fileId: string,
  ): Promise<FileGrant & { readonly localFixture: true }> {
    await this.read(principal, fileId);
    const now = Date.now();
    for (const [id, grant] of this.grants) if (grant.expires <= now) this.grants.delete(id);
    if (this.grants.size >= 2048) throw new AccessError(429, 'Too many pending file grants');
    const grantId = randomUUID(),
      expires = now + 60_000;
    this.grants.set(grantId, { fileId, sessionId: principal.sessionId, expires });
    return { fileId, grantId, expiresAt: new Date(expires).toISOString(), localFixture: true };
  }
  async consume(principal: Principal, fileId: string, grantId: string): Promise<string> {
    const grant = this.grants.get(grantId);
    if (
      !grant ||
      grant.fileId !== fileId ||
      grant.sessionId !== principal.sessionId ||
      grant.expires <= Date.now()
    )
      throw new AccessError(404, 'Private demo file not found');
    this.grants.delete(grantId);
    // Re-read authorization at redemption. A valid old grant never preserves revoked access.
    return this.read(principal, fileId);
  }
  private async read(principal: Principal, fileId: string): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        "SELECT set_config('app.user_id',$1,true),set_config('app.system_role',$2,true)",
        [
          principal.userId,
          principal.roles.has('admin')
            ? 'admin'
            : principal.roles.has('moderator')
              ? 'moderator'
              : '',
        ],
      );
      await assertCurrentStaffIdentity(client, principal);
      const result = await client.query<{ fixture_key: string }>(
        `SELECT fixture.fixture_key FROM local_demo_file_fixture fixture
        JOIN file_object f ON f.id=fixture.file_id
        WHERE f.id=$1 AND f.scan_state='clean' AND f.retention_state='active'
          AND (f.owner_user_id=$2 OR $3::boolean OR
            ($4::boolean AND EXISTS(SELECT 1 FROM visit_evidence e WHERE e.private_file_id=f.id AND staff_assigned_subject('review',e.review_id))))`,
        [fileId, principal.userId, principal.roles.has('admin'), principal.roles.has('moderator')],
      );
      const key = result.rows[0]?.fixture_key;
      if (!key || !Object.hasOwn(staffDemoFixtures, key))
        throw new AccessError(404, 'Private demo file not found');
      if (key === 'company-valid' && !principal.roles.has('admin')) {
        const own = await client.query(
          'SELECT 1 FROM file_object WHERE id=$1 AND owner_user_id=$2',
          [fileId, principal.userId],
        );
        if (!own.rowCount) throw new AccessError(404, 'Private demo file not found');
      }
      await client.query('COMMIT');
      return staffDemoFixtures[key as keyof typeof staffDemoFixtures];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
