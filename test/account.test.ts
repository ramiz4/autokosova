import assert from 'node:assert/strict';
import test from 'node:test';
import { AccessStore } from '../src/server/access';
import { createServer, isNoIndexPath } from '../src/server/app';
import { accountProfileFromClaims, isAccountPagePath } from '../src/server/account-profile';

const cookie = (session: { sessionId: string }) => ({
  cookie: `autokosova_session=${session.sessionId}`,
});

test('own account is session-bound, minimal, non-cacheable and does not change /api/session', async () => {
  const store = new AccessStore();
  const a = store.createSession('fictional-a', undefined, {
    displayName: 'Fiktives Konto A',
    username: 'fixture-a',
    email: 'a@example.invalid',
  });
  const b = store.createSession('fictional-b');
  store.setVerifiedRoles('fictional-a', ['admin', 'moderator']);
  store.addMembership('fictional-a', 'fictional-garage-a', 'owner');
  store.addMembership('fictional-a', 'fictional-revoked', 'editor', 'revoked');
  store.addMembership('fictional-b', 'fictional-garage-b', 'owner');
  const app = createServer({ accessStore: store });
  try {
    const result = await app.inject({
      url: '/api/me?userId=fictional-b&role=admin',
      headers: cookie(a),
    });
    assert.equal(result.statusCode, 200);
    assert.equal(result.headers['cache-control'], 'private, no-store');
    assert.equal(result.headers['vary'], 'Cookie');
    assert.equal(result.headers['x-robots-tag'], 'noindex, nofollow');
    assert.deepEqual(result.json(), {
      accountType: 'garage',
      userId: 'fictional-a',
      displayName: 'Fiktives Konto A',
      username: 'fixture-a',
      email: 'a@example.invalid',
      roles: ['customer', 'moderator', 'admin'],
      expiresAt: store.getOwnAccount(store.getPrincipal(a.sessionId)!).expiresAt,
      garageMemberships: [{ garageId: 'fictional-garage-a', role: 'owner' }],
    });
    assert.doesNotMatch(
      result.body,
      /csrfToken|sessionId|id_token|access_token|claims|fictional-b/,
    );
    const other = await app.inject({ url: '/api/me', headers: cookie(b) });
    assert.equal(other.json().userId, 'fictional-b');
    assert.equal(other.json().accountType, 'garage');
    assert.equal(other.json().displayName, undefined);
    assert.deepEqual(other.json().roles, ['customer']);
    const minimal = await app.inject({ url: '/api/session', headers: cookie(a) });
    assert.deepEqual(minimal.json(), { authenticated: true });
    assert.equal(
      (await app.inject({ url: '/api/me/fictional-b', headers: cookie(a) })).statusCode,
      404,
    );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/api/me',
          headers: cookie(a),
          payload: { roles: ['admin'] },
        })
      ).statusCode,
      404,
    );
  } finally {
    await app.close();
  }
});

test('guests, forged cookies, expiry and logout never return private account data', async () => {
  const store = new AccessStore();
  const expired = store.createSession('fictional-expired', new Date(0), {
    displayName: 'PRIVATE FIXTURE',
  });
  const active = store.createSession('fictional-active');
  const app = createServer({ accessStore: store });
  try {
    for (const headers of [
      {},
      cookie(expired),
      { cookie: 'autokosova_session=forged; roles=admin' },
    ]) {
      const result = await app.inject({ url: '/api/me', headers });
      assert.equal(result.statusCode, 401);
      assert.equal(result.headers['cache-control'], 'private, no-store');
      assert.deepEqual(result.json(), { error: 'Authentication required', loginAvailable: false });
    }
    const rejected = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: cookie(active),
    });
    assert.equal(rejected.statusCode, 403);
    assert.equal((await app.inject({ url: '/api/me', headers: cookie(active) })).statusCode, 200);
    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: {
        cookie: `autokosova_session=${active.sessionId}; autokosova_csrf=${active.csrfToken}`,
        'x-csrf-token': active.csrfToken,
      },
    });
    assert.equal(logout.statusCode, 204);
    assert.equal((await app.inject({ url: '/api/me', headers: cookie(active) })).statusCode, 401);
  } finally {
    await app.close();
  }
});

test('fresh server roles replace removed elevations, never promote OIDC roles to garage membership', async () => {
  const store = new AccessStore();
  store.setVerifiedRoles('fictional-admin', ['admin', 'moderator']);
  const session = store.createSession('fictional-admin');
  store.addMembership('fictional-other', 'fictional-garage', 'owner');
  const app = createServer({ accessStore: store });
  try {
    assert.deepEqual(
      (await app.inject({ url: '/api/me', headers: cookie(session) })).json().garageMemberships,
      [],
    );
    store.setVerifiedRoles('fictional-admin', []);
    const result = await app.inject({ url: '/api/me?roles=admin', headers: cookie(session) });
    assert.deepEqual(result.json().roles, ['customer']);
  } finally {
    await app.close();
  }
});

test('membership failures are not reported as an empty membership and do not leak database details', async () => {
  const store = new AccessStore();
  const session = store.createSession('fictional-a');
  store.listOwnMemberships = () => {
    throw new Error('PRIVATE DATABASE DETAILS');
  };
  const app = createServer({ accessStore: store });
  try {
    const response = await app.inject({ url: '/api/me', headers: cookie(session) });
    assert.equal(response.statusCode, 503);
    assert.equal(response.headers['cache-control'], 'private, no-store');
    assert.deepEqual(response.json(), { error: 'Account information unavailable' });
  } finally {
    await app.close();
  }
});

test('optional verified claims are trimmed and whitelisted, not dumped or interpreted as permissions', () => {
  assert.deepEqual(
    accountProfileFromClaims({
      name: ' Fiktives Konto ',
      preferred_username: ' fixture ',
      email: 'fixture@example.invalid',
      roles: ['admin'],
      password: 'NEVER RETURN',
      access_token: 'NEVER RETURN',
      other: { private: true },
    }),
    { displayName: 'Fiktives Konto', username: 'fixture', email: 'fixture@example.invalid' },
  );
  for (const value of [null, 42, {}, [], '', '   ', 'a\nb', 'x'.repeat(300)]) {
    assert.deepEqual(
      accountProfileFromClaims({ name: value, email: value, preferred_username: value }),
      {},
    );
  }
  for (const path of ['/profile', '/sq/profile', '/en/profile?view=settings', '/profile/']) {
    assert.equal(isNoIndexPath(path), true);
    assert.equal(isAccountPagePath(path), true);
  }
  assert.equal(isAccountPagePath('/garages/profile'), false);
});

test('display names use only valid provider name parts, without fabricating usernames', () => {
  assert.deepEqual(accountProfileFromClaims({ given_name: ' Ada ', family_name: ' Test ' }), {
    displayName: 'Ada Test',
  });
  assert.deepEqual(accountProfileFromClaims({ name: 'Chosen name', given_name: 'Ignored' }), {
    displayName: 'Chosen name',
  });
  assert.deepEqual(accountProfileFromClaims({ name: '', given_name: 'Ada', family_name: 5 }), {
    displayName: 'Ada',
  });
  assert.deepEqual(
    accountProfileFromClaims({
      given_name: 'Bad\nName',
      family_name: 'Safe',
      email: 'mail@example.invalid',
    }),
    { displayName: 'Safe', email: 'mail@example.invalid' },
  );
  assert.deepEqual(accountProfileFromClaims({ given_name: 'a'.repeat(200), family_name: 'b' }), {});
});
