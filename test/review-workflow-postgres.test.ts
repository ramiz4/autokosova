import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { AccessStore, type Principal } from '../src/server/access';
import { PostgresReviewStore } from '../src/server/review-store';
import { PostgresModerationStore } from '../src/server/moderation-store';
import { LocalDemoFileStore } from '../src/server/local-demo-files';
import { createServer } from '../src/server/app';
import { seedDatabase } from '../scripts/db/seed-data.mjs';
import { staffDemoFixtures, staffDemoGarage } from '../db/staff-demo-data.mjs';
import {
  validReviewSubmission,
  isAllowedVisitMonth,
  calculateOverallRating,
  type ReviewSubmissionInput,
} from '../src/shared/reviews';

const databaseUrl = process.env['DATABASE_URL'];
const person = (
  userId: string,
  role: 'customer' | 'moderator' | 'admin' = 'customer',
): Principal => ({
  userId,
  roles: new Set([role]),
  sessionId: 'test-' + userId,
  csrfToken: 'synthetic-csrf',
});
const input: ReviewSubmissionInput = {
  garageId: staffDemoGarage,
  serviceCategoryId: 'bremsen',
  visitMonth: '2026-08',
  workQuality: 2,
  communication: 3,
  priceTransparency: 1,
  punctuality: 2,
  text: 'DEMO – Die Arbeit wurde erledigt, die Kommunikation war jedoch nicht zufriedenstellend.',
  evidenceFileId: 'fixture',
  evidenceKind: 'invoice',
};

test('review submission validates real calendar months, all ratings and known optional references', () => {
  const now = new Date('2026-09-15T10:00:00Z');
  assert.equal(validReviewSubmission(input, now), true);
  assert.equal(calculateOverallRating(input), 2);
  for (const month of ['2026-13', '2026-00', '2026-10', '0000-01', '2026-08-01'])
    assert.equal(isAllowedVisitMonth(month, now), false);
  assert.equal(validReviewSubmission({ ...input, workQuality: 0 }, now), false);
  assert.equal(validReviewSubmission({ ...input, communication: 1.5 }, now), false);
  assert.equal(validReviewSubmission({ ...input, text: ' '.repeat(50) }, now), false);
  assert.equal(validReviewSubmission({ ...input, serviceCategoryId: 'invented' }, now), false);
  assert.equal(validReviewSubmission({ ...input, vehicleMakeId: 'invented' }, now), false);
});

test(
  'review workflow: actual RLS, private byte upload, idempotent submission, replies, updates and visibility',
  { skip: !databaseUrl, timeout: 60000 },
  async () => {
    const source = new URL(databaseUrl!);
    assert.ok(['127.0.0.1', 'localhost'].includes(source.hostname));
    const schema = 'reviewflow_' + randomUUID().replaceAll('-', ''),
      role = schema + '_runtime';
    const root = new pg.Client({ connectionString: source.href });
    await root.connect();
    await root.query(`CREATE SCHEMA ${schema}`);
    source.searchParams.set('options', '-csearch_path=' + schema + ',public');
    const seed = new pg.Client({ connectionString: source.href });
    await seed.connect();
    let createdRole = false;
    let reviews: PostgresReviewStore | undefined,
      moderation: PostgresModerationStore | undefined,
      files: LocalDemoFileStore | undefined;
    try {
      const directory = new URL('../db/migrations/', import.meta.url);
      for (const file of (await readdir(directory)).filter((f) => f.endsWith('.sql')).sort())
        await seed.query(
          (await readFile(new URL(file, directory), 'utf8')).replaceAll(
            "'public.",
            "'" + schema + '.',
          ),
        );
      const env = {
        NODE_ENV: 'test',
        AUTOKOSOVA_DEMO_ADMIN_SUBJECT: 'reviewflow-admin',
        AUTOKOSOVA_DEMO_MODERATOR_SUBJECT: 'reviewflow-moderator',
      };
      await seedDatabase(seed, 'demo-workflows', env);
      await root.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOBYPASSRLS`);
      createdRole = true;
      await root.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
      await root.query(
        `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${role}`,
      );
      await root.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${role}`);
      source.searchParams.set('options', '-csearch_path=' + schema + ',public -crole=' + role);
      reviews = new PostgresReviewStore(source.href);
      moderation = new PostgresModerationStore(source.href);
      files = new LocalDemoFileStore(source.href, {
        NODE_ENV: 'test',
        AUTOKOSOVA_LOCAL_DEMO_FILES: '1',
      });
      const author = person('reviewflow-author'),
        other = person('reviewflow-other'),
        owner = person('reviewflow-owner'),
        admin = person(env.AUTOKOSOVA_DEMO_ADMIN_SUBJECT, 'admin'),
        mod = person(env.AUTOKOSOVA_DEMO_MODERATOR_SUBJECT, 'moderator');
      for (const p of [author, other, owner, admin, mod])
        await moderation.recordVerifiedIdentity(
          p.userId,
          p === admin ? ['admin'] : p === mod ? ['moderator'] : [],
          { displayName: 'DEMO ' + p.userId },
        );
      const requestId = randomUUID();
      await assert.rejects(
        files.createVisitEvidence(
          author,
          requestId,
          'A real or unknown document must not be stored',
        ),
      );
      const proof = await files.createVisitEvidence(
        author,
        requestId,
        staffDemoFixtures['visit-valid'],
      );
      assert.deepEqual(
        await files.createVisitEvidence(author, requestId, staffDemoFixtures['visit-valid']),
        proof,
      );
      await assert.rejects(
        files.createVisitEvidence(author, requestId, staffDemoFixtures['visit-mismatch']),
      );
      await assert.rejects(files.issue(other, proof.fileId));
      const grant = await files.issue(author, proof.fileId);
      assert.equal(
        await files.consume(author, proof.fileId, grant.grantId),
        staffDemoFixtures['visit-valid'],
      );
      await assert.rejects(files.consume(author, proof.fileId, grant.grantId));
      await assert.rejects(reviews.createReview(other, { ...input, evidenceFileId: proof.fileId }));
      await seed.query(
        "INSERT INTO membership(user_id,garage_id,role,state,granted_by) VALUES($1,$2,'owner','active',$3)",
        [author.userId, staffDemoGarage, admin.userId],
      );
      await assert.rejects(
        reviews.createReview(author, { ...input, evidenceFileId: proof.fileId }),
        /own garage/,
      );
      await seed.query('DELETE FROM membership WHERE user_id=$1 AND garage_id=$2', [
        author.userId,
        staffDemoGarage,
      ]);
      const payload = { ...input, evidenceFileId: proof.fileId };
      const saved = await reviews.createReview(author, payload);
      assert.equal(saved.publicationState, 'submitted');
      assert.equal((await reviews.createReview(author, payload)).id, saved.id);
      await assert.rejects(
        reviews.createReview(author, {
          ...payload,
          text: 'DEMO – Ein veränderter Bericht darf denselben Beleg nicht neu verwenden.',
        }),
      );
      const own = await reviews.getOwnReview(author, saved.id);
      assert.equal(own.text, input.text);
      assert.equal(own.caseStatus, 'submitted');
      const secondProof = await files.createVisitEvidence(
        author,
        randomUUID(),
        staffDemoFixtures['visit-valid'],
      );
      const second = await reviews.createReview(author, {
        ...payload,
        evidenceFileId: secondProof.fileId,
        text: 'DEMO – Suchtext für den privaten Listenvertrag.',
        visitMonth: '2026-07',
      });
      await seed.query(
        "UPDATE garage_review SET submitted_at=CASE id WHEN $1 THEN '2026-01-01T10:00:00Z'::timestamptz WHEN $2 THEN '2026-02-01T10:00:00Z'::timestamptz END WHERE id=ANY($3::text[])",
        [saved.id, second.id, [saved.id, second.id]],
      );
      const ownPage = await reviews.listOwnReviewPage(author, 1);
      assert.equal(ownPage.reviews.length, 2);
      assert.equal(ownPage.total, 2);
      const searched = await reviews.listOwnReviewPage(author, {
        query: 'listenvertrag',
        publicationState: 'submitted',
        sort: 'submitted_asc',
      });
      assert.deepEqual(
        searched.reviews.map((review) => review.id),
        [second.id],
      );
      assert.equal(searched.total, 1);
      assert.equal((await reviews.listOwnReviewPage(author, 1)).reviews.length, 2);
      await assert.rejects(reviews.getOwnReview(other, saved.id));
      assert.equal((await reviews.listOwnReviewPage(admin, 1)).reviews.length, 0);
      assert.equal(JSON.stringify(own).includes('assignedModerator'), false);
      assert.equal(JSON.stringify(own).includes('reporter'), false);
      const caseId = 'review:' + saved.id;
      await moderation.assignStaffCase(admin, caseId, {
        moderatorUserId: mod.userId,
        revision: (await moderation.getStaffCase(admin, caseId)).revision,
      });
      await moderation.decideStaffCase(mod, caseId, {
        action: 'publish_review',
        revision: (await moderation.getStaffCase(mod, caseId)).revision,
        checklist: { garageMatches: true, serviceMatches: true, visitMonthMatches: true },
      });
      const publicPage = await reviews.listPublicReviewPage(staffDemoGarage, {});
      assert.ok(publicPage.reviews.some((r) => r.id === saved.id));
      const publicText = JSON.stringify(publicPage);
      assert.equal(publicText.includes(proof.fileId), false);
      assert.equal(publicText.includes(author.userId), false);
      const reply = 'DEMO – Danke für die Rückmeldung. Wir prüfen den beschriebenen Ablauf.';
      await assert.rejects(
        reviews.postGarageResponse(other, staffDemoGarage, saved.id, reply, randomUUID(), 0),
      );
      await seed.query(
        "INSERT INTO membership(user_id,garage_id,role,state,granted_by) VALUES($1,$2,'editor','active',$3)",
        [owner.userId, staffDemoGarage, admin.userId],
      );
      const replyId = randomUUID();
      await reviews.postGarageResponse(owner, staffDemoGarage, saved.id, reply, replyId, 0);
      await reviews.postGarageResponse(owner, staffDemoGarage, saved.id, reply, replyId, 0);
      await assert.rejects(
        reviews.postGarageResponse(
          owner,
          staffDemoGarage,
          saved.id,
          reply + ' Geändert.',
          randomUUID(),
          0,
        ),
      );
      await assert.rejects(reviews.issueEvidenceDownloadGrant(owner, saved.id));
      const updateId = randomUUID(),
        update =
          'DEMO – Die Werkstatt hat eine Nacharbeit durchgeführt. Der Originalbericht bleibt erhalten.';
      await reviews.postReviewUpdate(author, saved.id, 'rework', update, updateId);
      await reviews.postReviewUpdate(author, saved.id, 'rework', update, updateId);
      await assert.rejects(
        reviews.postReviewUpdate(other, saved.id, 'complaint', update, randomUUID()),
      );
      assert.equal((await reviews.getOwnReview(author, saved.id)).updates.length, 1);
      assert.equal((await reviews.getOwnReview(author, saved.id)).ratings.overall, 2);
      // A separate report must not accidentally close the author's independent appeal.
      await moderation.createAppeal(author, {
        caseId,
        message: 'DEMO – Bitte die Bewertung unabhängig erneut prüfen.',
      });
      assert.equal((await moderation.getStaffCase(admin, caseId)).openAppeal, true);
      const report = await moderation.createContentReport(other, {
        subjectId: saved.id,
        subjectType: 'review',
        category: 'personal_data',
        details: 'DEMO – Fiktive Inhaltsmeldung für eine Datenschutzprüfung.',
      });
      await moderation.assignStaffCase(admin, report.id, {
        moderatorUserId: mod.userId,
        revision: (await moderation.getStaffCase(admin, report.id)).revision,
      });
      await moderation.decideStaffCase(mod, report.id, {
        action: 'temporarily_hide',
        reasonCode: 'private_data_exposure',
        revision: (await moderation.getStaffCase(mod, report.id)).revision,
      });
      assert.ok(
        !(await reviews.listPublicReviewPage(staffDemoGarage, {})).reviews.some(
          (r) => r.id === saved.id,
        ),
      );
      const stillOpen = await moderation.getStaffCase(admin, caseId);
      assert.equal(stillOpen.openAppeal, true);
      assert.equal(stillOpen.status, 'submitted');
      await assert.rejects(
        reviews.postGarageResponse(owner, staffDemoGarage, saved.id, reply, randomUUID(), 1),
      );
      await moderation.decideStaffCase(mod, report.id, {
        action: 'restore',
        reasonCode: 'no_violation',
        revision: (await moderation.getStaffCase(mod, report.id)).revision,
      });
      const restored = (await reviews.listPublicReviewPage(staffDemoGarage, {})).reviews.find(
        (r) => r.id === saved.id,
      )!;
      assert.equal(restored.garageResponse?.text, reply);
      assert.equal(restored.updates.length, 1);
      await seedDatabase(seed, 'demo-workflows', env);
      assert.equal((await reviews.getOwnReview(author, saved.id)).publicationState, 'published');
      // Real HTTP schemas and owner boundaries over this non-owner PostgreSQL connection.
      const access = new AccessStore();
      const session = access.createSession(author.userId),
        foreign = access.createSession(other.userId);
      const headers = (s: typeof session, write = false) => ({
        cookie: `autokosova_session=${s.sessionId}; autokosova_csrf=${s.csrfToken}`,
        ...(write ? { 'x-csrf-token': s.csrfToken } : {}),
      });
      const app = createServer({
        accessStore: access,
        reviewStore: reviews,
        moderationStore: moderation,
        localDemoFiles: files,
      });
      try {
        assert.equal((await app.inject({ url: '/api/me/reviews' })).statusCode, 401);
        assert.equal(
          (await app.inject({ url: '/api/me/reviews/' + saved.id, headers: headers(foreign) }))
            .statusCode,
          404,
        );
        assert.equal(
          (await app.inject({ url: '/api/me/reviews?page=-1', headers: headers(session) }))
            .statusCode,
          400,
        );
        const filtered = await app.inject({
          url: '/api/me/reviews?query=listenvertrag&publicationState=submitted&sort=submitted_asc',
          headers: headers(session),
        });
        assert.equal(filtered.statusCode, 200);
        assert.deepEqual(
          filtered.json().reviews.map((review: { id: string }) => review.id),
          [second.id],
        );
        assert.equal(filtered.json().total, 1);
        assert.equal((await app.inject({ url: '/api/me/review-evidence/sample' })).statusCode, 401);
        const mine = await app.inject({
          url: '/api/me/reviews/' + saved.id,
          headers: headers(session),
        });
        assert.equal(mine.statusCode, 200);
        assert.match(mine.headers['cache-control']!, /no-store/);
        const sample = await app.inject({
          url: '/api/me/review-evidence/sample',
          headers: headers(session),
        });
        assert.equal(sample.body, staffDemoFixtures['visit-valid']);
        assert.equal(
          (
            await app.inject({
              method: 'PUT',
              url: '/api/me/review-evidence/' + randomUUID(),
              headers: { ...headers(session), 'content-type': 'text/plain' },
              payload: sample.body,
            })
          ).statusCode,
          403,
        );
        assert.equal(
          (
            await app.inject({
              method: 'PUT',
              url: '/api/me/review-evidence/' + randomUUID(),
              headers: { ...headers(session, true), 'content-type': 'text/plain' },
              payload: 'Unknown document content must never become trusted evidence.',
            })
          ).statusCode,
          422,
        );
      } finally {
        await app.close();
        reviews = undefined;
        moderation = undefined;
        files = undefined;
      }
    } finally {
      await reviews?.close();
      await moderation?.close();
      await files?.close();
      await seed.end();
      await root.query(`DROP SCHEMA ${schema} CASCADE`);
      if (createdRole) await root.query(`DROP ROLE ${role}`);
      await root.end();
    }
  },
);
