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
  if (profile === 'demo') {
    console.log(
      process.env.AUTOKOSOVA_DEMO_GARAGE_SUBJECT && process.env.AUTOKOSOVA_DEMO_CUSTOMER_SUBJECT
        ? 'Demo-Konten zugeordnet; vorhandene Änderungen und Löschungen bleiben erhalten.'
        : 'Demo-Konten noch nicht zugeordnet: beide AUTOKOSOVA_DEMO_*_SUBJECT-Werte aus dem freigegebenen Secret-Store konfigurieren.',
    );
  }
} finally {
  await client.end();
}
