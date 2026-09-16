import type { AccountProfile } from '../shared/account';

/** Only verified ID-token claims or same-subject, trusted UserInfo may reach this mapper. */
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
  if (!profile.displayName) {
    const parts = ['given_name', 'family_name']
      .map((key) => claims[key])
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(
        (value) =>
          value &&
          value.length <= 200 &&
          ![...value].some(
            (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
          ),
      );
    const name = parts.join(' ');
    if (name && name.length <= 200) profile.displayName = name;
  }
  return profile;
}
export function isAccountPagePath(url: string): boolean {
  return /^\/(?:sq\/|en\/)?(?:admin|moderation|profile|reviews|inquiries|favorites|garages\/[A-Za-z0-9_-]{1,128}\/reviews\/new)\/?$/.test(
    url.split(/[?#]/, 1)[0],
  );
}
