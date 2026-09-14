export const REPAIR_REQUEST_LIMITS = {
  maxAreas: 3,
  maxAttachments: 5,
  maxMileageKm: 2_000_000,
  maxRadiusKm: 100,
  maxSymptomLength: 2_000,
  minRadiusKm: 5,
  minVehicleYear: 1886,
  maxVehicleYear: 2100,
} as const;

export const REPAIR_REQUEST_SERVICE_CATEGORIES = [
  'service-inspektion',
  'bremsen',
  'reifen',
  'motor',
  'getriebe',
  'elektronik-diagnose',
  'klima',
  'karosserie',
] as const;

export const REPAIR_REQUEST_VEHICLE_MAKES = [
  'audi',
  'bmw',
  'mercedes-benz',
  'opel',
  'renault',
  'skoda',
  'toyota',
  'volkswagen',
] as const;

export const REPAIR_REQUEST_PLACES = [
  'xk-pristina',
  'xk-prizren',
  'xk-peja',
  'xk-gjakova',
  'xk-ferizaj',
  'xk-gjilan',
  'xk-mitrovica',
] as const;

export interface RepairRequestArea {
  readonly placeId: (typeof REPAIR_REQUEST_PLACES)[number];
  readonly radiusKm: number;
}

export const REPAIR_REQUEST_VEHICLE_CLASSES = [
  'car',
  'suv',
  'van',
  'camper',
  'motorcycle',
] as const;
export const REPAIR_REQUEST_FUELS = [
  'petrol',
  'diesel',
  'hybrid',
  'electric',
  'lpg',
  'other',
] as const;

export interface RepairRequestVehicle {
  readonly vehicleClass?: (typeof REPAIR_REQUEST_VEHICLE_CLASSES)[number];
  readonly fuel?: (typeof REPAIR_REQUEST_FUELS)[number];
  readonly engineDetails?: string;
  readonly makeId?: (typeof REPAIR_REQUEST_VEHICLE_MAKES)[number];
  readonly mileageKm?: number;
  readonly model?: string;
  readonly transmissionDetails?: string;
  readonly year?: number;
}

export interface RepairRequestInput {
  readonly areas: readonly RepairRequestArea[];
  readonly attachmentIds?: readonly string[];
  readonly earliestDropoffOn: string;
  readonly latestPickupOn: string;
  readonly serviceCategoryId: (typeof REPAIR_REQUEST_SERVICE_CATEGORIES)[number];
  readonly symptom?: string;
  readonly vehicle?: RepairRequestVehicle;
}

const localDatePattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isLocalCalendarDate(value: string): boolean {
  if (!localDatePattern.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDate() === day;
}

export function hasConsistentTravelDates(
  input: Pick<RepairRequestInput, 'earliestDropoffOn' | 'latestPickupOn'>,
): boolean {
  return (
    isLocalCalendarDate(input.earliestDropoffOn) &&
    isLocalCalendarDate(input.latestPickupOn) &&
    input.earliestDropoffOn <= input.latestPickupOn
  );
}
