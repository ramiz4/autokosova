import assert from 'node:assert/strict';
import test from 'node:test';
import { AccessStore } from '../src/server/access';
import { createServer } from '../src/server/app';

function setup() {
  const store = new AccessStore();
  store.addRole('admin', 'admin');
  store.addMembership('workshop-a', 'garage-a', 'owner');
  store.addMembership('workshop-b', 'garage-b', 'owner');
  const customerVehicle = store.createVehicle('customer-a', 'Fiktives Fahrzeug A');
  const admin = store.createSession('admin');
  const customerA = store.createSession('customer-a');
  const customerB = store.createSession('customer-b');
  const workshopA = store.createSession('workshop-a');
  const workshopB = store.createSession('workshop-b');
  const expired = store.createSession('expired', new Date(Date.now() - 1));
  const app = createServer({ accessStore: store });
  return {
    admin,
    app,
    customerA,
    customerB,
    customerVehicle,
    expired,
    store,
    workshopA,
    workshopB,
  };
}

function headers(session: { csrfToken: string; sessionId: string }, write = false) {
  return {
    cookie: `autokosova_session=${session.sessionId}; autokosova_csrf=${session.csrfToken}`,
    ...(write ? { 'x-csrf-token': session.csrfToken } : {}),
  };
}

test('guest paths stay public while private vehicles require a valid session', async () => {
  const { app } = setup();
  try {
    assert.equal((await app.inject({ method: 'GET', url: '/api/public/search' })).statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: '/api/me/vehicles' })).statusCode, 401);
  } finally {
    await app.close();
  }
});

test('login stays unavailable until an OIDC provider is configured', async () => {
  const { app } = setup();
  try {
    const response = await app.inject({ method: 'GET', url: '/auth/login' });
    assert.equal(response.statusCode, 503);
  } finally {
    await app.close();
  }
});

test('verified OIDC roles replace stale local elevated roles while retaining customer access', () => {
  const store = new AccessStore();
  store.addRole('test-user', 'admin');
  store.setVerifiedRoles('test-user', ['moderator']);
  const session = store.createSession('test-user');
  const principal = store.getPrincipal(session.sessionId)!;

  assert.equal(principal.roles.has('customer'), true);
  assert.equal(principal.roles.has('moderator'), true);
  assert.equal(principal.roles.has('admin'), false);
});

test('OIDC transaction preserves a local return path for the saved draft', () => {
  const store = new AccessStore();
  store.createOidcTransaction('state', 'verifier', '/inquiry');
  const transaction = store.consumeOidcTransaction('state');
  assert.equal(transaction?.codeVerifier, 'verifier');
  assert.equal(transaction?.returnTo, '/inquiry');
  assert.ok(transaction?.expiresAt instanceof Date);
});

test('OIDC login only accepts the repair-request return path', async () => {
  const store = new AccessStore();
  const app = createServer({
    accessStore: store,
    oidcConfig: {
      audience: 'client-id',
      authorizationEndpoint: 'https://issuer.example/oauth/v2/authorize',
      clientId: 'client-id',
      issuer: 'https://issuer.example',
      jwksUri: 'https://issuer.example/oauth/v2/keys',
      redirectUri: 'http://localhost:4000/auth/callback',
      tokenEndpoint: 'https://issuer.example/oauth/v2/token',
    },
  });
  try {
    const registration = await app.inject({
      method: 'GET',
      url: '/auth/login?returnTo=/sq/inquiry&prompt=create',
    });
    const registrationUrl = new URL(registration.headers.location!);
    assert.equal(registration.statusCode, 302);
    assert.equal(registrationUrl.searchParams.get('prompt'), 'create');
    assert.equal(registrationUrl.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(
      store.consumeOidcTransaction(registrationUrl.searchParams.get('state')!)?.returnTo,
      '/sq/inquiry',
    );
    const accepted = await app.inject({
      method: 'GET',
      url: '/auth/login?returnTo=/inquiry',
    });
    for (const legacy of ['/anfrage', '/sq/anfrage', '/en/anfrage']) {
      const response = await app.inject({ method: 'GET', url: `/auth/login?returnTo=${legacy}` });
      const state = new URL(response.headers.location!).searchParams.get('state')!;
      assert.equal(
        store.consumeOidcTransaction(state)?.returnTo,
        legacy.replace('/anfrage', '/inquiry'),
      );
    }
    const rejected = await app.inject({
      method: 'GET',
      url: '/auth/login?returnTo=//example.test',
    });
    const acceptedState = new URL(accepted.headers.location!).searchParams.get('state')!;
    const rejectedState = new URL(rejected.headers.location!).searchParams.get('state')!;

    assert.equal(store.consumeOidcTransaction(acceptedState)?.returnTo, '/inquiry');
    assert.equal(store.consumeOidcTransaction(rejectedState)?.returnTo, '/');
  } finally {
    await app.close();
  }
});

test('customers only receive their own vehicles', async () => {
  const { app, customerA, customerB, customerVehicle } = setup();
  try {
    const owner = await app.inject({
      headers: headers(customerA),
      method: 'GET',
      url: '/api/me/vehicles',
    });
    const stranger = await app.inject({
      headers: headers(customerB),
      method: 'GET',
      url: '/api/me/vehicles',
    });
    assert.deepEqual(owner.json(), {
      vehicles: [{ id: customerVehicle, label: 'Fiktives Fahrzeug A' }],
    });
    assert.deepEqual(stranger.json(), { vehicles: [] });
  } finally {
    await app.close();
  }
});

test('write requests require the session-bound CSRF token', async () => {
  const { app, customerA } = setup();
  try {
    const response = await app.inject({
      headers: headers(customerA),
      method: 'POST',
      payload: { label: 'Fiktives Fahrzeug B' },
      url: '/api/me/vehicles',
    });
    assert.equal(response.statusCode, 403);
  } finally {
    await app.close();
  }
});

test('workshop A cannot change workshop B', async () => {
  const { app, workshopA, workshopB } = setup();
  try {
    const own = await app.inject({
      headers: headers(workshopA, true),
      method: 'POST',
      payload: { description: 'Fiktives Profil' },
      url: '/api/garages/garage-a/profile',
    });
    const foreign = await app.inject({
      headers: headers(workshopA, true),
      method: 'POST',
      payload: { description: 'Fiktives Profil' },
      url: '/api/garages/garage-b/profile',
    });
    const other = await app.inject({
      headers: headers(workshopB, true),
      method: 'POST',
      payload: { description: 'Fiktives Profil' },
      url: '/api/garages/garage-a/profile',
    });
    assert.equal(own.statusCode, 204);
    assert.equal(foreign.statusCode, 403);
    assert.equal(other.statusCode, 403);
  } finally {
    await app.close();
  }
});

test('only an existing admin session can grant a workshop membership and produces an audit event', async () => {
  const { admin, app, customerA, store } = setup();
  try {
    const denied = await app.inject({
      headers: headers(customerA, true),
      method: 'POST',
      payload: { role: 'owner', userId: 'new-member', workshopId: 'garage-a' },
      url: '/api/admin/memberships',
    });
    const granted = await app.inject({
      headers: headers(admin, true),
      method: 'POST',
      payload: { role: 'editor', userId: 'new-member', workshopId: 'garage-a' },
      url: '/api/admin/memberships',
    });
    assert.equal(denied.statusCode, 403);
    assert.equal(granted.statusCode, 201);
    assert.deepEqual(store.auditEvents, [{ actorUserId: 'admin', type: 'membership-granted' }]);
  } finally {
    await app.close();
  }
});

test('private file grants reject foreign access and invalid uploads', async () => {
  const { app, customerA, customerB } = setup();
  try {
    const upload = await app.inject({
      headers: headers(customerA, true),
      method: 'POST',
      payload: { contentType: 'application/pdf', sizeBytes: 1024 },
      url: '/api/files/upload-grants',
    });
    const foreign = await app.inject({
      headers: headers(customerB),
      method: 'GET',
      url: `/api/files/${upload.json().fileId}/download-grant`,
    });
    const invalid = await app.inject({
      headers: headers(customerA, true),
      method: 'POST',
      payload: { contentType: 'text/plain', sizeBytes: 1024 },
      url: '/api/files/upload-grants',
    });
    assert.equal(upload.statusCode, 201);
    assert.equal(foreign.statusCode, 404);
    assert.equal(invalid.statusCode, 415);
  } finally {
    await app.close();
  }
});

test('expired sessions fail closed and logout revokes a valid session', async () => {
  const { app, customerA, expired } = setup();
  try {
    const expiredResponse = await app.inject({
      headers: headers(expired),
      method: 'GET',
      url: '/api/me/vehicles',
    });
    const logout = await app.inject({
      headers: headers(customerA, true),
      method: 'POST',
      url: '/auth/logout',
    });
    const afterLogout = await app.inject({
      headers: headers(customerA),
      method: 'GET',
      url: '/api/me/vehicles',
    });
    const recovery = await app.inject({ method: 'POST', url: '/auth/recovery' });
    assert.equal(expiredResponse.statusCode, 401);
    assert.equal(logout.statusCode, 204);
    assert.equal(afterLogout.statusCode, 401);
    assert.equal(recovery.statusCode, 202);
    assert.equal(
      recovery.json().message,
      'If an account exists, recovery continues with the identity provider.',
    );
  } finally {
    await app.close();
  }
});
