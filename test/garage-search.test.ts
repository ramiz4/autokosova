import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import {
  AccessStore,
  type PublicGarageProfile,
  type GarageProfileInput,
} from '../src/server/access';
import { createServer } from '../src/server/app';
import {
  findPublicGarages,
  isWithinSearchRadius,
  parsePublicGarageSearch,
} from '../src/server/garage-search';
import { PostgresGarageSearchStore } from '../src/server/garage-search-store';
import { getCatalogPlace } from '../src/shared/catalog';

const databaseUrl = process.env['DATABASE_URL'];

function profile(overrides: Partial<PublicGarageProfile> = {}): PublicGarageProfile {
  const result = {
    contact: { phone: '+383 44 000 001' },
    id: 'garage-pristina',
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
  if (Object.hasOwn(overrides, 'locationPoint')) return result;
  const place = getCatalogPlace(result.placeId)!;
  return { ...result, locationPoint: { latitude: place.latitude, longitude: place.longitude } };
}

function query(overrides: Record<string, string> = {}) {
  return parsePublicGarageSearch({
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

  const result = findPublicGarages(
    [
      profile(),
      profile({
        id: 'garage-prizren',
        name: 'Fiktive Bremsenwerkstatt Prizren',
        placeId: 'xk-prizren',
      }),
    ],
    query({ places: 'xk-pristina:5' }),
  );

  assert.deepEqual(
    result.results.map((garage) => garage.id),
    ['garage-pristina'],
  );
  assert.equal(result.results[0].distanceKm, 0);
  assert.equal(result.results[0].matchingPlace.label, 'Prishtina');
});

test('a garage without a confirmed point stays discoverable without a radius but never gains a zero-distance placeholder', () => {
  const withoutPoint = profile({ id: 'without-point', locationPoint: undefined });
  const radiusResult = findPublicGarages([withoutPoint], query({ places: 'xk-pristina:5' }));
  const allResult = findPublicGarages(
    [withoutPoint],
    parsePublicGarageSearch({ all: 'true', service: 'bremsen' })!,
  );

  assert.equal(radiusResult.total, 0);
  assert.equal(allResult.total, 1);
  assert.equal(allResult.results[0].distanceKm, undefined);
  assert.equal(
    allResult.results[0].reasons.some((reason) => /Luftlinie/.test(reason)),
    false,
  );
});

test('multiple places are unioned, overlap is deduplicated, and the closest matching place is shown', () => {
  const result = findPublicGarages(
    [
      profile(),
      profile({
        id: 'garage-ferizaj',
        name: 'Fiktive Bremsenwerkstatt Ferizaj',
        placeId: 'xk-ferizaj',
        vehicleMakeIds: [],
      }),
    ],
    query(),
  );

  assert.equal(result.total, 2);
  assert.deepEqual(
    result.results.map((garage) => garage.id),
    ['garage-pristina', 'garage-ferizaj'],
  );
  assert.equal(result.results[0].matchingPlace.label, 'Prishtina');
  assert.equal(result.results[1].matchingPlace.label, 'Ferizaj');
  assert.ok(
    result.results.every((garage) => garage.reasons.some((reason) => /Luftlinie/.test(reason))),
  );
});

test('the service is a hard filter, while markenoffene garages stay visible for a selected brand', () => {
  const result = findPublicGarages(
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
    result.results.map((garage) => garage.id),
    ['garage-pristina', 'open-to-all'],
  );
  assert.ok(
    result.results.find((garage) => garage.id === 'open-to-all')?.reasons.includes('Markenoffen'),
  );
  assert.equal(
    result.results.some((garage) => garage.id === 'volkswagen-only'),
    false,
  );
  assert.equal(
    result.results.some((garage) => garage.id === 'other-service'),
    false,
  );
});

test('ranking is deterministic and presents an honest pre-review state', () => {
  const result = findPublicGarages(
    [
      profile({ id: 'new-garage', name: 'Neue fiktive Werkstatt', vehicleMakeIds: [] }),
      profile({ id: 'specialist', name: 'Spezialisierte fiktive Werkstatt' }),
    ],
    query({ places: 'xk-pristina:5', language: 'Deutsch' }),
  );

  assert.deepEqual(
    result.results.map((garage) => garage.id),
    ['specialist', 'new-garage'],
  );
  assert.deepEqual(
    result.results.map((garage) => garage.reviewSummary),
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

test('the explicit all-results mode returns every demo item on one default page', () => {
  const all = parsePublicGarageSearch({ all: 'true' })!;
  const garages = Array.from({ length: 25 }, (_, index) =>
    profile({ id: `demo-${index}`, name: `Demo ${index}` }),
  );
  const result = findPublicGarages(garages, all);
  assert.equal(all.allResults, true);
  assert.equal(result.total, 25);
  assert.equal(result.results.length, 25);
  assert.equal(result.totalPages, 1);
});

test('result pagination is stable and malformed filters are rejected instead of widened', () => {
  const garages = Array.from({ length: 12 }, (_, index) =>
    profile({
      id: `garage-${String(index).padStart(2, '0')}`,
      name: `Fiktive Werkstatt ${index}`,
    }),
  );
  const firstPage = findPublicGarages(
    garages,
    query({ page: '1', pageSize: '10', places: 'xk-pristina:5' }),
  );
  const secondPage = findPublicGarages(
    garages,
    query({ page: '2', pageSize: '10', places: 'xk-pristina:5' }),
  );
  const unpaginated = findPublicGarages(
    garages,
    query({ page: '1', pageSize: '24', places: 'xk-pristina:5' }),
  );

  assert.equal(firstPage.total, 12);
  assert.equal(firstPage.totalPages, 2);
  assert.equal(firstPage.results.length, 10);
  assert.deepEqual(
    secondPage.results.map((garage) => garage.id),
    unpaginated.results.slice(10).map((garage) => garage.id),
  );
  assert.throws(
    () => parsePublicGarageSearch({ places: 'xk-pristina:101', service: 'bremsen' }),
    /radius from 5 to 100 km/,
  );
  assert.throws(
    () => parsePublicGarageSearch({ places: 'xk-pristina:10,xk-pristina:20', service: 'bremsen' }),
    /different place/,
  );
});

test('the public endpoint only returns released garages and does not accept private request data', async () => {
  const store = new AccessStore();
  store.addRole('admin', 'admin');
  const adminSession = store.createSession('admin');
  const ownerSession = store.createSession('owner');
  const admin = store.getPrincipal(adminSession.sessionId)!;
  const owner = store.getPrincipal(ownerSession.sessionId)!;
  const garageProfile: GarageProfileInput = {
    contactPerson: 'Private fiktive Person',
    contactPhone: '+383 44 000 002',
    languages: ['Deutsch'],
    name: 'Freigegebene fiktive Suche',
    placeId: 'xk-pristina',
    publicPhone: '+383 44 000 003',
    locationPoint: { latitude: 42.67272, longitude: 21.16688 },
    selfReportedSpecializations: [],
    serviceCategoryIds: ['bremsen'],
    vehicleMakeIds: [],
  };
  const released = store.createGarageRegistration(owner, garageProfile, 'test-v1');
  store.submitGarageForReview(owner, released.id);
  store.reviewGarage(admin, released.id, 'published', {
    companyDocument: 'verified',
    contactPerson: 'verified',
    location: 'verified',
    phone: 'verified',
  });
  store.createGarageRegistration(
    owner,
    { ...garageProfile, name: 'Private fiktive Suche', publicPhone: undefined },
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
    assert.equal(JSON.stringify(response.json()).includes('locationPoint'), false);
    assert.equal(rejected.statusCode, 200);
    assert.equal(JSON.stringify(rejected.json()).includes('private'), false);
  } finally {
    await app.close();
  }
});

test('changing a garage point withdraws its separate location confirmation', () => {
  const store = new AccessStore();
  store.addRole('admin', 'admin');
  const owner = store.getPrincipal(store.createSession('owner').sessionId)!;
  const admin = store.getPrincipal(store.createSession('admin').sessionId)!;
  const registered = store.createGarageRegistration(
    owner,
    {
      contactPerson: 'Fiktive Person',
      contactPhone: '+38344000009',
      languages: ['Deutsch'],
      locationPoint: { latitude: 42.67, longitude: 21.16 },
      name: 'Fiktiver Standort',
      placeId: 'xk-pristina',
      selfReportedSpecializations: [],
      serviceCategoryIds: ['bremsen'],
      vehicleMakeIds: [],
    },
    'test-v1',
  );
  store.submitGarageForReview(owner, registered.id);
  store.reviewGarage(admin, registered.id, 'published', {
    companyDocument: 'verified',
    contactPerson: 'verified',
    location: 'verified',
    phone: 'verified',
  });
  const privateGarage = store.getPrivateGarage(owner, registered.id);
  store.updateGarageProfile(owner, registered.id, {
    ...privateGarage.profile,
    locationPoint: { latitude: 42.68, longitude: 21.17 },
  });

  assert.equal(store.getPrivateGarage(owner, registered.id).verification.location, 'not_checked');
});

test(
  'PostgreSQL search uses PostGIS over the public profile view only',
  { skip: !databaseUrl },
  async () => {
    const client = new pg.Client({ connectionString: databaseUrl });
    const ownerId = `search-owner-${randomUUID()}`;
    const garageId = `search-garage-${randomUUID()}`;
    const store = new PostgresGarageSearchStore(databaseUrl!);
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO app_user (id, oidc_subject, status) VALUES ($1, $1, 'active')`,
        [ownerId],
      );
      await client.query(
        `INSERT INTO garage (
           id, name, publication_state, created_by_user_id, place_id, public_phone,
           contact_person, contact_phone, languages, self_reported_specializations,
           location_point, location_source
         ) VALUES (
           $1, 'Fiktive PostgreSQL-Suche', 'published', $2, 'xk-pristina', '+383 44 000 010',
           'Private fiktive Person', '+383 44 000 011', ARRAY['Deutsch'], ARRAY['Bremsen'],
           ST_SetSRID(ST_MakePoint(21.16688, 42.67272), 4326)::geography, 'self_reported'
         )`,
        [garageId, ownerId],
      );
      await client.query(
        `INSERT INTO garage_verification (
           garage_id, phone_state, contact_person_state, company_document_state, location_state
         ) VALUES ($1, 'verified', 'verified', 'verified', 'verified')`,
        [garageId],
      );
      await client.query(
        `INSERT INTO garage_service_category (garage_id, service_category_id)
         VALUES ($1, 'bremsen')`,
        [garageId],
      );
      await client.query('COMMIT');

      const result = await store.searchPublicGarages(query({ places: 'xk-pristina:5' }));
      const profile = await store.getPublicGarage(garageId);
      const profileMatch = await store.getPublicGarageMatch(garageId, [
        { placeId: 'xk-pristina', radiusKm: 5 },
      ]);

      const matchingGarage = result.results.find((garage) => garage.id === garageId);
      assert.ok(matchingGarage);
      assert.equal(matchingGarage.distanceKm, 0);
      assert.equal(matchingGarage.companyDataVerified, true);
      assert.equal(profileMatch?.id, garageId);
      assert.equal(profileMatch?.distanceKm, 0);
      assert.deepEqual(profileMatch?.matchingPlace, { id: 'xk-pristina', label: 'Prishtina' });
      assert.equal(JSON.stringify(result).includes('Private fiktive Person'), false);
      assert.deepEqual(profile, {
        contact: { phone: '+383 44 000 010' },
        id: garageId,
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
      await client.query('DELETE FROM garage_service_category WHERE garage_id = $1', [garageId]);
      await client.query('DELETE FROM garage_verification WHERE garage_id = $1', [garageId]);
      await client.query('DELETE FROM garage WHERE id = $1', [garageId]);
      await client.query('DELETE FROM app_user WHERE id = $1', [ownerId]);
      await client.end();
      await store.close();
    }
  },
);

test('location-free search preserves and validates make and language filters', () => {
  const input = parsePublicGarageSearch({
    all: 'true',
    vehicleMake: 'skoda',
    language: 'Deutsch',
  })!;
  assert.deepEqual(input.areas, []);
  assert.equal(input.vehicleMakeId, 'skoda');
  assert.equal(input.language, 'Deutsch');
  assert.throws(() => parsePublicGarageSearch({ all: 'true', vehicleMake: 'unknown' }));
  assert.throws(() => parsePublicGarageSearch({ all: 'true', language: 'x'.repeat(41) }));
});
