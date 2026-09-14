import type { PublicWorkshopProfile } from './access';
import { emptyReviewSummary, reviewRelevanceScore, type PublicReviewSummary } from './reviews';
import { getCatalogPlace, SERVICE_CATEGORY_LABELS, VEHICLE_MAKE_LABELS } from '../shared/catalog';
import {
  REPAIR_REQUEST_LIMITS,
  REPAIR_REQUEST_PLACES,
  REPAIR_REQUEST_SERVICE_CATEGORIES,
  REPAIR_REQUEST_VEHICLE_MAKES,
} from '../shared/repair-request';

const knownPlaceIds = new Set<string>(REPAIR_REQUEST_PLACES);
const knownServiceCategoryIds = new Set<string>(REPAIR_REQUEST_SERVICE_CATEGORIES);
const knownVehicleMakeIds = new Set<string>(REPAIR_REQUEST_VEHICLE_MAKES);

export const SEARCH_LIMITS = {
  defaultAllPageSize: 30,
  defaultPageSize: 10,
  maxPageSize: 30,
} as const;

export interface PublicWorkshopSearchArea {
  readonly placeId: string;
  readonly radiusKm: number;
}

export interface PublicWorkshopSearchInput {
  readonly areas: readonly PublicWorkshopSearchArea[];
  readonly allResults?: boolean;
  readonly language?: string;
  readonly page: number;
  readonly pageSize: number;
  readonly serviceCategoryId?: string;
  readonly sort?: 'recommended' | 'rating';
  readonly vehicleMakeId?: string;
}

export interface SearchMatchCandidate extends PublicWorkshopProfile {
  readonly distanceM?: number;
  readonly locationAvailable?: boolean;
  readonly matchingPlaceId: string;
}

export interface PublicWorkshopSearchResult {
  readonly companyDataVerified: boolean;
  readonly contact: PublicWorkshopProfile['contact'];
  readonly description?: string;
  readonly distanceKm?: number;
  readonly id: string;
  readonly languages: readonly string[];
  readonly locationAvailable: boolean;
  readonly matchingPlace: { readonly id: string; readonly label: string };
  readonly name: string;
  readonly photoIds: readonly string[];
  readonly placeId: string;
  readonly reasons: readonly string[];
  readonly reviewSummary: PublicReviewSummary;
  readonly selfReportedSpecializations: readonly string[];
  readonly serviceCategoryIds: readonly string[];
  readonly vehicleMakeIds: readonly string[];
}

export interface PublicWorkshopSearchResponse {
  readonly allResults: boolean;
  readonly page: number;
  readonly pageSize: number;
  readonly results: readonly PublicWorkshopSearchResult[];
  readonly searchAreas: readonly {
    readonly label: string;
    readonly placeId: string;
    readonly radiusKm: number;
  }[];
  readonly serviceCategory: { readonly id: string; readonly label: string };
  readonly sort: PublicWorkshopSearchInput['sort'];
  readonly total: number;
  readonly totalPages: number;
}

export interface WorkshopSearchStore {
  close?(): Promise<void>;
  getPublicWorkshop(
    workshopId: string,
  ): PublicWorkshopProfile | undefined | Promise<PublicWorkshopProfile | undefined>;
  listPublicWorkshopIds(): readonly string[] | Promise<readonly string[]>;
  searchPublicWorkshops(
    input: PublicWorkshopSearchInput,
  ): PublicWorkshopSearchResponse | Promise<PublicWorkshopSearchResponse>;
}

/**
 * Validates the public, non-sensitive search handoff. It deliberately accepts only the catalog
 * IDs and the same 5–100 km radius range as the repair-request flow; a malformed filter is never
 * broadened on the server.
 */
export function parsePublicWorkshopSearch(
  query: Record<string, unknown>,
): PublicWorkshopSearchInput | undefined {
  const places = optionalString(query['places']);
  const serviceCategoryId = optionalString(query['service']);
  const vehicleMakeId = optionalString(query['vehicleMake']);
  if (vehicleMakeId && !knownVehicleMakeIds.has(vehicleMakeId)) {
    throw new WorkshopSearchValidationError('Please choose a known vehicle make');
  }
  const language = optionalString(query['language']);
  if (language && (!isPlainTextFilter(language) || language.length > 40)) {
    throw new WorkshopSearchValidationError('Language filter is invalid');
  }

  if (!places) {
    if (!serviceCategoryId && query['all'] !== 'true') return undefined;
    if (serviceCategoryId && !knownServiceCategoryIds.has(serviceCategoryId)) {
      throw new WorkshopSearchValidationError('Please choose a known service category');
    }
    const sort = optionalString(query['sort']) ?? 'recommended';
    if (sort !== 'recommended' && sort !== 'rating') {
      throw new WorkshopSearchValidationError('Please choose a supported sort order');
    }
    return {
      allResults: true,
      areas: [],
      page: positiveInteger(query['page'], 1, 9999),
      pageSize: positiveInteger(
        query['pageSize'],
        SEARCH_LIMITS.defaultAllPageSize,
        SEARCH_LIMITS.maxPageSize,
      ),
      sort,
      ...(serviceCategoryId ? { serviceCategoryId } : {}),
      ...(vehicleMakeId ? { vehicleMakeId } : {}),
      ...(language ? { language } : {}),
    };
  }

  const areas = places.split(',').map((value) => {
    const [placeId, radius] = value.split(':');
    if (!placeId || !radius || value.split(':').length !== 2) {
      throw new WorkshopSearchValidationError('Each search area must use placeId:radiusKm');
    }
    const radiusKm = Number(radius);
    if (
      !knownPlaceIds.has(placeId) ||
      !Number.isInteger(radiusKm) ||
      radiusKm < REPAIR_REQUEST_LIMITS.minRadiusKm ||
      radiusKm > REPAIR_REQUEST_LIMITS.maxRadiusKm
    ) {
      throw new WorkshopSearchValidationError(
        'Search areas must use a known place and a radius from 5 to 100 km',
      );
    }
    return { placeId, radiusKm };
  });

  if (!areas.length || areas.length > REPAIR_REQUEST_LIMITS.maxAreas) {
    throw new WorkshopSearchValidationError('Choose between one and three search areas');
  }
  if (new Set(areas.map((area) => area.placeId)).size !== areas.length) {
    throw new WorkshopSearchValidationError('Each search area must use a different place');
  }
  if (serviceCategoryId && !knownServiceCategoryIds.has(serviceCategoryId)) {
    throw new WorkshopSearchValidationError('Please choose a known service category');
  }

  const sort = optionalString(query['sort']) ?? 'recommended';
  if (sort !== 'recommended' && sort !== 'rating') {
    throw new WorkshopSearchValidationError('Please choose a supported sort order');
  }

  return {
    areas,
    ...(language ? { language } : {}),
    page: positiveInteger(query['page'], 1, 9999),
    pageSize: positiveInteger(
      query['pageSize'],
      SEARCH_LIMITS.defaultPageSize,
      SEARCH_LIMITS.maxPageSize,
    ),
    ...(serviceCategoryId ? { serviceCategoryId } : {}),
    sort,
    ...(vehicleMakeId ? { vehicleMakeId } : {}),
  };
}

export function findPublicWorkshops(
  workshops: readonly PublicWorkshopProfile[],
  input: PublicWorkshopSearchInput,
): PublicWorkshopSearchResponse {
  const candidates = workshops.flatMap((workshop) => {
    if (input.serviceCategoryId && !workshop.serviceCategoryIds.includes(input.serviceCategoryId))
      return [];
    if (!matchesVehicleMake(workshop, input.vehicleMakeId)) return [];
    if (!matchesLanguage(workshop, input.language)) return [];

    const matchingAreas = input.allResults
      ? [{ matchingPlaceId: workshop.placeId }]
      : input.areas
          .map((area) => {
            const searchPlace = getCatalogPlace(area.placeId);
            if (!searchPlace || !workshop.locationPoint) return undefined;
            const distanceM = haversineDistanceM(
              workshop.locationPoint.latitude,
              workshop.locationPoint.longitude,
              searchPlace.latitude,
              searchPlace.longitude,
            );
            return isWithinSearchRadius(distanceM, area.radiusKm * 1000)
              ? { distanceM, matchingPlaceId: area.placeId }
              : undefined;
          })
          .filter(
            (area): area is { readonly distanceM: number; readonly matchingPlaceId: string } =>
              Boolean(area),
          );
    if (!matchingAreas.length) return [];
    const closest = matchingAreas.sort(compareMatchingAreaDistance)[0];
    return [{ ...workshop, ...closest }];
  });

  return toSearchResponse(candidates, input);
}

/**
 * Converts already-deduplicated database candidates into the same public response as the
 * in-memory local-development store. Only published, independently checked visit aggregates can
 * act as a small tie-breaker; payment and workshop confirmation have no ranking field.
 */
export function toSearchResponse(
  candidates: readonly SearchMatchCandidate[],
  input: PublicWorkshopSearchInput,
): PublicWorkshopSearchResponse {
  const uniqueCandidates = new Map<string, SearchMatchCandidate>();
  for (const candidate of candidates) {
    const existing = uniqueCandidates.get(candidate.id);
    if (!existing || compareCandidateDistance(candidate, existing) < 0) {
      uniqueCandidates.set(candidate.id, candidate);
    }
  }

  const sorted = [...uniqueCandidates.values()]
    .map((candidate) => toSearchResult(candidate, input))
    .sort(input.sort === 'rating' ? compareRatingResult : compareSearchResult);
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / input.pageSize));
  const page = Math.min(input.page, totalPages);
  const offset = (page - 1) * input.pageSize;
  return {
    allResults: input.allResults === true,
    page,
    pageSize: input.pageSize,
    results: sorted.slice(offset, offset + input.pageSize),
    searchAreas: input.areas.map((area) => ({
      label: getCatalogPlace(area.placeId)?.label ?? area.placeId,
      placeId: area.placeId,
      radiusKm: area.radiusKm,
    })),
    serviceCategory: {
      id: input.serviceCategoryId ?? 'all',
      label: input.serviceCategoryId
        ? (SERVICE_CATEGORY_LABELS[input.serviceCategoryId] ?? input.serviceCategoryId)
        : 'Alle Leistungen',
    },
    sort: input.sort ?? 'recommended',
    total,
    totalPages,
  };
}

function compareRatingResult(
  left: PublicWorkshopSearchResult,
  right: PublicWorkshopSearchResult,
): number {
  // A missing or single-review score is never promoted above a more substantial verified basis.
  const ratingDifference = ratingQuality(right) - ratingQuality(left);
  if (ratingDifference) return ratingDifference;
  return compareSearchResult(left, right);
}

function ratingQuality(result: PublicWorkshopSearchResult): number {
  const summary = result.reviewSummary;
  if (summary.state !== 'available' || !summary.averageRating || !summary.reviewCount) return 0;
  return Math.min(summary.reviewCount, 20) * 10 + Math.round(summary.averageRating * 10);
}

export class WorkshopSearchValidationError extends Error {}

export function isWithinSearchRadius(distanceM: number, radiusM: number): boolean {
  return Number.isFinite(distanceM) && Number.isFinite(radiusM) && distanceM <= radiusM;
}

function toSearchResult(
  candidate: SearchMatchCandidate,
  input: PublicWorkshopSearchInput,
): PublicWorkshopSearchResult {
  const matchingPlace = getCatalogPlace(candidate.matchingPlaceId);
  const companyDataVerified = candidate.verificationLabel === 'Unternehmensdaten geprüft';
  const distanceKm =
    candidate.distanceM === undefined ? undefined : roundDistance(candidate.distanceM / 1000);
  const reasons = input.serviceCategoryId
    ? [`Leistung: ${SERVICE_CATEGORY_LABELS[input.serviceCategoryId] ?? input.serviceCategoryId}`]
    : [];
  if (input.vehicleMakeId) {
    reasons.push(
      candidate.vehicleMakeIds.includes(input.vehicleMakeId)
        ? `Fahrzeugmarke: ${VEHICLE_MAKE_LABELS[input.vehicleMakeId] ?? input.vehicleMakeId}`
        : 'Markenoffen',
    );
  }
  if (input.language) reasons.push(`Sprache: ${input.language}`);
  if (companyDataVerified) reasons.push('Unternehmensdaten geprüft');
  if (distanceKm !== undefined) {
    reasons.push(
      `${formatDistance(distanceKm)} Luftlinie zu ${matchingPlace?.label ?? candidate.matchingPlaceId}`,
    );
  }

  return {
    companyDataVerified,
    contact: candidate.contact,
    ...(candidate.description ? { description: candidate.description } : {}),
    ...(distanceKm === undefined ? {} : { distanceKm }),
    id: candidate.id,
    languages: candidate.languages,
    locationAvailable: candidate.locationAvailable ?? candidate.locationPoint !== undefined,
    matchingPlace: {
      id: candidate.matchingPlaceId,
      label: matchingPlace?.label ?? candidate.matchingPlaceId,
    },
    name: candidate.name,
    photoIds: candidate.photoIds,
    placeId: candidate.placeId,
    reasons,
    reviewSummary: candidate.reviewSummary ?? emptyReviewSummary(),
    selfReportedSpecializations: candidate.selfReportedSpecializations,
    serviceCategoryIds: candidate.serviceCategoryIds,
    vehicleMakeIds: candidate.vehicleMakeIds,
  };
}

function compareSearchResult(
  left: PublicWorkshopSearchResult,
  right: PublicWorkshopSearchResult,
): number {
  // The fixed order is intentionally explainable: requested service is a hard filter; then an
  // explicit brand match, documented company-data check, language match, and shorter air distance.
  // The review tie-breaker is deliberately capped and needs a broader verified experience base;
  // one five-star review cannot leapfrog a larger current basis. Paid status has no field here.
  const scoreDifference = relevanceScore(right) - relevanceScore(left);
  if (scoreDifference) return scoreDifference;
  const distanceDifference = (left.distanceKm ?? Infinity) - (right.distanceKm ?? Infinity);
  if (distanceDifference) return distanceDifference;
  const nameDifference = left.name.localeCompare(right.name, 'de');
  return nameDifference || left.id.localeCompare(right.id);
}

function relevanceScore(result: PublicWorkshopSearchResult): number {
  return (
    100 +
    (result.reasons.some((reason) => reason.startsWith('Fahrzeugmarke:')) ? 15 : 0) +
    (result.companyDataVerified ? 5 : 0) +
    (result.reasons.some((reason) => reason.startsWith('Sprache:')) ? 2 : 0) +
    reviewRelevanceScore(result.reviewSummary)
  );
}

function matchesVehicleMake(
  workshop: PublicWorkshopProfile,
  vehicleMakeId: string | undefined,
): boolean {
  return (
    !vehicleMakeId ||
    workshop.vehicleMakeIds.length === 0 ||
    workshop.vehicleMakeIds.includes(vehicleMakeId)
  );
}

function matchesLanguage(workshop: PublicWorkshopProfile, language: string | undefined): boolean {
  return (
    !language ||
    workshop.languages.some(
      (value) => value.toLocaleLowerCase('de') === language.toLocaleLowerCase('de'),
    )
  );
}

function compareCandidateDistance(left: SearchMatchCandidate, right: SearchMatchCandidate): number {
  return compareMatchingAreaDistance(left, right);
}

function compareMatchingAreaDistance(
  left: { readonly distanceM?: number; readonly matchingPlaceId: string },
  right: { readonly distanceM?: number; readonly matchingPlaceId: string },
): number {
  return (
    (left.distanceM ?? Infinity) - (right.distanceM ?? Infinity) ||
    left.matchingPlaceId.localeCompare(right.matchingPlaceId)
  );
}

function haversineDistanceM(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const radians = Math.PI / 180;
  const latitudeDelta = (latitudeB - latitudeA) * radians;
  const longitudeDelta = (longitudeB - longitudeA) * radians;
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA * radians) *
      Math.cos(latitudeB * radians) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(distanceKm: number): string {
  return `${distanceKm.toLocaleString('de-CH', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km`;
}

function isPlainTextFilter(value: string): boolean {
  return /^[\p{L}\p{M}\p{N} .'-]+$/u.test(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function positiveInteger(value: unknown, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new WorkshopSearchValidationError('Pagination must use positive integers');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new WorkshopSearchValidationError('Pagination is outside the supported range');
  }
  return parsed;
}

function roundDistance(value: number): number {
  return Math.round(value * 10) / 10;
}
