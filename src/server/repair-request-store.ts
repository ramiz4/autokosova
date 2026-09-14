import {
  repairRequestSummary,
  validRepairRequestPageOptions,
  type RepairRequestPage,
  type RepairRequestPageOptions,
} from '../shared/saved-repair-request';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { AccessError, type StoredRepairRequest } from './access';
import type { RepairRequestInput, RepairRequestVehicle } from '../shared/repair-request';

// PostgreSQL DATE is a calendar value. Parsing it as a JavaScript Date would apply a timezone and
// could turn 2026-10-02 into 2026-10-01 for users west of UTC.
pg.types.setTypeParser(1082, (value: string) => value);

export interface RepairRequestStore {
  close?(): Promise<void>;
  listRepairRequests(
    ownerUserId: string,
    options: RepairRequestPageOptions,
  ): RepairRequestPage | Promise<RepairRequestPage>;
  createRepairRequest(
    ownerUserId: string,
    input: RepairRequestInput,
  ): StoredRepairRequest | Promise<StoredRepairRequest>;
  getRepairRequest(
    ownerUserId: string,
    repairRequestId: string,
  ): StoredRepairRequest | Promise<StoredRepairRequest>;
}

interface RepairRequestRow {
  readonly created_at: Date;
  readonly earliest_dropoff_on: string;
  readonly id: string;
  readonly latest_pickup_on: string;
  readonly service_category_id: string;
  readonly symptom: string | null;
  readonly vehicle_id: string | null;
}

interface VehicleRow {
  readonly vehicle_class: RepairRequestVehicle['vehicleClass'] | null;
  readonly fuel: RepairRequestVehicle['fuel'] | null;
  readonly engine_details: string | null;
  readonly make_id: string | null;
  readonly manufacture_year: number | null;
  readonly mileage_km: number | null;
  readonly model: string | null;
  readonly transmission_details: string | null;
}

/**
 * Runtime repository for private requests. It deliberately performs owner checks in SQL in
 * addition to the RLS policies, so a missing session variable cannot broaden a result set.
 */
export class PostgresRepairRequestStore implements RepairRequestStore {
  private readonly pool: pg.Pool;

  constructor(databaseUrl: string) {
    this.pool = new pg.Pool({ connectionString: databaseUrl });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async createRepairRequest(
    ownerUserId: string,
    input: RepairRequestInput,
  ): Promise<StoredRepairRequest> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.setPrincipal(client, ownerUserId);
      await client.query(
        `INSERT INTO app_user (id, oidc_subject, status)
         VALUES ($1, $1, 'active')
         ON CONFLICT (id) DO UPDATE SET status = 'active'`,
        [ownerUserId],
      );

      const vehicleId = input.vehicle ? randomUUID() : null;
      if (input.vehicle && vehicleId) {
        await client.query(
          `INSERT INTO vehicle (
             id, owner_user_id, label, make_id, model, manufacture_year,
             engine_details, transmission_details, mileage_km, vehicle_class, fuel
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            vehicleId,
            ownerUserId,
            [input.vehicle.makeId, input.vehicle.model].filter(Boolean).join(' ') || 'Vehicle',
            input.vehicle.makeId,
            input.vehicle.model,
            input.vehicle.year,
            input.vehicle.engineDetails ?? null,
            input.vehicle.transmissionDetails ?? null,
            input.vehicle.mileageKm ?? null,
            input.vehicle.vehicleClass ?? null,
            input.vehicle.fuel ?? null,
          ],
        );
      }

      const requestId = randomUUID();
      const createdAt = new Date().toISOString();
      await client.query(
        `INSERT INTO repair_request (
           id, owner_user_id, vehicle_id, service_category_id, symptom,
           earliest_dropoff_on, latest_pickup_on, state
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft')`,
        [
          requestId,
          ownerUserId,
          vehicleId,
          input.serviceCategoryId,
          input.symptom ?? null,
          input.earliestDropoffOn,
          input.latestPickupOn,
        ],
      );

      for (const [index, area] of input.areas.entries()) {
        await client.query(
          `INSERT INTO request_search_area (id, repair_request_id, position, place_id, radius_m)
           VALUES ($1, $2, $3, $4, $5)`,
          [randomUUID(), requestId, index + 1, area.placeId, area.radiusKm * 1000],
        );
      }

      await this.attachFiles(client, ownerUserId, requestId, input.attachmentIds ?? []);
      await client.query('COMMIT');
      return {
        areas: input.areas,
        attachmentIds: input.attachmentIds ?? [],
        createdAt,
        earliestDropoffOn: input.earliestDropoffOn,
        id: requestId,
        latestPickupOn: input.latestPickupOn,
        serviceCategoryId: input.serviceCategoryId,
        symptom: input.symptom,
        vehicle: input.vehicle,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listRepairRequests(
    ownerUserId: string,
    options: RepairRequestPageOptions,
  ): Promise<RepairRequestPage> {
    if (!validRepairRequestPageOptions(options)) throw new AccessError(400, 'Invalid request page');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await this.setPrincipal(client, ownerUserId);
      if (options.cursor) {
        const anchor = await client.query(
          'SELECT id FROM repair_request WHERE owner_user_id = $1 AND id = $2',
          [ownerUserId, options.cursor],
        );
        if (!anchor.rowCount) throw new AccessError(404, 'Request page unavailable');
      }
      // Resolve the cursor timestamp in SQL: JS Date would lose PostgreSQL microseconds.
      // Both the anchor and every joined vehicle are explicitly owner-bound, in addition to RLS.
      const result = await client.query<{
        id: string;
        created_at: Date;
        service_category_id: string;
        symptom: string | null;
        areas: RepairRequestInput['areas'];
        make_id: RepairRequestVehicle['makeId'] | null;
        vehicle_class: RepairRequestVehicle['vehicleClass'] | null;
        model: string | null;
        manufacture_year: number | null;
      }>(
        `SELECT r.id, r.created_at, r.service_category_id, left(r.symptom, 160) AS symptom,
                v.make_id, v.model, v.manufacture_year, v.vehicle_class,
                COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'placeId', a.place_id, 'radiusKm', a.radius_m / 1000
                ) ORDER BY a.position) FROM request_search_area a
                  WHERE a.repair_request_id = r.id), '[]'::jsonb) AS areas
         FROM repair_request r
         LEFT JOIN vehicle v ON v.id = r.vehicle_id AND v.owner_user_id = $1
         WHERE r.owner_user_id = $1 AND ($2::text IS NULL OR (r.created_at, r.id) < (
           SELECT c.created_at, c.id FROM repair_request c
           WHERE c.owner_user_id = $1 AND c.id = $2
         ))
         ORDER BY r.created_at DESC, r.id DESC
         LIMIT $3`,
        [ownerUserId, options.cursor ?? null, options.limit + 1],
      );
      const requests = result.rows.slice(0, options.limit).map((row) =>
        repairRequestSummary({
          id: row.id,
          createdAt: row.created_at.toISOString(),
          serviceCategoryId: row.service_category_id,
          symptom: row.symptom ?? undefined,
          areas: row.areas,
          vehicle: {
            ...(row.make_id ? { makeId: row.make_id } : {}),
            ...(row.vehicle_class ? { vehicleClass: row.vehicle_class } : {}),
            ...(row.model ? { model: row.model } : {}),
            ...(row.manufacture_year === null ? {} : { year: row.manufacture_year }),
          },
        }),
      );
      await client.query('COMMIT');
      return {
        requests,
        nextCursor: result.rows.length > options.limit ? requests[requests.length - 1].id : null,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getRepairRequest(
    ownerUserId: string,
    repairRequestId: string,
  ): Promise<StoredRepairRequest> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.setPrincipal(client, ownerUserId);
      const requestResult = await client.query<RepairRequestRow>(
        `SELECT id, created_at, service_category_id, symptom, earliest_dropoff_on,
                latest_pickup_on, vehicle_id
         FROM repair_request
         WHERE id = $1 AND owner_user_id = $2`,
        [repairRequestId, ownerUserId],
      );
      const request = requestResult.rows[0];
      if (!request) throw new AccessError(404, 'Private repair request not found');

      const areaResult = await client.query<{ place_id: string; radius_m: number }>(
        `SELECT place_id, radius_m
         FROM request_search_area
         WHERE repair_request_id = $1
         ORDER BY position`,
        [request.id],
      );
      const attachmentResult = await client.query<{ file_id: string }>(
        `SELECT file_id FROM repair_request_attachment WHERE repair_request_id = $1 ORDER BY file_id`,
        [request.id],
      );
      const vehicle = request.vehicle_id
        ? await this.getVehicle(client, ownerUserId, request.vehicle_id)
        : undefined;
      await client.query('COMMIT');

      return {
        areas: areaResult.rows.map((area) => ({
          placeId: area.place_id as RepairRequestInput['areas'][number]['placeId'],
          radiusKm: area.radius_m / 1000,
        })),
        attachmentIds: attachmentResult.rows.map((attachment) => attachment.file_id),
        createdAt: request.created_at.toISOString(),
        earliestDropoffOn: request.earliest_dropoff_on,
        id: request.id,
        latestPickupOn: request.latest_pickup_on,
        serviceCategoryId: request.service_category_id,
        symptom: request.symptom ?? undefined,
        vehicle,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async attachFiles(
    client: pg.PoolClient,
    ownerUserId: string,
    requestId: string,
    attachmentIds: readonly string[],
  ): Promise<void> {
    if (!attachmentIds.length) return;
    const fileResult = await client.query<{ id: string }>(
      `SELECT id
       FROM file_object
       WHERE id = ANY($1::text[]) AND owner_user_id = $2`,
      [attachmentIds, ownerUserId],
    );
    if (fileResult.rowCount !== attachmentIds.length) {
      throw new AccessError(404, 'Private file not found');
    }
    for (const fileId of attachmentIds) {
      await client.query(
        `INSERT INTO repair_request_attachment (repair_request_id, file_id)
         VALUES ($1, $2)`,
        [requestId, fileId],
      );
    }
  }

  private async getVehicle(client: pg.PoolClient, ownerUserId: string, vehicleId: string) {
    const result = await client.query<VehicleRow>(
      `SELECT make_id, model, manufacture_year, engine_details, transmission_details, mileage_km, vehicle_class, fuel
       FROM vehicle
       WHERE id = $1 AND owner_user_id = $2`,
      [vehicleId, ownerUserId],
    );
    const vehicle = result.rows[0];
    if (!vehicle) {
      throw new AccessError(404, 'Private vehicle not found');
    }
    return {
      ...(vehicle.engine_details ? { engineDetails: vehicle.engine_details } : {}),
      ...(vehicle.make_id ? { makeId: vehicle.make_id as RepairRequestVehicle['makeId'] } : {}),
      ...(vehicle.vehicle_class ? { vehicleClass: vehicle.vehicle_class } : {}),
      ...(vehicle.fuel ? { fuel: vehicle.fuel } : {}),
      ...(vehicle.mileage_km === null ? {} : { mileageKm: vehicle.mileage_km }),
      ...(vehicle.model ? { model: vehicle.model } : {}),
      ...(vehicle.transmission_details
        ? { transmissionDetails: vehicle.transmission_details }
        : {}),
      ...(vehicle.manufacture_year === null ? {} : { year: vehicle.manufacture_year }),
    };
  }

  private async setPrincipal(client: pg.PoolClient, userId: string): Promise<void> {
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [userId]);
  }
}
