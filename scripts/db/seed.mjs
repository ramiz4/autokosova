import pg from 'pg';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Seed data is prohibited in production.');
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required.');
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query(
    `INSERT INTO app_seed_marker (id, label)
     VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label`,
    ['foundation-fake-data', 'Nur fiktive lokale Entwicklungsdaten'],
  );
} finally {
  await client.end();
}
