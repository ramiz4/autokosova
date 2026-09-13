import pg from 'pg';
import { places, serviceCategories, vehicleMakes } from '../../db/catalog.mjs';

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

  for (const [id, labelDe, labelSq, aliases] of serviceCategories) {
    await client.query(
      `INSERT INTO service_category (id, label_de, label_sq, aliases)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE
       SET label_de = EXCLUDED.label_de, label_sq = EXCLUDED.label_sq, aliases = EXCLUDED.aliases`,
      [id, labelDe, labelSq, aliases],
    );
  }

  for (const [id, label] of vehicleMakes) {
    await client.query(
      `INSERT INTO vehicle_make (id, label)
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label`,
      [id, label],
    );
  }

  for (const [id, geonamesId, label, aliases, latitude, longitude] of places) {
    await client.query(
      `INSERT INTO place (
         id, geonames_id, label, aliases, country_code, point,
         source_name, source_url, source_license, source_checked_at
       ) VALUES (
         $1, $2, $3, $4, 'XK', ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography,
         'GeoNames', 'https://download.geonames.org/export/dump/XK.zip',
         'CC BY 4.0', DATE '2026-09-13'
       )
       ON CONFLICT (id) DO UPDATE
       SET geonames_id = EXCLUDED.geonames_id, label = EXCLUDED.label,
           aliases = EXCLUDED.aliases, point = EXCLUDED.point,
           source_checked_at = EXCLUDED.source_checked_at`,
      [id, geonamesId, label, aliases, longitude, latitude],
    );
  }
} finally {
  await client.end();
}
