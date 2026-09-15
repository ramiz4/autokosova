import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { AccessError, type StoredRepairRequest } from './access';
import type { RepairRequestInput, RepairRequestVehicle } from '../shared/repair-request';
import { validateRepairRequest } from '../shared/repair-request-validation';
import {
  repairRequestSummary,
  validRepairRequestPageOptions,
  type RepairRequestMutation,
  type RepairRequestPage,
  type RepairRequestPageOptions,
} from '../shared/saved-repair-request';

// DATE is a local calendar value, not an instant subject to timezone conversion.
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
    id: string,
  ): StoredRepairRequest | Promise<StoredRepairRequest>;
  mutateRepairRequest(
    ownerUserId: string,
    id: string,
    revision: number,
    mutation: RepairRequestMutation,
    authorize?: () => void,
  ): StoredRepairRequest | null | Promise<StoredRepairRequest | null>;
}

/** The runtime must never confirm durable storage when no database is configured. */
export class UnavailableRepairRequestStore implements RepairRequestStore {
  listRepairRequests(): never {
    throw new AccessError(503, 'Private request storage unavailable');
  }
  createRepairRequest(): never {
    throw new AccessError(503, 'Private request storage unavailable');
  }
  getRepairRequest(): never {
    throw new AccessError(503, 'Private request storage unavailable');
  }
  mutateRepairRequest(): never {
    throw new AccessError(503, 'Private request storage unavailable');
  }
}

interface RepairRequestRow {
  readonly id: string;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly revision: number;
  readonly active: boolean;
  readonly earliest_dropoff_on: string;
  readonly latest_pickup_on: string;
  readonly service_category_id: string;
  readonly symptom: string | null;
  readonly vehicle_id: string | null;
}
interface VehicleRow {
  readonly vehicle_class: RepairRequestVehicle['vehicleClass'] | null;
  readonly fuel: RepairRequestVehicle['fuel'] | null;
  readonly engine_details: string | null;
  readonly make_id: RepairRequestVehicle['makeId'] | null;
  readonly manufacture_year: number | null;
  readonly mileage_km: number | null;
  readonly model: string | null;
  readonly transmission_details: string | null;
}

/** Explicit owner predicates supplement RLS, including when a privileged test DB is used. */
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
    this.validate(input);
    return this.transaction(ownerUserId, false, async (client) => {
      await client.query(
        `INSERT INTO app_user (id, oidc_subject, status) VALUES ($1, $1, 'active')
        ON CONFLICT (id) DO NOTHING`,
        [ownerUserId],
      );
      const vehicleId = await this.insertVehicle(client, ownerUserId, input.vehicle);
      const id = randomUUID();
      await client.query(
        `INSERT INTO repair_request (id, owner_user_id, vehicle_id, service_category_id,
        symptom, earliest_dropoff_on, latest_pickup_on, state) VALUES ($1,$2,$3,$4,$5,$6,$7,'draft')`,
        [
          id,
          ownerUserId,
          vehicleId,
          input.serviceCategoryId,
          input.symptom ?? null,
          input.earliestDropoffOn,
          input.latestPickupOn,
        ],
      );
      await this.writeAreas(client, id, input);
      await this.attachFiles(client, ownerUserId, id, input.attachmentIds ?? []);
      return this.read(client, ownerUserId, id);
    });
  }

  async listRepairRequests(
    ownerUserId: string,
    options: RepairRequestPageOptions,
  ): Promise<RepairRequestPage> {
    if (!validRepairRequestPageOptions(options)) throw new AccessError(400, 'Invalid request page');
    return this.transaction(ownerUserId, true, async (client) => {
      if (options.cursor) {
        const anchor = await client.query(
          'SELECT id FROM repair_request WHERE owner_user_id = $1 AND id = $2',
          [ownerUserId, options.cursor],
        );
        if (!anchor.rowCount) throw new AccessError(404, 'Request page unavailable');
      }
      // Resolve the anchor in SQL; a JS Date round-trip loses microsecond precision.
      const result = await client.query<
        RepairRequestRow & VehicleRow & { areas: RepairRequestInput['areas'] }
      >(
        `SELECT r.id, r.created_at, r.updated_at, r.active, r.revision, r.service_category_id,
          left(r.symptom,160) AS symptom, v.make_id, v.model, v.manufacture_year, v.vehicle_class,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('placeId',a.place_id,'radiusKm',a.radius_m / 1000)
            ORDER BY a.position) FROM request_search_area a WHERE a.repair_request_id = r.id), '[]'::jsonb) AS areas
         FROM repair_request r LEFT JOIN vehicle v ON v.id = r.vehicle_id AND v.owner_user_id = $1
         WHERE r.owner_user_id = $1 AND ($4::boolean IS NULL OR r.active = $4)
           AND ($2::text IS NULL OR (r.created_at,r.id) < (
             SELECT c.created_at,c.id FROM repair_request c WHERE c.owner_user_id = $1 AND c.id = $2))
         ORDER BY r.created_at DESC,r.id DESC LIMIT $3`,
        [
          ownerUserId,
          options.cursor ?? null,
          options.limit + 1,
          !options.activity || options.activity === 'all' ? null : options.activity === 'active',
        ],
      );
      const requests = result.rows.slice(0, options.limit).map((row) =>
        repairRequestSummary({
          ...this.metadata(row),
          serviceCategoryId: row.service_category_id,
          symptom: row.symptom ?? undefined,
          areas: row.areas,
          vehicle: {
            ...(row.make_id ? { makeId: row.make_id } : {}),
            ...(row.model ? { model: row.model } : {}),
            ...(row.vehicle_class ? { vehicleClass: row.vehicle_class } : {}),
            ...(row.manufacture_year === null ? {} : { year: row.manufacture_year }),
          },
        }),
      );
      return {
        requests,
        nextCursor: result.rows.length > options.limit ? requests[requests.length - 1].id : null,
      };
    });
  }

  async getRepairRequest(ownerUserId: string, id: string): Promise<StoredRepairRequest> {
    return this.transaction(ownerUserId, true, (client) => this.read(client, ownerUserId, id));
  }

  async mutateRepairRequest(
    ownerUserId: string,
    id: string,
    revision: number,
    mutation: RepairRequestMutation,
    authorize: () => void = () => undefined,
  ): Promise<StoredRepairRequest | null> {
    if (mutation.kind === 'update') this.validate(mutation.input);
    return this.transaction(ownerUserId, false, async (client) => {
      const found = await client.query<RepairRequestRow>(
        'SELECT * FROM repair_request WHERE id = $1 AND owner_user_id = $2 FOR UPDATE',
        [id, ownerUserId],
      );
      const current = found.rows[0];
      if (!current) throw new AccessError(404, 'Private repair request not found');
      if (current.revision !== revision)
        throw new AccessError(409, 'Request changed; reload before saving');
      // A session may expire or be revoked while waiting for a row lock.
      authorize();
      if (mutation.kind === 'delete') {
        await client.query('DELETE FROM repair_request_attachment WHERE repair_request_id = $1', [
          id,
        ]);
        await client.query('DELETE FROM request_search_area WHERE repair_request_id = $1', [id]);
        await client.query('DELETE FROM repair_request WHERE id = $1 AND owner_user_id = $2', [
          id,
          ownerUserId,
        ]);
        await this.removeOrphanVehicle(client, ownerUserId, current.vehicle_id);
        // Standalone files remain under their own existing retention/deletion policy.
        authorize();
        return null;
      }
      if (mutation.kind === 'activity') {
        await client.query(
          `UPDATE repair_request SET active = $3, revision = revision + 1, updated_at = now()
          WHERE id = $1 AND owner_user_id = $2`,
          [id, ownerUserId, mutation.active],
        );
      } else {
        const input = mutation.input;
        // Copy-on-write: editing one inquiry must not edit another inquiry's vehicle snapshot.
        const vehicleId = await this.insertVehicle(client, ownerUserId, input.vehicle);
        const previousFiles = await client.query<{ file_id: string }>(
          'SELECT file_id FROM repair_request_attachment WHERE repair_request_id = $1',
          [id],
        );
        await client.query(
          `UPDATE repair_request SET vehicle_id = $3, service_category_id = $4, symptom = $5,
          earliest_dropoff_on = $6, latest_pickup_on = $7, revision = revision + 1, updated_at = now()
          WHERE id = $1 AND owner_user_id = $2`,
          [
            id,
            ownerUserId,
            vehicleId,
            input.serviceCategoryId,
            input.symptom ?? null,
            input.earliestDropoffOn,
            input.latestPickupOn,
          ],
        );
        await client.query('DELETE FROM request_search_area WHERE repair_request_id = $1', [id]);
        await this.writeAreas(client, id, input);
        await client.query('DELETE FROM repair_request_attachment WHERE repair_request_id = $1', [
          id,
        ]);
        await this.attachFiles(
          client,
          ownerUserId,
          id,
          input.attachmentIds ?? [],
          previousFiles.rows.map((row) => row.file_id),
        );
        await this.removeOrphanVehicle(client, ownerUserId, current.vehicle_id);
      }
      const result = await this.read(client, ownerUserId, id);
      authorize();
      return result;
    });
  }

  private metadata(row: RepairRequestRow) {
    return {
      id: row.id,
      active: row.active,
      revision: row.revision,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
  private async read(
    client: pg.PoolClient,
    ownerUserId: string,
    id: string,
  ): Promise<StoredRepairRequest> {
    const found = await client.query<RepairRequestRow>(
      'SELECT * FROM repair_request WHERE id = $1 AND owner_user_id = $2',
      [id, ownerUserId],
    );
    const row = found.rows[0];
    if (!row) throw new AccessError(404, 'Private repair request not found');
    const areas = await client.query<{
      place_id: RepairRequestInput['areas'][number]['placeId'];
      radius_m: number;
    }>(
      'SELECT place_id, radius_m FROM request_search_area WHERE repair_request_id = $1 ORDER BY position',
      [id],
    );
    const files = await client.query<{ file_id: string }>(
      'SELECT file_id FROM repair_request_attachment WHERE repair_request_id = $1 ORDER BY file_id',
      [id],
    );
    const vehicle = row.vehicle_id
      ? await this.getVehicle(client, ownerUserId, row.vehicle_id)
      : undefined;
    return {
      ...this.metadata(row),
      areas: areas.rows.map((area) => ({ placeId: area.place_id, radiusKm: area.radius_m / 1000 })),
      attachmentIds: files.rows.map((file) => file.file_id),
      earliestDropoffOn: row.earliest_dropoff_on,
      latestPickupOn: row.latest_pickup_on,
      serviceCategoryId: row.service_category_id,
      symptom: row.symptom ?? undefined,
      vehicle,
    };
  }
  private async insertVehicle(
    client: pg.PoolClient,
    owner: string,
    vehicle?: RepairRequestVehicle,
  ): Promise<string | null> {
    if (!vehicle || !Object.keys(vehicle).length) return null;
    const id = randomUUID();
    await client.query(
      `INSERT INTO vehicle (id, owner_user_id, label, make_id, model, manufacture_year,
      engine_details, transmission_details, mileage_km, vehicle_class, fuel) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        id,
        owner,
        [vehicle.makeId, vehicle.model].filter(Boolean).join(' ') || 'Vehicle',
        vehicle.makeId ?? null,
        vehicle.model ?? null,
        vehicle.year ?? null,
        vehicle.engineDetails ?? null,
        vehicle.transmissionDetails ?? null,
        vehicle.mileageKm ?? null,
        vehicle.vehicleClass ?? null,
        vehicle.fuel ?? null,
      ],
    );
    return id;
  }
  private async removeOrphanVehicle(
    client: pg.PoolClient,
    owner: string,
    id: string | null,
  ): Promise<void> {
    if (!id) return;
    await client.query(
      `DELETE FROM vehicle WHERE id = $1 AND owner_user_id = $2
      AND NOT EXISTS (SELECT 1 FROM repair_request WHERE vehicle_id = $1)`,
      [id, owner],
    );
  }
  private async writeAreas(
    client: pg.PoolClient,
    id: string,
    input: RepairRequestInput,
  ): Promise<void> {
    for (const [index, area] of input.areas.entries())
      await client.query(
        `INSERT INTO request_search_area (id,repair_request_id,position,place_id,radius_m)
        VALUES ($1,$2,$3,$4,$5)`,
        [randomUUID(), id, index + 1, area.placeId, area.radiusKm * 1000],
      );
  }
  private async attachFiles(
    client: pg.PoolClient,
    owner: string,
    id: string,
    ids: readonly string[],
    previous: readonly string[] = [],
  ): Promise<void> {
    if (!ids.length) return;
    const result = await client.query(
      `SELECT id FROM file_object WHERE id = ANY($1::text[]) AND owner_user_id = $2
      AND (retention_state = 'active' OR id = ANY($3::text[]))`,
      [ids, owner, previous],
    );
    if (result.rowCount !== ids.length) throw new AccessError(404, 'Private file not found');
    for (const fileId of ids)
      await client.query(
        'INSERT INTO repair_request_attachment (repair_request_id,file_id) VALUES ($1,$2)',
        [id, fileId],
      );
  }
  private async getVehicle(
    client: pg.PoolClient,
    owner: string,
    id: string,
  ): Promise<RepairRequestVehicle | undefined> {
    const result = await client.query<VehicleRow>(
      'SELECT * FROM vehicle WHERE id = $1 AND owner_user_id = $2',
      [id, owner],
    );
    const v = result.rows[0];
    if (!v) return undefined;
    return {
      ...(v.make_id ? { makeId: v.make_id } : {}),
      ...(v.model ? { model: v.model } : {}),
      ...(v.manufacture_year === null ? {} : { year: v.manufacture_year }),
      ...(v.vehicle_class ? { vehicleClass: v.vehicle_class } : {}),
      ...(v.fuel ? { fuel: v.fuel } : {}),
      ...(v.engine_details ? { engineDetails: v.engine_details } : {}),
      ...(v.transmission_details ? { transmissionDetails: v.transmission_details } : {}),
      ...(v.mileage_km === null ? {} : { mileageKm: v.mileage_km }),
    };
  }
  private validate(input: RepairRequestInput): void {
    const error = validateRepairRequest(input);
    if (error) throw new AccessError(400, error);
  }
  private async transaction<T>(
    owner: string,
    readOnly: boolean,
    work: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
      await client.query("SELECT set_config('app.user_id',$1,true)", [owner]);
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
