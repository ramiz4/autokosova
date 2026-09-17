import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { demoWorkflowRequests, demoWorkflowReviews, demoGarages } from '../db/demo-data.mjs';
import { PostgresRepairRequestStore } from '../src/server/repair-request-store';
import { PostgresReviewStore } from '../src/server/review-store';
import { PostgresGarageSearchStore } from '../src/server/garage-search-store';

const databaseUrl = process.env['DATABASE_URL'];
const demoWorkflowDataExpected = process.env['AUTOKOSOVA_EXPECT_DEMO_WORKFLOW_DATA'] === '1';

test(
  'the explicit workflow seed keeps private requests and evidence out of public demo data',
  { skip: !databaseUrl || !demoWorkflowDataExpected },
  async () => {
    const client = new pg.Client({ connectionString: databaseUrl });
    const repairRequests = new PostgresRepairRequestStore(databaseUrl!);
    const reviews = new PostgresReviewStore(databaseUrl!);
    const search = new PostgresGarageSearchStore(databaseUrl!);
    await client.connect();
    try {
      const garageRows = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM public_garage_profile WHERE id = ANY($1::text[])',
        [demoGarages.map((garage) => garage.id)],
      );
      const reviewRows = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM garage_review
         WHERE id = ANY($1::text[])`,
        [demoWorkflowReviews.map((review) => review.id)],
      );
      const requestRows = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM repair_request
         WHERE id = ANY($1::text[])`,
        [demoWorkflowRequests.map((request) => request.id)],
      );
      const requestId = 'demo-request-prishtina-bremsen';
      const fixture = demoWorkflowRequests.find((request) => request.id === requestId);
      assert.ok(fixture, 'The workflow request fixture must exist');
      const customerBinding = await client.query<{ user_id: string }>(
        `SELECT binding.user_id
         FROM local_demo_account_entity entity
         JOIN local_demo_account_binding binding ON binding.account_type = entity.account_type
         WHERE entity.entity_type = 'repair_request'
           AND entity.entity_id = $1
           AND entity.account_type = 'customer'`,
        [requestId],
      );
      const publicReviews = await reviews.listPublicReviews('demo-prishtina-bremsen', {});
      const publicSearch = await search.searchPublicGarages({
        areas: [{ placeId: 'xk-pristina', radiusKm: 5 }],
        page: 1,
        pageSize: 24,
        serviceCategoryId: 'bremsen',
      });
      const privateRequest = await repairRequests.getRepairRequest(
        customerBinding.rows[0]?.user_id ?? fixture.ownerUserId,
        requestId,
      );

      assert.equal(garageRows.rows[0].count, String(demoGarages.length));
      // The administration workflow intentionally adds one published synthetic membership garage;
      // submitted/incomplete/suspended admin scenarios must remain absent from the public view.
      const adminPublic = await client.query<{ id: string }>(
        "SELECT id FROM public_garage_profile WHERE id LIKE 'demo-admin-%' ORDER BY id",
      );
      assert.deepEqual(
        adminPublic.rows.map((g) => g.id),
        ['demo-admin-garage-members'],
      );

      assert.equal(reviewRows.rows[0].count, String(demoWorkflowReviews.length));
      assert.equal(requestRows.rows[0].count, String(demoWorkflowRequests.length));
      assert.equal(publicReviews.length, 2);
      assert.ok(publicReviews.every((review) => review.text.startsWith('Lokale Demo-Bewertung:')));
      assert.equal(JSON.stringify(publicReviews).includes('demo-workflow-reviewer'), false);
      assert.equal(JSON.stringify(publicReviews).includes('demo-evidence'), false);
      assert.equal(JSON.stringify(publicSearch).includes('demo-request'), false);
      assert.equal(privateRequest.id, requestId);
      assert.equal(privateRequest.symptom, 'Fiktive lokale Anfrage: Bremsen prüfen.');
      await assert.rejects(() =>
        repairRequests.getRepairRequest(
          'demo-workflow-requester-b',
          'demo-request-prishtina-bremsen',
        ),
      );
    } finally {
      await client.end();
      await repairRequests.close();
      await reviews.close();
      await search.close();
    }
  },
);
