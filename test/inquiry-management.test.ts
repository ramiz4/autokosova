import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { AccessError, AccessStore } from '../src/server/access';
import { createServer } from '../src/server/app';
import {
  PostgresRepairRequestStore,
  UnavailableRepairRequestStore,
  type RepairRequestStore,
} from '../src/server/repair-request-store';
import type { RepairRequestInput } from '../src/shared/repair-request';

const databaseUrl = process.env['DATABASE_URL'];
const input: RepairRequestInput = {
  areas: [{ placeId: 'xk-pristina', radiusKm: 20 }],
  serviceCategoryId: 'bremsen',
  earliestDropoffOn: '2026-10-02',
  latestPickupOn: '2026-10-06',
  symptom: 'Fiktiver Bedarf',
  vehicle: { makeId: 'skoda', model: 'Testmodell', mileageKm: 0, fuel: 'diesel' },
};
const headers = (session: { sessionId: string; csrfToken: string }, revision?: number) => ({
  cookie: `autokosova_session=${session.sessionId}; autokosova_csrf=${session.csrfToken}`,
  'x-csrf-token': session.csrfToken,
  ...(revision === undefined ? {} : { 'if-match': `"${revision}"` }),
});

for (const backend of ['memory', 'postgres'] as const) {
  test(
    `${backend}: real API persistence, revision checks, owner-only edit/deactivate/reactivate/delete`,
    { skip: backend === 'postgres' && !databaseUrl },
    async () => {
      const access = new AccessStore();
      const ownerId = `management-${randomUUID()}`;
      const otherId = `management-${randomUUID()}`;
      const owner = access.createSession(ownerId),
        other = access.createSession(otherId);
      access.addRole(otherId, 'admin'); // Admin is still not the owner of this private resource.
      const store: RepairRequestStore =
        backend === 'postgres' ? new PostgresRepairRequestStore(databaseUrl!) : access;
      const pool =
        backend === 'postgres' ? new pg.Pool({ connectionString: databaseUrl }) : undefined;
      const app = createServer({ accessStore: access, repairRequestStore: store });
      try {
        const created = await app.inject({
          method: 'POST',
          url: '/api/me/repair-requests',
          headers: headers(owner),
          payload: input,
        });
        assert.equal(created.statusCode, 201);
        const id = created.json().id as string;
        const url = `/api/me/repair-requests/${id}`;
        const before = await app.inject({ url, headers: headers(owner) });
        assert.equal(before.json().active, true);
        assert.equal(before.json().revision, 1);
        assert.equal(before.headers.etag, '"1"');
        const changed: RepairRequestInput = {
          ...input,
          areas: [{ placeId: 'xk-peja', radiusKm: 35 }],
          symptom: 'Geänderter fiktiver Bedarf',
          vehicle: { model: 'Neues Testmodell', mileageKm: 0 },
          earliestDropoffOn: '2026-11-01',
          latestPickupOn: '2026-11-08',
        };
        const missingSession = await app.inject({ method: 'PUT', url, payload: changed });
        assert.equal(missingSession.statusCode, 401);
        const missingCsrf = await app.inject({
          method: 'PUT',
          url,
          payload: changed,
          headers: { cookie: headers(owner).cookie, 'if-match': '"1"' },
        });
        assert.equal(missingCsrf.statusCode, 403);
        assert.equal(
          (await app.inject({ method: 'PUT', url, payload: changed, headers: headers(owner) }))
            .statusCode,
          428,
        );
        assert.equal(
          (
            await app.inject({
              method: 'PUT',
              url,
              payload: { ...changed, userId: otherId },
              headers: headers(owner, 1),
            })
          ).statusCode,
          400,
        );
        assert.equal(
          (
            await app.inject({
              method: 'PATCH',
              url,
              payload: { active: 'false' },
              headers: headers(owner, 1),
            })
          ).statusCode,
          400,
        );
        assert.equal(
          (
            await app.inject({
              method: 'PUT',
              url,
              payload: { ...changed, latestPickupOn: '2026-01-01' },
              headers: headers(owner, 1),
            })
          ).statusCode,
          400,
        );
        for (const method of ['PUT', 'PATCH', 'DELETE'] as const) {
          const denied = await app.inject({
            method,
            url,
            headers: headers(other, 1),
            ...(method === 'DELETE'
              ? {}
              : { payload: method === 'PUT' ? changed : { active: false } }),
          });
          assert.equal(denied.statusCode, 404);
          assert.equal(denied.headers['cache-control'], 'private, no-store');
          assert.ok(!denied.body.includes(input.symptom!));
        }
        const update = await app.inject({
          method: 'PUT',
          url,
          headers: headers(owner, 1),
          payload: changed,
        });
        assert.equal(update.statusCode, 200, update.body);
        assert.equal(update.json().revision, 2);
        assert.equal(update.json().createdAt, before.json().createdAt);
        assert.deepEqual(update.json().vehicle, changed.vehicle);
        const restored = await app.inject({ url, headers: headers(owner) });
        assert.equal(restored.json().symptom, changed.symptom);
        assert.deepEqual(restored.json().areas, changed.areas);
        assert.equal(restored.json().latestPickupOn, changed.latestPickupOn);
        if (pool) {
          const persisted = await pool.query(
            'SELECT symptom,revision,active FROM repair_request WHERE id=$1 AND owner_user_id=$2',
            [id, ownerId],
          );
          assert.deepEqual(persisted.rows[0], {
            symptom: changed.symptom,
            revision: 2,
            active: true,
          });
        }
        assert.equal(
          (await app.inject({ method: 'PUT', url, headers: headers(owner, 1), payload: input }))
            .statusCode,
          409,
        );
        assert.equal(
          (await app.inject({ url, headers: headers(owner) })).json().symptom,
          changed.symptom,
        );
        const inactive = await app.inject({
          method: 'PATCH',
          url,
          headers: headers(owner, 2),
          payload: { active: false },
        });
        assert.equal(inactive.statusCode, 200);
        assert.equal(inactive.json().active, false);
        assert.equal(inactive.json().revision, 3);
        assert.equal(
          (
            await app.inject({
              url: '/api/me/repair-requests?activity=active',
              headers: headers(owner),
            })
          ).json().requests.length,
          0,
        );
        assert.equal(
          (
            await app.inject({
              url: '/api/me/repair-requests?activity=inactive',
              headers: headers(owner),
            })
          ).json().requests[0].id,
          id,
        );
        const editInactive = await app.inject({
          method: 'PUT',
          url,
          headers: headers(owner, 3),
          payload: changed,
        });
        assert.equal(editInactive.json().active, false);
        const active = await app.inject({
          method: 'PATCH',
          url,
          headers: headers(owner, 4),
          payload: { active: true },
        });
        assert.equal(active.json().active, true);
        assert.equal(active.json().revision, 5);
        assert.equal(
          (await app.inject({ method: 'DELETE', url, headers: headers(owner, 1) })).statusCode,
          409,
        );
        const deletion = await app.inject({ method: 'DELETE', url, headers: headers(owner, 5) });
        assert.equal(deletion.statusCode, 204);
        assert.equal(deletion.headers['cache-control'], 'private, no-store');
        assert.equal((await app.inject({ url, headers: headers(owner) })).statusCode, 404);
        assert.equal(
          (await app.inject({ method: 'DELETE', url, headers: headers(owner, 5) })).statusCode,
          404,
        );
        assert.deepEqual(
          (await app.inject({ url: '/api/me/repair-requests', headers: headers(owner) })).json()
            .requests,
          [],
        );
        if (pool) {
          assert.equal(
            (await pool.query('SELECT id FROM repair_request WHERE id=$1', [id])).rowCount,
            0,
          );
          assert.equal(
            (
              await pool.query('SELECT id FROM request_search_area WHERE repair_request_id=$1', [
                id,
              ])
            ).rowCount,
            0,
          );
          assert.equal(
            (await pool.query('SELECT id FROM vehicle WHERE owner_user_id=$1', [ownerId])).rowCount,
            0,
          );
        }
      } finally {
        await app.close();
        if (pool) {
          await pool.query(
            'DELETE FROM request_search_area WHERE repair_request_id IN (SELECT id FROM repair_request WHERE owner_user_id=$1)',
            [ownerId],
          );
          await pool.query('DELETE FROM repair_request WHERE owner_user_id=$1', [ownerId]);
          await pool.query('DELETE FROM vehicle WHERE owner_user_id=$1', [ownerId]);
          await pool.query('DELETE FROM app_user WHERE id=$1', [ownerId]);
          await pool.end();
        }
      }
    },
  );
}

test('unconfigured runtime storage never substitutes transient records for persisted data', async () => {
  const access = new AccessStore(),
    session = access.createSession('storage-owner');
  const record = access.createRepairRequest('storage-owner', input);
  const app = createServer({
    accessStore: access,
    repairRequestStore: new UnavailableRepairRequestStore(),
  });
  try {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const url =
        '/api/me/repair-requests' +
        (['PUT', 'PATCH', 'DELETE'].includes(method) ? `/${record.id}` : '');
      const response = await app.inject({
        method,
        url,
        headers: headers(session, 1),
        ...(['POST', 'PUT', 'PATCH'].includes(method)
          ? { payload: method === 'PATCH' ? { active: false } : input }
          : {}),
      });
      assert.equal(response.statusCode, 503);
      assert.ok(!response.body.includes(input.symptom!));
    }
  } finally {
    await app.close();
  }
});

test(
  'PostgreSQL mutations roll back all child changes, isolate vehicle snapshots and serialize stale writes',
  { skip: !databaseUrl },
  async () => {
    const owner = `transaction-${randomUUID()}`,
      other = `transaction-${randomUUID()}`;
    const pool = new pg.Pool({ connectionString: databaseUrl });
    const store = new PostgresRepairRequestStore(databaseUrl!);
    try {
      const original = await store.createRepairRequest(owner, input);
      const second = await store.createRepairRequest(owner, input);
      await store.createRepairRequest(other, input);
      // Legacy shared vehicle references are not edited or removed as a side effect.
      await pool.query(
        'UPDATE repair_request SET vehicle_id=(SELECT vehicle_id FROM repair_request WHERE id=$1) WHERE id=$2',
        [original.id, second.id],
      );
      let checks = 0;
      await assert.rejects(
        store.mutateRepairRequest(
          owner,
          original.id,
          1,
          {
            kind: 'update',
            input: { ...input, symptom: 'Must roll back', vehicle: { model: 'Must roll back' } },
          },
          () => {
            if (++checks === 2) throw new AccessError(401, 'Authentication required');
          },
        ),
        (error: unknown) => error instanceof AccessError && error.statusCode === 401,
      );
      const unchanged = await store.getRepairRequest(owner, original.id);
      assert.equal(unchanged.revision, 1);
      assert.equal(unchanged.symptom, input.symptom);
      assert.deepEqual(unchanged.vehicle, input.vehicle);
      const wins = await Promise.allSettled(
        [1, 2].map((i) =>
          store.mutateRepairRequest(owner, original.id, 1, {
            kind: 'update',
            input: {
              ...input,
              symptom: `Concurrent ${i}`,
              vehicle: { model: 'Only this request' },
            },
          }),
        ),
      );
      assert.equal(wins.filter((item) => item.status === 'fulfilled').length, 1);
      const loss = wins.find((item) => item.status === 'rejected') as PromiseRejectedResult;
      assert.equal(loss.reason.statusCode, 409);
      assert.deepEqual((await store.getRepairRequest(owner, second.id)).vehicle, input.vehicle);
      const beforeFiles = await store.getRepairRequest(owner, second.id);
      await assert.rejects(
        store.mutateRepairRequest(owner, second.id, 1, {
          kind: 'update',
          input: { ...input, attachmentIds: ['foreign-file'], areas: [], vehicle: undefined },
        }),
        AccessError,
      );
      assert.deepEqual(await store.getRepairRequest(owner, second.id), beforeFiles);
      // Default filtering is all; cursor ordering remains based on creation, not edit time.
      await store.mutateRepairRequest(owner, original.id, 2, { kind: 'activity', active: false });
      const inactive = await store.listRepairRequests(owner, { limit: 1, activity: 'inactive' });
      assert.equal(inactive.requests[0].id, original.id);
      await store.mutateRepairRequest(owner, original.id, 3, { kind: 'delete' });
      assert.deepEqual((await store.getRepairRequest(owner, second.id)).vehicle, input.vehicle);
    } finally {
      await store.close();
      await pool.query(
        'DELETE FROM request_search_area WHERE repair_request_id IN (SELECT id FROM repair_request WHERE owner_user_id=ANY($1::text[]))',
        [[owner, other]],
      );
      await pool.query('DELETE FROM repair_request WHERE owner_user_id=ANY($1::text[])', [
        [owner, other],
      ]);
      await pool.query('DELETE FROM vehicle WHERE owner_user_id=ANY($1::text[])', [[owner, other]]);
      await pool.query('DELETE FROM app_user WHERE id=ANY($1::text[])', [[owner, other]]);
      await pool.end();
    }
  },
);
