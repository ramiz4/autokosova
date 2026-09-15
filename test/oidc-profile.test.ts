import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer as httpServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { AccessStore } from '../src/server/access';
import { createServer } from '../src/server/app';
import { readZitadelOidcConfig } from '../src/server/oidc';
import {
  OidcUserInfoSubjectError,
  resolveOidcProfile,
  validateUserInfoEndpoint,
} from '../src/server/oidc-profile';
import { startTestOidc } from '../scripts/inquiries-test-oidc.mjs';

const full = {
  displayName: 'Signed name',
  username: 'signed-user',
  email: 'signed@example.invalid',
};

test('UserInfo endpoints reject cross-origin, credentials, redirects-in-query and production HTTP', () => {
  const issuer = 'https://issuer.example';
  assert.equal(validateUserInfoEndpoint(issuer + '/oidc/v1/userinfo', issuer, true).origin, issuer);
  for (const url of [
    'https://other.example/userinfo',
    'http://issuer.example/userinfo',
    issuer + '/u?token=secret',
    issuer + '/u#fragment',
    'https://user:pass@issuer.example/u',
    'file:///etc/passwd',
  ])
    assert.throws(() => validateUserInfoEndpoint(url, issuer, true));
  assert.throws(() => validateUserInfoEndpoint('http://localhost/u', 'http://localhost', true));
  assert.equal(
    validateUserInfoEndpoint('http://127.0.0.1/u', 'http://127.0.0.1', false).pathname,
    '/u',
  );
  assert.throws(() => readZitadelOidcConfig({ ZITADEL_USERINFO_ENDPOINT: issuer + '/u' }));
});

test('bounded UserInfo resolution separates verified missing claims, outages and subject substitution', async () => {
  let mode = 'ready';
  let requests = 0;
  let forwarded = 0;
  let issuer = '';
  let metadata: Record<string, unknown>;
  const server = httpServer(async (req, res) => {
    if (req.url === '/.well-known/openid-configuration') {
      assert.equal(req.headers.authorization, undefined);
      res.end(JSON.stringify(metadata));
      return;
    }
    if (req.url === '/redirect-target') {
      forwarded++;
      res.end('{}');
      return;
    }
    requests++;
    assert.equal(req.headers.authorization, 'Bearer fixture-access');
    if (mode === 'error') {
      res.writeHead(503).end('{}');
      return;
    }
    if (mode === 'redirect') {
      res.writeHead(302, { location: issuer + '/redirect-target' }).end();
      return;
    }
    if (mode === 'invalid-json') {
      res.end('not JSON');
      return;
    }
    if (mode === 'array') {
      res.end('[]');
      return;
    }
    if (mode === 'oversized') {
      res.end(JSON.stringify({ name: 'x'.repeat(70_000) }));
      return;
    }
    if (mode === 'timeout') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.write('{');
      await delay(150);
      res.end('}');
      return;
    }
    res.end(
      JSON.stringify({
        ...(mode === 'missing'
          ? {}
          : {
              name: 'Provider name',
              preferred_username: 'provider-user',
              email: 'provider@example.invalid',
            }),
        ...(mode === 'no-sub'
          ? {}
          : { sub: mode === 'mismatch' ? 'Fixture-subject' : 'fixture-subject' }),
        'urn:zitadel:iam:org:project:roles': { admin: {} },
        access_token: 'NEVER EXPOSE',
      }),
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  issuer = `http://127.0.0.1:${address.port}`;
  metadata = { issuer, userinfo_endpoint: issuer + '/userinfo' };
  const config = {
    issuer,
    audience: 'fixture',
    clientId: 'fixture',
    authorizationEndpoint: issuer + '/authorize',
    tokenEndpoint: issuer + '/token',
    jwksUri: issuer + '/jwks',
    redirectUri: 'http://localhost/auth/callback',
  };
  const identity = { subject: 'fixture-subject', profile: {} };
  try {
    assert.deepEqual(await resolveOidcProfile(config, { ...identity, profile: full }), {
      ...full,
      profileStatus: 'ready',
    });
    assert.equal(requests, 0);
    assert.deepEqual(await resolveOidcProfile(config, identity), { profileStatus: 'unavailable' });
    assert.equal(requests, 0);
    assert.deepEqual(await resolveOidcProfile(config, identity, 'fixture-access'), {
      displayName: 'Provider name',
      username: 'provider-user',
      email: 'provider@example.invalid',
      profileStatus: 'ready',
    });
    assert.deepEqual(
      await resolveOidcProfile(
        { ...config, userInfoEndpoint: issuer + '/userinfo' },
        { ...identity, profile: { displayName: 'Signed name' } },
        'fixture-access',
      ),
      {
        displayName: 'Signed name',
        username: 'provider-user',
        email: 'provider@example.invalid',
        profileStatus: 'ready',
      },
    );
    mode = 'missing';
    assert.deepEqual(await resolveOidcProfile(config, identity, 'fixture-access'), {
      profileStatus: 'ready',
    });
    for (mode of ['error', 'invalid-json', 'array', 'oversized', 'redirect', 'timeout']) {
      assert.deepEqual(
        await resolveOidcProfile(
          config,
          { ...identity, profile: { displayName: 'Retained signed name' } },
          'fixture-access',
          mode === 'timeout' ? 40 : 5000,
        ),
        { displayName: 'Retained signed name', profileStatus: 'unavailable' },
        mode,
      );
    }
    assert.equal(forwarded, 0);
    for (mode of ['mismatch', 'no-sub'])
      await assert.rejects(
        () => resolveOidcProfile(config, identity, 'fixture-access'),
        OidcUserInfoSubjectError,
      );
    const before = requests;
    mode = 'ready';
    metadata = { issuer: issuer + '/wrong', userinfo_endpoint: issuer + '/userinfo' };
    assert.equal(
      (await resolveOidcProfile(config, identity, 'fixture-access')).profileStatus,
      'unavailable',
    );
    metadata = { issuer, userinfo_endpoint: 'https://other.invalid/userinfo' };
    assert.equal(
      (await resolveOidcProfile(config, identity, 'fixture-access')).profileStatus,
      'unavailable',
    );
    assert.equal(requests, before);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('real signed PKCE callback resolves UserInfo before committing session, roles and logout cancellation', async () => {
  const provider = await startTestOidc('http://localhost/auth/callback', 'fixture-customer');
  const store = new AccessStore();
  store.addMembership('fixture-garage', 'fixture-owned-garage', 'owner');
  const app = createServer({
    accessStore: store,
    oidcConfig: readZitadelOidcConfig(provider.environment),
  });
  const jar = new Map<string, string>();
  const headers = () => ({ cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') });
  const update = (cookies: readonly { name: string; value: string }[]) => {
    for (const c of cookies) jar.set(c.name, c.value);
  };
  async function login() {
    const start = await app.inject({ url: '/auth/login?returnTo=%2Fprofile', headers: headers() });
    update(start.cookies);
    const authorized = await fetch(start.headers.location!, { redirect: 'manual' });
    assert.equal(authorized.status, 302);
    const callbackUrl = new URL(authorized.headers.get('location')!);
    const result = await app.inject({
      url: callbackUrl.pathname + callbackUrl.search,
      headers: headers(),
    });
    update(result.cookies);
    return result;
  }
  async function account() {
    return app.inject({ url: '/api/me', headers: headers() });
  }
  try {
    for (const [subject, profile] of [
      [
        'fixture-customer',
        {
          name: 'Customer fixture',
          preferred_username: 'customer-user',
          email: 'customer@example.invalid',
        },
      ],
      [
        'fixture-garage',
        {
          given_name: 'Garage',
          family_name: 'Fixture',
          preferred_username: 'garage-user',
          email: 'garage@example.invalid',
          'urn:zitadel:iam:org:project:roles': { admin: {} },
        },
      ],
    ] as const) {
      const oldCookie = headers();
      provider.setSubject(subject);
      provider.setProfile(profile);
      const callback = await login();
      assert.equal(callback.statusCode, 302);
      const response = await account();
      const data = response.json();
      assert.equal(data.userId, subject);
      assert.equal(data.email, profile.email);
      assert.equal(data.username, profile.preferred_username);
      assert.equal(
        data.displayName,
        subject === 'fixture-customer' ? 'Customer fixture' : 'Garage Fixture',
      );
      assert.equal(data.profileStatus, 'ready');
      assert.deepEqual(data.roles, ['customer']);
      assert.equal(data.garageMemberships.length, subject === 'fixture-garage' ? 1 : 0);
      assert.equal(response.headers['cache-control'], 'private, no-store');
      assert.doesNotMatch(
        response.body,
        /access_token|id_token|urn:zitadel|csrfToken|code_verifier/,
      );
      assert.equal((await app.inject({ url: '/api/me', headers: oldCookie })).statusCode, 401);
      assert.deepEqual((await account()).json(), data);
    }
    provider.setProfile({ name: 'Updated provider name', email: 'changed@example.invalid' });
    assert.equal((await login()).statusCode, 302);
    assert.equal((await account()).json().username, undefined);
    assert.equal((await account()).json().displayName, 'Updated provider name');
    assert.equal((await account()).json().profileStatus, 'ready');
    provider.setUserInfoMode('error');
    assert.equal((await login()).statusCode, 302);
    assert.equal((await account()).json().profileStatus, 'unavailable');
    assert.equal((await account()).json().displayName, undefined);
    provider.setUserInfoMode('mismatch');
    const mismatch = await login();
    assert.equal(mismatch.statusCode, 401);
    assert.equal(mismatch.cookies.length, 0);
    provider.setUserInfoMode('ready');
    let release!: () => void;
    provider.pauseUserInfo(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    const before = provider.userInfoRequests;
    const pending = login();
    try {
      for (let i = 0; i < 200 && provider.userInfoRequests === before; i++) await delay(10);
      assert.ok(provider.userInfoRequests > before);
      const logout = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: { ...headers(), 'x-csrf-token': jar.get('autokosova_csrf')! },
      });
      assert.equal(logout.statusCode, 204);
    } finally {
      release();
    }
    const cancelled = await pending;
    assert.equal(cancelled.statusCode, 401);
    assert.equal(cancelled.cookies.length, 0);
    assert.equal((await account()).statusCode, 401);
    assert.equal((await app.inject({ url: '/api/me' })).statusCode, 401);
  } finally {
    await app.close();
    await provider.close();
  }
});
