import assert from 'node:assert/strict';
import test from 'node:test';
import { AccessStore } from '../src/server/access';
import { createServer } from '../src/server/app';

test('favorites remain personal across customer, operator, shared membership and privileged roles', async () => {
  const store = new AccessStore();
  store.addRole('fixture-reviewer', 'admin');
  const reviewer = store.createSession('fixture-reviewer');
  const creator = store.createSession('fixture-creator');
  const principal = store.getPrincipal(creator.sessionId)!;
  const garage = store.createGarageRegistration(
    principal,
    {
      name: 'DEMO · Shared favorite',
      contactPerson: 'Fiktiv',
      contactPhone: '+38344000000',
      placeId: 'xk-pristina',
      languages: ['Deutsch'],
      selfReportedSpecializations: [],
      serviceCategoryIds: ['bremsen'],
      vehicleMakeIds: [],
    },
    'fixture-consent',
  );
  store.submitGarageForReview(principal, garage.id);
  store.reviewGarage(store.getPrincipal(reviewer.sessionId)!, garage.id, 'published', {
    companyDocument: 'verified',
    contactPerson: 'verified',
    location: 'verified',
    phone: 'verified',
  });
  const people = ['fixture-customer', 'fixture-operator-a', 'fixture-operator-b', 'fixture-staff'];
  store.addMembership(people[1], garage.id, 'owner');
  store.addMembership(people[2], garage.id, 'editor');
  store.addRole(people[3], 'admin');
  store.addRole(people[3], 'moderator');
  const sessions = people.map((person) => store.createSession(person));
  const app = createServer({ accessStore: store });
  const path = '/api/me/favorites/' + garage.id;
  const headers = (index: number, csrf = true) => ({
    cookie: `autokosova_session=${sessions[index].sessionId}; autokosova_csrf=${sessions[index].csrfToken}`,
    ...(csrf ? { 'x-csrf-token': sessions[index].csrfToken } : {}),
  });
  const ids = async (index: number) => {
    const response = await app.inject({ url: '/api/me/favorites', headers: headers(index) });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['cache-control'], 'private, no-store');
    return response.json().garageIds;
  };
  try {
    for (let index = 0; index < people.length; index++) {
      assert.deepEqual(await ids(index), []);
      const account = await app.inject({ url: '/api/me', headers: headers(index) });
      assert.equal(account.json().accountType, index === 1 || index === 2 ? 'garage' : 'customer');
      assert.equal(
        (await app.inject({ method: 'PUT', url: path, headers: headers(index, false) })).statusCode,
        403,
      );
      assert.equal(
        (await app.inject({ method: 'PUT', url: path, headers: headers(index) })).statusCode,
        204,
      );
      assert.deepEqual(await ids(index), [garage.id]);
      for (let other = index + 1; other < people.length; other++)
        assert.deepEqual(await ids(other), []);
    }
    // Neither a shared garage nor staff roles authorize modifying another person's list.
    for (const index of [2, 3]) {
      assert.equal(
        (await app.inject({ method: 'DELETE', url: path, headers: headers(index) })).statusCode,
        204,
      );
      assert.deepEqual(await ids(index), []);
      assert.deepEqual(await ids(0), [garage.id]);
      assert.deepEqual(await ids(1), [garage.id]);
      assert.equal(
        (
          await app.inject({
            url: '/api/me/favorites?ownerUserId=' + people[1],
            headers: headers(index),
          })
        ).statusCode,
        400,
      );
    }
    // Additional account context preserves an already saved personal favorite.
    store.addMembership(people[0], garage.id, 'editor');
    store.addRole(people[0], 'moderator');
    assert.deepEqual(await ids(0), [garage.id]);
    store.addMembership(people[0], garage.id, 'editor', 'revoked');
    assert.deepEqual(await ids(0), [garage.id]);
    sessions[0] = store.createSession(people[0]);
    assert.deepEqual(await ids(0), [garage.id]);
    store.revokeUserSessions(people[1]);
    for (const [method, url] of [
      ['GET', '/api/me/favorites'],
      ['PUT', path],
      ['DELETE', path],
    ] as const) {
      assert.equal((await app.inject({ method, url, headers: headers(1) })).statusCode, 401);
      assert.equal((await app.inject({ method, url })).statusCode, 401);
    }
    assert.deepEqual(store.listFavoriteGarageIds(people[1]), [garage.id]);
    store.reviewGarage(store.getPrincipal(reviewer.sessionId)!, garage.id, 'suspended');
    assert.equal(
      (await app.inject({ method: 'PUT', url: path, headers: headers(0) })).statusCode,
      404,
    );
    assert.equal(
      (await app.inject({ method: 'DELETE', url: path, headers: headers(0) })).statusCode,
      204,
    );
    assert.deepEqual(await ids(0), []);
  } finally {
    await app.close();
  }
});
