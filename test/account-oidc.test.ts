import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer as httpServer } from 'node:http';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { AccessStore } from '../src/server/access';
import { createServer } from '../src/server/app';

// This provider exists only within the test process. The application still performs PKCE
// code exchange and cryptographic JWT verification; no application login bypass is added.
test('signed OIDC callback exposes only own profile, replaces roles and invalidates the previous browser session', async () => {
  const keys = await generateKeyPair('RS256');
  const jwk = {
    ...(await exportJWK(keys.publicKey)),
    kid: 'fixture-key',
    alg: 'RS256',
    use: 'sig',
  };
  let subject = 'fixture-customer';
  let roles: Record<string, unknown> = {};
  let includeProfile = true;
  let invalidToken = false;
  let challenge = '';
  let nonce = '';
  let issuer = '';
  const provider = httpServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.url === '/jwks') {
      response.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    if (request.url !== '/token') {
      response.writeHead(404).end();
      return;
    }
    let body = '';
    for await (const chunk of request) body += chunk;
    const form = new URLSearchParams(body);
    const validPkce =
      createHash('sha256')
        .update(form.get('code_verifier') ?? '')
        .digest('base64url') === challenge;
    if (!validPkce || form.get('code') !== 'fixture-code') {
      response.writeHead(400).end('{}');
      return;
    }
    const token = await new SignJWT({
      nonce,
      auth_time: Math.floor(Date.now() / 1000),
      'urn:zitadel:iam:org:project:roles': roles,
      ...(includeProfile
        ? {
            name: 'Fiktives OIDC-Konto',
            preferred_username: 'fixture',
            email: 'fixture@example.invalid',
          }
        : {}),
      unrelated_private_claim: 'DO NOT EXPOSE',
    })
      .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
      .setSubject(subject)
      .setIssuer(invalidToken ? 'https://wrong-issuer.invalid' : issuer)
      .setAudience('fixture-client')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(keys.privateKey);
    response.end(JSON.stringify({ id_token: token }));
  });
  provider.listen(0, '127.0.0.1');
  await once(provider, 'listening');
  const address = provider.address();
  assert.ok(address && typeof address !== 'string');
  issuer = `http://127.0.0.1:${address.port}`;
  const store = new AccessStore();
  store.addMembership('fixture-member', 'fixture-only-garage', 'editor');
  const app = createServer({
    accessStore: store,
    oidcConfig: {
      audience: 'fixture-client',
      clientId: 'fixture-client',
      issuer,
      authorizationEndpoint: issuer + '/authorize',
      tokenEndpoint: issuer + '/token',
      jwksUri: issuer + '/jwks',
      redirectUri: 'http://localhost/auth/callback',
    },
  });
  let previous = '';
  async function login(returnTo: string | null = '/sq/profile', locale?: string) {
    const query = new URLSearchParams();
    if (returnTo !== null) query.set('returnTo', returnTo);
    if (locale !== undefined) query.set('locale', locale);
    const start = await app.inject({ url: '/auth/login?' + query });
    const authorization = new URL(start.headers.location!);
    challenge = authorization.searchParams.get('code_challenge')!;
    nonce = authorization.searchParams.get('nonce')!;
    const callback = await app.inject({
      url: '/auth/callback?code=fixture-code&state=' + authorization.searchParams.get('state'),
      headers: {
        cookie: [previous, ...start.cookies.map((item) => `${item.name}=${item.value}`)]
          .filter(Boolean)
          .join('; '),
      },
    });
    return callback;
  }
  try {
    for (const [type, granted] of [
      ['customer', {}],
      ['member', { garage: {} }],
      ['moderator', { moderator: { fixture: 'example.invalid' } }],
      [
        'admin',
        { admin: { fixture: 'example.invalid' }, moderator: { fixture: 'example.invalid' } },
      ],
    ] as const) {
      subject = `fixture-${type}`;
      roles = granted;
      const callback = await login();
      assert.equal(callback.statusCode, 302);
      assert.equal(callback.headers.location, '/sq/profile');
      if (previous)
        assert.equal(
          (await app.inject({ url: '/api/me', headers: { cookie: previous } })).statusCode,
          401,
        );
      previous = callback.cookies.map((item) => `${item.name}=${item.value}`).join('; ');
      const current = await app.inject({ url: '/api/me', headers: { cookie: previous } });
      assert.equal(current.json().userId, subject);
      assert.equal(current.json().displayName, 'Fiktives OIDC-Konto');
      assert.deepEqual(
        current.json().roles,
        type === 'admin'
          ? ['customer', 'moderator', 'admin']
          : type === 'moderator'
            ? ['customer', 'moderator']
            : ['customer'],
      );
      assert.deepEqual(
        current.json().garageMemberships,
        type === 'member' ? [{ garageId: 'fixture-only-garage', role: 'editor' }] : [],
      );
      assert.doesNotMatch(
        current.body,
        /DO NOT EXPOSE|unrelated_private_claim|id_token|access_token|sessionId|csrfToken/,
      );
    }
    // The same subject logs in again with removed elevated grants and absent optional claims.
    roles = {};
    includeProfile = false;
    const relogin = await login('/en/profile');
    previous = relogin.cookies.map((item) => `${item.name}=${item.value}`).join('; ');
    const reduced = (await app.inject({ url: '/api/me', headers: { cookie: previous } })).json();
    assert.deepEqual(reduced.roles, ['customer']);
    assert.equal(reduced.displayName, undefined);
    assert.equal(reduced.email, undefined);
    // General login uses only server-side account purpose, never the token's role labels.
    for (const locale of ['de', 'sq', 'en']) {
      const prefix = locale === 'de' ? '' : '/' + locale;
      for (const member of [false, true]) {
        subject = member ? 'fixture-member' : 'fixture-customer';
        roles = member ? {} : { garage: { fixture: 'example.invalid' } };
        const general = await login(null, locale);
        assert.equal(general.statusCode, 302);
        assert.equal(general.headers.location, `/auth/landing?locale=${locale}`);
        previous = general.cookies.map((item) => `${item.name}=${item.value}`).join('; ');
        const landing = await app.inject({
          url: general.headers.location!,
          headers: { cookie: previous },
        });
        assert.equal(landing.statusCode, 302);
        assert.equal(landing.headers.location, prefix + (member ? '/garages/new' : '/inquiries'));
        assert.equal(landing.headers['cache-control'], 'private, no-store');
        assert.equal(landing.cookies.length, 0);
      }
      // A garage operator explicitly starting a request must return to the request, not the garage.
      for (const path of ['/inquiry', '/inquiries', '/favorites', '/profile', '/garages/new']) {
        const explicit = await login(prefix + path, locale);
        assert.equal(explicit.headers.location, prefix + path);
        previous = explicit.cookies.map((item) => `${item.name}=${item.value}`).join('; ');
      }
    }
    const missingLocale = await login(null);
    assert.equal(missingLocale.headers.location, '/auth/landing?locale=de');
    invalidToken = true;
    const rejected = await login();
    assert.equal(rejected.statusCode, 401);
    assert.equal(rejected.cookies.length, 0);
    for (const returnTo of [
      '//evil.invalid',
      '/auth/landing?locale=en',
      '/auth/login',
      'https://evil.invalid',
      '/profile?userId=someone',
      '/sq/profile#secret',
      '/profile/../../admin',
    ]) {
      const start = await app.inject({
        url: '/auth/login?returnTo=' + encodeURIComponent(returnTo),
      });
      const state = new URL(start.headers.location!).searchParams.get('state')!;
      assert.equal(store.consumeOidcTransaction(state)?.returnTo, '/');
    }
  } finally {
    await app.close();
    provider.close();
    await once(provider, 'close');
  }
});
