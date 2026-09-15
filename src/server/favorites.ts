import pg from 'pg';
import { AccessError } from './access';

export interface FavoriteStore {
  close?(): Promise<void>;
  listFavoriteGarageIds(ownerUserId: string): readonly string[] | Promise<readonly string[]>;
  saveFavorite(ownerUserId: string, garageId: string, authorize?: () => void): void | Promise<void>;
  removeFavorite(
    ownerUserId: string,
    garageId: string,
    authorize?: () => void,
  ): void | Promise<void>;
}

export class PostgresFavoriteStore implements FavoriteStore {
  private readonly pool: pg.Pool;
  constructor(databaseUrl: string) {
    this.pool = new pg.Pool({ connectionString: databaseUrl });
  }
  async close(): Promise<void> {
    await this.pool.end();
  }

  async listFavoriteGarageIds(ownerUserId: string): Promise<readonly string[]> {
    return this.transaction(ownerUserId, async (client) => {
      const result = await client.query<{ garage_id: string }>(
        'SELECT garage_id FROM garage_favorite WHERE owner_user_id = $1 ORDER BY created_at, garage_id',
        [ownerUserId],
      );
      return result.rows.map((row) => row.garage_id);
    });
  }
  async saveFavorite(ownerUserId: string, garageId: string, authorize?: () => void): Promise<void> {
    await this.transaction(
      ownerUserId,
      async (client) => {
        await client.query(
          "INSERT INTO app_user (id, oidc_subject, status) VALUES ($1, $1, 'active') ON CONFLICT (id) DO NOTHING",
          [ownerUserId],
        );
        const available = await client.query(
          `SELECT garage.id FROM garage AS garage JOIN app_user AS owner ON owner.id = $1 AND owner.status = 'active' WHERE garage.id = $2 AND garage.publication_state = 'published' FOR SHARE OF garage, owner`,
          [ownerUserId, garageId],
        );
        if (!available.rowCount) throw new AccessError(404, 'Garage not available');
        await client.query(
          'INSERT INTO garage_favorite (owner_user_id, garage_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [ownerUserId, garageId],
        );
      },
      authorize,
    );
  }
  async removeFavorite(
    ownerUserId: string,
    garageId: string,
    authorize?: () => void,
  ): Promise<void> {
    await this.transaction(
      ownerUserId,
      async (client) => {
        await client.query(
          'DELETE FROM garage_favorite WHERE owner_user_id = $1 AND garage_id = $2',
          [ownerUserId, garageId],
        );
      },
      authorize,
    );
  }
  private async transaction<T>(
    ownerUserId: string,
    operation: (client: pg.PoolClient) => Promise<T>,
    authorize?: () => void,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.user_id', $1, true)", [ownerUserId]);
      const result = await operation(client);
      authorize?.();
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

/** Runtime without a database fails closed; AccessStore remains an explicit test adapter. */
export class UnavailableFavoriteStore implements FavoriteStore {
  listFavoriteGarageIds(): never {
    throw new AccessError(503, 'Favorites unavailable');
  }
  saveFavorite(): never {
    throw new AccessError(503, 'Favorites unavailable');
  }
  removeFavorite(): never {
    throw new AccessError(503, 'Favorites unavailable');
  }
}
