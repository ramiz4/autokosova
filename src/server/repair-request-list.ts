import { AccessError } from './access';
import {
  REPAIR_REQUEST_PAGE_LIMIT,
  validRepairRequestPageOptions,
  type RepairRequestPageOptions,
} from '../shared/saved-repair-request';

/** Do not let schema coercion/removeAdditional silently accept a supplied owner or duplicate key. */
export function parseRepairRequestPage(value: unknown): RepairRequestPageOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AccessError(400, 'Invalid request page');
  const query = value as Record<string, unknown>;
  if (Object.keys(query).some((key) => !['limit', 'cursor', 'activity'].includes(key)))
    throw new AccessError(400, 'Invalid request page');
  if (
    query['limit'] !== undefined &&
    (typeof query['limit'] !== 'string' || !/^[1-9]\d?$/.test(query['limit']))
  )
    throw new AccessError(400, 'Invalid request page');
  if (query['cursor'] !== undefined && typeof query['cursor'] !== 'string')
    throw new AccessError(400, 'Invalid request page');
  if (
    query['activity'] !== undefined &&
    !['all', 'active', 'inactive'].includes(query['activity'] as string)
  )
    throw new AccessError(400, 'Invalid request page');
  const options: RepairRequestPageOptions = {
    ...(query['activity'] === undefined
      ? {}
      : { activity: query['activity'] as RepairRequestPageOptions['activity'] }),
    limit: query['limit'] === undefined ? REPAIR_REQUEST_PAGE_LIMIT : Number(query['limit']),
    ...(query['cursor'] === undefined ? {} : { cursor: query['cursor'] as string }),
  };
  if (!validRepairRequestPageOptions(options)) throw new AccessError(400, 'Invalid request page');
  return options;
}
