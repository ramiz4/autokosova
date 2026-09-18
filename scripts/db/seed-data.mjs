import { seedAdminDemo } from './admin-demo.mjs';
import { seedReviewWorkflowDemo } from './review-demo.mjs';
import { seedStaffDemo, readStaffDemoConfig } from './staff-demo.mjs';
import {
  isManagedDemoEntity,
  readDemoAccountConfig,
  seedDemoAccounts,
  demoAccountGarageIds,
} from './demo-accounts.mjs';
import {
  demoWorkflowRequests,
  demoWorkflowReviews,
  demoWorkflowUsers,
  demoGarages,
  demoBetreiberUsers,
} from '../../db/demo-data.mjs';
import { staffDemoFixtures } from '../../db/staff-demo-data.mjs';
import { places, serviceCategories, vehicleMakes } from '../../db/catalog.mjs';

export { demoGarages } from '../../db/demo-data.mjs';
export {
  demoWorkflowRequests,
  demoWorkflowReviews,
  demoWorkflowUsers,
} from '../../db/demo-data.mjs';

const localDatabaseHosts = new Set(['127.0.0.1', '::1', '[::1]', 'localhost']);

const demoSeedMarker = {
  id: 'demo-public-v2',
  label: 'Ausschliesslich fiktive lokale Demo-Werkstattprofile',
};

const demoWorkflowSeedMarker = {
  id: 'demo-workflows-v1',
  label: 'Ausschliesslich fiktive lokale Demo-Workflowdaten',
};

export function parseSeedProfile(argumentsToParse) {
  if (!argumentsToParse.length) return 'reference';
  if (argumentsToParse.length === 2 && argumentsToParse[0] === '--profile') {
    if (argumentsToParse[1] === 'demo') return 'demo';
    if (argumentsToParse[1] === 'demo-workflows') return 'demo'; // backwards-compat alias
  }

  throw new Error('Usage: node scripts/db/seed.mjs [--profile demo]');
}

export function assertSeedEnvironment({ databaseUrl, environment = process.env, profile }) {
  if (environment.NODE_ENV === 'production') {
    throw new Error('Seed data is prohibited in production.');
  }

  assertLocalDatabaseTarget(databaseUrl);

  if (profile !== 'reference' && environment.AUTOKOSOVA_DEMO_DATA !== '1') {
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

export async function seedDatabase(client, profile, environment = process.env) {
  const accounts = profile === 'demo' ? readDemoAccountConfig(environment) : undefined;
  if (profile === 'demo') readStaffDemoConfig(environment);
  await client.query('BEGIN');
  try {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('local-demo-account-binding', 0))",
    );
    if (profile !== 'reference') await assertDemoIdsAreAvailable(client);
    if (profile === 'demo') await assertDemoWorkflowIdsAreAvailable(client);

    await seedReferenceData(client);
    if (profile !== 'reference') await seedDemoData(client);
    if (profile === 'demo') {
      await seedDemoWorkflowData(client);
      await seedDemoAccounts(client, accounts);
      await seedStaffDemo(client, environment);
      await seedAdminDemo(client, environment);
      await seedReviewWorkflowDemo(client, accounts);
    }

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
  const demoIds = demoGarages.map((garage) => garage.id);
  const existing = await client.query('SELECT id, name FROM garage WHERE id = ANY($1::text[])', [
    demoIds,
  ]);
  const seeded = await client.query(
    'SELECT garage_id FROM local_demo_seed_garage WHERE garage_id = ANY($1::text[])',
    [demoIds],
  );
  const seededIds = new Set(seeded.rows.map((row) => row.garage_id));

  for (const row of existing.rows) {
    if (!seededIds.has(row.id)) {
      throw new Error(`Demo garage ID ${row.id} is occupied by non-demo local data.`);
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

  for (const garage of demoGarages) {
    if (await isManagedDemoEntity(client, 'garage', garage.id)) continue;
    await client.query(
      `INSERT INTO garage (
         id, name, publication_state, place_id, description, public_phone, public_whatsapp,
         contact_person, contact_phone, languages, self_reported_specializations, location_point, location_source
       ) VALUES ($1, $2, 'published', $3, $4, $5, $6, $7, $5, $8, $9,
         ST_SetSRID(ST_MakePoint($11, $10), 4326)::geography, 'local_demo')
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           publication_state = EXCLUDED.publication_state,
           place_id = EXCLUDED.place_id,
           description = EXCLUDED.description,
           public_phone = EXCLUDED.public_phone,
           public_whatsapp = EXCLUDED.public_whatsapp,
           contact_person = EXCLUDED.contact_person,
           contact_phone = EXCLUDED.contact_phone,
           languages = EXCLUDED.languages,
           self_reported_specializations = EXCLUDED.self_reported_specializations,
           location_point = EXCLUDED.location_point,
           location_source = EXCLUDED.location_source`,
      [
        garage.id,
        garage.name,
        garage.placeId,
        garage.description,
        garage.publicPhone,
        garage.publicWhatsapp,
        garage.contactPerson,
        garage.languages,
        garage.selfReportedSpecializations,
        garage.locationPoint.latitude,
        garage.locationPoint.longitude,
      ],
    );

    await client.query(
      `INSERT INTO local_demo_seed_garage (garage_id, seed_version)
       VALUES ($1, $2)
       ON CONFLICT (garage_id) DO UPDATE
       SET seed_version = EXCLUDED.seed_version, updated_at = now()`,
      [garage.id, demoSeedMarker.id],
    );

    await client.query(
      `INSERT INTO garage_verification (
         garage_id, phone_state, contact_person_state, company_document_state, location_state
       ) VALUES ($1, $2, $2, $2, $2)
       ON CONFLICT (garage_id) DO UPDATE
       SET phone_state = EXCLUDED.phone_state,
           contact_person_state = EXCLUDED.contact_person_state,
           company_document_state = EXCLUDED.company_document_state,
           location_state = EXCLUDED.location_state`,
      [garage.id, garage.verification],
    );

    for (const serviceCategoryId of garage.serviceCategoryIds) {
      await client.query(
        `INSERT INTO garage_service_category (garage_id, service_category_id)
         VALUES ($1, $2)
         ON CONFLICT (garage_id, service_category_id) DO NOTHING`,
        [garage.id, serviceCategoryId],
      );
    }

    for (const vehicleMakeId of garage.vehicleMakeIds) {
      await client.query(
        `INSERT INTO garage_vehicle_make (garage_id, vehicle_make_id)
         VALUES ($1, $2)
         ON CONFLICT (garage_id, vehicle_make_id) DO NOTHING`,
        [garage.id, vehicleMakeId],
      );
    }
  }

  // Seed fictional garage operators (owners + company documents for all demo garages)
  for (const userId of demoBetreiberUsers) {
    await client.query(
      `INSERT INTO app_user (id, oidc_subject, status) VALUES ($1, $1, 'active')
       ON CONFLICT (id) DO UPDATE SET status = 'active'`,
      [userId],
    );
  }
  const companyDocSize = Buffer.byteLength(staffDemoFixtures['company-valid'], 'utf8');
  const demoAccountGarageIdSet = new Set(demoAccountGarageIds);
  for (const [index, garage] of demoGarages.entries()) {
    const betreiber = demoBetreiberUsers[index % demoBetreiberUsers.length];
    const docId = `demo-company-doc-${garage.id}`;

    if (!demoAccountGarageIdSet.has(garage.id)) {
      await client.query(
        `INSERT INTO membership (user_id, garage_id, role, state, granted_by)
         VALUES ($1, $2, 'owner', 'active', $1)
         ON CONFLICT (user_id, garage_id) DO UPDATE SET role = 'owner', state = 'active'`,
        [betreiber, garage.id],
      );
    }

    await client.query(
      `INSERT INTO file_object (id, owner_user_id, storage_key, content_type, size_bytes, scan_state)
       VALUES ($1, $2, $3, 'text/plain', $4, 'clean')
       ON CONFLICT (id) DO NOTHING`,
      [docId, betreiber, `local-demo/${docId}`, companyDocSize],
    );
    await client.query(
      `INSERT INTO local_demo_file_fixture (file_id, fixture_key) VALUES ($1, 'company-valid')
       ON CONFLICT (file_id) DO NOTHING`,
      [docId],
    );
    await client.query(
      `INSERT INTO garage_verification_document (file_id, garage_id, uploaded_by_user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (file_id) DO NOTHING`,
      [docId, garage.id, betreiber],
    );
  }
}

function demoWorkflowFileId(review) {
  return `demo-evidence-${review.id}`;
}

function demoWorkflowEntities() {
  return {
    app_user: demoWorkflowUsers,
    file_object: demoWorkflowReviews.map(demoWorkflowFileId),
    repair_request: demoWorkflowRequests.map((request) => request.id),
    request_search_area: demoWorkflowRequests.flatMap((request) =>
      request.searchAreas.map((area) => area.id),
    ),
    visit_evidence: demoWorkflowReviews.map((review) => `demo-evidence-row-${review.id}`),
    garage_review: demoWorkflowReviews.map((review) => review.id),
  };
}

async function assertDemoWorkflowIdsAreAvailable(client) {
  const sourceTables = {
    app_user: 'app_user',
    file_object: 'file_object',
    repair_request: 'repair_request',
    request_search_area: 'request_search_area',
    visit_evidence: 'visit_evidence',
    garage_review: 'garage_review',
  };

  for (const [entityType, entityIds] of Object.entries(demoWorkflowEntities())) {
    const seeded = await client.query(
      `SELECT entity_id
       FROM local_demo_seed_entity
       WHERE entity_type = $1 AND entity_id = ANY($2::text[])`,
      [entityType, entityIds],
    );
    const existing = await client.query(
      `SELECT id FROM ${sourceTables[entityType]} WHERE id = ANY($1::text[])`,
      [entityIds],
    );
    const seededIds = new Set(seeded.rows.map((row) => row.entity_id));

    for (const row of existing.rows) {
      if (!seededIds.has(row.id)) {
        throw new Error(`Demo workflow ${entityType} ID ${row.id} is occupied by local data.`);
      }
    }
  }
}

async function recordDemoWorkflowEntity(client, entityType, entityId) {
  await client.query(
    `INSERT INTO local_demo_seed_entity (entity_type, entity_id, seed_version)
     VALUES ($1, $2, $3)
     ON CONFLICT (entity_type, entity_id) DO UPDATE
     SET seed_version = EXCLUDED.seed_version, updated_at = now()`,
    [entityType, entityId, demoWorkflowSeedMarker.id],
  );
}

async function seedDemoWorkflowData(client) {
  await client.query(
    `INSERT INTO app_seed_marker (id, label)
     VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label`,
    [demoWorkflowSeedMarker.id, demoWorkflowSeedMarker.label],
  );

  for (const userId of demoWorkflowUsers) {
    await client.query(
      `INSERT INTO app_user (id, oidc_subject, status)
       VALUES ($1, $1, 'active')
       ON CONFLICT (id) DO UPDATE SET oidc_subject = EXCLUDED.oidc_subject, status = 'active'`,
      [userId],
    );
    await recordDemoWorkflowEntity(client, 'app_user', userId);
  }

  for (const review of demoWorkflowReviews) {
    const seeded = await client.query(
      "SELECT 1 FROM local_demo_seed_entity WHERE entity_type='garage_review' AND entity_id=$1",
      [review.id],
    );
    if (seeded.rowCount) continue;
    const fileId = demoWorkflowFileId(review);
    const evidenceId = `demo-evidence-row-${review.id}`;

    await client.query(
      `INSERT INTO file_object (
         id, owner_user_id, storage_key, content_type, size_bytes, scan_state, retention_state
       ) VALUES ($1, $2, $3, 'application/pdf', 1, 'clean', 'active')
       ON CONFLICT (id) DO UPDATE
       SET owner_user_id = EXCLUDED.owner_user_id,
           storage_key = EXCLUDED.storage_key,
           content_type = EXCLUDED.content_type,
           size_bytes = EXCLUDED.size_bytes,
           scan_state = EXCLUDED.scan_state,
           retention_state = EXCLUDED.retention_state`,
      [fileId, review.authorUserId, `local-demo/${fileId}`],
    );
    await recordDemoWorkflowEntity(client, 'file_object', fileId);

    await client.query(
      `INSERT INTO garage_review (
         id, author_user_id, garage_id, service_category_id, vehicle_make_id, visit_month,
         work_quality, communication, price_transparency, punctuality, review_text,
         publication_state, published_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'published', now()
       )
       ON CONFLICT (id) DO UPDATE
       SET author_user_id = EXCLUDED.author_user_id,
           garage_id = EXCLUDED.garage_id,
           service_category_id = EXCLUDED.service_category_id,
           vehicle_make_id = EXCLUDED.vehicle_make_id,
           visit_month = EXCLUDED.visit_month,
           work_quality = EXCLUDED.work_quality,
           communication = EXCLUDED.communication,
           price_transparency = EXCLUDED.price_transparency,
           punctuality = EXCLUDED.punctuality,
           review_text = EXCLUDED.review_text,
           publication_state = EXCLUDED.publication_state,
           published_at = now()`,
      [
        review.id,
        review.authorUserId,
        review.garageId,
        review.serviceCategoryId,
        review.vehicleMakeId ?? null,
        review.visitMonth,
        review.workQuality,
        review.communication,
        review.priceTransparency,
        review.punctuality,
        review.text,
      ],
    );
    await recordDemoWorkflowEntity(client, 'garage_review', review.id);

    await client.query(
      `INSERT INTO visit_evidence (
         id, review_id, owner_user_id, private_file_id, evidence_kind, verification_state,
         service_matches, visit_month_matches, garage_matches, reviewed_by_user_id, reviewed_at
       ) VALUES ($1, $2, $3, $4, $5, 'verified', true, true, true, $6, now())
       ON CONFLICT (id) DO UPDATE
       SET review_id = EXCLUDED.review_id,
           owner_user_id = EXCLUDED.owner_user_id,
           private_file_id = EXCLUDED.private_file_id,
           evidence_kind = EXCLUDED.evidence_kind,
           verification_state = EXCLUDED.verification_state,
           service_matches = true,
           visit_month_matches = true,
           garage_matches = true,
           reviewed_by_user_id = EXCLUDED.reviewed_by_user_id,
           reviewed_at = now()`,
      [
        evidenceId,
        review.id,
        review.authorUserId,
        fileId,
        review.evidenceKind,
        'demo-workflow-moderator',
      ],
    );
    await recordDemoWorkflowEntity(client, 'visit_evidence', evidenceId);

    await client.query(
      `INSERT INTO review_moderator_assignment (
         review_id, moderator_user_id, assigned_by_user_id
       ) VALUES ($1, $2, $2)
       ON CONFLICT (review_id) DO UPDATE
       SET moderator_user_id = EXCLUDED.moderator_user_id,
           assigned_by_user_id = EXCLUDED.assigned_by_user_id`,
      [review.id, 'demo-workflow-moderator'],
    );
  }

  for (const request of demoWorkflowRequests) {
    if (await isManagedDemoEntity(client, 'repair_request', request.id)) continue;
    await client.query(
      `INSERT INTO repair_request (
         id, owner_user_id, description, service_category_id, symptom, state, earliest_dropoff_on, latest_pickup_on
       ) VALUES ($1, $2, $3, $4, $3, 'matching', $5, $6)
       ON CONFLICT (id) DO UPDATE
       SET owner_user_id = EXCLUDED.owner_user_id,
           description = EXCLUDED.description,
           service_category_id = EXCLUDED.service_category_id,
           symptom = EXCLUDED.symptom,
           state = EXCLUDED.state,
           earliest_dropoff_on = EXCLUDED.earliest_dropoff_on,
           latest_pickup_on = EXCLUDED.latest_pickup_on`,
      [
        request.id,
        request.ownerUserId,
        request.symptom,
        request.serviceCategoryId,
        request.earliestDropoffOn,
        request.latestPickupOn,
      ],
    );
    await recordDemoWorkflowEntity(client, 'repair_request', request.id);

    for (const [index, area] of request.searchAreas.entries()) {
      await client.query(
        `INSERT INTO request_search_area (
           id, repair_request_id, position, place_id, radius_m
         ) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE
         SET repair_request_id = EXCLUDED.repair_request_id,
             position = EXCLUDED.position,
             place_id = EXCLUDED.place_id,
             radius_m = EXCLUDED.radius_m`,
        [area.id, request.id, index + 1, area.placeId, area.radiusM],
      );
      await recordDemoWorkflowEntity(client, 'request_search_area', area.id);
    }
  }
}
