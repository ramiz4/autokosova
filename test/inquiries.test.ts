import assert from 'node:assert/strict';
import test from 'node:test';
import { AccessError, AccessStore } from '../src/server/access';
import { createServer, isNoIndexPath } from '../src/server/app';
import { isAccountPagePath } from '../src/server/account-profile';
import { parseRepairRequestPage } from '../src/server/repair-request-list';
import type { RepairRequestStore } from '../src/server/repair-request-store';
import {
  buildRepairRequestSearchParams,
  type RepairRequestInput,
} from '../src/shared/repair-request';

const input: RepairRequestInput = {
  serviceCategoryId: 'bremsen',
  areas: [
    { placeId: 'xk-pristina', radiusKm: 20 },
    { placeId: 'xk-prizren', radiusKm: 35 },
  ],
  earliestDropoffOn: '2026-10-02',
  latestPickupOn: '2026-10-06',
  symptom: 'A'.repeat(170) + 'PRIVATE-TAIL',
  vehicle: {
    makeId: 'skoda',
    model: 'Fiktives Modell',
    year: 2018,
    vehicleClass: 'suv',
    engineDetails: 'PRIVATE-ENGINE',
    transmissionDetails: 'PRIVATE-TRANSMISSION',
    mileageKm: 123_456,
  },
};
const headers = (session: { sessionId: string; csrfToken: string }, write = false) => ({
  cookie: `autokosova_session=${session.sessionId}; autokosova_csrf=${session.csrfToken}`,
  ...(write ? { 'x-csrf-token': session.csrfToken } : {}),
});
const privateHeaders = (response: { headers: Record<string, unknown> }) => {
  assert.equal(response.headers['cache-control'], 'private, no-store');
  assert.equal(response.headers['vary'], 'Cookie');
  assert.equal(response.headers['x-robots-tag'], 'noindex, nofollow');
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
};

test('existing POST persists into the same owner-only list and detail, including repeated reads', async () => {
  const store = new AccessStore();
  const owner = store.createSession('inquiries-owner');
  const other = store.createSession('inquiries-other');
  const admin = store.createSession('inquiries-admin');
  store.addRole('inquiries-admin', 'admin');
  const app = createServer({ accessStore: store });
  try {
    const grant = store.getFileGrant('inquiries-owner', 'application/pdf', 10);
    const posted = await app.inject({
      method: 'POST',
      url: '/api/me/repair-requests',
      headers: headers(owner, true),
      payload: { ...input, attachmentIds: [grant.fileId] },
    });
    assert.equal(posted.statusCode, 201);
    const id = posted.json().id as string;
    store.createRepairRequest('inquiries-other', { ...input, symptom: 'OTHER-ACCOUNT' });
    for (let reload = 0; reload < 2; reload++) {
      const list = await app.inject({ url: '/api/me/repair-requests', headers: headers(owner) });
      assert.equal(list.statusCode, 200);
      privateHeaders(list);
      assert.equal(list.json().requests.length, 1);
      assert.equal(list.json().requests[0].id, id);
      assert.equal(list.json().nextCursor, null);
      assert.equal(list.json().requests[0].symptomPreview.length, 160);
      assert.deepEqual(list.json().requests[0].areas, input.areas);
      assert.deepEqual(list.json().requests[0].vehicle, {
        makeId: 'skoda',
        model: 'Fiktives Modell',
        year: 2018,
        vehicleClass: 'suv',
      });
      for (const privateValue of [
        grant.fileId,
        'PRIVATE-TAIL',
        'PRIVATE-ENGINE',
        'PRIVATE-TRANSMISSION',
        '123456',
        'inquiries-owner',
        'OTHER-ACCOUNT',
        '2026-10-02',
      ])
        assert.ok(!list.body.includes(privateValue));
      assert.deepEqual(Object.keys(list.json().requests[0]).sort(), [
        'areas',
        'createdAt',
        'id',
        'serviceCategoryId',
        'symptomPreview',
        'vehicle',
      ]);
    }
    const detail = await app.inject({
      url: `/api/me/repair-requests/${id}`,
      headers: headers(owner),
    });
    assert.equal(detail.statusCode, 200);
    privateHeaders(detail);
    assert.equal(detail.json().symptom, input.symptom);
    assert.equal(detail.json().vehicle.engineDetails, 'PRIVATE-ENGINE');
    assert.equal(detail.json().earliestDropoffOn, input.earliestDropoffOn);
    assert.deepEqual(detail.json().attachmentIds, [grant.fileId]);
    for (const session of [other, admin]) {
      const foreign = await app.inject({
        url: `/api/me/repair-requests/${id}`,
        headers: headers(session),
      });
      const absent = await app.inject({
        url: '/api/me/repair-requests/absent',
        headers: headers(session),
      });
      assert.equal(foreign.statusCode, 404);
      assert.deepEqual(foreign.json(), absent.json());
      privateHeaders(foreign);
    }
    const adminList = await app.inject({ url: '/api/me/repair-requests', headers: headers(admin) });
    assert.deepEqual(adminList.json(), { requests: [], nextCursor: null });
    const query = buildRepairRequestSearchParams(input);
    assert.deepEqual([...query.keys()].sort(), ['places', 'service']);
    assert.ok(!query.toString().includes(id));
    assert.deepEqual(
      Object.keys(store.getRepairRequest('inquiries-owner', id).vehicle!).sort(),
      Object.keys(input.vehicle!).sort(),
    );
  } finally {
    await app.close();
  }
});

test('memory pagination is bounded, deterministic at equal timestamps, owner-scoped and detached', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-14T12:00:00Z') });
  const store = new AccessStore();
  const ids = Array.from({ length: 24 }, () => store.createRepairRequest('owner', input).id)
    .sort()
    .reverse();
  const foreign = store.createRepairRequest('other', input);
  const first = store.listRepairRequests('owner', { limit: 20 });
  assert.deepEqual(
    first.requests.map((item) => item.id),
    ids.slice(0, 20),
  );
  const last = store.listRepairRequests('owner', { limit: 20, cursor: first.nextCursor! });
  assert.deepEqual(
    last.requests.map((item) => item.id),
    ids.slice(20),
  );
  assert.equal(last.nextCursor, null);
  assert.equal(store.listRepairRequests('owner', { limit: 50 }).requests.length, 24);
  for (const cursor of [foreign.id, 'deleted-or-absent']) {
    assert.throws(
      () => store.listRepairRequests('owner', { limit: 20, cursor }),
      (error: unknown) => error instanceof AccessError && error.statusCode === 404,
    );
  }
  (first.requests[0].areas[0] as { radiusKm: number }).radiusKm = 99;
  assert.equal(store.getRepairRequest('owner', ids[0]).areas[0].radiusKm, 20);
  const minimal = store.createRepairRequest('minimal', {
    ...input,
    vehicle: undefined,
    symptom: undefined,
    areas: [],
  });
  const summary = store.listRepairRequests('minimal', { limit: 20 }).requests[0];
  assert.equal(summary.id, minimal.id);
  assert.equal(summary.vehicle, undefined);
  assert.equal(summary.symptomPreview, undefined);
  assert.deepEqual(summary.areas, []);
  for (const limit of [0, -1, 51, 1.5, Infinity])
    assert.throws(() => store.listRepairRequests('owner', { limit }), AccessError);
});

test('newer inserts do not shift an existing keyset page; default limit and query validation are explicit', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-14T12:00:00Z') });
  const store = new AccessStore();
  for (let i = 0; i < 3; i++) store.createRepairRequest('owner', input);
  const original = store.listRepairRequests('owner', { limit: 50 }).requests.map((item) => item.id);
  const first = store.listRepairRequests('owner', { limit: 1 });
  t.mock.timers.setTime(new Date('2026-09-14T13:00:00Z').getTime());
  store.createRepairRequest('owner', input);
  assert.deepEqual(
    store
      .listRepairRequests('owner', { limit: 20, cursor: first.nextCursor! })
      .requests.map((item) => item.id),
    original.slice(1),
  );
  assert.deepEqual(parseRepairRequestPage({}), { limit: 20 });
  for (const query of [
    { owner: 'other' },
    { userId: 'other' },
    { limit: '51' },
    { limit: '0' },
    { limit: '1.5' },
    { limit: '01' },
    { limit: ['1', '2'] },
    { cursor: '' },
    { cursor: ['x'] },
    { cursor: '../x' },
  ])
    assert.throws(() => parseRepairRequestPage(query), AccessError);
});

test('guests, expired sessions and supplied owner/duplicate query parameters cannot broaden access', async () => {
  const store = new AccessStore();
  const active = store.createSession('owner');
  const expired = store.createSession('owner', new Date(0));
  const app = createServer({ accessStore: store });
  try {
    for (const url of ['/api/me/repair-requests', '/api/me/repair-requests/any']) {
      for (const session of [undefined, expired]) {
        const response = await app.inject({
          url,
          ...(session ? { headers: headers(session) } : {}),
        });
        assert.equal(response.statusCode, 401);
        privateHeaders(response);
      }
    }
    for (const query of [
      'userId=other',
      'ownerUserId=other',
      'limit=1&limit=2',
      'cursor=x&cursor=y',
      'limit=51',
    ]) {
      const response = await app.inject({
        url: `/api/me/repair-requests?${query}`,
        headers: headers(active),
      });
      assert.equal(response.statusCode, 400);
      privateHeaders(response);
    }
  } finally {
    await app.close();
  }
});

for (const detail of [false, true]) {
  test(`session revocation during asynchronous ${detail ? 'detail' : 'list'} read discards the result`, async () => {
    const store = new AccessStore();
    const session = store.createSession('owner');
    const created = store.createRepairRequest('owner', input);
    const delegate: RepairRequestStore = {
      createRepairRequest: (owner, body) => store.createRepairRequest(owner, body),
      getRepairRequest: async (owner, id) => {
        store.revokeSession(session.sessionId);
        return store.getRepairRequest(owner, id);
      },
      listRepairRequests: async (owner, options) => {
        store.revokeSession(session.sessionId);
        return store.listRepairRequests(owner, options);
      },
    };
    const app = createServer({ accessStore: store, repairRequestStore: delegate });
    try {
      const response = await app.inject({
        url: '/api/me/repair-requests' + (detail ? `/${created.id}` : ''),
        headers: headers(session),
      });
      assert.equal(response.statusCode, 401);
      assert.ok(!response.body.includes(created.id));
      privateHeaders(response);
    } finally {
      await app.close();
    }
  });
}

test('unexpected database errors are sanitized for both private reads', async () => {
  const store = new AccessStore();
  const session = store.createSession('owner');
  const fail = () => {
    throw new Error('PRIVATE-DB-ROW with engine, travel and credentials');
  };
  const app = createServer({
    accessStore: store,
    repairRequestStore: {
      createRepairRequest: fail,
      getRepairRequest: fail,
      listRepairRequests: fail,
    },
  });
  try {
    for (const url of ['/api/me/repair-requests', '/api/me/repair-requests/any']) {
      const response = await app.inject({ url, headers: headers(session) });
      assert.equal(response.statusCode, 503);
      assert.ok(!response.body.includes('PRIVATE-DB-ROW'));
      privateHeaders(response);
    }
  } finally {
    await app.close();
  }
});

test('canonical pages are private/noindex, absent from sitemap, and safe login returns remain local', async () => {
  const store = new AccessStore();
  const app = createServer({
    accessStore: store,
    publicSiteUrl: 'https://example.invalid',
    oidcConfig: {
      clientId: 'fixture-client',
      audience: 'fixture-client',
      issuer: 'https://identity.invalid',
      authorizationEndpoint: 'https://identity.invalid/authorize',
      tokenEndpoint: 'https://identity.invalid/token',
      jwksUri: 'https://identity.invalid/jwks',
      redirectUri: 'https://example.invalid/auth/callback',
    },
  });
  try {
    const paths = ['/inquiries', '/sq/inquiries', '/en/inquiries'];
    const sitemap = await app.inject({ url: '/sitemap.xml' });
    assert.ok(!sitemap.body.includes('inquiries'));
    const robots = await app.inject({ url: '/robots.txt' });
    for (const path of paths) {
      assert.ok(isNoIndexPath(path));
      assert.ok(isAccountPagePath(`${path}/?view=any`));
      assert.ok(robots.body.includes(`Disallow: ${path}\n`));
      privateHeaders(await app.inject({ url: path }));
    }
    for (const target of [
      ...paths,
      'https://evil.invalid/inquiries',
      '//evil.invalid/inquiries',
      '/inquiries?userId=other',
      '/inquiries#secret',
      '/inquiries-elsewhere',
    ]) {
      const response = await app.inject({
        url: '/auth/login?returnTo=' + encodeURIComponent(target),
      });
      assert.equal(response.statusCode, 302);
      const state = new URL(response.headers.location!).searchParams.get('state')!;
      assert.equal(
        store.consumeOidcTransaction(state)?.returnTo,
        paths.includes(target) ? target : '/',
      );
    }
  } finally {
    await app.close();
  }
});
