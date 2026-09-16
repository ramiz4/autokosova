import { AccessError } from './access';

/** CASE-4: call only after locking the authorized case in the mutation transaction. */
export function assertCaseRevision(actual: number | undefined, expected: number | undefined): void {
  if (expected === undefined) return;
  if (!Number.isSafeInteger(expected) || expected < 1 || expected > 2147483647)
    throw new AccessError(422, 'Invalid case revision');
  if (actual === undefined) throw new AccessError(404, 'Moderation case not found');
  if (actual !== expected)
    throw new AccessError(
      409,
      'The case changed; reload it before making a decision',
      'case_stale',
    );
}
