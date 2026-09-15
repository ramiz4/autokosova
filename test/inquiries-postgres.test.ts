import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { AccessError, AccessStore } from '../src/server/access';
import { createServer } from '../src/server/app';
import { PostgresRepairRequestStore } from '../src/server/repair-request-store';
import type { RepairRequestInput } from '../src/shared/repair-request';

const databaseUrl = process.env['DATABASE_URL'];
const input: RepairRequestInput = {
  areas: [
    { placeId: 'xk-pristina', radiusKm: 20 },
    { placeId: 'xk-peja', radiusKm: 10 },
  ],
  earliestDropoffOn: '2026-10-02',
  latestPickupOn: '2026-10-06',
  serviceCategoryId: 'bremsen',
  symptom: 'P'.repeat(170) + 'PRIVATE-TAIL',
  vehicle: {
    vehicleClass: 'suv',
    makeId: 'skoda',
    model: 'Fixture',
    year: 2018,
    engineDetails: 'PRIVATE-ENGINE',
  },
};

test(
  'PostgreSQL listing preserves cursor microseconds, stable ties and explicit ownership',
  { skip: !databaseUrl },
  async () => {
    const owner = `inquiries-owner-${randomUUID()}`;
    const other = `inquiries-other-${randomUUID()}`;
    const pool = new pg.Pool({ connectionString: databaseUrl });
    const store = new PostgresRepairRequestStore(databaseUrl!);
    const access = new AccessStore();
    const session = access.createSession(owner);
    const app = createServer({ accessStore: access, repairRequestStore: store });
    try {
      const ids: string[] = [];
      // The creation API, not a parallel fixture table, supplies the persisted requests.
      for (let i = 0; i < 4; i++) {
        const posted = await app.inject({
          method: 'POST',
          url: '/api/me/repair-requests',
          headers: {
            cookie: `autokosova_session=${session.sessionId}; autokosova_csrf=${session.csrfToken}`,
            'x-csrf-token': session.csrfToken,
          },
          payload: input,
        });
        assert.equal(posted.statusCode, 201);
        ids.push(posted.json().id);
      }
      const foreign = await store.createRepairRequest(other, {
        ...input,
        symptom: 'OTHER-ACCOUNT',
      });
      // Two sub-millisecond timestamps deliberately differ while both become the same JS Date.
      await pool.query(
        "UPDATE repair_request SET created_at = '2026-09-14 12:00:00.123456+00' WHERE owner_user_id = $1",
        [owner],
      );
      await pool.query(
        "UPDATE repair_request SET created_at = '2026-09-14 12:00:00.123457+00' WHERE id = $1",
        [ids[0]],
      );
      const expected = [ids[0], ...ids.slice(1).sort().reverse()];
      const received: string[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 4; i++) {
        const page = await store.listRepairRequests(owner, {
          limit: 1,
          ...(cursor ? { cursor } : {}),
        });
        assert.equal(page.requests.length, 1);
        const row = page.requests[0];
        received.push(row.id);
        assert.deepEqual(row.areas, input.areas);
        assert.equal(row.symptomPreview?.length, 160);
        assert.equal(row.vehicle?.vehicleClass, 'suv');
        const json = JSON.stringify(row);
        for (const value of [
          'PRIVATE-TAIL',
          'PRIVATE-ENGINE',
          'OTHER-ACCOUNT',
          'earliestDropoffOn',
          'attachmentIds',
          'ownerUserId',
        ])
          assert.ok(!json.includes(value));
        cursor = page.nextCursor ?? undefined;
        if (i < 3) assert.ok(cursor);
        else assert.equal(page.nextCursor, null);
      }
      assert.deepEqual(received, expected);
      for (const id of [foreign.id, 'absent']) {
        await assert.rejects(
          store.listRepairRequests(owner, { limit: 20, cursor: id }),
          (error: unknown) => error instanceof AccessError && error.statusCode === 404,
        );
      }
      await assert.rejects(store.getRepairRequest(other, ids[0]), AccessError);
      const own = await store.getRepairRequest(owner, ids[0]);
      assert.equal(own.earliestDropoffOn, input.earliestDropoffOn);
      assert.equal(own.symptom, input.symptom);
      assert.equal(own.vehicle?.engineDetails, 'PRIVATE-ENGINE');
      await assert.rejects(store.listRepairRequests(owner, { limit: 51 }), AccessError);
      const index = await pool.query(
        "SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'repair_request_owner_created_id_idx'",
      );
      assert.equal(index.rowCount, 1);

      const minimal = await store.createRepairRequest(owner, {
        ...input,
        areas: [],
        vehicle: undefined,
        symptom: undefined,
      });
      const newest = await store.listRepairRequests(owner, { limit: 1 });
      assert.equal(newest.requests[0].id, minimal.id);
      assert.deepEqual(newest.requests[0].areas, []);
      assert.equal(newest.requests[0].vehicle, undefined);
      // Revoking/deleting a cursor never silently restarts and duplicates the first page.
      await pool.query('DELETE FROM repair_request WHERE id = $1 AND owner_user_id = $2', [
        minimal.id,
        owner,
      ]);
      await assert.rejects(
        store.listRepairRequests(owner, { limit: 20, cursor: minimal.id }),
        AccessError,
      );
    } finally {
      await app.close();
      await pool.query(
        'DELETE FROM request_search_area WHERE repair_request_id IN (SELECT id FROM repair_request WHERE owner_user_id = ANY($1::text[]))',
        [[owner, other]],
      );
      await pool.query('DELETE FROM repair_request WHERE owner_user_id = ANY($1::text[])', [
        [owner, other],
      ]);
      await pool.query('DELETE FROM vehicle WHERE owner_user_id = ANY($1::text[])', [
        [owner, other],
      ]);
      await pool.query('DELETE FROM app_user WHERE id = ANY($1::text[])', [[owner, other]]);
      await pool.end();
    }
  },
);
