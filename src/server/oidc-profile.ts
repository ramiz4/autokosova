import type { AccountProfile } from '../shared/account';
import { accountProfileFromClaims } from './account-profile';
import type { ZitadelOidcConfig } from './oidc';

/** Distinguishes identity substitution from an optional profile service outage. */
export class OidcUserInfoSubjectError extends Error {
  constructor() {
    super('OIDC UserInfo subject does not match');
  }
}

/** No request-controlled URLs, cross-origin bearer forwarding, redirects or production HTTP. */
export function validateUserInfoEndpoint(
  endpoint: string,
  issuer: string,
  production = process.env['NODE_ENV'] === 'production',
): URL {
  const url = new URL(endpoint);
  const trusted = new URL(issuer);
  if (
    url.origin !== trusted.origin ||
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    trusted.username ||
    trusted.password ||
    trusted.hash ||
    trusted.search ||
    !(
      url.protocol === 'https:' ||
      (!production &&
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    )
  )
    throw new Error('Invalid OIDC profile endpoint');
  return url;
}

async function readJson(
  url: URL,
  signal: AbortSignal,
  accessToken?: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'error',
    cache: 'no-store',
    signal,
    headers: {
      accept: 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error('OIDC profile service unavailable');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 65_536) throw new Error('OIDC profile response too large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const result: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!result || typeof result !== 'object' || Array.isArray(result))
    throw new Error('Invalid OIDC profile response');
  return result as Record<string, unknown>;
}

/** Resolve once during the verified callback; neither tokens nor raw claims enter the session. */
export async function resolveOidcProfile(
  config: ZitadelOidcConfig,
  identity: { readonly subject: string; readonly profile: AccountProfile },
  accessToken?: string,
  timeoutMs = 5000,
): Promise<AccountProfile> {
  const profile = identity.profile;
  if (profile.displayName && profile.email && profile.username)
    return { ...profile, profileStatus: 'ready' };
  try {
    if (!accessToken) throw new Error('OIDC UserInfo credential unavailable');
    // One deadline covers discovery, response bodies and the UserInfo request together.
    const signal = AbortSignal.timeout(timeoutMs);
    let endpoint = config.userInfoEndpoint;
    if (!endpoint) {
      const discovery = validateUserInfoEndpoint(config.issuer, config.issuer);
      discovery.pathname =
        discovery.pathname.replace(/\/$/, '') + '/.well-known/openid-configuration';
      const metadata = await readJson(discovery, signal);
      if (metadata['issuer'] !== config.issuer || typeof metadata['userinfo_endpoint'] !== 'string')
        throw new Error('Invalid OIDC profile discovery');
      endpoint = metadata['userinfo_endpoint'];
    }
    const userInfo = await readJson(
      validateUserInfoEndpoint(endpoint, config.issuer),
      signal,
      accessToken,
    );
    // OIDC Core 5.3.2: exact, case-sensitive match, never merge another subject's data.
    if (userInfo['sub'] !== identity.subject) throw new OidcUserInfoSubjectError();
    return { ...accountProfileFromClaims(userInfo), ...profile, profileStatus: 'ready' };
  } catch (error) {
    if (error instanceof OidcUserInfoSubjectError) throw error;
    // Authentication remains valid during an optional provider outage. The UI must not
    // call absent fields "not provided" until a successful fresh login resolves them.
    return { ...profile, profileStatus: 'unavailable' };
  }
}
