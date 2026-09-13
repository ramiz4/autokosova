import assert from 'node:assert/strict';
import test from 'node:test';
import { AccessStore } from '../src/server/access';
import { createServer } from '../src/server/app';
import { REPAIR_REQUEST_LIMITS } from '../src/shared/repair-request';

function headers(session: { csrfToken: string; sessionId: string }, write = false) {
  return {
    cookie: `autokosova_session=${session.sessionId}; autokosova_csrf=${session.csrfToken}`,
    ...(write ? { 'x-csrf-token': session.csrfToken } : {}),
  };
}

function validRequest() {
  return {
    areas: [
      { placeId: 'xk-pristina', radiusKm: REPAIR_REQUEST_LIMITS.minRadiusKm },
      { placeId: 'xk-prizren', radiusKm: REPAIR_REQUEST_LIMITS.maxRadiusKm },
    ],
    earliestDropoffOn: '2026-10-02',
    latestPickupOn: '2026-10-06',
    serviceCategoryId: 'bremsen',
    stayEndsOn: '2026-10-08',
    symptom: 'Fiktives Quietschen beim Bremsen.',
    vehicle: {
      engineDetails: 'Fiktiver Benzinmotor',
      makeId: 'skoda',
      mileageKm: 128000,
      model: 'Fiktives Modell',
      transmissionDetails: 'Manuell',
      year: 2018,
    },
  };
}

function setup() {
  const store = new AccessStore();
  const customerA = store.createSession('customer-a');
  const customerB = store.createSession('customer-b');
  const app = createServer({ accessStore: store });
  return { app, customerA, customerB };
}

test('repair requests stay private and hand only service and areas to matching', async () => {
  const { app, customerA, customerB } = setup();
  try {
    const guest = await app.inject({
      method: 'POST',
      payload: validRequest(),
      url: '/api/me/repair-requests',
    });
    const created = await app.inject({
      headers: headers(customerA, true),
      method: 'POST',
      payload: validRequest(),
      url: '/api/me/repair-requests',
    });
    const requestId = created.json().id as string;
    const owner = await app.inject({
      headers: headers(customerA),
      method: 'GET',
      url: `/api/me/repair-requests/${requestId}`,
    });
    const stranger = await app.inject({
      headers: headers(customerB),
      method: 'GET',
      url: `/api/me/repair-requests/${requestId}`,
    });

    assert.equal(guest.statusCode, 401);
    assert.equal(created.statusCode, 201);
    assert.equal(
      created.json().matchingPath,
      '/suche?places=xk-pristina%3A5%2Cxk-prizren%3A100&service=bremsen',
    );
    assert.equal(created.json().matchingPath.includes('2026-10-02'), false);
    assert.equal(created.json().matchingPath.includes('Fiktives'), false);
    assert.equal(owner.statusCode, 200);
    assert.equal(owner.json().symptom, 'Fiktives Quietschen beim Bremsen.');
    assert.equal(stranger.statusCode, 404);
  } finally {
    await app.close();
  }
});

test('request API rejects incomplete vehicles, duplicate areas, and inconsistent local dates', async () => {
  const { app, customerA } = setup();
  try {
    const incompleteVehicle = await app.inject({
      headers: headers(customerA, true),
      method: 'POST',
      payload: { ...validRequest(), vehicle: { makeId: 'skoda' } },
      url: '/api/me/repair-requests',
    });
    const duplicateArea = await app.inject({
      headers: headers(customerA, true),
      method: 'POST',
      payload: {
        ...validRequest(),
        areas: [
          { placeId: 'xk-pristina', radiusKm: 20 },
          { placeId: 'xk-pristina', radiusKm: 30 },
        ],
      },
      url: '/api/me/repair-requests',
    });
    const contradictoryDates = await app.inject({
      headers: headers(customerA, true),
      method: 'POST',
      payload: {
        ...validRequest(),
        earliestDropoffOn: '2026-10-08',
        latestPickupOn: '2026-10-06',
      },
      url: '/api/me/repair-requests',
    });
    const invalidDay = await app.inject({
      headers: headers(customerA, true),
      method: 'POST',
      payload: { ...validRequest(), latestPickupOn: '2026-02-30' },
      url: '/api/me/repair-requests',
    });

    assert.equal(incompleteVehicle.statusCode, 400);
    assert.equal(duplicateArea.statusCode, 400);
    assert.equal(contradictoryDates.statusCode, 400);
    assert.equal(invalidDay.statusCode, 400);
    assert.match(contradictoryDates.json().error, /local calendar dates/);
  } finally {
    await app.close();
  }
});

test('a repair request cannot reference another customer private upload', async () => {
  const { app, customerA, customerB } = setup();
  try {
    const uploaded = await app.inject({
      headers: headers(customerA, true),
      method: 'POST',
      payload: { contentType: 'application/pdf', sizeBytes: 1024 },
      url: '/api/files/upload-grants',
    });
    const foreignReference = await app.inject({
      headers: headers(customerB, true),
      method: 'POST',
      payload: { ...validRequest(), attachmentIds: [uploaded.json().fileId] },
      url: '/api/me/repair-requests',
    });

    assert.equal(uploaded.statusCode, 201);
    assert.equal(foreignReference.statusCode, 404);
  } finally {
    await app.close();
  }
});
