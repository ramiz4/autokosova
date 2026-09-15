import {
  hasConsistentTravelDates,
  REPAIR_REQUEST_LIMITS,
  REPAIR_REQUEST_PLACES,
  REPAIR_REQUEST_SERVICE_CATEGORIES,
  REPAIR_REQUEST_VEHICLE_MAKES,
  REPAIR_REQUEST_VEHICLE_CLASSES,
  REPAIR_REQUEST_FUELS,
  type RepairRequestInput,
} from './repair-request';

const serviceCategoryIds = new Set<string>(REPAIR_REQUEST_SERVICE_CATEGORIES);
const placeIds = new Set<string>(REPAIR_REQUEST_PLACES);
const vehicleMakeIds = new Set<string>(REPAIR_REQUEST_VEHICLE_MAKES);

export function validateRepairRequest(input: RepairRequestInput): string | undefined {
  if (!serviceCategoryIds.has(input.serviceCategoryId)) {
    return 'Please choose a known service category';
  }

  if (input.areas.length > REPAIR_REQUEST_LIMITS.maxAreas) {
    return 'Choose at most three search areas';
  }

  if (new Set(input.areas.map((area) => area.placeId)).size !== input.areas.length) {
    return 'Each search area must use a different place';
  }

  for (const area of input.areas) {
    if (!placeIds.has(area.placeId)) return 'Please choose a known place';
    if (
      !Number.isInteger(area.radiusKm) ||
      area.radiusKm < REPAIR_REQUEST_LIMITS.minRadiusKm ||
      area.radiusKm > REPAIR_REQUEST_LIMITS.maxRadiusKm
    ) {
      return `Radius must be between ${REPAIR_REQUEST_LIMITS.minRadiusKm} and ${REPAIR_REQUEST_LIMITS.maxRadiusKm} km`;
    }
  }

  if (!hasConsistentTravelDates(input)) {
    return 'Earliest drop-off and latest pickup must be consistent local calendar dates';
  }

  if (input.symptom && input.symptom.trim().length > REPAIR_REQUEST_LIMITS.maxSymptomLength) {
    return 'Symptom description is too long';
  }

  if (input.vehicle) {
    if (
      input.vehicle.vehicleClass !== undefined &&
      !REPAIR_REQUEST_VEHICLE_CLASSES.includes(input.vehicle.vehicleClass)
    )
      return 'Unknown vehicle class';
    if (input.vehicle.fuel !== undefined && !REPAIR_REQUEST_FUELS.includes(input.vehicle.fuel))
      return 'Unknown fuel';
    if (
      [input.vehicle.engineDetails, input.vehicle.transmissionDetails].some(
        (value) => value !== undefined && value.length > 120,
      )
    )
      return 'Vehicle details are too long';
    if (input.vehicle.makeId !== undefined && !vehicleMakeIds.has(input.vehicle.makeId))
      return 'Please choose a known vehicle make';
    if (
      input.vehicle.model !== undefined &&
      (!input.vehicle.model.trim() || input.vehicle.model.length > 120)
    ) {
      return 'Vehicle model is required and must be at most 120 characters';
    }
    if (
      input.vehicle.year !== undefined &&
      (!Number.isInteger(input.vehicle.year) ||
        input.vehicle.year < REPAIR_REQUEST_LIMITS.minVehicleYear ||
        input.vehicle.year > REPAIR_REQUEST_LIMITS.maxVehicleYear)
    ) {
      return 'Vehicle year is outside the supported range';
    }
    if (
      input.vehicle.mileageKm !== undefined &&
      (!Number.isInteger(input.vehicle.mileageKm) ||
        input.vehicle.mileageKm < 0 ||
        input.vehicle.mileageKm > REPAIR_REQUEST_LIMITS.maxMileageKm)
    ) {
      return 'Mileage is outside the supported range';
    }
  }

  if ((input.attachmentIds?.length ?? 0) > REPAIR_REQUEST_LIMITS.maxAttachments) {
    return `Attach at most ${REPAIR_REQUEST_LIMITS.maxAttachments} files`;
  }
  if (input.attachmentIds && new Set(input.attachmentIds).size !== input.attachmentIds.length) {
    return 'Each attachment can only be selected once';
  }

  return undefined;
}
