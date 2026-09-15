import {
  isLocalCalendarDate,
  REPAIR_REQUEST_FUELS,
  REPAIR_REQUEST_PLACES,
  REPAIR_REQUEST_SERVICE_CATEGORIES,
  REPAIR_REQUEST_VEHICLE_CLASSES,
  REPAIR_REQUEST_VEHICLE_MAKES,
} from './repair-request';
import {
  REPAIR_REQUEST_MAX_PAGE_LIMIT,
  type RepairRequestPage,
  type SavedRepairRequest,
} from './saved-repair-request';

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const text = (value: unknown, limit: number): boolean =>
  value === undefined || (typeof value === 'string' && [...value].length <= limit);
const integer = (value: unknown, min: number, max: number): boolean =>
  value === undefined ||
  (typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max);
const choice = (value: unknown, choices: readonly string[]): boolean =>
  value === undefined || (typeof value === 'string' && choices.includes(value));

function vehicle(value: unknown): boolean {
  if (value === undefined) return true;
  if (!record(value)) return false;
  return (
    choice(value['makeId'], REPAIR_REQUEST_VEHICLE_MAKES) &&
    choice(value['vehicleClass'], REPAIR_REQUEST_VEHICLE_CLASSES) &&
    choice(value['fuel'], REPAIR_REQUEST_FUELS) &&
    integer(value['year'], 1886, 2100) &&
    integer(value['mileageKm'], 0, 2_000_000) &&
    ['model', 'engineDetails', 'transmissionDetails'].every((key) => text(value[key], 120))
  );
}

function summary(value: unknown): value is RecordValue {
  if (!record(value)) return false;
  return (
    identifier(value['id']) &&
    typeof value['active'] === 'boolean' &&
    typeof value['revision'] === 'number' &&
    integer(value['revision'], 1, 2_147_483_647) &&
    typeof value['updatedAt'] === 'string' &&
    Number.isFinite(Date.parse(value['updatedAt'])) &&
    typeof value['createdAt'] === 'string' &&
    Number.isFinite(Date.parse(value['createdAt'])) &&
    typeof value['serviceCategoryId'] === 'string' &&
    (REPAIR_REQUEST_SERVICE_CATEGORIES as readonly string[]).includes(value['serviceCategoryId']) &&
    text(value['symptomPreview'], 160) &&
    vehicle(value['vehicle']) &&
    Array.isArray(value['areas']) &&
    value['areas'].length <= 3 &&
    value['areas'].every(
      (area: unknown) =>
        record(area) &&
        typeof area['placeId'] === 'string' &&
        (REPAIR_REQUEST_PLACES as readonly string[]).includes(area['placeId']) &&
        typeof area['radiusKm'] === 'number' &&
        integer(area['radiusKm'], 5, 100),
    )
  );
}

export function isRepairRequestPage(value: unknown): value is RepairRequestPage {
  if (!record(value) || !Array.isArray(value['requests'])) return false;
  const requests = value['requests'];
  return (
    requests.length <= REPAIR_REQUEST_MAX_PAGE_LIMIT &&
    requests.every(summary) &&
    new Set(requests.map((item: RecordValue) => item['id'])).size === requests.length &&
    (value['nextCursor'] === null ||
      (identifier(value['nextCursor']) &&
        requests.length > 0 &&
        value['nextCursor'] === requests[requests.length - 1]['id']))
  );
}

export function isSavedRepairRequest(value: unknown): value is SavedRepairRequest {
  return (
    summary(value) &&
    text(value['symptom'], 2_000) &&
    typeof value['earliestDropoffOn'] === 'string' &&
    isLocalCalendarDate(value['earliestDropoffOn']) &&
    typeof value['latestPickupOn'] === 'string' &&
    isLocalCalendarDate(value['latestPickupOn']) &&
    Array.isArray(value['attachmentIds']) &&
    value['attachmentIds'].length <= 5 &&
    value['attachmentIds'].every(identifier)
  );
}
