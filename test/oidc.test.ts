import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAuthorizationUrl,
  extractZitadelProjectRoles,
  readZitadelOidcConfig,
} from '../src/server/oidc';

const config = {
  audience: 'client-id',
  authorizationEndpoint: 'https://issuer.example/oauth/v2/authorize',
  clientId: 'client-id',
  issuer: 'https://issuer.example',
  jwksUri: 'https://issuer.example/oauth/v2/keys',
  redirectUri: 'http://localhost:4000/auth/callback',
  tokenEndpoint: 'https://issuer.example/oauth/v2/token',
};

test('authorization URL binds state, PKCE challenge and local redirect', () => {
  const url = new URL(createAuthorizationUrl(config, 'opaque-state', 'pkce-challenge'));
  assert.equal(url.searchParams.get('state'), 'opaque-state');
  assert.equal(url.searchParams.get('code_challenge'), 'pkce-challenge');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('redirect_uri'), config.redirectUri);
  assert.equal(url.searchParams.has('prompt'), false);
});

test('registration opens the hosted ZITADEL create screen with the same PKCE contract', () => {
  const url = new URL(
    createAuthorizationUrl(config, 'register-state', 'register-challenge', 'create'),
  );
  assert.equal(url.searchParams.get('prompt'), 'create');
  assert.equal(url.searchParams.get('state'), 'register-state');
  assert.equal(url.searchParams.get('code_challenge'), 'register-challenge');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('redirect_uri'), config.redirectUri);
});

test('OIDC configuration fails closed when it is incomplete', () => {
  assert.equal(readZitadelOidcConfig({}), undefined);
  assert.throws(() => readZitadelOidcConfig({ ZITADEL_ISSUER: config.issuer }));
  assert.deepEqual(
    readZitadelOidcConfig({
      ZITADEL_AUDIENCE: config.audience,
      ZITADEL_AUTHORIZATION_ENDPOINT: config.authorizationEndpoint,
      ZITADEL_CLIENT_ID: config.clientId,
      ZITADEL_ISSUER: config.issuer,
      ZITADEL_JWKS_URI: config.jwksUri,
      ZITADEL_REDIRECT_URI: config.redirectUri,
      ZITADEL_TOKEN_ENDPOINT: config.tokenEndpoint,
    }),
    config,
  );
});

test('only supported ZITADEL project roles become server roles', () => {
  assert.deepEqual(
    extractZitadelProjectRoles({
      admin: { 'org-1': 'test.example' },
      moderator: { 'org-1': 'test.example' },
    }),
    ['admin', 'moderator'],
  );
  assert.deepEqual(extractZitadelProjectRoles({ ignored: { moderator: false } }), []);
  assert.deepEqual(extractZitadelProjectRoles([{ customer: { 'org-1': 'test.example' } }]), []);
});
