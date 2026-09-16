import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { loadEnvironment } from '../environment.mjs';

Object.assign(process.env, loadEnvironment());

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required. Copy .env.example for local development.');
}

const migrationsDirectory = join(import.meta.dirname, '../../db/migrations');
const client = new pg.Client({ connectionString: databaseUrl });
// These three migration files were renamed with the garage terminology. A released database may
// still record their former filename; the numeric migration sequence is unique for each alias.
const renamedMigrationPrefixes = new Set(['004', '012', '020']);
// The isolated #94 draft used 080 before #99 reserved that sequence. Match the entire
// filename: 080_review_contribution_lock.sql is unrelated and must still run normally.
const renamedMigrationFiles = new Map([['082_administration.sql', '080_administration.sql']]);

await client.connect();

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const migrations = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const migration of migrations) {
    const previousName = renamedMigrationFiles.get(migration);
    if (previousName) {
      await client.query('BEGIN');
      try {
        const history = await client.query(
          'SELECT id FROM schema_migrations WHERE id = ANY($1::text[]) FOR UPDATE',
          [[previousName, migration]],
        );
        if (history.rows.some((row) => row.id === previousName)) {
          if (history.rowCount !== 1)
            throw new Error('Conflicting administration migration history');
          // Only a previously recorded migration is renamed. Never infer completion from a
          // column existing, suppress a failed DDL statement, reset data, or alter applied_at.
          await client.query('UPDATE schema_migrations SET id=$1 WHERE id=$2', [
            migration,
            previousName,
          ]);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    const prefix = migration.slice(0, 3);
    if (renamedMigrationPrefixes.has(prefix)) {
      const legacy = await client.query(
        "SELECT id FROM schema_migrations WHERE split_part(id, '_', 1) = $1",
        [prefix],
      );
      if (legacy.rows[0] && legacy.rows[0].id !== migration) {
        await client.query('UPDATE schema_migrations SET id = $1 WHERE id = $2', [
          migration,
          legacy.rows[0].id,
        ]);
      }
    }
    const alreadyApplied = await client.query('SELECT 1 FROM schema_migrations WHERE id = $1', [
      migration,
    ]);

    if (alreadyApplied.rowCount) {
      continue;
    }

    const sql = await readFile(join(migrationsDirectory, migration), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [migration]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client.end();
}
