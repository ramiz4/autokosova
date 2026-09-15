import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

/** Isolated test provider. Production auth code still exchanges PKCE and verifies signed JWTs. */
export async function startTestOidc(redirectUri, initialSubject) {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: randomUUID(), use: 'sig', alg: 'RS256' };
  const codes = new Map();
  let subject = initialSubject;
  let issuer;
  let exchanges = 0;
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, issuer);
      response.setHeader('cache-control', 'no-store');
      if (url.pathname === '/jwks') {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ keys: [jwk] }));
      } else if (url.pathname === '/authorize') {
        assert.equal(url.searchParams.get('client_id'), 'inquiries-browser-test');
        assert.equal(url.searchParams.get('redirect_uri'), redirectUri);
        assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
        assert.equal(url.searchParams.get('response_type'), 'code');
        assert.ok(url.searchParams.get('state'));
        const code = randomUUID();
        codes.set(code, {
          subject,
          challenge: url.searchParams.get('code_challenge'),
          nonce: url.searchParams.get('nonce'),
          authTime: Math.floor(Date.now() / 1000),
        });
        const target = new URL(redirectUri);
        target.searchParams.set('state', url.searchParams.get('state'));
        target.searchParams.set('code', code);
        response.writeHead(302, { location: target.toString() }).end();
      } else if (url.pathname === '/end_session') {
        assert.equal(url.searchParams.get('client_id'), 'inquiries-browser-test');
        const target = new URL('/auth/logout/callback', redirectUri);
        assert.equal(url.searchParams.get('post_logout_redirect_uri'), target.href);
        assert.ok(url.searchParams.get('state'));
        target.searchParams.set('state', url.searchParams.get('state'));
        response.writeHead(302, { location: target.href }).end();
      } else if (url.pathname === '/token' && request.method === 'POST') {
        let body = '';
        for await (const chunk of request) body += chunk;
        const form = new URLSearchParams(body);
        const grant = codes.get(form.get('code'));
        codes.delete(form.get('code'));
        assert.ok(grant);
        assert.equal(form.get('client_id'), 'inquiries-browser-test');
        assert.equal(form.get('redirect_uri'), redirectUri);
        assert.equal(form.get('grant_type'), 'authorization_code');
        assert.equal(
          createHash('sha256')
            .update(form.get('code_verifier') ?? '')
            .digest('base64url'),
          grant.challenge,
        );
        const token = await new SignJWT({
          nonce: grant.nonce,
          auth_time: grant.authTime,
          name: 'Testkonto · Anfragen',
          preferred_username: 'inquiries-test',
        })
          .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
          .setIssuer(issuer)
          .setAudience('inquiries-browser-test')
          .setSubject(grant.subject)
          .setIssuedAt()
          .setExpirationTime('5m')
          .sign(privateKey);
        exchanges++;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ id_token: token }));
      } else response.writeHead(404).end();
    } catch {
      // No credentials, authorization codes, request bodies or tokens in test logs.
      response.writeHead(400).end('Invalid test authorization');
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  issuer = `http://127.0.0.1:${server.address().port}`;
  return {
    environment: {
      ZITADEL_AUDIENCE: 'inquiries-browser-test',
      ZITADEL_CLIENT_ID: 'inquiries-browser-test',
      ZITADEL_ISSUER: issuer,
      ZITADEL_AUTHORIZATION_ENDPOINT: issuer + '/authorize',
      ZITADEL_TOKEN_ENDPOINT: issuer + '/token',
      ZITADEL_JWKS_URI: issuer + '/jwks',
      ZITADEL_REDIRECT_URI: redirectUri,
      ZITADEL_END_SESSION_ENDPOINT: issuer + '/end_session',
      ZITADEL_POST_LOGOUT_URI: new URL('/auth/logout/callback', redirectUri).href,
    },
    setSubject(value) {
      subject = value;
    },
    get exchanges() {
      return exchanges;
    },
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
