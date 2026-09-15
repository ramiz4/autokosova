import { createHash, randomBytes } from 'node:crypto';
import { accountProfileFromClaims } from './account-profile';
import { validateUserInfoEndpoint } from './oidc-profile';
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
  readonly userInfoEndpoint?: string;
  readonly endSessionEndpoint?: string;
  readonly postLogoutRedirectUri?: string;
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
  const endSessionEndpoint = environment['ZITADEL_END_SESSION_ENDPOINT'];
  const postLogoutRedirectUri = environment['ZITADEL_POST_LOGOUT_URI'];
  const userInfoEndpoint = environment['ZITADEL_USERINFO_ENDPOINT'];
  if (supplied === 0 && !endSessionEndpoint && !postLogoutRedirectUri && !userInfoEndpoint)
    return undefined;
  if (supplied !== Object.keys(values).length) {
    throw new Error('ZITADEL OIDC configuration is incomplete');
  }
  const config = {
    ...values,
    ...(userInfoEndpoint ? { userInfoEndpoint } : {}),
  } as ZitadelOidcConfig;
  if (userInfoEndpoint) {
    try {
      validateUserInfoEndpoint(
        userInfoEndpoint,
        config.issuer,
        environment['NODE_ENV'] === 'production',
      );
    } catch {
      throw new Error('ZITADEL UserInfo configuration is invalid');
    }
  }
  if (!endSessionEndpoint && !postLogoutRedirectUri) return config;
  if (!endSessionEndpoint || !postLogoutRedirectUri)
    throw new Error('ZITADEL logout configuration is incomplete');
  const logout = { ...config, endSessionEndpoint, postLogoutRedirectUri };
  try {
    validateLogoutConfig(logout, environment['NODE_ENV'] === 'production');
  } catch {
    throw new Error('ZITADEL logout configuration is invalid');
  }
  return logout;
}

export function createPkceTransaction() {
  const codeVerifier = randomBytes(48).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  const state = randomBytes(32).toString('base64url');
  return { codeChallenge, codeVerifier, state, nonce: randomBytes(32).toString('base64url') };
}

export function createAuthorizationUrl(
  config: ZitadelOidcConfig,
  state: string,
  codeChallenge: string,
  prompt: 'login' | 'select_account' | 'create' = 'login',
  nonce?: string,
) {
  const url = new URL(config.authorizationEndpoint);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid profile email');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', prompt);
  if (prompt === 'login') url.searchParams.set('max_age', '0');
  if (nonce) url.searchParams.set('nonce', nonce);
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
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error('OIDC authorization code exchange failed');
  }

  const payload = (await response.json()) as {
    id_token?: unknown;
    access_token?: unknown;
    token_type?: unknown;
  } | null;
  if (!payload || typeof payload.id_token !== 'string') {
    throw new Error('OIDC response has no ID token');
  }
  return {
    idToken: payload.id_token,
    // Keep the access token only for this callback's server-side UserInfo request.
    accessToken:
      typeof payload.access_token === 'string' &&
      payload.access_token.length > 0 &&
      typeof payload.token_type === 'string' &&
      payload.token_type.toLowerCase() === 'bearer'
        ? payload.access_token
        : undefined,
  };
}

export async function verifyZitadelAccessToken(
  token: string,
  config: ZitadelVerifierConfig,
  authentication?: { readonly nonce: string; readonly reauthenticateAfter?: number },
) {
  const verification = await jwtVerify(token, createRemoteJWKSet(new URL(config.jwksUri)), {
    audience: config.audience,
    issuer: config.issuer,
  });

  if (authentication) {
    if (verification.payload['nonce'] !== authentication.nonce)
      throw new Error('OIDC nonce does not match');
    if (authentication.reauthenticateAfter !== undefined) {
      const time = verification.payload['auth_time'];
      // max_age=0 is only meaningful if the signed token proves fresh authentication.
      // Five seconds tolerate provider clock skew, not an old SSO login.
      if (
        typeof time !== 'number' ||
        !Number.isInteger(time) ||
        time < authentication.reauthenticateAfter - 5 ||
        time > Date.now() / 1000 + 5
      )
        throw new Error('OIDC authentication is not fresh');
    }
  }
  if (!verification.payload.sub) {
    throw new Error('OIDC token has no subject');
  }

  return {
    profile: accountProfileFromClaims(verification.payload),
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

/** Explicit trusted configuration only; never use Host, Referer or a user-supplied redirect. */
export function validateLogoutConfig(config: ZitadelOidcConfig, production = false): void {
  if (!config.endSessionEndpoint || !config.postLogoutRedirectUri)
    throw new Error('ZITADEL logout configuration is incomplete');
  const endpoint = new URL(config.endSessionEndpoint);
  const callback = new URL(config.postLogoutRedirectUri);
  const loginCallback = new URL(config.redirectUri);
  const safe = (url: URL) =>
    !url.username &&
    !url.password &&
    !url.hash &&
    !url.search &&
    (url.protocol === 'https:' ||
      (!production &&
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)));
  if (
    !safe(endpoint) ||
    !safe(callback) ||
    callback.origin !== loginCallback.origin ||
    callback.pathname !== '/auth/logout/callback' ||
    ![new URL(config.issuer).origin, new URL(config.authorizationEndpoint).origin].includes(
      endpoint.origin,
    )
  )
    throw new Error('ZITADEL logout configuration is invalid');
}

export function createEndSessionUrl(
  config: ZitadelOidcConfig,
  state: string,
  locale: string,
): string {
  validateLogoutConfig(config, process.env['NODE_ENV'] === 'production');
  const url = new URL(config.endSessionEndpoint!);
  // ZITADEL supports client_id + its own browser cookie. Do not retain/forward raw ID tokens.
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('post_logout_redirect_uri', config.postLogoutRedirectUri!);
  url.searchParams.set('state', state);
  url.searchParams.set('ui_locales', locale);
  return url.toString();
}
