import type { AccountProfile } from '../shared/account';

/** Called only after the existing OIDC signature/issuer/audience/subject verification. */
export function accountProfileFromClaims(
  claims: Readonly<Record<string, unknown>>,
): AccountProfile {
  const profile: { displayName?: string; username?: string; email?: string } = {};
  for (const [claim, field, limit] of [
    ['name', 'displayName', 200],
    ['preferred_username', 'username', 254],
    ['email', 'email', 254],
  ] as const) {
    const value = claims[claim];
    if (typeof value !== 'string') continue;
    const text = value.trim();
    // Omit malformed optional values rather than making them authoritative account data.
    if (
      text &&
      text.length <= limit &&
      ![...text].some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    )
      profile[field] = text;
  }
  return profile;
}
export function isAccountPagePath(url: string): boolean {
  return /^\/(?:sq\/|en\/)?(?:profile|inquiries|favorites)\/?$/.test(url.split(/[?#]/, 1)[0]);
}
