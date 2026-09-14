import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import type { Principal } from '../src/server/access';
import { PostgresModerationStore } from '../src/server/moderation-store';
import { PostgresReviewStore } from '../src/server/review-store';

const databaseUrl = process.env['DATABASE_URL'];

function principal(
  userId: string,
  roles: readonly ('admin' | 'customer' | 'moderator')[],
): Principal {
  return {
    csrfToken: 'test-csrf',
    roles: new Set(roles),
    sessionId: 'test-session',
    userId,
  };
}

test(
  'PostgreSQL keeps reports private, requires an explicit visibility action, and queues object deletion',
  { skip: !databaseUrl },
  async () => {
    const client = new pg.Client({ connectionString: databaseUrl });
    const moderation = new PostgresModerationStore(databaseUrl!);
    const reviews = new PostgresReviewStore(databaseUrl!);
    const suffix = randomUUID();
    const adminId = `moderation-admin-${suffix}`;
    const authorId = `moderation-author-${suffix}`;
    const moderatorId = `moderation-moderator-${suffix}`;
    const reporterId = `moderation-reporter-${suffix}`;
    const ownerId = `moderation-owner-${suffix}`;
    const requestId = `moderation-request-${suffix}`;
    const workshopId = `moderation-workshop-${suffix}`;
    const evidenceFileId = `moderation-evidence-${suffix}`;
    let reportId: string | undefined;
    let deletionId: string | undefined;
    let anonymizedAuthorId: string | undefined;
    const policyVersion = `test-${suffix}`;

    await client.connect();
    try {
      await client.query('BEGIN');
      for (const userId of [adminId, authorId, moderatorId, reporterId, ownerId]) {
        await client.query(
          `INSERT INTO app_user (id, oidc_subject, status) VALUES ($1, $1, 'active')`,
          [userId],
        );
      }
      await client.query(
        `INSERT INTO workshop (
           id, name, publication_state, created_by_user_id, place_id, public_phone,
           contact_person, contact_phone, languages, self_reported_specializations
         ) VALUES (
           $1, 'Fiktive PostgreSQL-Moderation', 'published', $2, 'xk-pristina', '+383 44 000 220',
           'Private fiktive Person', '+383 44 000 221', ARRAY['Deutsch'], ARRAY[]::text[]
         )`,
        [workshopId, ownerId],
      );
      await client.query(
        `INSERT INTO workshop_verification (
           workshop_id, phone_state, contact_person_state, company_document_state, location_state
         ) VALUES ($1, 'verified', 'verified', 'verified', 'verified')`,
        [workshopId],
      );
      await client.query(
        `INSERT INTO workshop_service_category (workshop_id, service_category_id)
         VALUES ($1, 'bremsen')`,
        [workshopId],
      );
      await client.query(
        `INSERT INTO file_object (
           id, owner_user_id, storage_key, content_type, size_bytes, scan_state, retention_state
         ) VALUES ($1, $2, $3, 'application/pdf', 1024, 'clean', 'active')`,
        [evidenceFileId, authorId, `quarantine/${evidenceFileId}`],
      );
      await client.query(
        `INSERT INTO repair_request (
           id, owner_user_id, service_category_id, earliest_dropoff_on, latest_pickup_on
         ) VALUES ($1, $2, 'bremsen', '2026-08-01', '2026-08-05')`,
        [requestId, authorId],
      );
      await client.query(
        `INSERT INTO request_search_area (id, repair_request_id, position, place_id, radius_m)
         VALUES ($1, $2, 1, 'xk-pristina', 5000)`,
        [`moderation-area-${suffix}`, requestId],
      );
      await client.query(
        `INSERT INTO repair_request_attachment (repair_request_id, file_id) VALUES ($1, $2)`,
        [requestId, evidenceFileId],
      );
      await client.query('COMMIT');

      const review = await reviews.createReview(principal(authorId, ['customer']), {
        communication: 1,
        evidenceFileId,
        evidenceKind: 'invoice',
        priceTransparency: 1,
        punctuality: 1,
        serviceCategoryId: 'bremsen',
        text: 'Die fiktive negative Erfahrung hat einen privaten, überprüfbaren Nachweis.',
        visitMonth: '2026-08',
        workQuality: 1,
        workshopId,
      });
      await reviews.assignModerator(principal(adminId, ['admin']), review.id, moderatorId);
      await reviews.decideReview(principal(moderatorId, ['moderator']), review.id, {
        checklist: { serviceMatches: true, visitMonthMatches: true, workshopMatches: true },
        decision: 'published',
      });
      const report = await moderation.createContentReport(principal(reporterId, ['customer']), {
        category: 'personal_data',
        details: 'Fiktive Meldung mit privatem Kontext, der nicht im Audit-Ereignis stehen darf.',
        subjectId: review.id,
        subjectType: 'review',
      });
      reportId = report.id;
      const beforeAction = await reviews.listPublicReviews(workshopId);
      await moderation.assignModerationCase(principal(adminId, ['admin']), report.id, moderatorId);
      await moderation.applyModerationAction(principal(moderatorId, ['moderator']), report.id, {
        action: 'temporarily_hide',
        reasonCode: 'private_data_exposure',
      });
      const hidden = await reviews.listPublicReviews(workshopId);
      await moderation.applyModerationAction(principal(moderatorId, ['moderator']), report.id, {
        action: 'restore',
        reasonCode: 'no_violation',
      });
      await moderation.configureRetentionPolicy(principal(adminId, ['admin']), {
        auditLogRetentionDays: 365,
        operatorApprovalReference: 'operator-policy-test-v1',
        publicReviewHandling: 'retain_anonymized',
        repairRequestRetentionDays: 90,
        reportRetentionDays: 180,
        reviewEvidenceRetentionDays: 365,
        version: policyVersion,
      });
      await client.query('INSERT INTO garage_favorite (owner_user_id, garage_id) VALUES ($1,$2)', [
        authorId,
        workshopId,
      ]);
      const exported = await moderation.exportPersonalData(principal(authorId, ['customer']));
      const deletion = await moderation.requestPersonalDataDeletion(
        principal(authorId, ['customer']),
      );
      deletionId = deletion.id;
      const completed = await moderation.processPersonalDataDeletion(
        principal(adminId, ['admin']),
        deletion.id,
      );
      assert.deepEqual(exported.favoriteGarageIds, [workshopId]);
      assert.equal(
        (
          await client.query(
            'SELECT count(*)::int AS count FROM garage_favorite WHERE owner_user_id=$1',
            [authorId],
          )
        ).rows[0].count,
        0,
      );
      const retained = await reviews.listPublicReviews(workshopId);
      const retainedAuthor = await client.query<{ readonly author_user_id: string }>(
        'SELECT author_user_id FROM workshop_review WHERE id = $1',
        [review.id],
      );
      anonymizedAuthorId = retainedAuthor.rows[0]?.author_user_id;
      const deletionTask = await client.query(
        'SELECT storage_key FROM object_deletion_task WHERE file_id = $1',
        [evidenceFileId],
      );
      const events = await client.query(
        `SELECT event_type FROM moderation_event
         WHERE subject_id = $1 OR subject_id = $2`,
        [report.id, deletion.id],
      );
      const removedRequest = await client.query('SELECT 1 FROM repair_request WHERE id = $1', [
        requestId,
      ]);

      assert.equal(beforeAction.length, 1);
      assert.equal(hidden.length, 0);
      assert.deepEqual(exported.repairRequests[0]?.areas, [
        { placeId: 'xk-pristina', radiusKm: 5 },
      ]);
      assert.deepEqual(exported.repairRequests[0]?.attachmentIds, [evidenceFileId]);
      assert.deepEqual(completed.fileIds, [evidenceFileId]);
      assert.equal(retained.length, 1);
      assert.equal(deletionTask.rows[0]?.storage_key, `quarantine/${evidenceFileId}`);
      assert.equal(JSON.stringify(events.rows).includes('privatem Kontext'), false);
      assert.equal(removedRequest.rowCount, 0);
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      await client.query('DELETE FROM object_deletion_task WHERE file_id = $1', [evidenceFileId]);
      await client.query('DELETE FROM repair_request_attachment WHERE repair_request_id = $1', [
        requestId,
      ]);
      await client.query('DELETE FROM request_search_area WHERE repair_request_id = $1', [
        requestId,
      ]);
      await client.query('DELETE FROM repair_request WHERE id = $1', [requestId]);
      await client.query(
        `DELETE FROM review_update WHERE review_id IN (
           SELECT id FROM workshop_review WHERE workshop_id = $1
         )`,
        [workshopId],
      );
      await client.query(
        `DELETE FROM review_workshop_response WHERE review_id IN (
           SELECT id FROM workshop_review WHERE workshop_id = $1
         )`,
        [workshopId],
      );
      await client.query(
        `DELETE FROM review_moderator_assignment WHERE review_id IN (
           SELECT id FROM workshop_review WHERE workshop_id = $1
         )`,
        [workshopId],
      );
      await client.query(
        `DELETE FROM visit_evidence WHERE review_id IN (
           SELECT id FROM workshop_review WHERE workshop_id = $1
         )`,
        [workshopId],
      );
      await client.query('DELETE FROM workshop_review WHERE workshop_id = $1', [workshopId]);
      if (reportId) await client.query('DELETE FROM content_report WHERE case_id = $1', [reportId]);
      await client.query('DELETE FROM data_deletion_request WHERE user_id = $1', [authorId]);
      await client.query('DELETE FROM moderation_case WHERE id = ANY($1::text[])', [
        [reportId, deletionId].filter((id): id is string => Boolean(id)),
      ]);
      await client.query('DELETE FROM lifecycle_policy WHERE version = $1', [policyVersion]);
      await client.query('DELETE FROM moderation_event WHERE actor_user_id = ANY($1::text[])', [
        [adminId, authorId, moderatorId, reporterId, ownerId],
      ]);
      await client.query('DELETE FROM workshop_service_category WHERE workshop_id = $1', [
        workshopId,
      ]);
      await client.query('DELETE FROM workshop_verification WHERE workshop_id = $1', [workshopId]);
      await client.query('DELETE FROM workshop WHERE id = $1', [workshopId]);
      await client.query('DELETE FROM file_object WHERE id = $1', [evidenceFileId]);
      await client.query('DELETE FROM app_user WHERE id = ANY($1::text[])', [
        [adminId, authorId, moderatorId, reporterId, ownerId],
      ]);
      if (anonymizedAuthorId)
        await client.query('DELETE FROM app_user WHERE id = $1', [anonymizedAuthorId]);
      await client.end();
      await moderation.close();
      await reviews.close();
    }
  },
);
