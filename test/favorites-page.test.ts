import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { AccessError, AccessStore } from '../src/server/access';
import { createServer, isNoIndexPath } from '../src/server/app';
import { isAccountPagePath } from '../src/server/account-profile';
import {
  PostgresFavoriteStore,
  UnavailableFavoriteStore,
  type FavoriteStore,
} from '../src/server/favorites';
import { favoriteGarage } from '../src/shared/favorite-garage';
const headers = (session: { sessionId: string; csrfToken: string }, write = false) => ({
  cookie: `autokosova_session=${session.sessionId}; autokosova_csrf=${session.csrfToken}`,
  ...(write ? { 'x-csrf-token': session.csrfToken } : {}),
});
test('favorites privacy paths and login returns do not open redirects or enter the sitemap', async () => {
  const accessStore = new AccessStore();
  const app = createServer({
    accessStore,
    publicSiteUrl: 'https://autokosova.example',
    oidcConfig: {
      issuer: 'https://oidc.example',
      audience: 'fixture',
      clientId: 'fixture',
      authorizationEndpoint: 'https://oidc.example/authorize',
      tokenEndpoint: 'https://oidc.example/token',
      jwksUri: 'https://oidc.example/jwks',
      redirectUri: 'http://localhost/auth/callback',
    },
  });
  try {
    for (const prefix of ['', '/sq', '/en']) {
      const path = prefix + '/favorites';
      assert.equal(isAccountPagePath(path + '/?x=y'), true);
      assert.equal(isNoIndexPath(path), true);
      const response = await app.inject(path);
      assert.equal(response.headers['cache-control'], 'private, no-store');
      assert.equal(response.headers['vary'], 'Cookie');
      assert.equal(response.headers['x-robots-tag'], 'noindex, nofollow');
      const login = await app.inject('/auth/login?returnTo=' + encodeURIComponent(path));
      const state = new URL(login.headers.location!).searchParams.get('state')!;
      assert.equal(accessStore.consumeOidcTransaction(state)?.returnTo, path);
    }
    for (const path of [
      'https://evil.example/favorites',
      '//evil.example/favorites',
      '/favorites?userId=other',
      '/favorites/../auth',
      '/sq/favorites#secret',
    ]) {
      const login = await app.inject('/auth/login?returnTo=' + encodeURIComponent(path));
      assert.equal(
        accessStore.consumeOidcTransaction(
          new URL(login.headers.location!).searchParams.get('state')!,
        )?.returnTo,
        '/',
      );
    }
    assert.doesNotMatch((await app.inject('/sitemap.xml')).body, /favorites/);
    assert.match((await app.inject('/robots.txt')).body, /Disallow: \/en\/favorites/);
  } finally {
    await app.close();
  }
});
test('list rechecks session after async read and never serializes storage failures', async () => {
  const accessStore = new AccessStore(),
    owner = accessStore.createSession('fixture-owner');
  let fail = false;
  const favoriteStore: FavoriteStore = {
    listFavoriteGarageIds: async () => {
      if (fail) throw new Error('PRIVATE database value');
      accessStore.revokeSession(owner.sessionId);
      return ['PRIVATE favorite'];
    },
    saveFavorite: () => {},
    removeFavorite: () => {},
  };
  const app = createServer({ accessStore, favoriteStore });
  try {
    const response = await app.inject({ url: '/api/me/favorites', headers: headers(owner) });
    assert.equal(response.statusCode, 401);
    assert.doesNotMatch(response.body, /PRIVATE/);
    fail = true;
    const next = accessStore.createSession('fixture-owner');
    const error = await app.inject({ url: '/api/me/favorites', headers: headers(next) });
    assert.equal(error.statusCode, 503);
    assert.doesNotMatch(error.body, /PRIVATE/);
    assert.equal(error.headers['cache-control'], 'private, no-store');
    assert.equal(
      (await app.inject({ url: '/api/me/favorites?ownerUserId=other', headers: headers(next) }))
        .statusCode,
      400,
    );
    assert.equal(
      (
        await app.inject({
          method: 'DELETE',
          url: '/api/me/favorites/unknown',
          headers: headers(next),
        })
      ).statusCode,
      403,
    );
  } finally {
    await app.close();
  }
});
test('unconfigured runtime favorites fail closed rather than claim memory persistence', async () => {
  const store = new UnavailableFavoriteStore();
  for (const fn of [
    () => store.listFavoriteGarageIds(),
    () => store.saveFavorite(),
    () => store.removeFavorite(),
  ])
    assert.throws(fn, (e: unknown) => e instanceof AccessError && e.statusCode === 503);
});
test('public projection retains only real public card fields and does not invent ratings', () => {
  const data = {
    id: 'fixture',
    name: 'Fiktive Garage',
    placeId: 'xk-peja',
    photoIds: [],
    serviceCategoryIds: [],
    privateAddress: 'PRIVATE',
    reviewSummary: {
      state: 'unavailable',
      averageRating: 5,
      reviewCount: 0,
      verifiedVisitCount: 0,
    },
  };
  const card = favoriteGarage(data, 'fixture');
  assert.equal(card.rating, undefined);
  assert.equal(card.photoId, undefined);
  assert.equal(card.companyDataVerified, false);
  assert.doesNotMatch(JSON.stringify(card), /PRIVATE/);
  assert.throws(() => favoriteGarage(data, 'other'));
  assert.deepEqual(
    favoriteGarage(
      {
        ...data,
        reviewSummary: {
          state: 'available',
          averageRating: 4.5,
          reviewCount: 3,
          verifiedVisitCount: 2,
        },
      },
      'fixture',
    ).rating,
    { average: 4.5, count: 3, verifiedVisits: 2 },
  );
});
test(
  'PostgreSQL writes roll back on expired sessions and actual owner RLS hides other favorites',
  { skip: !process.env['DATABASE_URL'] },
  async () => {
    const url = process.env['DATABASE_URL']!,
      pool = new pg.Pool({ connectionString: url }),
      store = new PostgresFavoriteStore(url);
    const suffix = randomUUID().replaceAll('-', ''),
      role = 'favorite_rls_' + suffix;
    const a = 'favorite-a-' + suffix,
      b = 'favorite-b-' + suffix,
      g = 'favorite-g-' + suffix;
    const expired = () => {
      throw new AccessError(401, 'Expired');
    };
    try {
      await pool.query(
        "INSERT INTO app_user(id,oidc_subject,status) VALUES ($1,$1,'active'),($2,$2,'active')",
        [a, b],
      );
      await pool.query(
        "INSERT INTO garage(id,name,publication_state,place_id) VALUES ($1,'Fiktive Garage','published','xk-peja')",
        [g],
      );
      await assert.rejects(store.saveFavorite(a, g, expired), { statusCode: 401 });
      assert.deepEqual(await store.listFavoriteGarageIds(a), []);
      await store.saveFavorite(a, g);
      await assert.rejects(store.removeFavorite(a, g, expired), { statusCode: 401 });
      assert.deepEqual(await store.listFavoriteGarageIds(a), [g]);
      await pool.query(`CREATE ROLE ${role} NOLOGIN`);
      await pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
      await pool.query(`GRANT SELECT,DELETE ON garage_favorite TO ${role}`);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SET LOCAL ROLE ${role}`);
        await client.query("SELECT set_config('app.user_id',$1,true)", [b]);
        assert.equal((await client.query('SELECT garage_id FROM garage_favorite')).rowCount, 0);
        assert.equal(
          (await client.query('DELETE FROM garage_favorite WHERE garage_id=$1', [g])).rowCount,
          0,
        );
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
      await pool.query("UPDATE garage SET publication_state='suspended' WHERE id=$1", [g]);
      assert.deepEqual(await store.listFavoriteGarageIds(a), [g]);
      await store.removeFavorite(a, g);
      assert.deepEqual(await store.listFavoriteGarageIds(a), []);
    } finally {
      await pool.query('DELETE FROM garage_favorite WHERE garage_id=$1', [g]);
      await pool.query('DELETE FROM garage WHERE id=$1', [g]);
      await pool.query('DELETE FROM app_user WHERE id=ANY($1::text[])', [[a, b]]);
      await pool.query(`DROP OWNED BY ${role}`).catch(() => {});
      await pool.query(`DROP ROLE IF EXISTS ${role}`);
      await store.close();
      await pool.end();
    }
  },
);
