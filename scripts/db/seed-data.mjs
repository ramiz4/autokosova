import { places, serviceCategories, vehicleMakes } from '../../db/catalog.mjs';

const localDatabaseHosts = new Set(['127.0.0.1', '::1', '[::1]', 'localhost']);

const demoSeedMarker = {
  id: 'demo-public-v1',
  label: 'Ausschliesslich fiktive lokale Demo-Werkstattprofile',
};

export const demoWorkshops = [
  {
    contactPerson: 'Lokale Demo-Person Prishtina',
    description:
      'Ausschliesslich fiktive lokale Entwicklungsdaten. Kein echter Betrieb und kein echtes Angebot.',
    id: 'demo-prishtina-bremsen',
    languages: ['Deutsch', 'Shqip'],
    name: 'DEMO · Bremsen Prishtina',
    placeId: 'xk-pristina',
    publicPhone: '+99900000001',
    selfReportedSpecializations: ['Bremsen'],
    serviceCategoryIds: ['bremsen'],
    vehicleMakeIds: ['skoda'],
    verification: 'verified',
  },
  {
    contactPerson: 'Lokale Demo-Person Prishtina Reifen',
    description:
      'Ausschliesslich fiktive lokale Entwicklungsdaten. Dieses Profil zeigt einen markenoffenen Betrieb ohne Unternehmenskennzeichen.',
    id: 'demo-prishtina-reifen',
    languages: ['Shqip'],
    name: 'DEMO · Reifen Prishtina',
    placeId: 'xk-pristina',
    publicPhone: '+99900000002',
    selfReportedSpecializations: ['Reifenwechsel'],
    serviceCategoryIds: ['reifen'],
    vehicleMakeIds: [],
    verification: 'not_checked',
  },
  {
    contactPerson: 'Lokale Demo-Person Ferizaj',
    description:
      'Ausschliesslich fiktive lokale Entwicklungsdaten. Dieses Profil ist für Mehrortsuche und Markenoffenheit bestimmt.',
    id: 'demo-ferizaj-bremsen-offen',
    languages: ['Deutsch'],
    name: 'DEMO · Bremsen Ferizaj',
    placeId: 'xk-ferizaj',
    publicPhone: '+99900000003',
    selfReportedSpecializations: ['Bremsen', 'Inspektion'],
    serviceCategoryIds: ['bremsen', 'service-inspektion'],
    vehicleMakeIds: [],
    verification: 'verified',
  },
  {
    contactPerson: 'Lokale Demo-Person Prizren',
    description:
      'Ausschliesslich fiktive lokale Entwicklungsdaten. Dieses Profil ist ein Markenfilter-Gegenbeispiel.',
    id: 'demo-prizren-bremsen-vw',
    languages: ['Deutsch', 'Shqip'],
    name: 'DEMO · Bremsen Prizren',
    placeId: 'xk-prizren',
    publicPhone: '+99900000004',
    selfReportedSpecializations: ['Bremsen'],
    serviceCategoryIds: ['bremsen'],
    vehicleMakeIds: ['volkswagen'],
    verification: 'verified',
  },
  {
    contactPerson: 'Lokale Demo-Person Pejë',
    description:
      'Ausschliesslich fiktive lokale Entwicklungsdaten. Dieses Profil deckt Leistung und Sprachfilter ausserhalb von Prishtina ab.',
    id: 'demo-peja-klima',
    languages: ['Shqip'],
    name: 'DEMO · Klima Pejë',
    placeId: 'xk-peja',
    publicPhone: '+99900000005',
    selfReportedSpecializations: ['Klimaanlage'],
    serviceCategoryIds: ['klima'],
    vehicleMakeIds: ['toyota'],
    verification: 'verified',
  },
];

export function parseSeedProfile(argumentsToParse) {
  if (!argumentsToParse.length) return 'reference';
  if (argumentsToParse.length === 2 && argumentsToParse[0] === '--profile') {
    if (argumentsToParse[1] === 'demo') return 'demo';
  }

  throw new Error('Usage: node scripts/db/seed.mjs [--profile demo]');
}

export function assertSeedEnvironment({ databaseUrl, environment = process.env, profile }) {
  if (environment.NODE_ENV === 'production') {
    throw new Error('Seed data is prohibited in production.');
  }

  assertLocalDatabaseTarget(databaseUrl);

  if (profile === 'demo' && environment.AUTOKOSOVA_DEMO_DATA !== '1') {
    throw new Error('Set AUTOKOSOVA_DEMO_DATA=1 to seed local demo data.');
  }
}

export function assertLocalDatabaseTarget(databaseUrl) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required.');
  }

  let target;
  try {
    target = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
  }

  if (!['postgres:', 'postgresql:'].includes(target.protocol)) {
    throw new Error('DATABASE_URL must use the PostgreSQL protocol.');
  }

  if (!localDatabaseHosts.has(target.hostname.toLowerCase())) {
    throw new Error('Seed data requires a loopback DATABASE_URL.');
  }

  const databaseName = decodeURIComponent(target.pathname).replace(/^\/+/, '');
  if (databaseName !== 'autokosova') {
    throw new Error('Seed data requires the local autokosova database.');
  }
}

export async function seedDatabase(client, profile) {
  await client.query('BEGIN');
  try {
    if (profile === 'demo') await assertDemoIdsAreAvailable(client);

    await seedReferenceData(client);
    if (profile === 'demo') await seedDemoData(client);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function seedReferenceData(client) {
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
}

async function assertDemoIdsAreAvailable(client) {
  const demoIds = demoWorkshops.map((workshop) => workshop.id);
  const existing = await client.query('SELECT id, name FROM workshop WHERE id = ANY($1::text[])', [
    demoIds,
  ]);
  const seeded = await client.query(
    'SELECT workshop_id FROM local_demo_seed_workshop WHERE workshop_id = ANY($1::text[])',
    [demoIds],
  );
  const seededIds = new Set(seeded.rows.map((row) => row.workshop_id));

  for (const row of existing.rows) {
    if (!seededIds.has(row.id)) {
      throw new Error(`Demo workshop ID ${row.id} is occupied by non-demo local data.`);
    }
  }
}

async function seedDemoData(client) {
  await client.query(
    `INSERT INTO app_seed_marker (id, label)
     VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label`,
    [demoSeedMarker.id, demoSeedMarker.label],
  );

  for (const workshop of demoWorkshops) {
    await client.query(
      `INSERT INTO workshop (
         id, name, publication_state, place_id, description, public_phone,
         contact_person, contact_phone, languages, self_reported_specializations
       ) VALUES ($1, $2, 'published', $3, $4, $5, $6, $5, $7, $8)
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           publication_state = EXCLUDED.publication_state,
           place_id = EXCLUDED.place_id,
           description = EXCLUDED.description,
           public_phone = EXCLUDED.public_phone,
           contact_person = EXCLUDED.contact_person,
           contact_phone = EXCLUDED.contact_phone,
           languages = EXCLUDED.languages,
           self_reported_specializations = EXCLUDED.self_reported_specializations`,
      [
        workshop.id,
        workshop.name,
        workshop.placeId,
        workshop.description,
        workshop.publicPhone,
        workshop.contactPerson,
        workshop.languages,
        workshop.selfReportedSpecializations,
      ],
    );

    await client.query(
      `INSERT INTO local_demo_seed_workshop (workshop_id, seed_version)
       VALUES ($1, $2)
       ON CONFLICT (workshop_id) DO UPDATE
       SET seed_version = EXCLUDED.seed_version, updated_at = now()`,
      [workshop.id, demoSeedMarker.id],
    );

    await client.query(
      `INSERT INTO workshop_verification (
         workshop_id, phone_state, contact_person_state, company_document_state, location_state
       ) VALUES ($1, $2, $2, $2, $2)
       ON CONFLICT (workshop_id) DO UPDATE
       SET phone_state = EXCLUDED.phone_state,
           contact_person_state = EXCLUDED.contact_person_state,
           company_document_state = EXCLUDED.company_document_state,
           location_state = EXCLUDED.location_state`,
      [workshop.id, workshop.verification],
    );

    for (const serviceCategoryId of workshop.serviceCategoryIds) {
      await client.query(
        `INSERT INTO workshop_service_category (workshop_id, service_category_id)
         VALUES ($1, $2)
         ON CONFLICT (workshop_id, service_category_id) DO NOTHING`,
        [workshop.id, serviceCategoryId],
      );
    }

    for (const vehicleMakeId of workshop.vehicleMakeIds) {
      await client.query(
        `INSERT INTO workshop_vehicle_make (workshop_id, vehicle_make_id)
         VALUES ($1, $2)
         ON CONFLICT (workshop_id, vehicle_make_id) DO NOTHING`,
        [workshop.id, vehicleMakeId],
      );
    }
  }
}
