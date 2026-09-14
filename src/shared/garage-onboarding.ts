import { CATALOG_PLACES, SERVICE_CATEGORY_LABELS, VEHICLE_MAKE_LABELS } from './catalog';

export type WorkshopPublicationState =
  'draft' | 'pending_review' | 'published' | 'rejected' | 'suspended';
export interface WorkshopLocationPoint {
  readonly latitude: number;
  readonly longitude: number;
}
export interface VerificationChecklist {
  readonly companyDocument: 'not_checked' | 'verified' | 'failed';
  readonly contactPerson: 'not_checked' | 'verified' | 'failed';
  readonly location: 'not_checked' | 'verified' | 'failed';
  readonly phone: 'not_checked' | 'verified' | 'failed';
}
export interface WorkshopProfileInput {
  readonly address?: string;
  readonly contactEmail?: string;
  readonly contactPerson: string;
  readonly contactPhone: string;
  readonly description?: string;
  readonly languages: readonly string[];
  readonly locationPoint?: WorkshopLocationPoint;
  readonly name: string;
  readonly placeId: string;
  readonly publicPhone?: string;
  readonly selfReportedSpecializations: readonly string[];
  readonly serviceCategoryIds: readonly string[];
  readonly vehicleMakeIds: readonly string[];
}

// Stored language/specialization values remain compatible with existing public profiles.
export const GARAGE_LANGUAGES = [
  'Deutsch',
  'Shqip',
  'English',
  'Srpski',
  'Türkçe',
  'Italiano',
] as const;
export const GARAGE_SPECIALIZATIONS = [
  'Elektrodiagnose',
  'Bremsen',
  'Reifenwechsel',
  'Klimaanlage',
  'Karosserie',
  'Motor',
  'Getriebe',
  'Inspektion',
] as const;

export function foldSelection(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim();
}

// Manual entry is not geocoding. Compare only explicit catalog town names; never infer a point.
export function addressMatchesPlace(address: string, placeId: string): boolean {
  const normalized = foldSelection(address);
  const mentions = CATALOG_PLACES.flatMap((place) =>
    [place.label, ...place.aliases]
      .map((label) => ({ id: place.id, index: normalized.lastIndexOf(foldSelection(label)) }))
      .filter((entry) => entry.index >= 0),
  ).sort((a, b) => b.index - a.index);
  return mentions.length > 0 && mentions[0].id === placeId;
}

export function validGarageAddress(address: string, placeId: string): boolean {
  if (typeof address !== 'string') return false;
  let detail = foldSelection(address);
  for (const place of CATALOG_PLACES) {
    for (const label of [place.label, ...place.aliases])
      detail = detail.replaceAll(foldSelection(label), '');
  }
  return (
    address.trim().length >= 8 &&
    address.length <= 500 &&
    /\p{L}{2}/u.test(detail) &&
    addressMatchesPlace(address, placeId)
  );
}

export function knownGarageCatalogs(profile: {
  placeId: string;
  serviceCategoryIds: readonly string[];
  vehicleMakeIds: readonly string[];
}): boolean {
  return (
    CATALOG_PLACES.some((place) => place.id === profile.placeId) &&
    profile.serviceCategoryIds.every((id) => Object.hasOwn(SERVICE_CATEGORY_LABELS, id)) &&
    profile.vehicleMakeIds.every((id) => Object.hasOwn(VEHICLE_MAKE_LABELS, id))
  );
}

export function validGarageProfile(
  profile: WorkshopProfileInput,
  existing?: WorkshopProfileInput,
): boolean {
  const required = [profile.name, profile.placeId, profile.contactPerson, profile.contactPhone];
  if (
    required.some((value) => typeof value !== 'string' || !value.trim()) ||
    profile.name.length > 160 ||
    profile.contactPerson.length > 120 ||
    profile.contactPhone.trim().length < 3 ||
    profile.contactPhone.length > 40
  )
    return false;
  if (
    profile.publicPhone !== undefined &&
    (typeof profile.publicPhone !== 'string' ||
      profile.publicPhone.trim().length < 3 ||
      profile.publicPhone.length > 40)
  )
    return false;
  for (const list of [
    profile.languages,
    profile.serviceCategoryIds,
    profile.vehicleMakeIds,
    profile.selfReportedSpecializations,
  ]) {
    if (
      !Array.isArray(list) ||
      list.length > 20 ||
      new Set(list).size !== list.length ||
      list.some((value) => typeof value !== 'string' || !value.trim() || value.length > 80)
    )
      return false;
  }
  if (
    !profile.languages.length ||
    !profile.serviceCategoryIds.length ||
    !knownGarageCatalogs(profile)
  )
    return false;
  if (profile.address !== undefined && !validGarageAddress(profile.address, profile.placeId))
    return false;
  // Legacy profiles can retain custom labels. Newly entered choices use the shared option set.
  if (profile.address !== undefined) {
    if (
      !profile.languages.every(
        (value) =>
          (GARAGE_LANGUAGES as readonly string[]).includes(value) ||
          existing?.languages.includes(value),
      )
    )
      return false;
    if (
      !profile.selfReportedSpecializations.every(
        (value) =>
          (GARAGE_SPECIALIZATIONS as readonly string[]).includes(value) ||
          existing?.selfReportedSpecializations.includes(value),
      )
    )
      return false;
  }
  const point = profile.locationPoint;
  return (
    point === undefined ||
    (Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude) &&
      point.latitude >= -90 &&
      point.latitude <= 90 &&
      point.longitude >= -180 &&
      point.longitude <= 180)
  );
}
