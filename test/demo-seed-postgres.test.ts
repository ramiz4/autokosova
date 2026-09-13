import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { demoWorkshops } from '../scripts/db/seed-data.mjs';
import { PostgresWorkshopSearchStore } from '../src/server/workshop-search-store';

const databaseUrl = process.env['DATABASE_URL'];
const demoDataExpected = process.env['AUTOKOSOVA_EXPECT_DEMO_DATA'] === '1';

test(
  'the explicit demo seed creates only the documented public, review-free profiles',
  { skip: !databaseUrl || !demoDataExpected },
  async () => {
    const client = new pg.Client({ connectionString: databaseUrl });
    const search = new PostgresWorkshopSearchStore(databaseUrl!);
    const demoIds = demoWorkshops.map((workshop) => workshop.id);
    await client.connect();
    try {
      const profiles = await client.query<{ id: string; name: string }>(
        `SELECT id, name
         FROM public_workshop_profile
         WHERE id = ANY($1::text[])
         ORDER BY id`,
        [demoIds],
      );
      const reviews = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM workshop_review
         WHERE workshop_id = ANY($1::text[])`,
        [demoIds],
      );
      const provenance = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM local_demo_seed_workshop
         WHERE workshop_id = ANY($1::text[])`,
        [demoIds],
      );
      const result = await search.searchPublicWorkshops({
        areas: [{ placeId: 'xk-pristina', radiusKm: 5 }],
        language: 'Deutsch',
        page: 1,
        pageSize: 10,
        serviceCategoryId: 'bremsen',
        vehicleMakeId: 'skoda',
      });

      assert.deepEqual(
        profiles.rows.map((profile) => profile.id),
        [...demoIds].sort(),
      );
      assert.ok(profiles.rows.every((profile) => profile.name.startsWith('DEMO ·')));
      assert.equal(reviews.rows[0].count, '0');
      assert.equal(provenance.rows[0].count, String(demoWorkshops.length));
      assert.deepEqual(
        result.results.map((workshop) => workshop.id),
        ['demo-prishtina-bremsen'],
      );
      assert.equal(result.results[0].reviewSummary.state, 'unavailable');
      assert.equal(JSON.stringify(result).includes('Lokale Demo-Person'), false);
    } finally {
      await client.end();
      await search.close();
    }
  },
);
