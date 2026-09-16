import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import pg from 'pg';
import { seedDatabase } from '../scripts/db/seed-data.mjs';

test(
  'recorded administration draft migrates without reset or skipping the two review migrations',
  { skip: !process.env['DATABASE_URL'], timeout: 30000 },
  async () => {
    const url = new URL(process.env['DATABASE_URL']!);
    assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
    const root = new pg.Client({ connectionString: url.href });
    await root.connect();
    const schema = 'admin_migration_' + randomUUID().replaceAll('-', '');
    await root.query(`CREATE SCHEMA ${schema}`);
    url.searchParams.set('options', '-csearch_path=' + schema + ',public');
    const db = new pg.Client({ connectionString: url.href });
    await db.connect();
    const cwd = await mkdtemp(join(tmpdir(), 'ak-admin-migration-'));
    try {
      await db.query(
        'CREATE TABLE schema_migrations(id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
      );
      const dir = new URL('../db/migrations/', import.meta.url);
      for (const name of (await readdir(dir)).filter((n) => n.endsWith('.sql')).sort()) {
        if (name > '079_review_workflows.sql' && name !== '082_administration.sql') continue;
        await db.query(
          (await readFile(new URL(name, dir), 'utf8')).replaceAll("'public.", "'" + schema + '.'),
        );
        await db.query('INSERT INTO schema_migrations(id) VALUES($1)', [
          name === '082_administration.sql' ? '080_administration.sql' : name,
        ]);
      }
      await seedDatabase(db, 'demo-workflows', { NODE_ENV: 'test' });
      await db.query(
        "UPDATE garage SET description='DEMO preserved operator edit' WHERE id='demo-admin-garage-pending'",
      );
      const snapshot = async () =>
        (
          await db.query(
            "SELECT to_jsonb(g) - 'updated_at' AS row FROM garage g WHERE id LIKE 'demo-admin-%' ORDER BY id",
          )
        ).rows;
      const before = await snapshot();
      const date = (
        await db.query("SELECT applied_at FROM schema_migrations WHERE id='080_administration.sql'")
      ).rows[0].applied_at;
      const run = () =>
        promisify(execFile)(
          process.execPath,
          [fileURLToPath(new URL('../scripts/db/migrate.mjs', import.meta.url))],
          {
            cwd,
            timeout: 10000,
            env: { PATH: process.env['PATH'], NODE_ENV: 'test', DATABASE_URL: url.href },
          },
        );
      await run();
      assert.deepEqual(await snapshot(), before);
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::integer AS count FROM garage WHERE id LIKE 'demo-admin-%' AND updated_at IS NOT NULL",
          )
        ).rows[0].count,
        before.length,
      );
      assert.deepEqual(
        (
          await db.query(
            "SELECT applied_at FROM schema_migrations WHERE id='082_administration.sql'",
          )
        ).rows[0].applied_at,
        date,
      );
      assert.equal(
        (await db.query("SELECT 1 FROM schema_migrations WHERE id='080_administration.sql'"))
          .rowCount,
        0,
      );
      for (const id of ['080_review_contribution_lock.sql', '081_review_appeal_preservation.sql'])
        assert.equal(
          (await db.query('SELECT 1 FROM schema_migrations WHERE id=$1', [id])).rowCount,
          1,
        );
      assert.equal(
        (
          await db.query(
            "SELECT to_regprocedure('review_lock_contribution(text)') IS NOT NULL AS present",
          )
        ).rows[0].present,
        true,
      );
      await run();
      assert.deepEqual(await snapshot(), before);
      // Two histories cannot silently mask an inconsistent manual import.
      await db.query("INSERT INTO schema_migrations(id) VALUES('080_administration.sql')");
      await assert.rejects(run(), /Conflicting administration migration history/);
      assert.deepEqual(await snapshot(), before);
    } finally {
      await db.end();
      await root.query(`DROP SCHEMA ${schema} CASCADE`);
      await root.end();
      await rm(cwd, { recursive: true, force: true });
    }
  },
);
