import assert from 'node:assert/strict';
import test from 'node:test';
import { AccessStore, type GarageProfileInput } from '../src/server/access';
import { createServer } from '../src/server/app';

const profile: GarageProfileInput = {
  contactPerson: 'Fiktive Ansprechperson',
  contactPhone: '+383 44 000 210',
  languages: ['Deutsch', 'Shqip'],
  name: 'Fiktive Moderationswerkstatt',
  placeId: 'xk-pristina',
  publicPhone: '+383 44 000 211',
  selfReportedSpecializations: [],
  serviceCategoryIds: ['bremsen'],
  vehicleMakeIds: [],
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
    moderator: store.createSession('moderator'),
    store,
    garageOwner: store.createSession('garage-owner'),
  };
}

async function createPublishedReview(
  app: ReturnType<typeof createServer>,
  sessions: {
    admin: { csrfToken: string; sessionId: string };
    customer: { csrfToken: string; sessionId: string };
    moderator: { csrfToken: string; sessionId: string };
    garageOwner: { csrfToken: string; sessionId: string };
  },
) {
  const garage = await app.inject({
    headers: headers(sessions.garageOwner, true),
    method: 'POST',
    payload: { consentVersion: 'moderation-test-v1', profile },
    url: '/api/garages',
  });
  const garageId = garage.json().id as string;
  await app.inject({
    headers: headers(sessions.garageOwner, true),
    method: 'POST',
    url: `/api/garages/${garageId}/submit-for-review`,
  });
  const garageDecision = await app.inject({
    headers: headers(sessions.admin, true),
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
  const upload = await app.inject({
    headers: headers(sessions.customer, true),
    method: 'POST',
    payload: { contentType: 'application/pdf', sizeBytes: 1024 },
    url: '/api/files/upload-grants',
  });
  const review = await app.inject({
    headers: headers(sessions.customer, true),
    method: 'POST',
    payload: {
      communication: 1,
      evidenceFileId: upload.json().fileId,
      evidenceKind: 'invoice',
      priceTransparency: 1,
      punctuality: 1,
      serviceCategoryId: 'bremsen',
      text: 'Die negative fiktive Bewertung beschreibt eine nachvollziehbare Erfahrung.',
      visitMonth: '2026-08',
      workQuality: 1,
      garageId,
    },
    url: '/api/me/reviews',
  });
  const reviewId = review.json().id as string;
  await app.inject({
    headers: headers(sessions.admin, true),
    method: 'POST',
    payload: { moderatorUserId: 'moderator' },
    url: `/api/admin/reviews/${reviewId}/assign`,
  });
  const reviewDecision = await app.inject({
    headers: headers(sessions.moderator, true),
    method: 'POST',
    payload: {
      checklist: { serviceMatches: true, visitMonthMatches: true, garageMatches: true },
      decision: 'published',
    },
    url: `/api/admin/reviews/${reviewId}/decision`,
  });
  assert.equal(garageDecision.statusCode, 204);
  assert.equal(reviewDecision.statusCode, 204);
  return { evidenceFileId: upload.json().fileId as string, reviewId, garageId };
}

test('reports do not automatically remove criticism; only an assigned, auditable action can hide and restore it', async () => {
  const { admin, app, customer, moderator, store, garageOwner } = setup();
  try {
    const { reviewId, garageId } = await createPublishedReview(app, {
      admin,
      customer,
      moderator,
      garageOwner,
    });
    const report = await app.inject({
      headers: headers(customer, true),
      method: 'POST',
      payload: {
        category: 'personal_data',
        details:
          'Fiktive Meldung: Bitte prüfen, ob die öffentliche Erfahrung private Daten enthält.',
        subjectId: reviewId,
        subjectType: 'review',
      },
      url: '/api/me/content-reports',
    });
    const caseId = report.json().caseId as string;
    const duplicateReport = await app.inject({
      headers: headers(customer, true),
      method: 'POST',
      payload: {
        category: 'personal_data',
        details:
          'Dieselbe fiktive Meldung darf nicht mehrfach eine Moderationswarteschlange füllen.',
        subjectId: reviewId,
        subjectType: 'review',
      },
      url: '/api/me/content-reports',
    });
    const stillPublic = await app.inject({
      method: 'GET',
      url: `/api/public/garages/${garageId}/reviews`,
    });
    const unassignedQueue = await app.inject({
      headers: headers(moderator),
      method: 'GET',
      url: '/api/admin/moderation/queue',
    });
    const adminCase = await app.inject({
      headers: headers(admin),
      method: 'GET',
      url: `/api/admin/moderation/cases/${caseId}`,
    });
    const assigned = await app.inject({
      headers: headers(admin, true),
      method: 'POST',
      payload: { moderatorUserId: 'moderator' },
      url: `/api/admin/moderation/cases/${caseId}/assign`,
    });
    const hidden = await app.inject({
      headers: headers(moderator, true),
      method: 'POST',
      payload: { action: 'temporarily_hide', reasonCode: 'private_data_exposure' },
      url: `/api/admin/moderation/cases/${caseId}/action`,
    });
    const hiddenPublic = await app.inject({
      method: 'GET',
      url: `/api/public/garages/${garageId}/reviews`,
    });
    const restored = await app.inject({
      headers: headers(moderator, true),
      method: 'POST',
      payload: { action: 'restore', reasonCode: 'no_violation' },
      url: `/api/admin/moderation/cases/${caseId}/action`,
    });
    const restoredPublic = await app.inject({
      method: 'GET',
      url: `/api/public/garages/${garageId}/reviews`,
    });
    const appeal = await app.inject({
      headers: headers(customer, true),
      method: 'POST',
      payload: {
        caseId,
        message:
          'Die fiktive Person bittet um eine nachvollziehbare erneute Prüfung der Entscheidung.',
      },
      url: '/api/me/moderation-appeals',
    });

    assert.equal(report.statusCode, 201);
    assert.equal(duplicateReport.statusCode, 409);
    assert.equal(stillPublic.json().reviews.length, 1);
    assert.deepEqual(unassignedQueue.json().cases, []);
    assert.equal(adminCase.json().priority, 'high');
    assert.equal(adminCase.json().report.details.includes('private Daten'), true);
    assert.equal(assigned.statusCode, 204);
    assert.equal(hidden.statusCode, 200);
    assert.equal(hiddenPublic.json().reviews.length, 0);
    assert.equal(restored.statusCode, 200);
    assert.equal(restoredPublic.json().reviews.length, 1);
    assert.equal(appeal.statusCode, 201);
    assert.equal(JSON.stringify(store.auditEvents).includes('private Daten enthält'), false);
  } finally {
    await app.close();
  }
});

test('a policy-gated deletion exports and removes private data, sessions and uploads while retaining only an anonymized public review', async () => {
  const { admin, app, customer, moderator, store, garageOwner } = setup();
  try {
    const { evidenceFileId, reviewId, garageId } = await createPublishedReview(app, {
      admin,
      customer,
      moderator,
      garageOwner,
    });
    const exported = await app.inject({
      headers: headers(customer),
      method: 'GET',
      url: '/api/me/data-export',
    });
    const requestedWithoutPolicy = await app.inject({
      headers: headers(customer, true),
      method: 'POST',
      url: '/api/me/data-deletion-requests',
    });
    const requestId = requestedWithoutPolicy.json().id as string;
    const policy = await app.inject({
      headers: headers(admin, true),
      method: 'POST',
      payload: {
        auditLogRetentionDays: 365,
        operatorApprovalReference: 'operator-policy-test-v1',
        publicReviewHandling: 'retain_anonymized',
        repairRequestRetentionDays: 90,
        reportRetentionDays: 180,
        reviewEvidenceRetentionDays: 365,
        version: 'test-v1',
      },
      url: '/api/admin/lifecycle/retention-policy',
    });
    const deletionQueue = await app.inject({
      headers: headers(admin),
      method: 'GET',
      url: '/api/admin/lifecycle/data-deletion-requests',
    });
    const processed = await app.inject({
      headers: headers(admin, true),
      method: 'POST',
      url: `/api/admin/lifecycle/data-deletion-requests/${requestId}/process`,
    });
    const oldSessionDenied = await app.inject({
      headers: headers(customer),
      method: 'GET',
      url: '/api/me/data-export',
    });
    const freshCustomer = store.createSession('customer');
    const removedEvidence = await app.inject({
      headers: headers(freshCustomer),
      method: 'GET',
      url: `/api/reviews/${reviewId}/evidence/download-grant`,
    });
    const publicReview = await app.inject({
      method: 'GET',
      url: `/api/public/garages/${garageId}/reviews`,
    });
    const newExport = await app.inject({
      headers: headers(freshCustomer),
      method: 'GET',
      url: '/api/me/data-export',
    });

    assert.equal(exported.statusCode, 200);
    assert.equal(exported.json().files[0].id, evidenceFileId);
    assert.equal(requestedWithoutPolicy.json().status, 'blocked_by_policy');
    assert.equal(policy.statusCode, 201);
    assert.equal(deletionQueue.json().requests[0].status, 'submitted');
    assert.equal(processed.statusCode, 204);
    assert.equal(oldSessionDenied.statusCode, 401);
    assert.equal(removedEvidence.statusCode, 404);
    assert.equal(store.wasPrivateObjectDeleted(evidenceFileId), true);
    assert.equal(publicReview.json().reviews.length, 1);
    assert.equal(newExport.json().files.length, 0);
    assert.equal(newExport.json().reviews.length, 0);
  } finally {
    await app.close();
  }
});
