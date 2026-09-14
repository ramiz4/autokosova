import assert from 'node:assert/strict';
import test from 'node:test';
import { AccessStore, type GarageProfileInput } from '../src/server/access';
import { createServer } from '../src/server/app';

const garageProfile: GarageProfileInput = {
  contactPerson: 'Fiktive Ansprechperson',
  contactPhone: '+383 44 000 110',
  languages: ['Deutsch', 'Shqip'],
  locationPoint: { latitude: 42.67272, longitude: 21.16688 },
  name: 'Fiktive Bewertungswerkstatt',
  placeId: 'xk-pristina',
  publicPhone: '+383 44 000 111',
  selfReportedSpecializations: [],
  serviceCategoryIds: ['bremsen', 'reifen'],
  vehicleMakeIds: [],
};

const fullyCheckedEvidence = {
  serviceMatches: true,
  visitMonthMatches: true,
  garageMatches: true,
};

function headers(session: { csrfToken: string; sessionId: string }, write = false) {
  return {
    cookie: `autokosova_session=${session.sessionId}; autokosova_csrf=${session.csrfToken}`,
    ...(write ? { 'x-csrf-token': session.csrfToken } : {}),
  };
}

function setup() {
  const store = new AccessStore();
  store.addRole('admin', 'admin');
  store.addRole('moderator', 'moderator');
  const app = createServer({ accessStore: store });
  return {
    admin: store.createSession('admin'),
    app,
    customer: store.createSession('customer'),
    foreignCustomer: store.createSession('foreign-customer'),
    moderator: store.createSession('moderator'),
    store,
    garageOwner: store.createSession('garage-owner'),
  };
}

async function publishGarage(
  app: ReturnType<typeof createServer>,
  admin: { csrfToken: string; sessionId: string },
  garageOwner: { csrfToken: string; sessionId: string },
) {
  const created = await app.inject({
    headers: headers(garageOwner, true),
    method: 'POST',
    payload: { consentVersion: 'review-test-v1', profile: garageProfile },
    url: '/api/garages',
  });
  const garageId = created.json().id as string;
  await app.inject({
    headers: headers(garageOwner, true),
    method: 'POST',
    url: `/api/garages/${garageId}/submit-for-review`,
  });
  const decision = await app.inject({
    headers: headers(admin, true),
    method: 'POST',
    payload: {
      decision: 'published',
      verification: {
        companyDocument: 'verified',
        contactPerson: 'verified',
        location: 'verified',
        phone: 'verified',
      },
    },
    url: `/api/admin/garages/${garageId}/decision`,
  });
  assert.equal(created.statusCode, 201);
  assert.equal(decision.statusCode, 204);
  return garageId;
}

async function uploadEvidence(
  app: ReturnType<typeof createServer>,
  session: { csrfToken: string; sessionId: string },
) {
  const upload = await app.inject({
    headers: headers(session, true),
    method: 'POST',
    payload: { contentType: 'application/pdf', sizeBytes: 1024 },
    url: '/api/files/upload-grants',
  });
  assert.equal(upload.statusCode, 201);
  return upload.json().fileId as string;
}

function reviewPayload(
  garageId: string,
  evidenceFileId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    communication: 1,
    evidenceFileId,
    evidenceKind: 'invoice',
    priceTransparency: 1,
    punctuality: 1,
    serviceCategoryId: 'bremsen',
    text: 'Die negative fiktive Bewertung beschreibt nachvollziehbar die ausgeführte Arbeit.',
    vehicleMakeId: 'skoda',
    visitMonth: '2026-08',
    workQuality: 1,
    garageId,
    ...overrides,
  };
}

async function submitAndPublish(
  app: ReturnType<typeof createServer>,
  sessions: {
    admin: { csrfToken: string; sessionId: string };
    customer: { csrfToken: string; sessionId: string };
    moderator: { csrfToken: string; sessionId: string };
  },
  garageId: string,
  evidenceFileId: string,
  overrides: Record<string, unknown> = {},
) {
  const submitted = await app.inject({
    headers: headers(sessions.customer, true),
    method: 'POST',
    payload: reviewPayload(garageId, evidenceFileId, overrides),
    url: '/api/me/reviews',
  });
  const reviewId = submitted.json().id as string;
  const assigned = await app.inject({
    headers: headers(sessions.admin, true),
    method: 'POST',
    payload: { moderatorUserId: 'moderator' },
    url: `/api/admin/reviews/${reviewId}/assign`,
  });
  const published = await app.inject({
    headers: headers(sessions.moderator, true),
    method: 'POST',
    payload: { checklist: fullyCheckedEvidence, decision: 'published' },
    url: `/api/admin/reviews/${reviewId}/decision`,
  });
  assert.equal(submitted.statusCode, 201);
  assert.equal(assigned.statusCode, 204);
  assert.equal(published.statusCode, 204);
  return reviewId;
}

test('a negative review with an invoice can be published without garage confirmation or a garage veto', async () => {
  const { admin, app, customer, foreignCustomer, moderator, garageOwner } = setup();
  try {
    const garageId = await publishGarage(app, admin, garageOwner);
    const evidenceFileId = await uploadEvidence(app, customer);
    const submitted = await app.inject({
      headers: headers(customer, true),
      method: 'POST',
      payload: reviewPayload(garageId, evidenceFileId),
      url: '/api/me/reviews',
    });
    const reviewId = submitted.json().id as string;
    const duplicate = await app.inject({
      headers: headers(customer, true),
      method: 'POST',
      payload: reviewPayload(garageId, evidenceFileId, { visitMonth: '2026-07' }),
      url: '/api/me/reviews',
    });
    const foreignEvidence = await app.inject({
      headers: headers(foreignCustomer),
      method: 'GET',
      url: `/api/reviews/${reviewId}/evidence/download-grant`,
    });
    const garageEvidence = await app.inject({
      headers: headers(garageOwner),
      method: 'GET',
      url: `/api/reviews/${reviewId}/evidence/download-grant`,
    });
    const assigned = await app.inject({
      headers: headers(admin, true),
      method: 'POST',
      payload: { moderatorUserId: 'moderator' },
      url: `/api/admin/reviews/${reviewId}/assign`,
    });
    const moderatorEvidence = await app.inject({
      headers: headers(moderator),
      method: 'GET',
      url: `/api/reviews/${reviewId}/evidence/download-grant`,
    });
    const published = await app.inject({
      headers: headers(moderator, true),
      method: 'POST',
      payload: { checklist: fullyCheckedEvidence, decision: 'published' },
      url: `/api/admin/reviews/${reviewId}/decision`,
    });
    const garageVeto = await app.inject({
      headers: headers(garageOwner, true),
      method: 'POST',
      payload: {
        checklist: fullyCheckedEvidence,
        decision: 'rejected',
        rejectionReason: 'other_policy',
      },
      url: `/api/admin/reviews/${reviewId}/decision`,
    });
    const garageResponse = await app.inject({
      headers: headers(garageOwner, true),
      method: 'POST',
      payload: { text: 'Wir nehmen die fiktive Rückmeldung ernst und prüfen die Nacharbeit.' },
      url: `/api/garages/${garageId}/reviews/${reviewId}/response`,
    });
    const publicReviews = await app.inject({
      method: 'GET',
      url: `/api/public/garages/${garageId}/reviews?serviceCategoryId=bremsen&vehicleMakeId=skoda`,
    });

    assert.equal(submitted.statusCode, 201);
    assert.equal(submitted.json().publicationState, 'submitted');
    assert.equal(duplicate.statusCode, 409);
    assert.equal(foreignEvidence.statusCode, 404);
    assert.equal(garageEvidence.statusCode, 404);
    assert.equal(assigned.statusCode, 204);
    assert.equal(moderatorEvidence.statusCode, 200);
    assert.equal(published.statusCode, 204);
    assert.equal(garageVeto.statusCode, 403);
    assert.equal(garageResponse.statusCode, 204);
    assert.equal(publicReviews.statusCode, 200);
    assert.deepEqual(publicReviews.json().reviews[0].evidence, {
      label: 'Besuch belegt',
      state: 'verified',
    });
    assert.equal(publicReviews.json().reviews[0].ratings.overall, 1);
    assert.equal(publicReviews.json().reviews[0].garageResponse.text.includes('Nacharbeit'), true);
    assert.equal(JSON.stringify(publicReviews.json()).includes(evidenceFileId), false);
    assert.equal(JSON.stringify(publicReviews.json()).includes('customer'), false);
  } finally {
    await app.close();
  }
});

test('rejection remains private with a reason, while only published reviews change aggregates and search', async () => {
  const { admin, app, customer, moderator, garageOwner } = setup();
  try {
    const garageId = await publishGarage(app, admin, garageOwner);
    const rejectedEvidence = await uploadEvidence(app, customer);
    const rejected = await app.inject({
      headers: headers(customer, true),
      method: 'POST',
      payload: reviewPayload(garageId, rejectedEvidence),
      url: '/api/me/reviews',
    });
    const rejectedId = rejected.json().id as string;
    await app.inject({
      headers: headers(admin, true),
      method: 'POST',
      payload: { moderatorUserId: 'moderator' },
      url: `/api/admin/reviews/${rejectedId}/assign`,
    });
    const rejectedDecision = await app.inject({
      headers: headers(moderator, true),
      method: 'POST',
      payload: {
        checklist: { serviceMatches: false, visitMonthMatches: true, garageMatches: true },
        decision: 'rejected',
        rejectionReason: 'evidence_not_sufficient',
      },
      url: `/api/admin/reviews/${rejectedId}/decision`,
    });
    const ownAfterRejection = await app.inject({
      headers: headers(customer),
      method: 'GET',
      url: '/api/me/reviews',
    });
    const publishedId = await submitAndPublish(
      app,
      { admin, customer, moderator },
      garageId,
      await uploadEvidence(app, customer),
      { visitMonth: '2026-06' },
    );
    const secondPublishedId = await submitAndPublish(
      app,
      { admin, customer, moderator },
      garageId,
      await uploadEvidence(app, customer),
      {
        serviceCategoryId: 'reifen',
        text: 'Die zweite fiktive Bewertung beschreibt den separat nachvollziehbaren Reifenservice.',
        vehicleMakeId: 'volkswagen',
        visitMonth: '2026-07',
      },
    );
    const filtered = await app.inject({
      method: 'GET',
      url: `/api/public/garages/${garageId}/reviews?serviceCategoryId=reifen&vehicleMakeId=volkswagen`,
    });
    const profile = await app.inject({ method: 'GET', url: `/api/public/garages/${garageId}` });
    const search = await app.inject({
      method: 'GET',
      url: '/api/public/search?places=xk-pristina%3A5&service=bremsen',
    });
    const update = await app.inject({
      headers: headers(customer, true),
      method: 'POST',
      payload: {
        kind: 'rework',
        text: 'Die fiktive Nacharbeit wurde später nachvollziehbar ergänzt.',
      },
      url: `/api/me/reviews/${publishedId}/updates`,
    });
    const publicAfterUpdate = await app.inject({
      method: 'GET',
      url: `/api/public/garages/${garageId}/reviews`,
    });

    assert.equal(rejectedDecision.statusCode, 204);
    assert.equal(ownAfterRejection.json().reviews[0].publicationState, 'rejected');
    assert.equal(ownAfterRejection.json().reviews[0].rejectionReason, 'evidence_not_sufficient');
    assert.equal(filtered.json().reviews.length, 1);
    assert.equal(filtered.json().reviews[0].id, secondPublishedId);
    assert.deepEqual(profile.json().reviewSummary, {
      averageRating: 1,
      label: '1.0 von 5 · 2 Bewertungen',
      latestVisitMonth: '2026-07',
      reviewCount: 2,
      state: 'available',
      verifiedVisitCount: 2,
    });
    assert.equal(search.json().results[0].reviewSummary.reviewCount, 2);
    assert.equal(update.statusCode, 204);
    assert.equal(
      publicAfterUpdate.json().reviews.find((review: { id: string }) => review.id === publishedId)
        .updates[0].kind,
      'rework',
    );
  } finally {
    await app.close();
  }
});

test('retention deletion makes private evidence unavailable but preserves the explained historic visit marker', async () => {
  const { admin, app, customer, moderator, garageOwner } = setup();
  try {
    const garageId = await publishGarage(app, admin, garageOwner);
    const evidenceFileId = await uploadEvidence(app, customer);
    const reviewId = await submitAndPublish(
      app,
      { admin, customer, moderator },
      garageId,
      evidenceFileId,
    );
    const beforeDeletion = await app.inject({
      headers: headers(customer),
      method: 'GET',
      url: `/api/reviews/${reviewId}/evidence/download-grant`,
    });
    const deleted = await app.inject({
      headers: headers(admin, true),
      method: 'POST',
      url: `/api/admin/reviews/${reviewId}/evidence/delete-after-retention`,
    });
    const afterDeletion = await app.inject({
      headers: headers(customer),
      method: 'GET',
      url: `/api/reviews/${reviewId}/evidence/download-grant`,
    });
    const genericAfterDeletion = await app.inject({
      headers: headers(customer),
      method: 'GET',
      url: `/api/files/${evidenceFileId}/download-grant`,
    });
    const publicReviews = await app.inject({
      method: 'GET',
      url: `/api/public/garages/${garageId}/reviews`,
    });

    assert.equal(beforeDeletion.statusCode, 200);
    assert.equal(deleted.statusCode, 204);
    assert.equal(afterDeletion.statusCode, 404);
    assert.equal(genericAfterDeletion.statusCode, 404);
    assert.deepEqual(publicReviews.json().reviews[0].evidence, {
      label: 'Besuch belegt',
      state: 'verified',
    });
  } finally {
    await app.close();
  }
});
