import pg from 'pg';
import { assertSeedEnvironment, parseSeedProfile, seedDatabase } from './seed-data.mjs';
import { loadEnvironment } from '../environment.mjs';

Object.assign(process.env, loadEnvironment());

const databaseUrl = process.env.DATABASE_URL;
const profile = parseSeedProfile(process.argv.slice(2));

assertSeedEnvironment({ databaseUrl, profile });

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  await seedDatabase(client, profile);
} finally {
  await client.end();
}
