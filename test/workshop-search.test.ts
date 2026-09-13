import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import {
  AccessStore,
  type PublicWorkshopProfile,
  type WorkshopProfileInput,
} from '../src/server/access';
import { createServer } from '../src/server/app';
import {
  findPublicWorkshops,
  isWithinSearchRadius,
  parsePublicWorkshopSearch,
} from '../src/server/workshop-search';
import { PostgresWorkshopSearchStore } from '../src/server/workshop-search-store';

const databaseUrl = process.env['DATABASE_URL'];

function profile(overrides: Partial<PublicWorkshopProfile> = {}): PublicWorkshopProfile {
  return {
    contact: { phone: '+383 44 000 001' },
    id: 'workshop-pristina',
    languages: ['Deutsch', 'Shqip'],
    name: 'Fiktive Bremsenwerkstatt Prishtina',
    photoIds: [],
    placeId: 'xk-pristina',
    selfReportedSpecializations: ['Bremsen'],
    serviceCategoryIds: ['bremsen'],
    vehicleMakeIds: ['skoda'],
    verificationLabel: 'Unternehmensdaten geprüft',
    ...overrides,
  };
}

function query(overrides: Record<string, string> = {}) {
  return parsePublicWorkshopSearch({
    places: 'xk-pristina:100,xk-ferizaj:100',
    service: 'bremsen',
    vehicleMake: 'skoda',
    ...overrides,
  })!;
}

test('a radius includes its centre and its boundary, but never silently expands outside it', () => {
  assert.equal(isWithinSearchRadius(0, 5_000), true);
  assert.equal(isWithinSearchRadius(5_000, 5_000), true);
  assert.equal(isWithinSearchRadius(5_000.01, 5_000), false);

  const result = findPublicWorkshops(
    [
      profile(),
      profile({
        id: 'workshop-prizren',
        name: 'Fiktive Bremsenwerkstatt Prizren',
        placeId: 'xk-prizren',
      }),
    ],
    query({ places: 'xk-pristina:5' }),
  );

  assert.deepEqual(
    result.results.map((workshop) => workshop.id),
    ['workshop-pristina'],
  );
  assert.equal(result.results[0].distanceKm, 0);
  assert.equal(result.results[0].matchingPlace.label, 'Prishtina');
});

test('multiple places are unioned, overlap is deduplicated, and the closest matching place is shown', () => {
  const result = findPublicWorkshops(
    [
      profile(),
      profile({
        id: 'workshop-ferizaj',
        name: 'Fiktive Bremsenwerkstatt Ferizaj',
        placeId: 'xk-ferizaj',
        vehicleMakeIds: [],
      }),
    ],
    query(),
  );

  assert.equal(result.total, 2);
  assert.deepEqual(
    result.results.map((workshop) => workshop.id),
    ['workshop-pristina', 'workshop-ferizaj'],
  );
  assert.equal(result.results[0].matchingPlace.label, 'Prishtina');
  assert.equal(result.results[1].matchingPlace.label, 'Ferizaj');
  assert.ok(
    result.results.every((workshop) => workshop.reasons.some((reason) => /Luftlinie/.test(reason))),
  );
});

test('the service is a hard filter, while markenoffene workshops stay visible for a selected brand', () => {
  const result = findPublicWorkshops(
    [
      profile(),
      profile({
        id: 'open-to-all',
        name: 'Fiktive offene Werkstatt',
        vehicleMakeIds: [],
      }),
      profile({
        id: 'volkswagen-only',
        name: 'Fiktive VW-Werkstatt',
        vehicleMakeIds: ['volkswagen'],
      }),
      profile({
        id: 'other-service',
        name: 'Fiktive Reifenwerkstatt',
        serviceCategoryIds: ['reifen'],
      }),
    ],
    query({ places: 'xk-pristina:5' }),
  );

  assert.deepEqual(
    result.results.map((workshop) => workshop.id),
    ['workshop-pristina', 'open-to-all'],
  );
  assert.ok(
    result.results
      .find((workshop) => workshop.id === 'open-to-all')
      ?.reasons.includes('Markenoffen'),
  );
  assert.equal(
    result.results.some((workshop) => workshop.id === 'volkswagen-only'),
    false,
  );
  assert.equal(
    result.results.some((workshop) => workshop.id === 'other-service'),
    false,
  );
});

test('ranking is deterministic and presents an honest pre-review state', () => {
  const result = findPublicWorkshops(
    [
      profile({ id: 'new-workshop', name: 'Neue fiktive Werkstatt', vehicleMakeIds: [] }),
      profile({ id: 'specialist', name: 'Spezialisierte fiktive Werkstatt' }),
    ],
    query({ places: 'xk-pristina:5', language: 'Deutsch' }),
  );

  assert.deepEqual(
    result.results.map((workshop) => workshop.id),
    ['specialist', 'new-workshop'],
  );
  assert.deepEqual(
    result.results.map((workshop) => workshop.reviewSummary),
    [
      {
        label: 'Noch keine Bewertungen',
        reviewCount: 0,
        state: 'unavailable',
        verifiedVisitCount: 0,
      },
      {
        label: 'Noch keine Bewertungen',
        reviewCount: 0,
        state: 'unavailable',
        verifiedVisitCount: 0,
      },
    ],
  );
  assert.equal(JSON.stringify(result).includes('paid'), false);
});

test('sort accepts only the documented server-side orders', () => {
  assert.equal(query({ sort: 'rating' }).sort, 'rating');
  assert.equal(query().sort, 'recommended');
  assert.throws(() => query({ sort: 'paid-top' }));
});

test('result pagination is stable and malformed filters are rejected instead of widened', () => {
  const workshops = Array.from({ length: 12 }, (_, index) =>
    profile({
      id: `workshop-${String(index).padStart(2, '0')}`,
      name: `Fiktive Werkstatt ${index}`,
    }),
  );
  const firstPage = findPublicWorkshops(
    workshops,
    query({ page: '1', pageSize: '10', places: 'xk-pristina:5' }),
  );
  const secondPage = findPublicWorkshops(
    workshops,
    query({ page: '2', pageSize: '10', places: 'xk-pristina:5' }),
  );
  const unpaginated = findPublicWorkshops(
    workshops,
    query({ page: '1', pageSize: '24', places: 'xk-pristina:5' }),
  );

  assert.equal(firstPage.total, 12);
  assert.equal(firstPage.totalPages, 2);
  assert.equal(firstPage.results.length, 10);
  assert.deepEqual(
    secondPage.results.map((workshop) => workshop.id),
    unpaginated.results.slice(10).map((workshop) => workshop.id),
  );
  assert.throws(
    () => parsePublicWorkshopSearch({ places: 'xk-pristina:101', service: 'bremsen' }),
    /radius from 5 to 100 km/,
  );
  assert.throws(
    () =>
      parsePublicWorkshopSearch({ places: 'xk-pristina:10,xk-pristina:20', service: 'bremsen' }),
    /different place/,
  );
});

test('the public endpoint only returns released workshops and does not accept private request data', async () => {
  const store = new AccessStore();
  store.addRole('admin', 'admin');
  const adminSession = store.createSession('admin');
  const ownerSession = store.createSession('owner');
  const admin = store.getPrincipal(adminSession.sessionId)!;
  const owner = store.getPrincipal(ownerSession.sessionId)!;
  const workshopProfile: WorkshopProfileInput = {
    contactPerson: 'Private fiktive Person',
    contactPhone: '+383 44 000 002',
    languages: ['Deutsch'],
    name: 'Freigegebene fiktive Suche',
    placeId: 'xk-pristina',
    publicPhone: '+383 44 000 003',
    selfReportedSpecializations: [],
    serviceCategoryIds: ['bremsen'],
    vehicleMakeIds: [],
  };
  const released = store.createWorkshopRegistration(owner, workshopProfile, 'test-v1');
  store.submitWorkshopForReview(owner, released.id);
  store.reviewWorkshop(admin, released.id, 'published', {
    companyDocument: 'verified',
    contactPerson: 'verified',
    location: 'verified',
    phone: 'verified',
  });
  store.createWorkshopRegistration(
    owner,
    { ...workshopProfile, name: 'Private fiktive Suche', publicPhone: undefined },
    'test-v1',
  );
  const app = createServer({ accessStore: store });

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/api/public/search?places=xk-pristina%3A5&service=bremsen&vehicleMake=skoda',
    });
    const rejected = await app.inject({
      method: 'GET',
      url: '/api/public/search?places=xk-pristina%3A5&service=bremsen&symptom=private',
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().total, 1);
    assert.equal(JSON.stringify(response.json()).includes('Private fiktive Person'), false);
    assert.equal(rejected.statusCode, 200);
    assert.equal(JSON.stringify(rejected.json()).includes('private'), false);
  } finally {
    await app.close();
  }
});

test(
  'PostgreSQL search uses PostGIS over the public profile view only',
  { skip: !databaseUrl },
  async () => {
    const client = new pg.Client({ connectionString: databaseUrl });
    const ownerId = `search-owner-${randomUUID()}`;
    const workshopId = `search-workshop-${randomUUID()}`;
    const store = new PostgresWorkshopSearchStore(databaseUrl!);
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO app_user (id, oidc_subject, status) VALUES ($1, $1, 'active')`,
        [ownerId],
      );
      await client.query(
        `INSERT INTO workshop (
           id, name, publication_state, created_by_user_id, place_id, public_phone,
           contact_person, contact_phone, languages, self_reported_specializations
         ) VALUES (
           $1, 'Fiktive PostgreSQL-Suche', 'published', $2, 'xk-pristina', '+383 44 000 010',
           'Private fiktive Person', '+383 44 000 011', ARRAY['Deutsch'], ARRAY['Bremsen']
         )`,
        [workshopId, ownerId],
      );
      await client.query(
        `INSERT INTO workshop_verification (
           workshop_id, phone_state, contact_person_state, company_document_state, location_state
         ) VALUES ($1, 'verified', 'verified', 'verified', 'verified')`,
        [workshopId],
      );
      await client.query(
        `INSERT INTO workshop_service_category (workshop_id, service_category_id)
         VALUES ($1, 'bremsen')`,
        [workshopId],
      );
      await client.query('COMMIT');

      const result = await store.searchPublicWorkshops(query({ places: 'xk-pristina:5' }));
      const profile = await store.getPublicWorkshop(workshopId);

      const matchingWorkshop = result.results.find((workshop) => workshop.id === workshopId);
      assert.ok(matchingWorkshop);
      assert.equal(matchingWorkshop.distanceKm, 0);
      assert.equal(matchingWorkshop.companyDataVerified, true);
      assert.equal(JSON.stringify(result).includes('Private fiktive Person'), false);
      assert.deepEqual(profile, {
        contact: { phone: '+383 44 000 010' },
        id: workshopId,
        languages: ['Deutsch'],
        name: 'Fiktive PostgreSQL-Suche',
        photoIds: [],
        placeId: 'xk-pristina',
        reviewSummary: {
          label: 'Noch keine Bewertungen',
          reviewCount: 0,
          state: 'unavailable',
          verifiedVisitCount: 0,
        },
        selfReportedSpecializations: ['Bremsen'],
        serviceCategoryIds: ['bremsen'],
        vehicleMakeIds: [],
        verificationLabel: 'Unternehmensdaten geprüft',
      });
    } finally {
      await client.query('ROLLBACK');
      await client.query('DELETE FROM workshop_service_category WHERE workshop_id = $1', [
        workshopId,
      ]);
      await client.query('DELETE FROM workshop_verification WHERE workshop_id = $1', [workshopId]);
      await client.query('DELETE FROM workshop WHERE id = $1', [workshopId]);
      await client.query('DELETE FROM app_user WHERE id = $1', [ownerId]);
      await client.end();
      await store.close();
    }
  },
);
