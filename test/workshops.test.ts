import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { AccessStore, type WorkshopProfileInput } from '../src/server/access';
import { createServer } from '../src/server/app';

const profile: WorkshopProfileInput = {
  contactPerson: 'Fiktive Ansprechperson',
  contactPhone: '+383 44 000 000',
  description: 'Fiktive Werkstatt für lokale Entwicklungstests.',
  languages: ['Deutsch', 'Shqip'],
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

async function createWorkshop(
  app: ReturnType<typeof createServer>,
  owner: { csrfToken: string; sessionId: string },
  workshopProfile = profile,
) {
  const response = await app.inject({
    headers: headers(owner, true),
    method: 'POST',
    payload: { consentVersion: 'workshop-onboarding-v1', profile: workshopProfile },
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

test('a workshop is private until an admin releases it, while qualification stays self-reported', async () => {
  const { admin, app, foreign, owner } = setup();
  try {
    const workshopId = await createWorkshop(app, owner);
    const hidden = await app.inject({ method: 'GET', url: `/api/public/garages/${workshopId}` });
    const foreignPrivate = await app.inject({
      headers: headers(foreign),
      method: 'GET',
      url: `/api/garages/${workshopId}`,
    });
    const prematurePublication = await app.inject({
      headers: headers(admin, true),
      method: 'POST',
      payload: { decision: 'published', verification: fullyVerified },
      url: `/api/admin/garages/${workshopId}/decision`,
    });
    const submitted = await app.inject({
      headers: headers(owner, true),
      method: 'POST',
      url: `/api/garages/${workshopId}/submit-for-review`,
    });
    const published = await app.inject({
      headers: headers(admin, true),
      method: 'POST',
      payload: { decision: 'published', verification: fullyVerified },
      url: `/api/admin/garages/${workshopId}/decision`,
    });
    const publicProfile = await app.inject({
      method: 'GET',
      url: `/api/public/garages/${workshopId}`,
    });

    assert.equal(hidden.statusCode, 404);
    assert.equal(foreignPrivate.statusCode, 403);
    assert.equal(prematurePublication.statusCode, 409);
    assert.equal(submitted.statusCode, 204);
    assert.equal(published.statusCode, 204);
    assert.equal(publicProfile.statusCode, 200);
    assert.deepEqual(publicProfile.json(), {
      contact: { phone: '+383 44 000 001' },
      description: 'Fiktive Werkstatt für lokale Entwicklungstests.',
      id: workshopId,
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

test('a possible public duplicate is shown but cannot be taken over by another applicant', async () => {
  const { admin, app, foreign, owner } = setup();
  try {
    const workshopId = await createWorkshop(app, owner);
    await app.inject({
      headers: headers(owner, true),
      method: 'POST',
      url: `/api/garages/${workshopId}/submit-for-review`,
    });
    await app.inject({
      headers: headers(admin, true),
      method: 'POST',
      payload: { decision: 'published', verification: fullyVerified },
      url: `/api/admin/garages/${workshopId}/decision`,
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
      url: `/api/garages/${workshopId}`,
    });
    const duplicate = await app.inject({
      headers: headers(foreign, true),
      method: 'POST',
      payload: { consentVersion: 'workshop-onboarding-v1', profile },
      url: '/api/garages',
    });

    assert.equal(candidates.statusCode, 200);
    assert.deepEqual(
      candidates.json().candidates.map((candidate: { id: string }) => candidate.id),
      [workshopId],
    );
    assert.equal(takeover.statusCode, 403);
    assert.equal(duplicate.statusCode, 409);
    assert.deepEqual(
      duplicate.json().candidates.map((candidate: { id: string }) => candidate.id),
      [workshopId],
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
        consentVersion: 'workshop-onboarding-v1',
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
        consentVersion: 'workshop-onboarding-v1',
        profile,
      },
      url: '/api/admin/garages/assisted-onboarding',
    });
    const workshopId = assisted.json().id as string;
    const assistedOwner = store.createSession('assisted-owner');
    const document = await app.inject({
      headers: headers(assistedOwner, true),
      method: 'POST',
      url: `/api/garages/${workshopId}/verification-document-grants`,
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
      subjectId: workshopId,
      type: 'workshop-consent-recorded',
    });
  } finally {
    await app.close();
  }
});

test('photos are normalized without metadata and only public after profile and photo release', async () => {
  const { admin, app, owner } = setup();
  try {
    const workshopId = await createWorkshop(app, owner);
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
      url: `/api/garages/${workshopId}/photos`,
    });
    const photoId = uploaded.json().id as string;
    const privatePhoto = await app.inject({
      method: 'GET',
      url: `/api/public/garages/${workshopId}/photos/${photoId}`,
    });
    await app.inject({
      headers: headers(admin, true),
      method: 'POST',
      payload: { approved: true },
      url: `/api/admin/garages/${workshopId}/photos/${photoId}/decision`,
    });
    await app.inject({
      headers: headers(owner, true),
      method: 'POST',
      url: `/api/garages/${workshopId}/submit-for-review`,
    });
    await app.inject({
      headers: headers(admin, true),
      method: 'POST',
      payload: { decision: 'published', verification: fullyVerified },
      url: `/api/admin/garages/${workshopId}/decision`,
    });
    const publicPhoto = await app.inject({
      method: 'GET',
      url: `/api/public/garages/${workshopId}/photos/${photoId}`,
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
    const removed = await app.inject({ method: 'GET', url: '/api/public/workshops' });
    assert.equal(removed.statusCode, 404);
  } finally {
    await app.close();
  }
});
