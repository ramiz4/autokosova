import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import type { Principal } from '../src/server/access';
import { PostgresReviewStore } from '../src/server/review-store';
import { PostgresWorkshopSearchStore } from '../src/server/workshop-search-store';

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
  'PostgreSQL persists only checked published review aggregates and keeps retained evidence private',
  { skip: !databaseUrl },
  async () => {
    const client = new pg.Client({ connectionString: databaseUrl });
    const reviews = new PostgresReviewStore(databaseUrl!);
    const search = new PostgresWorkshopSearchStore(databaseUrl!);
    const suffix = randomUUID();
    const adminId = `review-admin-${suffix}`;
    const authorId = `review-author-${suffix}`;
    const moderatorId = `review-moderator-${suffix}`;
    const ownerId = `review-owner-${suffix}`;
    const workshopId = `review-workshop-${suffix}`;
    const evidenceFileId = `review-evidence-${suffix}`;

    await client.connect();
    try {
      await client.query('BEGIN');
      for (const userId of [adminId, authorId, moderatorId, ownerId]) {
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
           $1, 'Fiktive PostgreSQL-Bewertungen', 'published', $2, 'xk-pristina', '+383 44 000 120',
           'Private fiktive Person', '+383 44 000 121', ARRAY['Deutsch'], ARRAY[]::text[]
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
        `INSERT INTO membership (user_id, workshop_id, role, state, granted_by)
         VALUES ($1, $2, 'owner', 'active', $1)`,
        [ownerId, workshopId],
      );
      await client.query(
        `INSERT INTO file_object (
           id, owner_user_id, storage_key, content_type, size_bytes, scan_state, retention_state
         ) VALUES ($1, $2, $3, 'application/pdf', 1024, 'clean', 'active')`,
        [evidenceFileId, authorId, `quarantine/${evidenceFileId}`],
      );
      await client.query('COMMIT');

      const submitted = await reviews.createReview(principal(authorId, ['customer']), {
        communication: 1,
        evidenceFileId,
        evidenceKind: 'invoice',
        priceTransparency: 1,
        punctuality: 1,
        serviceCategoryId: 'bremsen',
        text: 'Die negative fiktive Bewertung hat einen eigenständigen privaten Rechnungsnachweis.',
        vehicleMakeId: 'skoda',
        visitMonth: '2026-08',
        workQuality: 1,
        workshopId,
      });
      await reviews.assignModerator(principal(adminId, ['admin']), submitted.id, moderatorId);
      await reviews.decideReview(principal(moderatorId, ['moderator']), submitted.id, {
        checklist: { serviceMatches: true, visitMonthMatches: true, workshopMatches: true },
        decision: 'published',
      });
      await reviews.postWorkshopResponse(
        principal(ownerId, ['customer']),
        workshopId,
        submitted.id,
        'Wir nehmen die fiktive Kritik entgegen und können die Bewertung nicht verändern.',
      );
      const publicReviews = await reviews.listPublicReviews(workshopId, {
        serviceCategoryId: 'bremsen',
        vehicleMakeId: 'skoda',
      });
      const results = await search.searchPublicWorkshops({
        areas: [{ placeId: 'xk-pristina', radiusKm: 5 }],
        page: 1,
        pageSize: 10,
        serviceCategoryId: 'bremsen',
      });
      const deletedFileId = await reviews.deleteEvidenceAfterRetention(
        principal(adminId, ['admin']),
        submitted.id,
      );
      const deniedAfterRetention = await assert.rejects(
        () => reviews.issueEvidenceDownloadGrant(principal(authorId, ['customer']), submitted.id),
        (error: unknown) =>
          error instanceof Error && error.message === 'Private visit evidence not found',
      );

      assert.equal(submitted.publicationState, 'submitted');
      assert.equal(publicReviews.length, 1);
      assert.equal(publicReviews[0].ratings.overall, 1);
      assert.equal(publicReviews[0].workshopResponse?.text.includes('nicht verändern'), true);
      assert.equal(
        results.results.find((result) => result.id === workshopId)?.reviewSummary.reviewCount,
        1,
      );
      assert.equal(deletedFileId, evidenceFileId);
      assert.equal(deniedAfterRetention, undefined);
      assert.equal(JSON.stringify(publicReviews).includes(evidenceFileId), false);
    } finally {
      await client.query('ROLLBACK');
      await client.query(
        'DELETE FROM review_update WHERE review_id IN (SELECT id FROM workshop_review WHERE workshop_id = $1)',
        [workshopId],
      );
      await client.query(
        'DELETE FROM review_workshop_response WHERE review_id IN (SELECT id FROM workshop_review WHERE workshop_id = $1)',
        [workshopId],
      );
      await client.query(
        'DELETE FROM review_moderator_assignment WHERE review_id IN (SELECT id FROM workshop_review WHERE workshop_id = $1)',
        [workshopId],
      );
      await client.query(
        'DELETE FROM visit_evidence WHERE review_id IN (SELECT id FROM workshop_review WHERE workshop_id = $1)',
        [workshopId],
      );
      await client.query('DELETE FROM workshop_review WHERE workshop_id = $1', [workshopId]);
      await client.query('DELETE FROM moderation_event WHERE actor_user_id = ANY($1::text[])', [
        [adminId, authorId, moderatorId, ownerId],
      ]);
      await client.query('DELETE FROM membership WHERE workshop_id = $1', [workshopId]);
      await client.query('DELETE FROM workshop_service_category WHERE workshop_id = $1', [
        workshopId,
      ]);
      await client.query('DELETE FROM workshop_verification WHERE workshop_id = $1', [workshopId]);
      await client.query('DELETE FROM workshop WHERE id = $1', [workshopId]);
      await client.query('DELETE FROM file_object WHERE id = $1', [evidenceFileId]);
      await client.query('DELETE FROM app_user WHERE id = ANY($1::text[])', [
        [adminId, authorId, moderatorId, ownerId],
      ]);
      await client.end();
      await reviews.close();
      await search.close();
    }
  },
);
