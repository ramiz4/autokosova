import assert from 'node:assert/strict';
import test from 'node:test';
import { AccessError, AccessStore } from '../src/server/access';
import { createServer } from '../src/server/app';
import { PostgresRepairRequestStore } from '../src/server/repair-request-store';

const databaseUrl = process.env['DATABASE_URL'];

function headers(session: { csrfToken: string; sessionId: string }, write = false) {
  return {
    cookie: `autokosova_session=${session.sessionId}; autokosova_csrf=${session.csrfToken}`,
    ...(write ? { 'x-csrf-token': session.csrfToken } : {}),
  };
}

test(
  'PostgreSQL repository persists a private request with local dates and multiple areas',
  {
    skip: !databaseUrl,
  },
  async () => {
    const store = new PostgresRepairRequestStore(databaseUrl!);
    try {
      const created = await store.createRepairRequest('postgres-customer-a', {
        areas: [
          { placeId: 'xk-pristina', radiusKm: 15 },
          { placeId: 'xk-prizren', radiusKm: 30 },
        ],
        earliestDropoffOn: '2026-10-02',
        latestPickupOn: '2026-10-06',
        serviceCategoryId: 'bremsen',
        symptom: 'Fiktiver privater Hinweis',
        vehicle: {
          vehicleClass: 'suv',
          fuel: 'diesel',
          makeId: 'skoda',
          mileageKm: 128000,
          model: 'Fiktives Modell',
          year: 2018,
        },
      });

      test(
        'private repair-request API uses the PostgreSQL repository when configured',
        {
          skip: !databaseUrl,
        },
        async () => {
          const accessStore = new AccessStore();
          const customerA = accessStore.createSession('postgres-api-customer-a');
          const customerB = accessStore.createSession('postgres-api-customer-b');
          const app = createServer({
            accessStore,
            repairRequestStore: new PostgresRepairRequestStore(databaseUrl!),
          });
          try {
            const created = await app.inject({
              headers: headers(customerA, true),
              method: 'POST',
              payload: {
                areas: [{ placeId: 'xk-pristina', radiusKm: 20 }],
                earliestDropoffOn: '2026-10-02',
                latestPickupOn: '2026-10-06',
                serviceCategoryId: 'bremsen',
              },
              url: '/api/me/repair-requests',
            });
            const requestId = created.json().id as string;
            const owner = await app.inject({
              headers: headers(customerA),
              method: 'GET',
              url: `/api/me/repair-requests/${requestId}`,
            });
            const foreign = await app.inject({
              headers: headers(customerB),
              method: 'GET',
              url: `/api/me/repair-requests/${requestId}`,
            });

            assert.equal(created.statusCode, 201);
            assert.equal(owner.statusCode, 200);
            assert.equal(owner.json().earliestDropoffOn, '2026-10-02');
            assert.equal(foreign.statusCode, 404);
          } finally {
            await app.close();
          }
        },
      );
      const restored = await store.getRepairRequest('postgres-customer-a', created.id);

      assert.deepEqual(restored.areas, [
        { placeId: 'xk-pristina', radiusKm: 15 },
        { placeId: 'xk-prizren', radiusKm: 30 },
      ]);
      assert.equal(restored.earliestDropoffOn, '2026-10-02');
      assert.equal(restored.latestPickupOn, '2026-10-06');
      assert.equal(restored.symptom, 'Fiktiver privater Hinweis');
      assert.deepEqual(restored.vehicle, {
        vehicleClass: 'suv',
        fuel: 'diesel',
        makeId: 'skoda',
        mileageKm: 128000,
        model: 'Fiktives Modell',
        year: 2018,
      });
      const partial = await store.createRepairRequest('postgres-customer-a', {
        areas: [{ placeId: 'xk-peja', radiusKm: 10 }],
        earliestDropoffOn: '2026-10-02',
        latestPickupOn: '2026-10-06',
        serviceCategoryId: 'bremsen',
        vehicle: { vehicleClass: 'motorcycle', fuel: 'electric' },
      });
      assert.deepEqual((await store.getRepairRequest('postgres-customer-a', partial.id)).vehicle, {
        vehicleClass: 'motorcycle',
        fuel: 'electric',
      });
      await assert.rejects(
        () => store.getRepairRequest('postgres-customer-b', created.id),
        (error: unknown) => error instanceof AccessError && error.statusCode === 404,
      );
    } finally {
      await store.close();
    }
  },
);
