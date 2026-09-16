import assert from 'node:assert/strict';
import test from 'node:test';
import { AccessStore } from '../src/server/access';
import { createServer } from '../src/server/app';
import { readDemoAccountConfig } from '../scripts/db/demo-accounts.mjs';

const profile = {
  name: 'Fiktive Besitzer-Werkstatt',
  placeId: 'xk-pristina',
  address: 'Fiktive Strasse 12, Prishtina',
  contactPerson: 'Demo Kontakt',
  contactPhone: '+9990000001',
  languages: ['Deutsch'],
  serviceCategoryIds: ['bremsen'],
  vehicleMakeIds: [],
  selfReportedSpecializations: [],
};

test('demo binding configuration requires distinct subjects and an explicit valid issuer', () => {
  assert.equal(readDemoAccountConfig({}), undefined);
  const config = {
    AUTOKOSOVA_DEMO_GARAGE_SUBJECT: 'fake-garage',
    AUTOKOSOVA_DEMO_CUSTOMER_SUBJECT: 'fake-customer',
    ZITADEL_ISSUER: 'https://identity.example.test',
  };
  assert.deepEqual(readDemoAccountConfig(config), {
    garage: 'fake-garage',
    customer: 'fake-customer',
    issuer: config.ZITADEL_ISSUER,
  });
  for (const invalid of [
    { ...config, AUTOKOSOVA_DEMO_CUSTOMER_SUBJECT: '' },
    { ...config, AUTOKOSOVA_DEMO_CUSTOMER_SUBJECT: 'fake-garage' },
    { ...config, AUTOKOSOVA_DEMO_GARAGE_SUBJECT: '   ' },
    { ...config, ZITADEL_ISSUER: '' },
    { ...config, ZITADEL_ISSUER: 'http://remote.example.test' },
    { ...config, ZITADEL_ISSUER: 'https://identity.example.test?unexpected=value' },
  ])
    assert.throws(() => readDemoAccountConfig(invalid));
});

test('garage CRUD keeps account purpose, requires active ownership for deletion and never accepts email claims as rights', async () => {
  const access = new AccessStore();
  const sessions = Object.fromEntries(
    ['owner', 'other', 'editor', 'admin'].map((id) => [
      id,
      access.createSession(id, undefined, { email: 'same@example.test' }),
    ]),
  );
  access.addRole('admin', 'admin');
  const app = createServer({ accessStore: access });
  const headers = (id: string) => ({
    cookie: `autokosova_session=${sessions[id].sessionId}; autokosova_csrf=${sessions[id].csrfToken}`,
    'x-csrf-token': sessions[id].csrfToken,
  });
  try {
    const ids: string[] = [];
    for (const name of ['Erste fiktive Werkstatt', 'Zweite fiktive Werkstatt']) {
      const created = await app.inject({
        method: 'POST',
        url: '/api/garages',
        headers: headers('owner'),
        payload: { profile: { ...profile, name }, consentVersion: 'v1' },
      });
      assert.equal(created.statusCode, 201);
      ids.push(created.json().id);
    }
    const url = '/api/garages/' + ids[0];
    access.addMembership('editor', ids[0], 'editor');
    assert.equal(
      (await app.inject({ url: '/api/me', headers: headers('owner') })).json().accountType,
      'garage',
    );
    assert.equal(
      (await app.inject({ url: '/api/me', headers: headers('other') })).json().accountType,
      'customer',
    );
    const summaries = (
      await app.inject({ url: '/api/me/garages', headers: headers('owner') })
    ).json().garages;
    assert.equal(summaries.length, 2);
    assert.deepEqual(Object.keys(summaries[0]).sort(), [
      'canDelete',
      'id',
      'name',
      'placeId',
      'publicationState',
      'serviceCategoryIds',
    ]);
    assert.equal(summaries[0].canDelete, true);
    assert.deepEqual(summaries[0].serviceCategoryIds, ['bremsen']);
    assert.equal(
      (await app.inject({ url: '/api/me/garages', headers: headers('other') })).json().garages
        .length,
      0,
    );
    assert.equal((await app.inject({ url, headers: headers('editor') })).json().canDelete, false);
    assert.equal(
      (await app.inject({ method: 'PUT', url, headers: headers('owner'), payload: profile }))
        .statusCode,
      204,
    );
    assert.equal((await app.inject({ method: 'DELETE', url })).statusCode, 401);
    assert.equal(
      (await app.inject({ method: 'DELETE', url, headers: { cookie: headers('owner').cookie } }))
        .statusCode,
      403,
    );
    const csrfDenied = await app.inject({
      method: 'DELETE',
      url,
      headers: { cookie: headers('owner').cookie },
    });
    assert.equal(csrfDenied.json().code, 'csrf_invalid');
    const permissionDenied = await app.inject({ method: 'DELETE', url, headers: headers('other') });
    assert.equal(permissionDenied.statusCode, 403);
    assert.equal(permissionDenied.json().code, undefined);
    for (const user of ['other', 'editor', 'admin'])
      assert.equal(
        (await app.inject({ method: 'DELETE', url, headers: headers(user) })).statusCode,
        403,
      );
    access.addMembership('owner', ids[0], 'owner', 'revoked');
    assert.equal(
      (await app.inject({ method: 'DELETE', url, headers: headers('owner') })).statusCode,
      403,
    );
    access.addMembership('owner', ids[0], 'owner');
    for (const id of ids)
      assert.equal(
        (
          await app.inject({
            method: 'DELETE',
            url: '/api/garages/' + id,
            headers: headers('owner'),
          })
        ).statusCode,
        204,
      );
    assert.equal((await app.inject({ url, headers: headers('owner') })).statusCode, 403);
    const account = (await app.inject({ url: '/api/me', headers: headers('owner') })).json();
    assert.equal(account.accountType, 'garage');
    assert.equal(account.garageMemberships.length, 0);
    assert.equal(
      (await app.inject({ url: '/api/me/garages', headers: headers('owner') })).json().garages
        .length,
      0,
    );
    const recreate = await app.inject({
      method: 'POST',
      url: '/api/garages',
      headers: headers('owner'),
      payload: { profile, consentVersion: 'v1' },
    });
    assert.equal(recreate.statusCode, 201);
    assert.ok(access.auditEvents.some((event) => event.type === 'garage-deleted'));
  } finally {
    await app.close();
  }
});
