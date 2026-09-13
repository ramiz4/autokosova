import pg from 'pg';
import type { PublicWorkshopProfile } from './access';
import {
  toSearchResponse,
  type PublicWorkshopSearchInput,
  type PublicWorkshopSearchResponse,
  type SearchMatchCandidate,
  type WorkshopSearchStore,
} from './workshop-search';

interface SearchRow {
  readonly company_data_verified: boolean;
  readonly description: string | null;
  readonly distance_m: number;
  readonly id: string;
  readonly languages: readonly string[] | null;
  readonly matching_place_id: string;
  readonly name: string;
  readonly photo_ids: readonly string[] | null;
  readonly place_id: string;
  readonly public_phone: string | null;
  readonly self_reported_specializations: readonly string[] | null;
  readonly service_category_ids: readonly string[] | null;
  readonly vehicle_make_ids: readonly string[] | null;
}

/**
 * Uses the public view and PostGIS only. It never joins a repair request, vehicle, travel date,
 * document, contact person, or a private membership table.
 */
export class PostgresWorkshopSearchStore implements WorkshopSearchStore {
  private readonly pool: pg.Pool;

  constructor(databaseUrl: string) {
    this.pool = new pg.Pool({ connectionString: databaseUrl });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async getPublicWorkshop(workshopId: string): Promise<PublicWorkshopProfile | undefined> {
    const result = await this.pool.query<SearchRow>(
      `SELECT
         profile.id,
         profile.name,
         profile.place_id,
         profile.description,
         profile.public_phone,
         profile.languages,
         profile.self_reported_specializations,
         profile.service_category_ids,
         profile.vehicle_make_ids,
         profile.company_data_verified,
         ARRAY[]::text[] AS photo_ids,
         profile.place_id AS matching_place_id,
         0::double precision AS distance_m
       FROM public_workshop_profile AS profile
       WHERE profile.id = $1`,
      [workshopId],
    );
    const row = result.rows[0];
    return row ? toPublicProfile(row) : undefined;
  }

  async searchPublicWorkshops(
    input: PublicWorkshopSearchInput,
  ): Promise<PublicWorkshopSearchResponse> {
    const placeIds = input.areas.map((area) => area.placeId);
    const radiusMeters = input.areas.map((area) => area.radiusKm * 1000);
    const result = await this.pool.query<SearchRow>(
      `WITH search_areas AS (
         SELECT place.id, place.point, requested.radius_m
         FROM unnest($1::text[], $2::integer[]) AS requested(place_id, radius_m)
         JOIN place ON place.id = requested.place_id
       ), matched AS (
         SELECT DISTINCT ON (profile.id)
           profile.id,
           profile.name,
           profile.place_id,
           profile.description,
           profile.public_phone,
           profile.languages,
           profile.self_reported_specializations,
           profile.service_category_ids,
           profile.vehicle_make_ids,
           profile.company_data_verified,
           ARRAY[]::text[] AS photo_ids,
           search_areas.id AS matching_place_id,
           ST_Distance(profile.place_point, search_areas.point) AS distance_m
         FROM public_workshop_profile AS profile
         JOIN search_areas
           ON profile.place_point IS NOT NULL
          AND ST_DWithin(profile.place_point, search_areas.point, search_areas.radius_m)
         WHERE $3::text = ANY(COALESCE(profile.service_category_ids, ARRAY[]::text[]))
           AND (
             $4::text IS NULL
             OR cardinality(COALESCE(profile.vehicle_make_ids, ARRAY[]::text[])) = 0
             OR $4::text = ANY(COALESCE(profile.vehicle_make_ids, ARRAY[]::text[]))
           )
           AND (
             $5::text IS NULL
             OR EXISTS (
               SELECT 1
               FROM unnest(COALESCE(profile.languages, ARRAY[]::text[])) AS language(value)
               WHERE lower(language.value) = lower($5::text)
             )
           )
         ORDER BY profile.id, ST_Distance(profile.place_point, search_areas.point), search_areas.id
       )
       SELECT * FROM matched`,
      [
        placeIds,
        radiusMeters,
        input.serviceCategoryId,
        input.vehicleMakeId ?? null,
        input.language ?? null,
      ],
    );

    return toSearchResponse(result.rows.map(toCandidate), input);
  }
}

function toCandidate(row: SearchRow): SearchMatchCandidate {
  const profile = toPublicProfile(row);
  return {
    ...profile,
    distanceM: Number(row.distance_m),
    matchingPlaceId: row.matching_place_id,
  };
}

function toPublicProfile(row: SearchRow): PublicWorkshopProfile {
  return {
    contact: row.public_phone ? { phone: row.public_phone } : {},
    ...(row.description ? { description: row.description } : {}),
    id: row.id,
    languages: row.languages ?? [],
    name: row.name,
    photoIds: row.photo_ids ?? [],
    placeId: row.place_id,
    selfReportedSpecializations: row.self_reported_specializations ?? [],
    serviceCategoryIds: row.service_category_ids ?? [],
    vehicleMakeIds: row.vehicle_make_ids ?? [],
    ...(row.company_data_verified ? { verificationLabel: 'Unternehmensdaten geprüft' } : {}),
  };
}
