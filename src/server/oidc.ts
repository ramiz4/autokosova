import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const zitadelProjectRolesClaim = 'urn:zitadel:iam:org:project:roles';
const supportedSystemRoles = new Set(['admin', 'moderator']);

export interface ZitadelVerifierConfig {
  readonly audience: string;
  readonly issuer: string;
  readonly jwksUri: string;
}

export interface ZitadelOidcConfig extends ZitadelVerifierConfig {
  readonly authorizationEndpoint: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly tokenEndpoint: string;
}

export function readZitadelOidcConfig(
  environment: NodeJS.ProcessEnv,
): ZitadelOidcConfig | undefined {
  const values = {
    audience: environment['ZITADEL_AUDIENCE'],
    authorizationEndpoint: environment['ZITADEL_AUTHORIZATION_ENDPOINT'],
    clientId: environment['ZITADEL_CLIENT_ID'],
    issuer: environment['ZITADEL_ISSUER'],
    jwksUri: environment['ZITADEL_JWKS_URI'],
    redirectUri: environment['ZITADEL_REDIRECT_URI'],
    tokenEndpoint: environment['ZITADEL_TOKEN_ENDPOINT'],
  };
  const supplied = Object.values(values).filter(Boolean).length;
  if (supplied === 0) return undefined;
  if (supplied !== Object.keys(values).length) {
    throw new Error('ZITADEL OIDC configuration is incomplete');
  }
  return values as ZitadelOidcConfig;
}

export function createPkceTransaction() {
  const codeVerifier = randomBytes(48).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  const state = randomBytes(32).toString('base64url');
  return { codeChallenge, codeVerifier, state };
}

export function createAuthorizationUrl(
  config: ZitadelOidcConfig,
  state: string,
  codeChallenge: string,
  prompt?: 'create',
) {
  const url = new URL(config.authorizationEndpoint);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid profile email');
  url.searchParams.set('state', state);
  if (prompt === 'create') url.searchParams.set('prompt', 'create');
  return url.toString();
}

export async function exchangeAuthorizationCode(
  config: ZitadelOidcConfig,
  code: string,
  codeVerifier: string,
) {
  const response = await fetch(config.tokenEndpoint, {
    body: new URLSearchParams({
      client_id: config.clientId,
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
    }),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('OIDC authorization code exchange failed');
  }

  const payload = (await response.json()) as { id_token?: unknown };
  if (typeof payload.id_token !== 'string') {
    throw new Error('OIDC response has no ID token');
  }
  return payload.id_token;
}

export async function verifyZitadelAccessToken(token: string, config: ZitadelVerifierConfig) {
  const verification = await jwtVerify(token, createRemoteJWKSet(new URL(config.jwksUri)), {
    audience: config.audience,
    issuer: config.issuer,
  });

  if (!verification.payload.sub) {
    throw new Error('OIDC token has no subject');
  }

  return {
    roles: extractZitadelProjectRoles(verification.payload[zitadelProjectRolesClaim]),
    subject: verification.payload.sub,
  };
}

export function extractZitadelProjectRoles(value: unknown): readonly ('admin' | 'moderator')[] {
  const roles = new Set<'admin' | 'moderator'>();
  const grants = Array.isArray(value) ? value : [value];
  for (const grant of grants) {
    if (!grant || typeof grant !== 'object') continue;
    for (const roleKey of Object.keys(grant)) {
      if (supportedSystemRoles.has(roleKey)) roles.add(roleKey as 'admin' | 'moderator');
    }
  }
  return [...roles].sort();
}
