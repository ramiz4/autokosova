import type { RepairRequestInput, RepairRequestVehicle } from './repair-request';

/** The existing owner-only detail response; never use this type in public search URLs. */
export interface SavedRepairRequest {
  readonly active: boolean;
  readonly revision: number;
  readonly updatedAt: string;
  readonly areas: RepairRequestInput['areas'];
  readonly attachmentIds: readonly string[];
  readonly createdAt: string;
  readonly earliestDropoffOn: string;
  readonly id: string;
  readonly latestPickupOn: string;
  readonly serviceCategoryId: string;
  readonly symptom?: string;
  readonly vehicle?: RepairRequestVehicle;
}

export interface RepairRequestSummary {
  readonly active: boolean;
  readonly revision: number;
  readonly updatedAt: string;
  readonly id: string;
  readonly createdAt: string;
  readonly serviceCategoryId: string;
  readonly symptomPreview?: string;
  readonly areas: RepairRequestInput['areas'];
  readonly vehicle?: Pick<RepairRequestVehicle, 'makeId' | 'model' | 'year' | 'vehicleClass'>;
}

export interface RepairRequestPage {
  readonly requests: readonly RepairRequestSummary[];
  readonly nextCursor: string | null;
}

export interface RepairRequestPageOptions {
  readonly limit: number;
  readonly activity?: 'all' | 'active' | 'inactive';
  /** ID of the last displayed request, resolved within the current owner's records. */
  readonly cursor?: string;
}

export const REPAIR_REQUEST_PAGE_LIMIT = 20;
export const REPAIR_REQUEST_MAX_PAGE_LIMIT = 50;
export const REPAIR_REQUEST_PREVIEW_LENGTH = 160;

export function validRepairRequestPageOptions(options: RepairRequestPageOptions): boolean {
  return (
    (options.activity === undefined || ['all', 'active', 'inactive'].includes(options.activity)) &&
    Number.isInteger(options.limit) &&
    options.limit >= 1 &&
    options.limit <= REPAIR_REQUEST_MAX_PAGE_LIMIT &&
    (options.cursor === undefined ||
      (typeof options.cursor === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(options.cursor)))
  );
}

/** Whitelist summary fields. In particular, do not spread travel dates or attachment IDs. */
export function repairRequestSummary(
  request: Pick<
    SavedRepairRequest,
    | 'id'
    | 'createdAt'
    | 'serviceCategoryId'
    | 'symptom'
    | 'areas'
    | 'vehicle'
    | 'active'
    | 'revision'
    | 'updatedAt'
  >,
): RepairRequestSummary {
  const vehicle = request.vehicle;
  return {
    id: request.id,
    active: request.active,
    revision: request.revision,
    updatedAt: request.updatedAt,
    createdAt: request.createdAt,
    serviceCategoryId: request.serviceCategoryId,
    ...(request.symptom
      ? { symptomPreview: [...request.symptom].slice(0, REPAIR_REQUEST_PREVIEW_LENGTH).join('') }
      : {}),
    areas: request.areas.map(({ placeId, radiusKm }) => ({ placeId, radiusKm })),
    ...(vehicle &&
    (vehicle.makeId || vehicle.model || vehicle.year !== undefined || vehicle.vehicleClass)
      ? {
          vehicle: {
            ...(vehicle.makeId ? { makeId: vehicle.makeId } : {}),
            ...(vehicle.vehicleClass ? { vehicleClass: vehicle.vehicleClass } : {}),
            ...(vehicle.model ? { model: vehicle.model } : {}),
            ...(vehicle.year === undefined ? {} : { year: vehicle.year }),
          },
        }
      : {}),
  };
}

/** Mutations never infer ownership from the body. Every operation requires the last read revision. */
export type RepairRequestMutation =
  | { readonly kind: 'update'; readonly input: RepairRequestInput }
  | { readonly kind: 'activity'; readonly active: boolean }
  | { readonly kind: 'delete' };
