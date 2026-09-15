export { validateRepairRequest } from '../shared/repair-request-validation';
import { buildRepairRequestSearchParams, type RepairRequestInput } from '../shared/repair-request';

export function buildMatchingPath(input: RepairRequestInput): string {
  return `/garages?${buildRepairRequestSearchParams(input)}`;
}
