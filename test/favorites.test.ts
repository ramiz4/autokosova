import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { AccessStore } from '../src/server/access';
import { createServer } from '../src/server/app';
import { PostgresFavoriteStore } from '../src/server/favorites';

function headers(session: { csrfToken: string; sessionId: string }, write = false) {
  return {
    cookie: `autokosova_session=${session.sessionId}; autokosova_csrf=${session.csrfToken}`,
    ...(write ? { 'x-csrf-token': session.csrfToken } : {}),
  };
}

test('favorites are private, require CSRF, are idempotent and available to another session of the owner', async () => {
  const store = new AccessStore();
  store.addRole('favorite-admin', 'admin');
  const admin = store.createSession('favorite-admin');
  const owner = store.createSession('favorite-owner');
  const other = store.createSession('favorite-other');
  const principal = store.getPrincipal(owner.sessionId)!;
  const garage = store.createWorkshopRegistration(
    principal,
    {
      name: 'DEMO Favorite Garage',
      contactPerson: 'Fiktiv',
      contactPhone: '+38344000000',
      placeId: 'xk-pristina',
      languages: ['Deutsch'],
      selfReportedSpecializations: [],
      serviceCategoryIds: ['bremsen'],
      vehicleMakeIds: [],
    },
    'demo-consent',
  );
  const app = createServer({ accessStore: store });
  try {
    const url = `/api/me/favorites/${garage.id}`;
    assert.equal((await app.inject({ method: 'PUT', url })).statusCode, 401);
    assert.equal(
      (await app.inject({ method: 'PUT', url, headers: headers(owner) })).statusCode,
      403,
    );
    assert.equal(
      (await app.inject({ method: 'PUT', url, headers: headers(owner, true) })).statusCode,
      404,
    );
    store.submitWorkshopForReview(principal, garage.id);
    store.reviewWorkshop(store.getPrincipal(admin.sessionId)!, garage.id, 'published', {
      companyDocument: 'verified',
      contactPerson: 'verified',
      location: 'verified',
      phone: 'verified',
    });
    for (let i = 0; i < 2; i++)
      assert.equal(
        (await app.inject({ method: 'PUT', url, headers: headers(owner, true) })).statusCode,
        204,
      );
    const secondDevice = store.createSession('favorite-owner');
    const listed = await app.inject({
      method: 'GET',
      url: '/api/me/favorites',
      headers: headers(secondDevice),
    });
    assert.deepEqual(listed.json().garageIds, [garage.id]);
    assert.equal(listed.headers['cache-control'], 'private, no-store');
    assert.deepEqual(
      (
        await app.inject({ method: 'GET', url: '/api/me/favorites', headers: headers(other) })
      ).json().garageIds,
      [],
    );
    await app.inject({ method: 'DELETE', url, headers: headers(other, true) });
    assert.deepEqual(store.listFavoriteGarageIds(principal.userId), [garage.id]);
    assert.deepEqual(store.exportPersonalData(principal).favoriteGarageIds, [garage.id]);
    assert.deepEqual(
      (await app.inject({ method: 'GET', url: '/api/session', headers: headers(owner) })).json(),
      { authenticated: true },
    );
    assert.deepEqual((await app.inject({ method: 'GET', url: '/api/session' })).json(), {
      authenticated: false,
    });
    for (let i = 0; i < 2; i++)
      assert.equal(
        (await app.inject({ method: 'DELETE', url, headers: headers(secondDevice, true) }))
          .statusCode,
        204,
      );
    assert.deepEqual(store.listFavoriteGarageIds(principal.userId), []);
  } finally {
    await app.close();
  }
});

test(
  'PostgreSQL favorites survive store recreation and remain owner-scoped',
  { skip: !process.env['DATABASE_URL'] },
  async () => {
    const url = process.env['DATABASE_URL']!;
    const client = new pg.Client({ connectionString: url });
    const store = new PostgresFavoriteStore(url);
    const reader = new PostgresFavoriteStore(url);
    const owner = `favorite-owner-${randomUUID()}`,
      other = `favorite-other-${randomUUID()}`,
      garage = `favorite-garage-${randomUUID()}`;
    await client.connect();
    try {
      await client.query(
        "INSERT INTO app_user (id,oidc_subject,status) VALUES ($1,$1,'active'),($2,$2,'active')",
        [owner, other],
      );
      await client.query(
        "INSERT INTO workshop (id,name,publication_state,place_id) VALUES ($1,'DEMO Favorite Garage','published','xk-pristina')",
        [garage],
      );
      await store.saveFavorite(owner, garage);
      await store.saveFavorite(owner, garage);
      assert.deepEqual(await reader.listFavoriteGarageIds(owner), [garage]);
      assert.deepEqual(await reader.listFavoriteGarageIds(other), []);
      await reader.removeFavorite(other, garage);
      assert.deepEqual(await store.listFavoriteGarageIds(owner), [garage]);
      await client.query("UPDATE workshop SET publication_state='suspended' WHERE id=$1", [garage]);
      await assert.rejects(() => store.saveFavorite(other, garage));
      await store.removeFavorite(owner, garage);
      assert.deepEqual(await reader.listFavoriteGarageIds(owner), []);
    } finally {
      await client.query('DELETE FROM garage_favorite WHERE garage_id=$1', [garage]);
      await client.query('DELETE FROM workshop WHERE id=$1', [garage]);
      await client.query('DELETE FROM app_user WHERE id=ANY($1::text[])', [[owner, other]]);
      await client.end();
      await store.close();
      await reader.close();
    }
  },
);
