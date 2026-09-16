import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { jwtVerify, exportJWK, generateKeyPair, SignJWT } from 'jose';

/** Test-only stateful provider: real PKCE/JWT flow, explicit fake credential entry, real SSO cookie. */
export async function startSessionOidc(redirectUri) {
  const callback = new URL('/auth/logout/callback', redirectUri).href;
  const keys = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(keys.publicKey)), kid: randomUUID(), alg: 'RS256', use: 'sig' };
  const password = randomBytes(24).toString('base64url');
  const codes = new Map(),
    sessions = new Map(),
    forms = new Map();
  const counters = { prompts: 0, silentLogins: 0, logouts: 0, exchanges: 0, selections: 0 };
  let issuer,
    mode = 'fresh',
    rejectLogout = false,
    tokenPause;
  function cookie(request, name) {
    return request.headers.cookie
      ?.split('; ')
      .find((part) => part.startsWith(name + '='))
      ?.slice(name.length + 1);
  }
  function authorize(response, parameters, session) {
    const code = randomUUID();
    codes.set(code, {
      ...session,
      nonce: parameters.get('nonce'),
      challenge: parameters.get('code_challenge'),
    });
    const target = new URL(redirectUri);
    target.searchParams.set('code', code);
    target.searchParams.set('state', parameters.get('state'));
    response.writeHead(302, { location: target.href }).end();
  }
  const server = createServer(async (request, response) => {
    response.setHeader('cache-control', 'no-store');
    response.setHeader('referrer-policy', 'no-referrer');
    try {
      const url = new URL(request.url, issuer);
      if (url.pathname === '/jwks') {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ keys: [jwk] }));
      } else if (url.pathname === '/authorize') {
        const parameters = url.searchParams;
        assert.equal(parameters.get('client_id'), 'logout-test-client');
        assert.equal(parameters.get('redirect_uri'), redirectUri);
        assert.equal(parameters.get('response_type'), 'code');
        assert.equal(parameters.get('code_challenge_method'), 'S256');
        assert.ok(parameters.get('state'));
        const session = sessions.get(cookie(request, 'fixture_sso'));
        if (
          session &&
          !['login', 'select_account', 'create'].includes(parameters.get('prompt')) &&
          parameters.get('max_age') !== '0'
        ) {
          counters.silentLogins++;
          authorize(response, parameters, session);
        } else {
          counters.prompts++;
          const binding = randomUUID();
          forms.set(binding, parameters);
          response.setHeader(
            'set-cookie',
            `fixture_flow=${binding}; Path=/; HttpOnly; SameSite=Lax`,
          );
          response.setHeader('content-type', 'text/html; charset=utf-8');
          response.end(
            '<!doctype html><html><head><title>Fiktiver OIDC-Testprovider</title></head><body><h1 data-credential-prompt>Testanmeldung</h1><form method="post" action="/signin"><label>Konto<select name="account"><option value="a">Fiktives Konto A</option><option value="b">Fiktives Konto B</option></select></label><label>Testpasswort<input type="password" name="password" autocomplete="off" required></label><button type="submit">Anmelden</button></form></body></html>',
          );
        }
      } else if (url.pathname === '/signin' && request.method === 'POST') {
        let body = '';
        for await (const chunk of request) {
          body += chunk;
          assert.ok(body.length < 4096);
        }
        const form = new URLSearchParams(body),
          binding = cookie(request, 'fixture_flow');
        const parameters = forms.get(binding);
        forms.delete(binding);
        assert.ok(parameters);
        assert.equal(form.get('password'), password);
        assert.ok(['a', 'b'].includes(form.get('account')));
        const id = randomUUID(),
          session = {
            id,
            subject: `logout-fixture-${form.get('account')}`,
            authTime: Math.floor(Date.now() / 1000),
          };
        sessions.set(id, session);
        response.setHeader('set-cookie', `fixture_sso=${id}; Path=/; HttpOnly; SameSite=Lax`);
        authorize(response, parameters, session);
      } else if (url.pathname === '/token' && request.method === 'POST') {
        let body = '';
        for await (const chunk of request) {
          body += chunk;
          assert.ok(body.length < 8192);
        }
        const form = new URLSearchParams(body),
          grant = codes.get(form.get('code'));
        codes.delete(form.get('code'));
        assert.ok(grant);
        assert.equal(form.get('client_id'), 'logout-test-client');
        assert.equal(form.get('redirect_uri'), redirectUri);
        assert.equal(form.get('grant_type'), 'authorization_code');
        assert.equal(
          createHash('sha256')
            .update(form.get('code_verifier') ?? '')
            .digest('base64url'),
          grant.challenge,
        );
        await tokenPause?.();
        const token = await new SignJWT({
          ...(mode === 'missing-sid'
            ? {}
            : {
                sid:
                  mode === 'legacy-sid' ? 'V1_' + grant.id : mode === 'invalid-sid' ? 42 : grant.id,
              }),
          name: `Fiktives Konto ${grant.subject.endsWith('a') ? 'A' : 'B'}`,
          nonce: mode === 'wrong-nonce' ? 'wrong' : grant.nonce,
          ...(mode === 'missing-time'
            ? {}
            : { auth_time: mode === 'stale' ? grant.authTime - 3600 : grant.authTime }),
        })
          .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
          .setIssuer(issuer)
          .setSubject(grant.subject)
          .setAudience('logout-test-client')
          .setIssuedAt()
          .setExpirationTime('5m')
          .sign(keys.privateKey);
        counters.exchanges++;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ id_token: token }));
      } else if (url.pathname === '/end_session') {
        assert.equal(url.searchParams.get('client_id'), 'logout-test-client');
        assert.equal(url.searchParams.get('post_logout_redirect_uri'), callback);
        assert.ok(url.searchParams.get('state'));
        const hint = url.searchParams.get('id_token_hint');
        if (!hint) {
          counters.selections++;
          response.writeHead(302, { location: '/logout?selection=required' }).end();
          return;
        }
        const { payload } = await jwtVerify(hint, keys.publicKey, {
          issuer,
          audience: 'logout-test-client',
        });
        const sid = payload.sid;
        assert.equal(typeof sid, 'string');
        assert.ok(
          sessions.has(sid),
          'id_token_hint must identify an active matching provider session',
        );
        assert.equal(sessions.get(sid).subject, payload.sub);
        if (rejectLogout) {
          response.writeHead(503).end('Test provider unavailable');
          return;
        }
        sessions.delete(sid);
        counters.logouts++;
        if (cookie(request, 'fixture_sso') === sid)
          response.setHeader(
            'set-cookie',
            'fixture_sso=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
          );
        const target = new URL(callback);
        target.searchParams.set('state', url.searchParams.get('state'));
        response.writeHead(302, { location: target.href }).end();
      } else if (url.pathname === '/logout') {
        response.setHeader('content-type', 'text/html; charset=utf-8');
        response.end('<!doctype html><h1 data-account-selection>Account selection required</h1>');
      } else response.writeHead(404).end();
    } catch {
      response.writeHead(400).end('Invalid test request');
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  issuer = `http://127.0.0.1:${server.address().port}`;
  return {
    issuer,
    password,
    counters,
    get sessionCount() {
      return sessions.size;
    },
    addUnrelatedSession(subject = 'logout-fixture-unrelated') {
      const id = randomUUID();
      sessions.set(id, { id, subject, authTime: Math.floor(Date.now() / 1000) });
      return id;
    },
    hasSession(id) {
      return sessions.has(id);
    },
    setMode(value) {
      mode = value;
    },
    setLogoutFailure(value) {
      rejectLogout = value;
    },
    pauseToken(handler) {
      tokenPause = handler;
    },
    environment: {
      ZITADEL_ISSUER: issuer,
      ZITADEL_CLIENT_ID: 'logout-test-client',
      ZITADEL_AUDIENCE: 'logout-test-client',
      ZITADEL_AUTHORIZATION_ENDPOINT: issuer + '/authorize',
      ZITADEL_TOKEN_ENDPOINT: issuer + '/token',
      ZITADEL_JWKS_URI: issuer + '/jwks',
      ZITADEL_REDIRECT_URI: redirectUri,
      ZITADEL_END_SESSION_ENDPOINT: issuer + '/end_session',
      ZITADEL_POST_LOGOUT_URI: callback,
    },
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
