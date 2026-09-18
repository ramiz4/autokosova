import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { demoGarages } from '../scripts/db/seed-data.mjs';
import { PostgresGarageSearchStore } from '../src/server/garage-search-store';
import { LOCAL_DEMO_PHOTOS } from '../src/shared/local-demo';

const databaseUrl = process.env['DATABASE_URL'];
const demoDataExpected = process.env['AUTOKOSOVA_EXPECT_DEMO_DATA'] === '1';

test(
  'the explicit demo seed creates only the documented public, review-free profiles',
  { skip: !databaseUrl || !demoDataExpected },
  async () => {
    const client = new pg.Client({ connectionString: databaseUrl });
    const search = new PostgresGarageSearchStore(databaseUrl!);
    const demoIds = demoGarages.map((garage) => garage.id);
    await client.connect();
    try {
      const profiles = await client.query<{ id: string; name: string }>(
        `SELECT id, name
         FROM public_garage_profile
         WHERE id = ANY($1::text[])
         ORDER BY id`,
        [demoIds],
      );
      const reviews = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM garage_review g
         WHERE g.garage_id = ANY($1::text[])
           AND NOT EXISTS (
             SELECT 1 FROM local_demo_seed_entity
             WHERE entity_type = 'garage_review' AND entity_id = g.id
           )`,
        [demoIds],
      );
      const provenance = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM local_demo_seed_garage
         WHERE garage_id = ANY($1::text[])`,
        [demoIds],
      );
      const result = await search.searchPublicGarages({
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
      // IDs are the stable demo identifiers — names are intentionally realistic.
      assert.ok(profiles.rows.every((profile) => profile.id.startsWith('demo-')));
      assert.equal(reviews.rows[0].count, '0');
      assert.equal(provenance.rows[0].count, String(demoGarages.length));
      assert.deepEqual(
        result.results.map((garage) => garage.id),
        ['demo-prishtina-bremsen', 'demo-prishtina-bremsen-offen'],
      );
      assert.equal(result.results[0].reviewSummary.state, 'unavailable');
      assert.deepEqual(
        result.results[0].photoIds,
        LOCAL_DEMO_PHOTOS.map((photo) => photo.id),
      );
      assert.equal(result.results[0].contact.whatsapp, true);
      assert.equal(JSON.stringify(result).includes('Lokale Demo-Person'), false);
    } finally {
      await client.end();
      await search.close();
    }
  },
);
