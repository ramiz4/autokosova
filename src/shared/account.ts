/** Minimal private account contract. Never serialize a principal, token or raw claims. */
export const APPLICATION_ROLES = ['customer', 'moderator', 'admin'] as const;
export type ApplicationRole = (typeof APPLICATION_ROLES)[number];
export interface AccountProfile {
  readonly displayName?: string;
  readonly username?: string;
  readonly email?: string;
}
export interface OwnGarageMembership {
  readonly garageId: string;
  readonly garageName?: string;
  readonly role: 'owner' | 'editor';
}
export interface OwnAccount extends AccountProfile {
  readonly userId: string;
  readonly roles: readonly ApplicationRole[];
  readonly garageMemberships: readonly OwnGarageMembership[];
  readonly expiresAt: string;
}
export function accountName(account: OwnAccount): string {
  return account.displayName || account.username || account.email || account.userId;
}
export function isOwnAccount(value: unknown): value is OwnAccount {
  if (!value || typeof value !== 'object') return false;
  const account = value as Record<string, unknown>;
  return (
    typeof account['userId'] === 'string' &&
    account['userId'].length > 0 &&
    typeof account['expiresAt'] === 'string' &&
    Number.isFinite(Date.parse(account['expiresAt'])) &&
    ['displayName', 'username', 'email'].every(
      (key) =>
        account[key] === undefined || (typeof account[key] === 'string' && account[key].length > 0),
    ) &&
    Array.isArray(account['roles']) &&
    account['roles'].length > 0 &&
    new Set(account['roles']).size === account['roles'].length &&
    account['roles'].every((role: unknown) =>
      APPLICATION_ROLES.some((allowed) => allowed === role),
    ) &&
    Array.isArray(account['garageMemberships']) &&
    account['garageMemberships'].every((membership: unknown) => {
      if (!membership || typeof membership !== 'object') return false;
      const item = membership as Record<string, unknown>;
      return (
        typeof item['garageId'] === 'string' &&
        item['garageId'].length > 0 &&
        (item['garageName'] === undefined || typeof item['garageName'] === 'string') &&
        (item['role'] === 'owner' || item['role'] === 'editor')
      );
    })
  );
}
