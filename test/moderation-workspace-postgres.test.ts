import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { AccessStore, type Principal } from '../src/server/access';
import { PostgresModerationStore } from '../src/server/moderation-store';
import { PostgresReviewStore } from '../src/server/review-store';
import { LocalDemoFileStore } from '../src/server/local-demo-files';
import { createServer } from '../src/server/app';
import { seedDatabase } from '../scripts/db/seed-data.mjs';
import type { StaffCaseDecision } from '../src/shared/staff-decision';

const databaseUrl = process.env['DATABASE_URL'];
const checklist = { garageMatches: true, serviceMatches: true, visitMonthMatches: true };
const principal = (userId: string, role: 'admin' | 'moderator' | 'customer'): Principal => ({
  userId,
  roles: new Set([role]),
  sessionId: 'test-session-' + userId,
  csrfToken: 'synthetic-csrf',
});

test(
  'moderation workspace: decisions, appeals, visibility, RLS, API boundaries and durable demo',
  { skip: !databaseUrl, timeout: 60000 },
  async () => {
    const source = new URL(databaseUrl!);
    assert.ok(['127.0.0.1', 'localhost'].includes(source.hostname));
    const schema = 'moderation_test_' + randomUUID().replaceAll('-', '');
    const runtimeRole = schema + '_runtime';
    const root = new pg.Client({ connectionString: source.href });
    await root.connect();
    await root.query(`CREATE SCHEMA ${schema}`);
    source.searchParams.set('options', '-csearch_path=' + schema + ',public');
    const seed = new pg.Client({ connectionString: source.href });
    await seed.connect();
    let runtimeCreated = false;
    let store: PostgresModerationStore | undefined,
      reviews: PostgresReviewStore | undefined,
      files: LocalDemoFileStore | undefined;
    try {
      const dir = new URL('../db/migrations/', import.meta.url);
      for (const name of (await readdir(dir)).filter((n) => n.endsWith('.sql')).sort())
        await seed.query(
          (await readFile(new URL(name, dir), 'utf8')).replaceAll("'public.", "'" + schema + '.'),
        );
      const env = {
        NODE_ENV: 'test',
        AUTOKOSOVA_DEMO_MODERATOR_SUBJECT: 'moderation-test-moderator',
        AUTOKOSOVA_DEMO_ADMIN_SUBJECT: 'moderation-test-admin',
      };
      await seedDatabase(seed, 'demo', env);
      await root.query(`CREATE ROLE ${runtimeRole} NOLOGIN NOSUPERUSER NOBYPASSRLS`);
      runtimeCreated = true;
      await root.query(`GRANT USAGE ON SCHEMA ${schema},public TO ${runtimeRole}`);
      await root.query(
        `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${runtimeRole}`,
      );
      await root.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${runtimeRole}`);
      source.searchParams.set(
        'options',
        '-csearch_path=' + schema + ',public -crole=' + runtimeRole,
      );
      store = new PostgresModerationStore(source.href);
      reviews = new PostgresReviewStore(source.href);
      files = new LocalDemoFileStore(source.href, {
        NODE_ENV: 'test',
        AUTOKOSOVA_LOCAL_DEMO_FILES: '1',
      });
      const admin = principal(env.AUTOKOSOVA_DEMO_ADMIN_SUBJECT, 'admin'),
        mod = principal(env.AUTOKOSOVA_DEMO_MODERATOR_SUBJECT, 'moderator'),
        other = principal('moderation-test-other', 'moderator'),
        author = principal('demo-staff-review-author', 'customer');
      for (const [person, label] of [
        [admin, 'Admin'],
        [mod, 'Moderator'],
        [other, 'Other'],
      ] as const)
        await store.recordVerifiedIdentity(
          person.userId,
          [person === admin ? 'admin' : 'moderator'],
          { displayName: 'DEMO ' + label },
        );
      const get = (id: string, person = mod) => store!.getStaffCase(person, id);
      const decide = async (
        id: string,
        input: Omit<StaffCaseDecision, 'revision'>,
        person = mod,
      ) => {
        const current = await get(id, person);
        await store!.decideStaffCase(person, id, {
          ...input,
          revision: current.revision,
        } as StaffCaseDecision);
      };
      const assigned = 'review:demo-staff-review-assigned';
      const before = await get(assigned);
      assert.ok(before.allowedActions?.includes('publish_review'));
      assert.equal(before.evidenceAvailable, true);
      await assert.rejects(store.getStaffCase(other, assigned));
      await assert.rejects(
        store.decideStaffCase(other, assigned, {
          action: 'publish_review',
          revision: before.revision,
          checklist,
        }),
      );
      await assert.rejects(
        store.decideStaffCase(mod, assigned, {
          action: 'publish_review',
          revision: before.revision,
          checklist: { ...checklist, garageMatches: false },
        }),
      );
      assert.equal((await get(assigned)).revision, before.revision);
      await store.decideStaffCase(mod, assigned, {
        action: 'publish_review',
        revision: before.revision,
        checklist,
      });
      assert.equal((await get(assigned)).status, 'resolved');
      assert.ok(
        (await reviews.listPublicReviews('demo-prishtina-bremsen-offen')).some(
          (r) =>
            r.id === 'demo-staff-review-assigned' &&
            r.ratings.workQuality === 2 &&
            r.text.includes('kritische'),
        ),
      );
      await assert.rejects(
        store.decideStaffCase(mod, assigned, {
          action: 'publish_review',
          revision: before.revision,
          checklist,
        }),
      );
      await assert.rejects(
        store.applyModerationAction(mod, assigned, {
          action: 'approve',
          reasonCode: 'no_violation',
        }),
      );
      const blocked = await get('review:demo-staff-review-blocked');
      assert.equal(blocked.evidenceAvailable, false);
      assert.ok(!blocked.allowedActions?.includes('publish_review'));
      await assert.rejects(
        store.decideStaffCase(mod, blocked.id, {
          action: 'publish_review',
          revision: blocked.revision,
          checklist,
        }),
      );
      await decide('review:demo-staff-review-mismatch', {
        action: 'request_information',
        reasonCode: 'missing_information',
      });
      assert.equal((await get('review:demo-staff-review-mismatch')).status, 'waiting_for_subject');
      await decide('review:demo-staff-review-mismatch', {
        action: 'reject_review',
        checklist: { ...checklist, garageMatches: false },
        rejectionReason: 'evidence_not_sufficient',
      } as Omit<StaffCaseDecision, 'revision'>);
      assert.equal(
        (await get('review:demo-staff-review-mismatch')).review?.evidenceStatus,
        'not_verified',
      );
      // Reconsideration may uphold a previous rejection without changing public state.
      await store.createAppeal(author, {
        caseId: 'review:demo-staff-review-mismatch',
        message: 'DEMO – Bitte diese Entscheidung durch eine andere Person prüfen.',
      });
      const appeal = await get('review:demo-staff-review-mismatch', admin);
      assert.deepEqual(appeal.appealContext, {
        originalDecision: 'rejected',
        originalReason: 'evidence_not_sufficient',
      });
      assert.match(JSON.stringify(appeal.appealContext), /evidence_not_sufficient/);
      await assert.rejects(
        store.assignStaffCase(admin, appeal.id, {
          moderatorUserId: mod.userId,
          revision: appeal.revision,
        }),
      );
      await store.assignStaffCase(admin, appeal.id, {
        moderatorUserId: other.userId,
        revision: appeal.revision,
      });
      assert.equal((await get(appeal.id, other)).review?.publicationState, 'rejected');
      await decide(
        appeal.id,
        { action: 'reject_review', checklist, rejectionReason: 'evidence_not_sufficient' } as Omit<
          StaffCaseDecision,
          'revision'
        >,
        other,
      );
      assert.equal((await get(appeal.id, admin)).status, 'rejected');
      assert.equal((await get(appeal.id, admin)).openAppeal, false);
      // A valid, independently reconsidered demo appeal can be published.
      await decide('review:demo-staff-review-appeal', {
        action: 'publish_review',
        checklist,
      } as Omit<StaffCaseDecision, 'revision'>);
      const self = await get('review:demo-staff-review-own-appeal');
      assert.equal(self.conflictOfInterest, true);
      assert.deepEqual(self.allowedActions, []);
      await assert.rejects(
        store.decideStaffCase(mod, self.id, {
          action: 'reject_review',
          revision: self.revision,
          checklist,
          rejectionReason: 'other_policy',
        }),
      );
      await store.escalateStaffCase(mod, self.id, {
        revision: self.revision,
        reason: 'conflict_of_interest',
      });
      assert.equal((await get(self.id, admin)).escalation?.reason, 'conflict_of_interest');
      // Report decisions use a different workflow and cannot change text or stars.
      const report = 'demo-staff-review-reported-report';
      const r = await get(report);
      assert.ok(r.allowedActions?.includes('temporarily_hide'));
      assert.ok(!r.allowedActions?.includes('publish_review'));
      await decide(report, { action: 'temporarily_hide', reasonCode: 'private_data_exposure' });
      assert.ok(
        !(await reviews.listPublicReviews('demo-prishtina-bremsen-offen')).some(
          (r) => r.id === 'demo-staff-review-reported',
        ),
      );
      assert.ok((await get(report)).allowedActions?.includes('restore'));
      await decide(report, { action: 'restore', reasonCode: 'no_violation' });
      assert.ok(
        (await reviews.listPublicReviews('demo-prishtina-bremsen-offen')).some(
          (r) => r.id === 'demo-staff-review-reported',
        ),
      );
      await decide('demo-staff-review-restore-report', {
        action: 'restore',
        reasonCode: 'no_violation',
      });
      assert.ok(
        !(await get('demo-staff-review-removed-report')).allowedActions?.includes('restore'),
      );
      await assert.rejects(
        store.decideStaffCase(mod, 'demo-staff-review-removed-report', {
          action: 'restore',
          revision: 1,
          reasonCode: 'no_violation',
        }),
      );
      // Independent profile fixture: moderation may hide/restore, never first-publish or lift an admin block.
      const profile = 'moderation-test-profile';
      await seed.query(
        "INSERT INTO garage(id,name,publication_state,place_id,description) VALUES($1,'DEMO · Profilprüfung','published','xk-pristina','DEMO – Fiktiver zu prüfender Profiltext.')",
        [profile],
      );
      await seed.query(
        "INSERT INTO garage_verification(garage_id,phone_state,contact_person_state,company_document_state,location_state) VALUES($1,'verified','verified','verified','verified')",
        [profile],
      );
      const profileReport = await store.createContentReport(author, {
        subjectType: 'garage_profile',
        subjectId: profile,
        category: 'spam_or_deception',
        details: 'DEMO – Bitte diesen fiktiven Profilinhalt prüfen.',
      });
      await store.assignStaffCase(admin, profileReport.id, {
        moderatorUserId: mod.userId,
        revision: (await get(profileReport.id, admin)).revision,
      });
      const loaded = await get(profileReport.id);
      assert.match(loaded.garage?.description ?? '', /Fiktiver/);
      await seed.query(
        "UPDATE garage SET description='DEMO – Geänderter Inhalt nach dem Laden des Falls.' WHERE id=$1",
        [profile],
      );
      await assert.rejects(
        store.decideStaffCase(mod, profileReport.id, {
          action: 'approve',
          revision: loaded.revision,
          reasonCode: 'no_violation',
        }),
      );
      await decide(profileReport.id, {
        action: 'temporarily_hide',
        reasonCode: 'policy_violation',
      });
      await decide(profileReport.id, { action: 'restore', reasonCode: 'no_violation' });
      assert.equal(
        (await seed.query('SELECT publication_state FROM garage WHERE id=$1', [profile])).rows[0]
          .publication_state,
        'published',
      );
      await seed.query(
        "UPDATE garage SET publication_state='suspended',moderation_hidden_case_id=NULL WHERE id=$1",
        [profile],
      );
      assert.ok(!(await get(profileReport.id)).allowedActions?.includes('restore'));
      await assert.rejects(
        store.applyModerationAction(mod, profileReport.id, {
          action: 'restore',
          reasonCode: 'no_violation',
        }),
      );
      // Mutating the same revision twice cannot yield two successful decisions.
      const concurrent = await get('review:demo-staff-review-waiting');
      const results = await Promise.allSettled([
        store.decideStaffCase(mod, concurrent.id, {
          action: 'publish_review',
          revision: concurrent.revision,
          checklist,
        }),
        store.decideStaffCase(mod, concurrent.id, {
          action: 'reject_review',
          revision: concurrent.revision,
          checklist,
          rejectionReason: 'other_policy',
        }),
      ]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      // A report assignee may read the same review proof without inheriting its submission assignment.
      await seed.query(
        'UPDATE review_moderator_assignment SET moderator_user_id=$2 WHERE review_id=$1',
        ['demo-staff-review-reported', other.userId],
      );
      await reviews.issueEvidenceDownloadGrant(mod, 'demo-staff-review-reported');
      const reportProof = await files.issue(mod, 'demo-staff-review-reported-file');
      await store.createAppeal(author, {
        caseId: report,
        message: 'DEMO – Diese Inhaltsentscheidung bitte unabhängig nochmals prüfen.',
      });
      await assert.rejects(reviews.issueEvidenceDownloadGrant(mod, 'demo-staff-review-reported'));
      await assert.rejects(
        files.consume(mod, 'demo-staff-review-reported-file', reportProof.grantId),
      );
      const saved = await get(assigned);
      await seedDatabase(seed, 'demo', env);
      assert.deepEqual(await get(assigned), saved);
      // New Fastify route: actual DB, strict input, CSRF, role and object boundaries.
      const access = new AccessStore();
      access.addRole(mod.userId, 'moderator');
      access.addRole(admin.userId, 'admin');
      const m = access.createSession(mod.userId),
        a = access.createSession(admin.userId),
        c = access.createSession('ordinary-test-customer');
      const headers = (session: typeof m, csrf = true) => ({
        cookie: `autokosova_session=${session.sessionId}; autokosova_csrf=${session.csrfToken}`,
        ...(csrf ? { 'x-csrf-token': session.csrfToken } : {}),
      });
      const app = createServer({
        accessStore: access,
        moderationStore: store,
        reviewStore: reviews,
        localDemoFiles: files,
      });
      try {
        const legacy = '/api/admin/reviews/demo-staff-review-blocked/decision';
        const legacyInput = {
          decision: 'rejected',
          checklist,
          rejectionReason: 'evidence_not_sufficient',
        };
        assert.equal(
          (await app.inject({ method: 'POST', url: legacy, payload: legacyInput })).statusCode,
          401,
        );
        assert.equal(
          (
            await app.inject({
              method: 'POST',
              url: legacy,
              payload: legacyInput,
              headers: headers(c),
            })
          ).statusCode,
          403,
        );
        assert.equal(
          (
            await app.inject({
              method: 'POST',
              url: legacy,
              payload: legacyInput,
              headers: headers(m),
            })
          ).statusCode,
          422,
        );
        assert.equal(
          (
            await app.inject({
              method: 'POST',
              url: legacy,
              payload: { ...legacyInput, caseRevision: blocked.revision - 1 },
              headers: headers(m),
            })
          ).statusCode,
          409,
        );
        const path = '/api/staff/cases/' + encodeURIComponent(blocked.id) + '/decide';
        const payload = {
          action: 'reject_review',
          revision: blocked.revision,
          checklist,
          rejectionReason: 'evidence_not_sufficient',
        };
        assert.equal((await app.inject({ method: 'POST', url: path, payload })).statusCode, 401);
        assert.equal(
          (await app.inject({ method: 'POST', url: path, payload, headers: headers(c) }))
            .statusCode,
          403,
        );
        assert.equal(
          (await app.inject({ method: 'POST', url: path, payload, headers: headers(m, false) }))
            .statusCode,
          403,
        );
        assert.equal(
          (
            await app.inject({
              method: 'POST',
              url: path,
              payload: { ...payload, reviewText: 'tampered' },
              headers: headers(m),
            })
          ).statusCode,
          422,
        );
        assert.equal(
          (await app.inject({ method: 'POST', url: path, payload, headers: headers(m) }))
            .statusCode,
          204,
        );
        assert.equal(
          (await app.inject({ method: 'POST', url: path, payload, headers: headers(m) }))
            .statusCode,
          409,
        );
        const detail = await app.inject({
          url: '/api/staff/cases/' + encodeURIComponent(blocked.id),
          headers: headers(m),
        });
        assert.equal(detail.statusCode, 200);
        assert.match(detail.headers['cache-control']!, /no-store/);
        const raw = detail.json();
        assert.ok(!('reporterUserId' in (raw.report ?? {})));
        assert.ok(!JSON.stringify(raw).includes('storage_key'));
        const grant = await files.issue(mod, 'demo-staff-review-assigned-file');
        await store.recordVerifiedIdentity(mod.userId, [], { displayName: 'DEMO Moderator' });
        assert.equal(
          (await app.inject({ url: '/api/staff/cases', headers: headers(m) })).statusCode,
          403,
        );
        await assert.rejects(files.consume(mod, 'demo-staff-review-assigned-file', grant.grantId));
        assert.equal(
          (await app.inject({ url: '/api/staff/cases', headers: headers(a) })).statusCode,
          200,
        );
      } finally {
        await app.close();
        store = undefined;
        reviews = undefined;
        files = undefined;
      }
    } catch (error) {
      console.error('Moderation regression failed:', error);
      throw error;
    } finally {
      await files?.close();
      await reviews?.close();
      await store?.close();
      await seed.end();
      await root.query(`DROP SCHEMA ${schema} CASCADE`);
      try {
        if (runtimeCreated) {
          await root.query(`REVOKE USAGE ON SCHEMA public FROM ${runtimeRole}`);
          await root.query(`DROP ROLE ${runtimeRole}`);
        }
      } finally {
        await root.end();
      }
    }
  },
);
