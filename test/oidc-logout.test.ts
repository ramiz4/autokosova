import assert from 'node:assert/strict';
import test from 'node:test';
import { AccessStore } from '../src/server/access';
import { createServer } from '../src/server/app';
import { createEndSessionUrl, readZitadelOidcConfig } from '../src/server/oidc';
import { OidcLogoutTransactions } from '../src/server/oidc-logout';
import { startSessionOidc } from '../scripts/logout-test-oidc.mjs';

const environment = {
  ZITADEL_AUDIENCE: 'fixture',
  ZITADEL_CLIENT_ID: 'fixture',
  ZITADEL_ISSUER: 'https://issuer.invalid',
  ZITADEL_AUTHORIZATION_ENDPOINT: 'https://issuer.invalid/authorize',
  ZITADEL_TOKEN_ENDPOINT: 'https://issuer.invalid/token',
  ZITADEL_JWKS_URI: 'https://issuer.invalid/jwks',
  ZITADEL_REDIRECT_URI: 'http://localhost:4200/auth/callback',
  ZITADEL_END_SESSION_ENDPOINT: 'https://issuer.invalid/end_session',
  ZITADEL_POST_LOGOUT_URI: 'http://localhost:4200/auth/logout/callback',
};

class Jar {
  readonly values = new Map<string, string>();
  update(cookies: string[]) {
    for (const cookie of cookies) {
      const pair = cookie.split(';', 1)[0],
        split = pair.indexOf('=');
      this.values.set(pair.slice(0, split), pair.slice(split + 1));
    }
  }
  get header() {
    return [...this.values].map(([key, value]) => `${key}=${value}`).join('; ');
  }
}

test('logout configuration is paired, origin/path restricted, and directs only a supplied verified token', () => {
  const config = readZitadelOidcConfig(environment)!;
  const url = new URL(createEndSessionUrl(config, 'opaque-state', 'sq', 'verified-id-token'));
  assert.equal(url.searchParams.get('client_id'), 'fixture');
  assert.equal(
    url.searchParams.get('post_logout_redirect_uri'),
    environment.ZITADEL_POST_LOGOUT_URI,
  );
  assert.equal(url.searchParams.get('ui_locales'), 'sq');
  assert.equal(url.searchParams.get('id_token_hint'), 'verified-id-token');
  assert.throws(() => createEndSessionUrl(config, 'state', 'de', ''), /context is required/);
  for (const patch of [
    { ZITADEL_END_SESSION_ENDPOINT: '' },
    { ZITADEL_POST_LOGOUT_URI: '' },
    { ZITADEL_END_SESSION_ENDPOINT: 'https://evil.invalid/logout' },
    { ZITADEL_END_SESSION_ENDPOINT: 'javascript:alert(1)' },
    { ZITADEL_END_SESSION_ENDPOINT: 'https://secret@issuer.invalid/end' },
    { ZITADEL_POST_LOGOUT_URI: 'https://evil.invalid/auth/logout/callback' },
    { ZITADEL_POST_LOGOUT_URI: 'http://localhost:4000/auth/logout/callback' },
    { ZITADEL_POST_LOGOUT_URI: 'http://localhost:4200/auth/callback' },
    { ZITADEL_POST_LOGOUT_URI: 'http://localhost:4200/auth/logout/callback?next=evil' },
    { ZITADEL_POST_LOGOUT_URI: 'http://localhost:4200/auth/logout/callback#fragment' },
    { NODE_ENV: 'production' },
  ])
    assert.throws(() => readZitadelOidcConfig({ ...environment, ...patch }));
});

test('handoff and return are browser-bound, one-use, expiring and bounded', () => {
  let now = 0;
  const transactions = new OidcLogoutTransactions(() => now);
  assert.equal(transactions.begin('en', ''), undefined);
  const binding = transactions.begin('en', 'verified-id-token')!;
  assert.equal(transactions.handoff('other-browser'), undefined);
  assert.equal(transactions.complete(binding, 'before-handoff'), undefined);
  const transaction = transactions.handoff(binding)!;
  assert.ok(transaction);
  assert.equal(transaction.idTokenHint, 'verified-id-token');
  assert.equal(
    (
      transactions as unknown as {
        pending: Map<string, { idTokenHint?: string }>;
      }
    ).pending.get(binding)?.idTokenHint,
    undefined,
  );
  assert.equal(transactions.handoff(binding), undefined);
  assert.equal(transactions.complete(binding, 'wrong-state'), undefined);
  assert.equal(transactions.complete('foreign-browser', transaction.state), undefined);
  assert.equal(transactions.complete(binding, transaction.state)?.locale, 'en');
  assert.equal(transactions.complete(binding, transaction.state), undefined);
  const expired = transactions.begin('de', 'expired-token')!;
  now += 300001;
  transactions.pruneExpired();
  now -= 300001; // Going back before expiry proves the sweep removed, rather than merely hid, it.
  assert.equal(transactions.handoff(expired), undefined);
  const returnedExpired = transactions.begin('de', 'returned-expired-token')!;
  const returned = transactions.handoff(returnedExpired)!;
  now += 300001;
  assert.equal(transactions.complete(returnedExpired, returned.state), undefined);
  const cancelled = transactions.begin('de', 'cancelled-token')!;
  transactions.cancel(cancelled);
  assert.equal(transactions.handoff(cancelled), undefined);
  for (let i = 0; i < 1000; i++) assert.ok(transactions.begin('de', 'bounded-token'));
  assert.equal(transactions.begin('de', 'bounded-token'), undefined);
  transactions.clear();
  assert.ok(transactions.begin('de', 'fresh-token'));
});

test('verified logout tokens remain server-only and are isolated to their exact local session', () => {
  const store = new AccessStore();
  const first = store.createVerifiedOidcSession('first', {}, 'first-verified-token');
  const second = store.createVerifiedOidcSession('first', {}, 'second-verified-token');
  assert.equal(store.getLogoutIdToken(first.sessionId), 'first-verified-token');
  assert.equal(store.getLogoutIdToken(second.sessionId), 'second-verified-token');
  assert.doesNotMatch(
    JSON.stringify(store.getPrincipal(first.sessionId)),
    /verified-token|logoutIdToken/,
  );
  assert.doesNotMatch(
    JSON.stringify(store.getOwnAccount(store.getPrincipal(first.sessionId)!)),
    /verified-token|logoutIdToken/,
  );
  store.revokeSession(first.sessionId);
  assert.equal(store.getLogoutIdToken(first.sessionId), undefined);
  assert.equal(store.getLogoutIdToken(second.sessionId), 'second-verified-token');
  const expired = store.createVerifiedOidcSession(
    'expired',
    {},
    'expired-verified-token',
    new Date(0),
  );
  assert.equal(store.getLogoutIdToken(expired.sessionId), undefined);
});

test('idle token material is swept and server shutdown discards remaining logout tokens', async () => {
  const store = new AccessStore();
  const idle = store.createVerifiedOidcSession('idle', {}, 'idle-token', new Date(100));
  store.pruneExpiredSessions(new Date(101));
  assert.equal(store.getLogoutIdToken(idle.sessionId, new Date(0)), undefined);
  const revoked = store.createVerifiedOidcSession('revoked', {}, 'revoked-token');
  store.revokeUserSessions('revoked');
  assert.equal(store.getLogoutIdToken(revoked.sessionId), undefined);
  const active = store.createVerifiedOidcSession('active', {}, 'active-token');
  const app = createServer({ accessStore: store });
  await app.ready();
  assert.equal(store.getLogoutIdToken(active.sessionId), 'active-token');
  await app.close();
  assert.equal(store.getLogoutIdToken(active.sessionId), undefined);
});

test('configured provider cannot use missing or expired session context or client-supplied hints', async () => {
  for (const expired of [false, true]) {
    const store = new AccessStore();
    const session = expired
      ? store.createVerifiedOidcSession('expired', {}, 'expired-token', new Date(0))
      : store.createSession('local-only');
    const app = createServer({
      accessStore: store,
      oidcConfig: readZitadelOidcConfig(environment),
    });
    try {
      const out = await app.inject({
        method: 'POST',
        url: '/auth/logout?locale=en&id_token_hint=forged&logout_hint=someone-else',
        payload: { id_token_hint: 'also-forged' },
        headers: {
          cookie: `autokosova_session=${session.sessionId}; autokosova_csrf=${session.csrfToken}`,
          'x-csrf-token': session.csrfToken,
          accept: 'application/json',
        },
      });
      assert.equal(out.statusCode, 200);
      assert.deepEqual(out.json(), { redirectTo: '/auth/logged-out?locale=en' });
      assert.equal(store.getLogoutIdToken(session.sessionId), undefined);
      assert.equal((await app.inject('/auth/logout/provider')).statusCode, 400);
      assert.doesNotMatch(out.body, /forged|expired-token|someone-else/);
    } finally {
      await app.close();
    }
  }
});

test('SSO survives local logout, browser end-session clears it; next login is interactive and isolated', async () => {
  const provider = await startSessionOidc('http://localhost:4200/auth/callback');
  const config = readZitadelOidcConfig(provider.environment)!;
  const store = new AccessStore(),
    app = createServer({ accessStore: store, oidcConfig: config });
  const jar = new Jar();
  const request = async (url: string, method: 'GET' | 'POST' = 'GET', extra = {}) => {
    const response = await app.inject({ url, method, headers: { cookie: jar.header, ...extra } });
    jar.update(response.cookies.map((item) => `${item.name}=${item.value}`));
    return response;
  };
  const providerRequest = async (url: string, body?: URLSearchParams) => {
    const response = await fetch(url, {
      redirect: 'manual',
      headers: { cookie: jar.header },
      ...(body ? { method: 'POST', body } : {}),
    });
    jar.update(response.headers.getSetCookie());
    return response;
  };
  let authorizationUrl = '';
  async function credentials(account: string) {
    const start = await request('/auth/login?returnTo=%2Fsq%2Fprofile');
    const url = new URL(start.headers.location!);
    authorizationUrl = url.href;
    assert.equal(url.searchParams.get('prompt'), 'login');
    assert.equal(url.searchParams.get('max_age'), '0');
    const form = await providerRequest(url.href);
    assert.equal(form.status, 200);
    assert.match(await form.text(), /data-credential-prompt/);
    const authorization = await providerRequest(
      provider.issuer + '/signin',
      new URLSearchParams({ account, password: provider.password }),
    );
    const callback = new URL(authorization.headers.get('location')!);
    return callback.pathname + callback.search;
  }
  const logout = () =>
    request('/auth/logout?locale=sq&id_token_hint=untrusted&logout_hint=someone-else', 'POST', {
      'x-csrf-token': jar.values.get('autokosova_csrf')!,
      accept: 'application/json',
    });
  try {
    assert.equal((await request(await credentials('a'))).statusCode, 302);
    assert.equal((await request('/api/me')).json().userId, 'logout-fixture-a');
    const targetSession = jar.values.get('fixture_sso')!;
    const originalLocalSession = jar.values.get('autokosova_session')!;
    const originalToken = store.getLogoutIdToken(originalLocalSession)!;
    assert.ok(originalToken);
    assert.doesNotMatch((await request('/api/me')).body, /eyJ|logoutIdToken/);
    const unrelated = provider.addUnrelatedSession('logout-fixture-a');
    const oldCookie = jar.header;
    const oldBehavior = new URL(authorizationUrl);
    oldBehavior.searchParams.delete('prompt');
    oldBehavior.searchParams.delete('max_age');
    assert.equal((await providerRequest(oldBehavior.href)).status, 302);
    assert.equal(provider.counters.silentLogins, 1, 'control reproduces previous silent SSO login');
    assert.equal((await request('/auth/logout', 'POST')).statusCode, 403);
    assert.equal((await request('/api/me')).statusCode, 200);
    // Another session of the SAME account is now in the provider cookie. Target the
    // session bound to AutoKosova, not that cookie and not every session of the user.
    jar.values.set('fixture_sso', unrelated);
    const out = await logout();
    assert.equal(store.getLogoutIdToken(originalLocalSession), undefined);
    assert.deepEqual(out.json(), { redirectTo: '/auth/logout/provider' });
    assert.doesNotMatch(out.body, /id_token|logout-fixture|eyJ/);
    assert.equal(out.headers['cache-control'], 'private, no-store');
    assert.equal(out.headers['referrer-policy'], 'no-referrer');
    assert.equal(
      (await app.inject({ url: '/api/me', headers: { cookie: oldCookie } })).statusCode,
      401,
    );
    assert.equal(provider.sessionCount, 2, 'local logout alone does not end SSO');
    assert.equal((await app.inject({ url: '/auth/logout/provider' })).statusCode, 400);
    const handoff = await request('/auth/logout/provider');
    assert.equal(handoff.statusCode, 302);
    assert.equal(
      new URL(handoff.headers.location!).searchParams.get('id_token_hint'),
      originalToken,
    );
    assert.equal(JSON.stringify(out.cookies).includes(originalToken), false);
    assert.equal((await request('/auth/logout/provider')).statusCode, 400);
    const end = await providerRequest(handoff.headers.location!);
    assert.equal(
      provider.sessionCount,
      1,
      'targeted logout leaves an unrelated provider session intact',
    );
    assert.equal(provider.hasSession(targetSession), false);
    assert.equal(provider.hasSession(unrelated), true);
    assert.equal(jar.values.get('fixture_sso'), unrelated);
    assert.equal(provider.counters.selections, 0);
    const callback = new URL(end.headers.get('location')!);
    const path = callback.pathname + callback.search;
    assert.equal((await app.inject({ url: path })).statusCode, 400);
    assert.equal((await request('/auth/logout/callback?state=wrong')).statusCode, 400);
    const completed = await request(path);
    assert.equal(completed.headers.location, '/sq');
    assert.equal((await request(path)).statusCode, 400);
    assert.equal((await request(await credentials('b'))).statusCode, 302);
    assert.equal((await request('/api/me')).json().userId, 'logout-fixture-b');
    assert.equal(
      provider.counters.silentLogins,
      1,
      'fixed login did not perform any further silent reuse',
    );

    // Even with active provider SSO, explicit reauthentication is required and signed time verified.
    for (const mode of ['stale', 'missing-time', 'wrong-nonce']) {
      provider.setMode(mode);
      const existingSession = jar.values.get('autokosova_session')!;
      const existingToken = store.getLogoutIdToken(existingSession);
      const rejected = await request(await credentials('a'));
      assert.equal(store.getLogoutIdToken(existingSession), existingToken);
      assert.equal(rejected.statusCode, 401);
      assert.equal(rejected.cookies.length, 0);
      assert.equal((await request('/api/me')).json().userId, 'logout-fixture-b');
    }
    provider.setMode('fresh');
    const alienCallback = await credentials('a');
    assert.equal((await app.inject({ url: alienCallback })).statusCode, 400);
    assert.equal((await request(alienCallback)).statusCode, 302);

    // A callback already exchanging a code is revoked by logout before it can create a session.
    let arrived!: () => void, release!: () => void;
    const atToken = new Promise<void>((resolve) => (arrived = resolve));
    const paused = new Promise<void>((resolve) => (release = resolve));
    provider.pauseToken(async () => {
      arrived();
      await paused;
    });
    const delayedPath = await credentials('a');
    const delayed = request(delayedPath);
    await atToken;
    await logout();
    release();
    assert.equal((await delayed).statusCode, 401);
    assert.equal((await request('/api/me')).statusCode, 401);
    provider.pauseToken(undefined);

    // A new login cancels stale logout handoffs/callbacks instead of clearing the new session.
    const staleHandoff = await request('/auth/logout/provider');
    const staleState = new URL(staleHandoff.headers.location!).searchParams.get('state');
    assert.equal((await request(await credentials('b'))).statusCode, 302);
    assert.equal((await request('/auth/logout/callback?state=' + staleState)).statusCode, 400);
    assert.equal((await request('/api/me')).json().userId, 'logout-fixture-b');

    // A verified login is still usable without a V2 sid, but must never trigger the
    // provider's legacy/all-sessions behavior. Replacement also drops the old token.
    for (const mode of ['missing-sid', 'legacy-sid', 'invalid-sid']) {
      provider.setMode(mode);
      const previous = jar.values.get('autokosova_session');
      assert.equal((await request(await credentials('a'))).statusCode, 302);
      assert.equal(store.getLogoutIdToken(previous), undefined);
      assert.equal(store.getLogoutIdToken(jar.values.get('autokosova_session')), undefined);
      const providerSessions = provider.sessionCount;
      assert.deepEqual((await logout()).json(), { redirectTo: '/auth/logged-out?locale=sq' });
      assert.equal(provider.sessionCount, providerSessions);
      assert.equal((await request('/auth/logout/provider')).statusCode, 400);
    }
    provider.setMode('fresh');
    assert.equal((await request(await credentials('a'))).statusCode, 302);
    const apiSession = jar.values.get('autokosova_session')!;
    assert.ok(store.getLogoutIdToken(apiSession));
    const localOnly = await request('/auth/logout', 'POST', {
      'x-csrf-token': jar.values.get('autokosova_csrf')!,
    });
    assert.equal(localOnly.statusCode, 204);
    assert.equal(localOnly.headers.location, undefined);
    assert.equal(store.getLogoutIdToken(apiSession), undefined);
  } finally {
    await app.close();
    await provider.close();
  }
});

test('the stateful provider exposes account selection for the old no-hint request', async () => {
  const provider = await startSessionOidc('http://localhost:4200/auth/callback');
  try {
    const response = await fetch(
      provider.issuer +
        '/end_session?client_id=logout-test-client&post_logout_redirect_uri=' +
        encodeURIComponent('http://localhost:4200/auth/logout/callback') +
        '&state=old',
      { redirect: 'manual' },
    );
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location')!, /^\/logout\?selection=/);
    assert.equal(provider.counters.selections, 1);
  } finally {
    await provider.close();
  }
});

test('missing configuration and expired sessions remain locally logged out without false provider success', async () => {
  const store = new AccessStore(),
    app = createServer({ accessStore: store });
  const expired = store.createSession('expired', new Date(0));
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout?locale=en&returnTo=https://evil.invalid',
      headers: {
        cookie: `autokosova_session=${expired.sessionId}; autokosova_csrf=${expired.csrfToken}`,
        'x-csrf-token': expired.csrfToken,
        accept: 'application/json',
      },
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { redirectTo: '/auth/logged-out?locale=en' });
    const page = await app.inject({ url: response.json().redirectTo });
    assert.match(page.body, /local session has ended/);
    assert.match(page.body, /not configured/);
    assert.equal(page.headers['cache-control'], 'private, no-store');
    assert.doesNotMatch(page.body, /evil.invalid/);
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/logout',
          headers: { accept: 'application/json' },
        })
      ).statusCode,
      401,
    );
  } finally {
    await app.close();
  }
});

test('prompt allowlist preserves registration/explicit account choice; silent and unknown prompts force reauthentication', async () => {
  const app = createServer({ oidcConfig: readZitadelOidcConfig(environment) });
  try {
    for (const [prompt, expected] of [
      ['create', 'create'],
      ['select_account', 'select_account'],
      ['none', 'login'],
      ['unexpected', 'login'],
    ]) {
      const response = await app.inject({
        url: `/auth/login?prompt=${prompt}&returnTo=https://evil.invalid`,
      });
      const url = new URL(response.headers.location!);
      assert.equal(url.searchParams.get('prompt'), expected);
      assert.equal(url.searchParams.get('max_age'), expected === 'login' ? '0' : null);
      assert.ok(url.searchParams.get('nonce'));
      assert.equal(response.headers['cache-control'], 'private, no-store');
    }
  } finally {
    await app.close();
  }
});
