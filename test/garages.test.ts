import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { AccessStore, type GarageProfileInput } from '../src/server/access';
import { createServer } from '../src/server/app';
import { LOCAL_DEMO_PHOTOS } from '../src/shared/local-demo';

const profile: GarageProfileInput = {
  contactPerson: 'Fiktive Ansprechperson',
  contactPhone: '+383 44 000 000',
  description: 'Fiktive Werkstatt für lokale Entwicklungstests.',
  languages: ['Deutsch', 'Shqip'],
  locationPoint: { latitude: 42.67272, longitude: 21.16688 },
  name: 'Fiktive Werkstatt Prishtina',
  placeId: 'xk-pristina',
  publicPhone: '+383 44 000 001',
  selfReportedSpecializations: ['Elektrodiagnose'],
  serviceCategoryIds: ['elektronik-diagnose'],
  vehicleMakeIds: ['volkswagen'],
};

function setup() {
  const store = new AccessStore();
  store.addRole('admin', 'admin');
  const admin = store.createSession('admin');
  const owner = store.createSession('owner');
  const foreign = store.createSession('foreign');
  const app = createServer({ accessStore: store });
  return { admin, app, foreign, owner, store };
}

function headers(session: { csrfToken: string; sessionId: string }, write = false) {
  return {
    cookie: `autokosova_session=${session.sessionId}; autokosova_csrf=${session.csrfToken}`,
    ...(write ? { 'x-csrf-token': session.csrfToken } : {}),
  };
}

async function createGarage(
  app: ReturnType<typeof createServer>,
  owner: { csrfToken: string; sessionId: string },
  garageProfile = profile,
) {
  const response = await app.inject({
    headers: headers(owner, true),
    method: 'POST',
    payload: { consentVersion: 'garage-onboarding-v1', profile: garageProfile },
    url: '/api/garages',
  });
  assert.equal(response.statusCode, 201);
  return response.json().id as string;
}

const fullyVerified = {
  companyDocument: 'verified',
  contactPerson: 'verified',
  location: 'verified',
  phone: 'verified',
} as const;

test('a garage is private until an admin releases it, while qualification stays self-reported', async () => {
  const { admin, app, foreign, owner } = setup();
  try {
    const garageId = await createGarage(app, owner);
    const hidden = await app.inject({ method: 'GET', url: `/api/public/garages/${garageId}` });
    const foreignPrivate = await app.inject({
      headers: headers(foreign),
      method: 'GET',
      url: `/api/garages/${garageId}`,
    });
    const prematurePublication = await app.inject({
      headers: headers(admin, true),
      method: 'POST',
      payload: { decision: 'published', verification: fullyVerified },
      url: `/api/admin/garages/${garageId}/decision`,
    });
    const submitted = await app.inject({
      headers: headers(owner, true),
      method: 'POST',
      url: `/api/garages/${garageId}/submit-for-review`,
    });
    const published = await app.inject({
      headers: headers(admin, true),
      method: 'POST',
      payload: { decision: 'published', verification: fullyVerified },
      url: `/api/admin/garages/${garageId}/decision`,
    });
    const publicProfile = await app.inject({
      method: 'GET',
      url: `/api/public/garages/${garageId}`,
    });
    const profileFromSearch = await app.inject({
      method: 'GET',
      url: `/api/public/garages/${garageId}?places=xk-pristina:5`,
    });
    const invalidSearchContext = await app.inject({
      method: 'GET',
      url: `/api/public/garages/${garageId}?places=xk-pristina:101`,
    });

    assert.equal(hidden.statusCode, 404);
    assert.equal(foreignPrivate.statusCode, 403);
    assert.equal(prematurePublication.statusCode, 409);
    assert.equal(submitted.statusCode, 204);
    assert.equal(published.statusCode, 204);
    assert.equal(publicProfile.statusCode, 200);
    assert.equal(profileFromSearch.statusCode, 200);
    assert.deepEqual(profileFromSearch.json().searchContext, {
      distanceKm: 0,
      matchingPlace: { id: 'xk-pristina', label: 'Prishtina' },
    });
    assert.equal(JSON.stringify(profileFromSearch.json()).includes('latitude'), false);
    assert.equal(JSON.stringify(profileFromSearch.json()).includes('longitude'), false);
    assert.equal(invalidSearchContext.statusCode, 400);
    assert.deepEqual(publicProfile.json(), {
      contact: { phone: '+383 44 000 001' },
      description: 'Fiktive Werkstatt für lokale Entwicklungstests.',
      id: garageId,
      languages: ['Deutsch', 'Shqip'],
      name: 'Fiktive Werkstatt Prishtina',
      photoIds: [],
      placeId: 'xk-pristina',
      reviewSummary: {
        label: 'Noch keine Bewertungen',
        reviewCount: 0,
        state: 'unavailable',
        verifiedVisitCount: 0,
      },
      selfReportedSpecializations: ['Elektrodiagnose'],
      serviceCategoryIds: ['elektronik-diagnose'],
      vehicleMakeIds: ['volkswagen'],
      verificationLabel: 'Unternehmensdaten geprüft',
    });
    assert.equal(JSON.stringify(publicProfile.json()).includes('Ansprechperson'), false);
  } finally {
    await app.close();
  }
});

test('WhatsApp availability is explicit and requires a public phone number', async () => {
  const { admin, app, owner } = setup();
  try {
    const missingPhone = await app.inject({
      headers: headers(owner, true),
      method: 'POST',
      payload: {
        consentVersion: 'garage-onboarding-v1',
        profile: { ...profile, publicPhone: undefined, publicWhatsapp: true },
      },
      url: '/api/garages',
    });
    const explicit = await app.inject({
      headers: headers(owner, true),
      method: 'POST',
      payload: {
        consentVersion: 'garage-onboarding-v1',
        profile: { ...profile, name: 'Fiktive WhatsApp-Werkstatt', publicWhatsapp: true },
      },
      url: '/api/garages',
    });
    assert.equal(missingPhone.statusCode, 422);
    assert.equal(explicit.statusCode, 201);
    const garageId = explicit.json().id as string;
    await app.inject({
      headers: headers(owner, true),
      method: 'POST',
      url: `/api/garages/${garageId}/submit-for-review`,
    });
    await app.inject({
      headers: headers(admin, true),
      method: 'POST',
      payload: { decision: 'published', verification: fullyVerified },
      url: `/api/admin/garages/${garageId}/decision`,
    });
    const published = await app.inject({
      method: 'GET',
      url: `/api/public/garages/${garageId}`,
    });
    assert.deepEqual(published.json().contact, {
      phone: '+383 44 000 001',
      whatsapp: true,
    });
  } finally {
    await app.close();
  }
});

test('a possible public duplicate is shown but cannot be taken over by another applicant', async () => {
  const { admin, app, foreign, owner } = setup();
  try {
    const garageId = await createGarage(app, owner);
    await app.inject({
      headers: headers(owner, true),
      method: 'POST',
      url: `/api/garages/${garageId}/submit-for-review`,
    });
    await app.inject({
      headers: headers(admin, true),
      method: 'POST',
      payload: { decision: 'published', verification: fullyVerified },
      url: `/api/admin/garages/${garageId}/decision`,
    });
    const candidates = await app.inject({
      headers: headers(foreign),
      method: 'GET',
      url: '/api/garages/duplicate-candidates?name=Fiktive%20Werkstatt%20Prishtina&placeId=xk-pristina',
    });
    const takeover = await app.inject({
      headers: headers(foreign, true),
      method: 'PUT',
      payload: { ...profile, description: 'Fremder Übernahmeversuch' },
      url: `/api/garages/${garageId}`,
    });
    const duplicate = await app.inject({
      headers: headers(foreign, true),
      method: 'POST',
      payload: { consentVersion: 'garage-onboarding-v1', profile },
      url: '/api/garages',
    });

    assert.equal(candidates.statusCode, 200);
    assert.deepEqual(
      candidates.json().candidates.map((candidate: { id: string }) => candidate.id),
      [garageId],
    );
    assert.equal(takeover.statusCode, 403);
    assert.equal(duplicate.statusCode, 409);
    assert.deepEqual(
      duplicate.json().candidates.map((candidate: { id: string }) => candidate.id),
      [garageId],
    );
  } finally {
    await app.close();
  }
});

test('admin-assisted onboarding requires documented consent and private verification documents stay private', async () => {
  const { admin, app, foreign, owner, store } = setup();
  try {
    const denied = await app.inject({
      headers: headers(owner, true),
      method: 'POST',
      payload: {
        applicantUserId: 'assisted-owner',
        consentSource: 'documented_support_request',
        consentVersion: 'garage-onboarding-v1',
        profile,
      },
      url: '/api/admin/garages/assisted-onboarding',
    });
    const assisted = await app.inject({
      headers: headers(admin, true),
      method: 'POST',
      payload: {
        applicantUserId: 'assisted-owner',
        consentSource: 'documented_support_request',
        consentVersion: 'garage-onboarding-v1',
        profile,
      },
      url: '/api/admin/garages/assisted-onboarding',
    });
    const garageId = assisted.json().id as string;
    const assistedOwner = store.createSession('assisted-owner');
    const document = await app.inject({
      headers: headers(assistedOwner, true),
      method: 'POST',
      url: `/api/garages/${garageId}/verification-document-grants`,
    });
    const foreignDownload = await app.inject({
      headers: headers(foreign),
      method: 'GET',
      url: `/api/files/${document.json().fileId}/download-grant`,
    });

    assert.equal(denied.statusCode, 403);
    assert.equal(assisted.statusCode, 201);
    assert.equal(document.statusCode, 201);
    assert.equal(foreignDownload.statusCode, 403);
    assert.deepEqual(store.auditEvents.at(-1), {
      actorUserId: 'admin',
      subjectId: garageId,
      type: 'garage-consent-recorded',
    });
  } finally {
    await app.close();
  }
});

test('photos are normalized without metadata and only public after profile and photo release', async () => {
  const { admin, app, owner } = setup();
  try {
    const garageId = await createGarage(app, owner);
    const source = await sharp({
      create: { background: { b: 30, g: 20, r: 10 }, channels: 3, height: 2000, width: 2400 },
    })
      .withExif({ IFD0: { Copyright: 'synthetic-private-metadata' } })
      .jpeg()
      .toBuffer();
    const uploaded = await app.inject({
      headers: { ...headers(owner, true), 'content-type': 'image/jpeg' },
      method: 'POST',
      payload: source,
      url: `/api/garages/${garageId}/photos`,
    });
    const photoId = uploaded.json().id as string;
    const privatePhoto = await app.inject({
      method: 'GET',
      url: `/api/public/garages/${garageId}/photos/${photoId}`,
    });
    await app.inject({
      headers: headers(admin, true),
      method: 'POST',
      payload: { approved: true },
      url: `/api/admin/garages/${garageId}/photos/${photoId}/decision`,
    });
    await app.inject({
      headers: headers(owner, true),
      method: 'POST',
      url: `/api/garages/${garageId}/submit-for-review`,
    });
    await app.inject({
      headers: headers(admin, true),
      method: 'POST',
      payload: { decision: 'published', verification: fullyVerified },
      url: `/api/admin/garages/${garageId}/decision`,
    });
    const publicPhoto = await app.inject({
      method: 'GET',
      url: `/api/public/garages/${garageId}/photos/${photoId}`,
    });
    const metadata = await sharp(publicPhoto.rawPayload).metadata();

    assert.equal(uploaded.statusCode, 201);
    assert.equal(uploaded.json().contentType, 'image/webp');
    assert.equal(uploaded.json().width, 1600);
    assert.equal(privatePhoto.statusCode, 404);
    assert.equal(publicPhoto.statusCode, 200);
    assert.equal(publicPhoto.headers['content-type'], 'image/webp');
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.xmp, undefined);
    assert.equal(metadata.iptc, undefined);
  } finally {
    await app.close();
  }
});

test('public API uses the garages route and collection name', async () => {
  const app = createServer();
  try {
    const response = await app.inject({ method: 'GET', url: '/api/public/garages' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(Object.keys(response.json()), ['garages']);
    const singular = await app.inject({ method: 'GET', url: '/api/public/garage' });
    assert.equal(singular.statusCode, 404);
  } finally {
    await app.close();
  }
});

test('demo gallery assets require a published demo profile and a known photo id', async () => {
  const searchStore = {
    getPublicGarage: (garageId: string) =>
      garageId === 'demo-published' ? ({ id: garageId } as never) : undefined,
    listPublicGarageIds: () => [],
    searchPublicGarages: () => {
      throw new Error('Not used');
    },
  };
  const app = createServer({ searchStore });
  try {
    const photo = await app.inject({
      method: 'GET',
      url: `/api/public/garages/demo-published/photos/${LOCAL_DEMO_PHOTOS[0].id}`,
    });
    const missingProfile = await app.inject({
      method: 'GET',
      url: `/api/public/garages/demo-missing/photos/${LOCAL_DEMO_PHOTOS[0].id}`,
    });
    const unknownPhoto = await app.inject({
      method: 'GET',
      url: '/api/public/garages/demo-published/photos/not-known',
    });
    assert.equal(photo.statusCode, 302);
    assert.equal(photo.headers.location, `/images/demo/garages/${LOCAL_DEMO_PHOTOS[0].file}`);
    assert.equal(missingProfile.statusCode, 404);
    assert.equal(unknownPhoto.statusCode, 404);
  } finally {
    await app.close();
  }
});
