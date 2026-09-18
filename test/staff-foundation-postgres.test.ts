import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { AccessStore, type Principal } from '../src/server/access';
import { createServer } from '../src/server/app';
import { PostgresModerationStore } from '../src/server/moderation-store';
import { PostgresReviewStore } from '../src/server/review-store';
import { LocalDemoFileStore } from '../src/server/local-demo-files';
import type { StaffQueuePage } from '../src/shared/moderation';
import { seedDatabase } from '../scripts/db/seed-data.mjs';
const databaseUrl = process.env['DATABASE_URL'];
function principal(userId: string, role: 'admin' | 'moderator' | 'customer'): Principal {
  return {
    userId,
    roles: new Set([role]),
    sessionId: 'session-' + userId,
    csrfToken: 'synthetic-test-csrf',
  };
}

test(
  'staff foundation: actual RLS, assignment, escalation, private files, stale writes and durable seed',
  { skip: !databaseUrl, timeout: 30000 },
  async () => {
    const schema = 'staff_test_' + randomUUID().replaceAll('-', '');
    const role = schema + '_runtime';
    const root = new pg.Client({ connectionString: databaseUrl });
    await root.connect();
    const source = new URL(databaseUrl!);
    source.searchParams.set('options', '-csearch_path=' + schema + ',public');
    const seed = new pg.Client({ connectionString: source.toString() });
    let store: PostgresModerationStore | undefined,
      reviews: PostgresReviewStore | undefined,
      files: LocalDemoFileStore | undefined;
    try {
      await root.query(`CREATE SCHEMA ${schema}`);
      await seed.connect();
      const directory = new URL('../db/migrations/', import.meta.url);
      for (const file of (await readdir(directory)).filter((f) => f.endsWith('.sql')).sort()) {
        const sql = (await readFile(new URL(file, directory), 'utf8')).replaceAll(
          "'public.",
          "'" + schema + '.',
        );
        await seed.query(sql);
      }
      const env = {
        NODE_ENV: 'test',
        AUTOKOSOVA_DEMO_MODERATOR_SUBJECT: 'staff-test-moderator',
        AUTOKOSOVA_DEMO_ADMIN_SUBJECT: 'staff-test-admin',
      };
      await seedDatabase(seed, 'demo', env);
      await root.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOBYPASSRLS`);
      await root.query(`GRANT USAGE ON SCHEMA ${schema},public TO ${role}`);
      await root.query(
        `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${role}`,
      );
      await root.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${role}`);
      source.searchParams.set('options', '-csearch_path=' + schema + ',public -crole=' + role);
      store = new PostgresModerationStore(source.toString());
      reviews = new PostgresReviewStore(source.toString());
      await store.recordVerifiedIdentity('staff-test-admin', ['admin'], {
        displayName: 'DEMO Admin',
      });
      await store.recordVerifiedIdentity('staff-test-moderator', ['moderator'], {
        displayName: 'DEMO Moderator',
      });
      await store.recordVerifiedIdentity('staff-test-other', ['moderator'], {
        displayName: 'DEMO Other Moderator',
      });
      const admin = principal('staff-test-admin', 'admin'),
        moderator = principal('staff-test-moderator', 'moderator'),
        other = principal('staff-test-other', 'moderator');
      const id = 'review:demo-staff-review-unassigned';
      const unassignedTodo = await store.listStaffCases(admin, { queue: 'todo', unassigned: true });
      assert.ok(unassignedTodo.cases.some((c) => c.id === id));
      assert.ok(
        unassignedTodo.cases.every(
          (c) =>
            c.assignedModeratorUserId === undefined &&
            !c.escalation &&
            ['submitted', 'assigned'].includes(c.status) &&
            ['report', 'review_submission'].includes(c.kind),
        ),
      );
      await assert.rejects(store.listStaffCases(moderator, { unassigned: true }));
      const mine = await store.listStaffCases(moderator, {});
      assert.ok(mine.cases.some((c) => c.id === 'review:demo-staff-review-assigned'));
      assert.ok(
        !mine.cases.some((c) => c.id === id || c.id === 'review:demo-staff-review-foreign'),
      );
      await assert.rejects(store.getStaffCase(moderator, id));
      await assert.rejects(store.listStaffCases(principal('any-customer', 'customer'), {}));
      const before = await store.getStaffCase(admin, id);
      await assert.rejects(
        store.assignStaffCase(admin, id, {
          moderatorUserId: 'unknown-user',
          revision: before.revision,
        }),
      );
      await store.assignStaffCase(admin, id, {
        moderatorUserId: moderator.userId,
        revision: before.revision,
      });
      await assert.rejects(
        store.assignStaffCase(admin, id, {
          moderatorUserId: other.userId,
          revision: before.revision,
        }),
      );
      const assigned = await store.getStaffCase(moderator, id);
      assert.equal(assigned.canEscalate, true);
      assert.equal(assigned.assignedModeratorLabel, 'DEMO Moderator');
      assert.equal((await store.getStaffCase(admin, id)).assignedModeratorLabel, 'DEMO Moderator');
      assert.equal(assigned.assignedModeratorUserId, moderator.userId);
      assert.equal(assigned.review?.text.startsWith('DEMO'), true);
      files = new LocalDemoFileStore(source.toString(), {
        NODE_ENV: 'test',
        AUTOKOSOVA_LOCAL_DEMO_FILES: '1',
      });
      const file = 'demo-staff-review-unassigned-file';
      const grant = await files.issue(moderator, file);
      await assert.rejects(files.consume(other, file, grant.grantId));
      assert.match(
        await files.consume(moderator, file, grant.grantId),
        /Fiktiver/,
      );
      await assert.rejects(files.consume(moderator, file, grant.grantId));
      await assert.rejects(files.issue(moderator, 'demo-staff-review-blocked-file'));
      const prior = await files.issue(moderator, file);
      await store.escalateStaffCase(moderator, id, {
        reason: 'requires_admin',
        revision: assigned.revision,
      });
      await assert.rejects(files.consume(moderator, file, prior.grantId));
      await assert.rejects(store.getStaffCase(moderator, id));
      assert.ok(
        (await store.listStaffCases(admin, { escalated: true })).cases.some((c) => c.id === id),
      );
      assert.ok(
        (await store.listStaffCases(admin, { queue: 'todo', escalated: true })).cases.some(
          (c) => c.id === id,
        ),
      );
      const escalated = await store.getStaffCase(admin, id);
      assert.equal(escalated.escalation?.reason, 'requires_admin');
      assert.equal(escalated.assignedModeratorUserId, undefined);
      // Durable seed: an escalated/modified case is not assigned back or republished.
      await seedDatabase(seed, 'demo', env);
      assert.deepEqual(await store.getStaffCase(admin, id), escalated);
      await store.assignStaffCase(admin, id, {
        moderatorUserId: other.userId,
        revision: escalated.revision,
      });
      await assert.rejects(store.getStaffCase(moderator, id));
      const assignedOther = await store.getStaffCase(other, id);
      assert.equal(assignedOther.review?.publicationState, 'under_review');
      // Removed roles invalidate a principal that was captured before the verified change.
      await store.recordVerifiedIdentity(other.userId, [], { displayName: 'DEMO Other Moderator' });
      await assert.rejects(store.getStaffCase(other, id));
      await assert.rejects(
        reviews.issueEvidenceDownloadGrant(other, 'demo-staff-review-unassigned'),
      );
      await store.recordVerifiedIdentity(other.userId, ['moderator'], {
        displayName: 'DEMO Other Moderator',
      });
      // Negative proof can never become published even if all browser checkboxes are selected.
      await assert.rejects(
        reviews.decideReview(moderator, 'demo-staff-review-blocked', {
          decision: 'published',
          checklist: { garageMatches: true, serviceMatches: true, visitMonthMatches: true },
        }),
      );
      await reviews.decideReview(other, 'demo-staff-review-unassigned', {
        decision: 'published',
        checklist: { garageMatches: true, serviceMatches: true, visitMonthMatches: true },
      });
      assert.equal((await store.getStaffCase(admin, id)).status, 'resolved');
      // Synthetic content deleted deliberately is not resurrected by subsequent demo starts.
      await seed.query(
        "DELETE FROM review_moderator_assignment WHERE review_id='demo-staff-review-mismatch'",
      );
      await seed.query("DELETE FROM visit_evidence WHERE review_id='demo-staff-review-mismatch'");
      await seed.query("DELETE FROM moderation_case WHERE id='review:demo-staff-review-mismatch'");
      await seed.query("DELETE FROM garage_review WHERE id='demo-staff-review-mismatch'");
      await seed.query("DELETE FROM file_object WHERE id='demo-staff-review-mismatch-file'");
      await seedDatabase(seed, 'demo', env);
      assert.equal(
        (await seed.query("SELECT 1 FROM garage_review WHERE id='demo-staff-review-mismatch'"))
          .rowCount,
        0,
      );
      assert.equal(
        (await seed.query("SELECT 1 FROM file_object WHERE id='demo-staff-review-mismatch-file'"))
          .rowCount,
        0,
      );
      // The proof/identity lock policies must not allow role escalation or proof mutation.
      const runtime = new pg.Client({ connectionString: source.toString() });
      await runtime.connect();
      try {
        await runtime.query('BEGIN');
        await runtime.query(
          "SELECT set_config('app.user_id',$1,true),set_config('app.system_role','moderator',true)",
          [moderator.userId],
        );
        await assert.rejects(
          runtime.query(
            "UPDATE staff_identity SET verified_roles=ARRAY['admin'] WHERE user_id=$1",
            [moderator.userId],
          ),
        );
        await runtime.query('ROLLBACK');
      } finally {
        await runtime.end();
      }
      // Request schemas, CSRF and nonstaff rejection use actual Fastify routes and this database.
      const access = new AccessStore();
      access.addRole(admin.userId, 'admin');
      access.addRole(moderator.userId, 'moderator');
      const a = access.createSession(admin.userId),
        m = access.createSession(moderator.userId),
        c = access.createSession('ordinary-customer');
      const app = createServer({
        accessStore: access,
        moderationStore: store,
        reviewStore: reviews,
        localDemoFiles: files,
      });
      const headers = (session: { sessionId: string; csrfToken: string }, write = false) => ({
        cookie: `autokosova_session=${session.sessionId}; autokosova_csrf=${session.csrfToken}`,
        ...(write ? { 'x-csrf-token': session.csrfToken } : {}),
      });
      try {
        assert.equal((await app.inject({ url: '/api/staff/cases' })).statusCode, 401);
        assert.equal(
          (await app.inject({ url: '/api/staff/cases', headers: headers(c) })).statusCode,
          403,
        );
        assert.equal(
          (await app.inject({ url: '/api/staff/cases?page=-1', headers: headers(a) })).statusCode,
          400,
        );
        const res = await app.inject({ url: '/api/staff/cases', headers: headers(m) });
        assert.equal(res.statusCode, 200);
        assert.match(res.headers['cache-control']!, /no-store/);
        const unassigned = await app.inject({
          url: '/api/staff/cases?queue=todo&unassigned=true',
          headers: headers(a),
        });
        assert.equal(unassigned.statusCode, 200);
        assert.ok(
          unassigned
            .json<StaffQueuePage>()
            .cases.every((c) => !c.assignedModeratorUserId && !c.escalation),
        );
        assert.equal(
          (
            await app.inject({
              url: '/api/staff/cases?unassigned=true',
              headers: headers(m),
            })
          ).statusCode,
          403,
        );
        assert.equal(
          (
            await app.inject({
              method: 'POST',
              url:
                '/api/staff/cases/' +
                encodeURIComponent('review:demo-staff-review-assigned') +
                '/escalate',
              headers: headers(m),
              payload: { reason: 'requires_admin', revision: 1 },
            })
          ).statusCode,
          403,
        );
      } finally {
        await app.close();
        store = undefined;
        reviews = undefined;
        files = undefined;
      }
    } catch (error) {
      console.error('Staff integration error:', error);
      throw error;
    } finally {
      await files?.close();
      await reviews?.close();
      await store?.close();
      await seed.end();
      await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      try {
        await root.query(`REVOKE USAGE ON SCHEMA public FROM ${role}`);
        await root.query(`DROP ROLE IF EXISTS ${role}`);
      } finally {
        await root.end();
      }
    }
  },
);
