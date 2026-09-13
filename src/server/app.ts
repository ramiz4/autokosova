import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import type { FastifyReply } from 'fastify';
import {
  isAutomatedRequest,
  isPublicAnalyticsEvent,
  type AnalyticsStore,
  type PublicAnalyticsEvent,
} from './analytics';
import {
  AccessError,
  AccessStore,
  DuplicateWorkshopError,
  type VerificationChecklist,
  type WorkshopProfileInput,
} from './access';
import {
  createAuthorizationUrl,
  createPkceTransaction,
  exchangeAuthorizationCode,
  type ZitadelOidcConfig,
  verifyZitadelAccessToken,
} from './oidc';
import { buildMatchingPath, validateRepairRequest } from './repair-requests';
import type { RepairRequestStore } from './repair-request-store';
import { normalizeWorkshopPhoto, WorkshopPhotoError } from './workshop-photo';
import {
  REVIEW_EVIDENCE_KINDS,
  REVIEW_LIMITS,
  REVIEW_REJECTION_REASONS,
  type ReviewDecisionInput,
  type ReviewStore,
  type ReviewSubmissionInput,
  type ReviewUpdateKind,
} from './reviews';
import {
  MODERATION_ACTIONS,
  MODERATION_REASON_CODES,
  MODERATION_REPORT_CATEGORIES,
  type AppealInput,
  type ContentReportInput,
  type ModerationActionInput,
  type ModerationLifecycleStore,
  type RetentionPolicyInput,
} from './moderation';
import {
  parsePublicWorkshopSearch,
  type WorkshopSearchStore,
  WorkshopSearchValidationError,
} from './workshop-search';
import {
  REPAIR_REQUEST_LIMITS,
  REPAIR_REQUEST_PLACES,
  REPAIR_REQUEST_SERVICE_CATEGORIES,
  REPAIR_REQUEST_VEHICLE_MAKES,
  type RepairRequestInput,
} from '../shared/repair-request';

interface ServerOptions {
  readonly accessStore?: AccessStore;
  readonly analyticsEnabled?: boolean;
  readonly analyticsStore?: AnalyticsStore;
  readonly oidcConfig?: ZitadelOidcConfig;
  readonly moderationStore?: ModerationLifecycleStore;
  readonly repairRequestStore?: RepairRequestStore;
  readonly reviewStore?: ReviewStore;
  readonly searchStore?: WorkshopSearchStore;
  readonly publicSiteUrl?: string;
  readonly staticRoot?: string;
}

const analyticsEventSchema = {
  additionalProperties: false,
  properties: {
    name: {
      enum: [
        'search_started',
        'search_results_displayed',
        'workshop_profile_opened',
        'contact_channel_opened',
      ],
      type: 'string',
    },
  },
  required: ['name'],
  type: 'object',
};

const repairRequestBodySchema = {
  additionalProperties: false,
  properties: {
    areas: {
      items: {
        additionalProperties: false,
        properties: {
          placeId: { enum: REPAIR_REQUEST_PLACES, type: 'string' },
          radiusKm: {
            maximum: REPAIR_REQUEST_LIMITS.maxRadiusKm,
            minimum: REPAIR_REQUEST_LIMITS.minRadiusKm,
            type: 'integer',
          },
        },
        required: ['placeId', 'radiusKm'],
        type: 'object',
      },
      maxItems: REPAIR_REQUEST_LIMITS.maxAreas,
      minItems: 1,
      type: 'array',
    },
    attachmentIds: {
      items: { minLength: 1, type: 'string' },
      maxItems: REPAIR_REQUEST_LIMITS.maxAttachments,
      type: 'array',
      uniqueItems: true,
    },
    earliestDropoffOn: { pattern: '^\\d{4}-\\d{2}-\\d{2}$', type: 'string' },
    latestPickupOn: { pattern: '^\\d{4}-\\d{2}-\\d{2}$', type: 'string' },
    serviceCategoryId: { enum: REPAIR_REQUEST_SERVICE_CATEGORIES, type: 'string' },
    stayEndsOn: { pattern: '^\\d{4}-\\d{2}-\\d{2}$', type: 'string' },
    symptom: { maxLength: REPAIR_REQUEST_LIMITS.maxSymptomLength, type: 'string' },
    vehicle: {
      additionalProperties: false,
      properties: {
        engineDetails: { maxLength: 120, type: 'string' },
        makeId: { enum: REPAIR_REQUEST_VEHICLE_MAKES, type: 'string' },
        mileageKm: {
          maximum: REPAIR_REQUEST_LIMITS.maxMileageKm,
          minimum: 0,
          type: 'integer',
        },
        model: { maxLength: 120, minLength: 1, type: 'string' },
        transmissionDetails: { maxLength: 120, type: 'string' },
        year: {
          maximum: REPAIR_REQUEST_LIMITS.maxVehicleYear,
          minimum: REPAIR_REQUEST_LIMITS.minVehicleYear,
          type: 'integer',
        },
      },
      required: ['makeId', 'model', 'year'],
      type: 'object',
    },
  },
  required: ['areas', 'earliestDropoffOn', 'latestPickupOn', 'serviceCategoryId', 'stayEndsOn'],
  type: 'object',
};

function safeReturnTo(value: unknown): string {
  return value === '/anfrage' || value === '/sq/anfrage' || value === '/en/anfrage' ? value : '/';
}

const stringListSchema = {
  items: { maxLength: 80, minLength: 1, type: 'string' },
  maxItems: 20,
  type: 'array',
  uniqueItems: true,
};

const workshopProfileSchema = {
  additionalProperties: false,
  properties: {
    contactEmail: { format: 'email', maxLength: 254, type: 'string' },
    contactPerson: { maxLength: 120, minLength: 1, type: 'string' },
    contactPhone: { maxLength: 40, minLength: 3, type: 'string' },
    description: { maxLength: 2000, type: 'string' },
    languages: stringListSchema,
    name: { maxLength: 160, minLength: 1, type: 'string' },
    placeId: { maxLength: 80, minLength: 1, pattern: '^xk-[a-z]+$', type: 'string' },
    publicPhone: { maxLength: 40, minLength: 3, type: 'string' },
    selfReportedSpecializations: stringListSchema,
    serviceCategoryIds: stringListSchema,
    vehicleMakeIds: stringListSchema,
  },
  required: [
    'name',
    'placeId',
    'contactPerson',
    'contactPhone',
    'languages',
    'serviceCategoryIds',
    'vehicleMakeIds',
    'selfReportedSpecializations',
  ],
  type: 'object',
};

const verificationChecklistSchema = {
  additionalProperties: false,
  properties: {
    companyDocument: { enum: ['not_checked', 'verified', 'failed'], type: 'string' },
    contactPerson: { enum: ['not_checked', 'verified', 'failed'], type: 'string' },
    location: { enum: ['not_checked', 'verified', 'failed'], type: 'string' },
    phone: { enum: ['not_checked', 'verified', 'failed'], type: 'string' },
  },
  required: ['phone', 'contactPerson', 'companyDocument', 'location'],
  type: 'object',
};

const reviewSubmissionSchema = {
  additionalProperties: false,
  properties: {
    communication: { maximum: 5, minimum: 1, type: 'integer' },
    evidenceFileId: { maxLength: 120, minLength: 1, type: 'string' },
    evidenceKind: { enum: REVIEW_EVIDENCE_KINDS, type: 'string' },
    priceTransparency: { maximum: 5, minimum: 1, type: 'integer' },
    punctuality: { maximum: 5, minimum: 1, type: 'integer' },
    serviceCategoryId: { enum: REPAIR_REQUEST_SERVICE_CATEGORIES, type: 'string' },
    text: {
      maxLength: REVIEW_LIMITS.maxTextLength,
      minLength: REVIEW_LIMITS.minTextLength,
      type: 'string',
    },
    vehicleMakeId: { enum: REPAIR_REQUEST_VEHICLE_MAKES, type: 'string' },
    visitMonth: { pattern: '^\\d{4}-(0[1-9]|1[0-2])$', type: 'string' },
    workQuality: { maximum: 5, minimum: 1, type: 'integer' },
    workshopId: { maxLength: 120, minLength: 1, type: 'string' },
  },
  required: [
    'workshopId',
    'serviceCategoryId',
    'visitMonth',
    'workQuality',
    'communication',
    'priceTransparency',
    'punctuality',
    'text',
    'evidenceKind',
    'evidenceFileId',
  ],
  type: 'object',
};

const reviewDecisionSchema = {
  additionalProperties: false,
  properties: {
    checklist: {
      additionalProperties: false,
      properties: {
        serviceMatches: { type: 'boolean' },
        visitMonthMatches: { type: 'boolean' },
        workshopMatches: { type: 'boolean' },
      },
      required: ['serviceMatches', 'visitMonthMatches', 'workshopMatches'],
      type: 'object',
    },
    decision: { enum: ['published', 'rejected'], type: 'string' },
    rejectionReason: { enum: REVIEW_REJECTION_REASONS, type: 'string' },
  },
  required: ['decision', 'checklist'],
  type: 'object',
};

const contentReportSchema = {
  additionalProperties: false,
  properties: {
    category: { enum: MODERATION_REPORT_CATEGORIES, type: 'string' },
    details: { maxLength: 1200, minLength: 20, type: 'string' },
    subjectId: { maxLength: 120, minLength: 1, type: 'string' },
    subjectType: { enum: ['review', 'workshop_profile'], type: 'string' },
  },
  required: ['category', 'subjectId', 'subjectType'],
  type: 'object',
};

const moderationActionSchema = {
  additionalProperties: false,
  properties: {
    action: { enum: MODERATION_ACTIONS, type: 'string' },
    reasonCode: { enum: MODERATION_REASON_CODES, type: 'string' },
  },
  required: ['action', 'reasonCode'],
  type: 'object',
};

const appealSchema = {
  additionalProperties: false,
  properties: {
    caseId: { maxLength: 120, minLength: 1, type: 'string' },
    message: { maxLength: 1200, minLength: 20, type: 'string' },
  },
  required: ['caseId', 'message'],
  type: 'object',
};

const retentionPolicySchema = {
  additionalProperties: false,
  properties: {
    auditLogRetentionDays: { maximum: 3650, minimum: 1, type: 'integer' },
    operatorApprovalReference: { maxLength: 160, minLength: 1, type: 'string' },
    publicReviewHandling: { enum: ['delete', 'retain_anonymized'], type: 'string' },
    repairRequestRetentionDays: { maximum: 3650, minimum: 1, type: 'integer' },
    reportRetentionDays: { maximum: 3650, minimum: 1, type: 'integer' },
    reviewEvidenceRetentionDays: { maximum: 3650, minimum: 1, type: 'integer' },
    version: { maxLength: 80, minLength: 1, type: 'string' },
  },
  required: [
    'version',
    'operatorApprovalReference',
    'publicReviewHandling',
    'reviewEvidenceRetentionDays',
    'repairRequestRetentionDays',
    'reportRetentionDays',
    'auditLogRetentionDays',
  ],
  type: 'object',
};

export function createServer(options: ServerOptions = {}) {
  const app = Fastify({
    bodyLimit: 5 * 1024 * 1024,
    logger: {
      level: 'info',
      serializers: {
        req: (request) => ({
          method: request.method,
          url: request.url.split('?')[0],
        }),
      },
    },
  });
  const accessStore = options.accessStore ?? new AccessStore();
  const repairRequestStore: RepairRequestStore = options.repairRequestStore ?? accessStore;
  const reviewStore: ReviewStore = options.reviewStore ?? accessStore;
  const searchStore: WorkshopSearchStore = options.searchStore ?? accessStore;
  const moderationStore: ModerationLifecycleStore = options.moderationStore ?? accessStore;

  app.addHook('onRequest', async (request, reply) => {
    if (isNoIndexPath(request.url)) reply.header('x-robots-tag', 'noindex, nofollow');
  });

  app.register(cookie);
  app.addContentTypeParser(
    ['image/jpeg', 'image/png', 'image/webp'],
    { parseAs: 'buffer' },
    (_request, body, done) => done(null, body),
  );
  if (repairRequestStore.close) {
    app.addHook('onClose', async () => repairRequestStore.close?.());
  }
  if (searchStore.close && (searchStore as object) !== (repairRequestStore as object)) {
    app.addHook('onClose', async () => searchStore.close?.());
  }
  if (
    reviewStore.close &&
    (reviewStore as object) !== (repairRequestStore as object) &&
    (reviewStore as object) !== (searchStore as object)
  ) {
    app.addHook('onClose', async () => reviewStore.close?.());
  }
  if (
    moderationStore.close &&
    (moderationStore as object) !== (reviewStore as object) &&
    (moderationStore as object) !== (repairRequestStore as object) &&
    (moderationStore as object) !== (searchStore as object)
  ) {
    app.addHook('onClose', async () => moderationStore.close?.());
  }
  if (
    options.analyticsStore?.close &&
    (options.analyticsStore as object) !== (repairRequestStore as object) &&
    (options.analyticsStore as object) !== (searchStore as object) &&
    (options.analyticsStore as object) !== (reviewStore as object) &&
    (options.analyticsStore as object) !== (moderationStore as object)
  ) {
    app.addHook('onClose', async () => options.analyticsStore?.close?.());
  }

  function requirePrincipal(
    request: {
      cookies: Record<string, string | undefined>;
      headers: Record<string, string | string[] | undefined>;
    },
    write = false,
  ) {
    const principal = accessStore.getPrincipal(request.cookies['autokosova_session']);
    if (!principal) throw new AccessError(401, 'Authentication required');
    if (
      write &&
      (request.cookies['autokosova_csrf'] !== principal.csrfToken ||
        request.headers['x-csrf-token'] !== principal.csrfToken)
    ) {
      throw new AccessError(403, 'CSRF validation failed');
    }
    return principal;
  }

  function errorResponse(error: unknown, reply: FastifyReply) {
    if (error instanceof DuplicateWorkshopError) {
      return reply.code(error.statusCode).send({
        candidates: error.publicMatches,
        error: error.message,
      });
    }
    if (error instanceof AccessError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    if (error instanceof WorkshopSearchValidationError) {
      return reply.code(400).send({ error: error.message });
    }
    throw error;
  }

  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/api/health', async () => ({ status: 'ok' }));
  app.get('/robots.txt', async (_request, reply) => {
    reply.type('text/plain; charset=utf-8');
    const sitemap = options.publicSiteUrl
      ? `\nSitemap: ${siteUrl(options.publicSiteUrl, '/sitemap.xml')}`
      : '';
    return `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /auth/\nDisallow: /anfrage\nDisallow: /sq/anfrage\nDisallow: /en/anfrage\nDisallow: /werkstatt/aufnahme\nDisallow: /sq/werkstatt/aufnahme\nDisallow: /en/werkstatt/aufnahme\nDisallow: /suche${sitemap}\n`;
  });
  app.get('/sitemap.xml', async (_request, reply) => {
    if (!options.publicSiteUrl) {
      return reply
        .code(503)
        .send({ error: 'PUBLIC_SITE_URL is required before publishing a sitemap' });
    }
    const workshopIds = await searchStore.listPublicWorkshopIds();
    const locations = [
      '/',
      '/sq',
      '/en',
      ...workshopIds.flatMap((id) => [
        `/werkstatt/${encodeURIComponent(id)}`,
        `/sq/werkstatt/${encodeURIComponent(id)}`,
        `/en/werkstatt/${encodeURIComponent(id)}`,
      ]),
    ];
    reply.type('application/xml; charset=utf-8');
    return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locations.map((location) => `<url><loc>${escapeXml(siteUrl(options.publicSiteUrl!, location))}</loc></url>`).join('')}</urlset>`;
  });
  app.post(
    '/api/public/analytics/events',
    { schema: { body: analyticsEventSchema } },
    async (request, reply) => {
      if (!options.analyticsEnabled || !options.analyticsStore) return reply.code(204).send();
      const body = request.body as unknown;
      if (!isAnalyticsPayload(body))
        return reply.code(400).send({ error: 'Invalid analytics event' });
      const userAgent =
        typeof request.headers['user-agent'] === 'string'
          ? request.headers['user-agent']
          : undefined;
      if (isAutomatedRequest(userAgent)) {
        return reply.code(204).send();
      }
      await options.analyticsStore.record(body.name, new Date().toISOString().slice(0, 10));
      return reply.code(204).send();
    },
  );
  app.get('/api/public/search', async (request, reply) => {
    try {
      const input = parsePublicWorkshopSearch(request.query as Record<string, unknown>);
      // Kept as a non-sensitive readiness response for the existing health/smoke contract.
      if (!input) return { status: 'public-search-ready' };
      return await searchStore.searchPublicWorkshops(input);
    } catch (error) {
      return errorResponse(error, reply);
    }
  });
  app.get('/api/public/workshops', async () => ({ workshops: accessStore.listPublicWorkshops() }));
  app.get('/api/public/workshops/:workshopId', async (request, reply) => {
    const params = request.params as { workshopId: string };
    const workshop = await searchStore.getPublicWorkshop(params.workshopId);
    return workshop ? workshop : reply.code(404).send({ error: 'Published workshop not found' });
  });
  app.get('/api/public/workshops/:workshopId/reviews', async (request, reply) => {
    try {
      const params = request.params as { workshopId: string };
      const query = request.query as { serviceCategoryId?: string; vehicleMakeId?: string };
      if (
        query.serviceCategoryId &&
        !REPAIR_REQUEST_SERVICE_CATEGORIES.includes(query.serviceCategoryId as never)
      ) {
        throw new AccessError(400, 'Please choose a known service category');
      }
      if (
        query.vehicleMakeId &&
        !REPAIR_REQUEST_VEHICLE_MAKES.includes(query.vehicleMakeId as never)
      ) {
        throw new AccessError(400, 'Please choose a known vehicle make');
      }
      return {
        reviews: await reviewStore.listPublicReviews(params.workshopId, {
          ...(query.serviceCategoryId ? { serviceCategoryId: query.serviceCategoryId } : {}),
          ...(query.vehicleMakeId ? { vehicleMakeId: query.vehicleMakeId } : {}),
        }),
      };
    } catch (error) {
      return errorResponse(error, reply);
    }
  });
  app.get('/api/public/workshops/:workshopId/photos/:photoId', async (request, reply) => {
    const params = request.params as { photoId: string; workshopId: string };
    const photo = accessStore.getWorkshopPhoto(params.workshopId, params.photoId);
    if (!photo) return reply.code(404).send({ error: 'Published workshop photo not found' });
    return reply
      .header('cache-control', 'public, max-age=3600')
      .type(photo.contentType)
      .send(photo.content);
  });

  app.get('/auth/login', async (request, reply) => {
    if (!options.oidcConfig) {
      return reply.code(503).send({ error: 'OIDC is not configured' });
    }
    const transaction = createPkceTransaction();
    const query = request.query as { returnTo?: string; prompt?: string };
    accessStore.createOidcTransaction(
      transaction.state,
      transaction.codeVerifier,
      safeReturnTo(query.returnTo),
    );
    return reply.redirect(
      createAuthorizationUrl(
        options.oidcConfig,
        transaction.state,
        transaction.codeChallenge,
        query.prompt === 'create' ? 'create' : undefined,
      ),
    );
  });

  app.get('/auth/callback', async (request, reply) => {
    if (!options.oidcConfig) {
      return reply.code(503).send({ error: 'OIDC is not configured' });
    }
    const query = request.query as { code?: string; error?: string; state?: string };
    if (!query.code || !query.state || query.error) {
      return reply.code(400).send({ error: 'Invalid OIDC callback' });
    }
    const transaction = accessStore.consumeOidcTransaction(query.state);
    if (!transaction) {
      return reply.code(400).send({ error: 'OIDC state is invalid or expired' });
    }

    try {
      const idToken = await exchangeAuthorizationCode(
        options.oidcConfig,
        query.code,
        transaction.codeVerifier,
      );
      const identity = await verifyZitadelAccessToken(idToken, options.oidcConfig);
      accessStore.setVerifiedRoles(identity.subject, identity.roles);
      const session = accessStore.createSession(identity.subject);
      const secure = process.env['NODE_ENV'] === 'production';
      reply.setCookie('autokosova_session', session.sessionId, {
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure,
      });
      reply.setCookie('autokosova_csrf', session.csrfToken, {
        httpOnly: false,
        path: '/',
        sameSite: 'lax',
        secure,
      });
      return reply.redirect(transaction.returnTo);
    } catch {
      return reply.code(401).send({ error: 'OIDC authentication failed' });
    }
  });

  app.get('/api/me/vehicles', async (request, reply) => {
    try {
      const principal = requirePrincipal(request);
      return { vehicles: accessStore.listVehicles(principal.userId) };
    } catch (error) {
      return errorResponse(error, reply);
    }
  });

  app.post(
    '/api/me/vehicles',
    {
      schema: {
        body: {
          additionalProperties: false,
          properties: { label: { maxLength: 120, minLength: 1, type: 'string' } },
          required: ['label'],
          type: 'object',
        },
      },
    },
    async (request, reply) => {
      try {
        const principal = requirePrincipal(request, true);
        const body = request.body as { label: string };
        return reply
          .code(201)
          .send({ id: accessStore.createVehicle(principal.userId, body.label) });
      } catch (error) {
        return errorResponse(error, reply);
      }
    },
  );

  app.post(
    '/api/me/repair-requests',
    { schema: { body: repairRequestBodySchema } },
    async (request, reply) => {
      try {
        const principal = requirePrincipal(request, true);
        const body = request.body as RepairRequestInput;
        const validationError = validateRepairRequest(body);
        if (validationError) throw new AccessError(400, validationError);
        const repairRequest = await repairRequestStore.createRepairRequest(principal.userId, body);
        return reply.code(201).send({
          id: repairRequest.id,
          matchingPath: buildMatchingPath(body),
          state: 'draft',
        });
      } catch (error) {
        return errorResponse(error, reply);
      }
    },
  );

  app.get('/api/me/repair-requests/:repairRequestId', async (request, reply) => {
    try {
      const principal = requirePrincipal(request);
      const params = request.params as { repairRequestId: string };
      return await repairRequestStore.getRepairRequest(principal.userId, params.repairRequestId);
    } catch (error) {
      return errorResponse(error, reply);
    }
  });

  app.get('/api/me/workshops', async (request, reply) => {
    try {
      const principal = requirePrincipal(request);
      return { workshops: accessStore.listOwnedWorkshops(principal) };
    } catch (error) {
      return errorResponse(error, reply);
    }
  });

  app.get('/api/me/reviews', async (request, reply) => {
    try {
      return { reviews: await reviewStore.listOwnReviews(requirePrincipal(request)) };
    } catch (error) {
      return errorResponse(error, reply);
    }
  });

  app.post(
    '/api/me/reviews',
    { schema: { body: reviewSubmissionSchema } },
    async (request, reply) => {
      try {
        const review = await reviewStore.createReview(
          requirePrincipal(request, true),
          request.body as ReviewSubmissionInput,
        );
        return reply.code(201).send(review);
      } catch (error) {
        return errorResponse(error, reply);
      }
    },
  );

  app.post(
    '/api/me/reviews/:reviewId/updates',
    {
      schema: {
        body: {
          additionalProperties: false,
          properties: {
            kind: { enum: ['complaint', 'rework'], type: 'string' },
            text: {
              maxLength: REVIEW_LIMITS.maxUpdateLength,
              minLength: REVIEW_LIMITS.minTextLength,
              type: 'string',
            },
          },
          required: ['kind', 'text'],
          type: 'object',
        },
      },
    },
    async (request, reply) => {
      try {
        const params = request.params as { reviewId: string };
        const body = request.body as { kind: ReviewUpdateKind; text: string };
        await reviewStore.postReviewUpdate(
          requirePrincipal(request, true),
          params.reviewId,
          body.kind,
          body.text,
        );
        return reply.code(204).send();
      } catch (error) {
        return errorResponse(error, reply);
      }
    },
  );

  app.get('/api/reviews/:reviewId/evidence/download-grant', async (request, reply) => {
    try {
      const params = request.params as { reviewId: string };
      return await reviewStore.issueEvidenceDownloadGrant(
        requirePrincipal(request),
        params.reviewId,
      );
    } catch (error) {
      return errorResponse(error, reply);
    }
  });

  app.post(
    '/api/me/content-reports',
    { schema: { body: contentReportSchema } },
    async (request, reply) => {
      try {
        const report = await moderationStore.createContentReport(
          requirePrincipal(request, true),
          request.body as ContentReportInput,
        );
        return reply.code(201).send({
          caseId: report.id,
          message: 'Die Meldung wurde zur unabhängigen Prüfung aufgenommen.',
          status: report.status,
        });
      } catch (error) {
        return errorResponse(error, reply);
      }
    },
  );

  app.get('/api/me/moderation-cases', async (request, reply) => {
    try {
      return { cases: await moderationStore.listOwnModerationCases(requirePrincipal(request)) };
    } catch (error) {
      return errorResponse(error, reply);
    }
  });

  app.post(
    '/api/me/moderation-appeals',
    { schema: { body: appealSchema } },
    async (request, reply) => {
      try {
        const appealId = await moderationStore.createAppeal(
          requirePrincipal(request, true),
          request.body as AppealInput,
        );
        return reply.code(201).send({
          id: appealId,
          message: 'Der Widerspruch wurde zur erneuten Prüfung aufgenommen.',
        });
      } catch (error) {
        return errorResponse(error, reply);
      }
    },
  );

  app.get('/api/me/data-export', async (request, reply) => {
    try {
      return await moderationStore.exportPersonalData(requirePrincipal(request));
    } catch (error) {
      return errorResponse(error, reply);
    }
  });

  app.post('/api/me/data-deletion-requests', async (request, reply) => {
    try {
      const deletion = await moderationStore.requestPersonalDataDeletion(
        requirePrincipal(request, true),
      );
      return reply.code(202).send({
        id: deletion.id,
        status: deletion.status,
        message:
          deletion.status === 'submitted'
            ? 'Der Löschauftrag wurde zur Bearbeitung aufgenommen.'
            : 'Der Löschauftrag benötigt zuerst die dokumentierte Betreiberregel.',
      });
    } catch (error) {
      return errorResponse(error, reply);
    }
  });

  app.get('/api/workshops/duplicate-candidates', async (request, reply) => {
    try {
      requirePrincipal(request);
      const query = request.query as { name?: string; placeId?: string };
      if (!query.name?.trim() || !query.placeId?.trim()) {
        throw new AccessError(400, 'Name and placeId are required for duplicate checks');
      }
      return { candidates: accessStore.listPublicDuplicateCandidates(query.name, query.placeId) };
    } catch (error) {
      return errorResponse(error, reply);
    }
  });

  app.post(
    '/api/workshops',
    {
      schema: {
        body: {
          additionalProperties: false,
          properties: {
            consentVersion: { maxLength: 80, minLength: 1, type: 'string' },
            profile: workshopProfileSchema,
          },
          required: ['consentVersion', 'profile'],
          type: 'object',
        },
      },
    },
    async (request, reply) => {
      try {
        const principal = requirePrincipal(request, true);
        const body = request.body as { consentVersion: string; profile: WorkshopProfileInput };
        const workshop = accessStore.createWorkshopRegistration(
          principal,
          body.profile,
          body.consentVersion,
        );
        return reply
          .code(201)
          .send({ id: workshop.id, publicationState: workshop.publicationState });
      } catch (error) {
        return errorResponse(error, reply);
      }
    },
  );

  app.get('/api/workshops/:workshopId', async (request, reply) => {
    try {
      const principal = requirePrincipal(request);
      const params = request.params as { workshopId: string };
      return accessStore.getPrivateWorkshop(principal, params.workshopId);
    } catch (error) {
      return errorResponse(error, reply);
    }
  });

  app.put(
    '/api/workshops/:workshopId',
    { schema: { body: workshopProfileSchema } },
    async (request, reply) => {
      try {
        const principal = requirePrincipal(request, true);
        const params = request.params as { workshopId: string };
        accessStore.updateWorkshopProfile(
          principal,
          params.workshopId,
          request.body as WorkshopProfileInput,
        );
        return reply.code(204).send();
      } catch (error) {
        return errorResponse(error, reply);
      }
    },
  );

  app.post('/api/workshops/:workshopId/submit-for-review', async (request, reply) => {
    try {
      const principal = requirePrincipal(request, true);
      const params = request.params as { workshopId: string };
      accessStore.submitWorkshopForReview(principal, params.workshopId);
      return reply.code(204).send();
    } catch (error) {
      return errorResponse(error, reply);
    }
  });

  app.post('/api/workshops/:workshopId/verification-document-grants', async (request, reply) => {
    try {
      const principal = requirePrincipal(request, true);
      const params = request.params as { workshopId: string };
      return reply
        .code(201)
        .send(accessStore.createWorkshopDocumentGrant(principal, params.workshopId));
    } catch (error) {
      return errorResponse(error, reply);
    }
  });

  app.post('/api/workshops/:workshopId/photos', async (request, reply) => {
    try {
      const principal = requirePrincipal(request, true);
      const params = request.params as { workshopId: string };
      const body = request.body;
      if (!Buffer.isBuffer(body)) throw new AccessError(415, 'A binary workshop photo is required');
      const normalized = await normalizeWorkshopPhoto(body, request.headers['content-type']);
      const photo = accessStore.registerWorkshopPhoto(principal, params.workshopId, normalized);
      return reply.code(201).send({
        contentType: photo.contentType,
        height: photo.height,
        id: photo.id,
        width: photo.width,
      });
    } catch (error) {
      if (error instanceof WorkshopPhotoError) {
        return reply.code(415).send({ error: error.message });
      }
      return errorResponse(error, reply);
    }
  });

  app.get('/api/workshops/:workshopId/photos/:photoId', async (request, reply) => {
    try {
      const principal = requirePrincipal(request);
      const params = request.params as { photoId: string; workshopId: string };
      const photo = accessStore.getWorkshopPhoto(params.workshopId, params.photoId, principal);
      if (!photo) throw new AccessError(404, 'Workshop photo not found');
      return reply.type(photo.contentType).send(photo.content);
    } catch (error) {
      return errorResponse(error, reply);
    }
  });

  app.post(
    '/api/workshops/:workshopId/profile',
    {
      schema: {
        body: {
          additionalProperties: false,
          properties: { description: { maxLength: 1000, type: 'string' } },
          required: ['description'],
          type: 'object',
        },
      },
    },
    async (request, reply) => {
      try {
        const principal = requirePrincipal(request, true);
        const params = request.params as { workshopId: string };
        accessStore.requireWorkshopMembership(principal, params.workshopId);
        return reply.code(204).send();
      } catch (error) {
        return errorResponse(error, reply);
      }
    },
  );

  app.post(
    '/api/workshops/:workshopId/reviews/:reviewId/response',
    {
      schema: {
        body: {
          additionalProperties: false,
          properties: {
            text: {
              maxLength: REVIEW_LIMITS.maxResponseLength,
              minLength: REVIEW_LIMITS.minTextLength,
              type: 'string',
            },
          },
          required: ['text'],
          type: 'object',
        },
      },
    },
    async (request, reply) => {
      try {
        const params = request.params as { reviewId: string; workshopId: string };
        const body = request.body as { text: string };
        await reviewStore.postWorkshopResponse(
          requirePrincipal(request, true),
          params.workshopId,
          params.reviewId,
          body.text,
        );
        return reply.code(204).send();
      } catch (error) {
        return errorResponse(error, reply);
      }
    },
  );

  app.post(
    '/api/admin/memberships',
    {
      schema: {
        body: {
          additionalProperties: false,
          properties: {
            role: { enum: ['editor', 'owner'], type: 'string' },
            userId: { minLength: 1, type: 'string' },
            workshopId: { minLength: 1, type: 'string' },
          },
          required: ['userId', 'workshopId', 'role'],
          type: 'object',
        },
      },
    },
    async (request, reply) => {
      try {
        const principal = requirePrincipal(request, true);
        if (!principal.roles.has('admin')) throw new AccessError(403, 'Admin access denied');
        const body = request.body as {
          role: 'editor' | 'owner';
          userId: string;
          workshopId: string;
        };
        accessStore.addMembership(body.userId, body.workshopId, body.role);
        accessStore.auditEvents.push({ actorUserId: principal.userId, type: 'membership-granted' });
        return reply.code(201).send({ status: 'created' });
      } catch (error) {
        return errorResponse(error, reply);
      }
    },
  );

  app.get('/api/admin/moderation/queue', async (request, reply) => {
    try {
      return { cases: await moderationStore.listModerationQueue(requirePrincipal(request)) };
    } catch (error) {
      return errorResponse(error, reply);
    }
  });

  app.get('/api/admin/moderation/cases/:caseId', async (request, reply) => {
    try {
      const params = request.params as { caseId: string };
      return await moderationStore.getModerationCase(requirePrincipal(request), params.caseId);
    } catch (error) {
      return errorResponse(error, reply);
    }
  });

  app.post(
    '/api/admin/moderation/cases/:caseId/assign',
    {
      schema: {
        body: {
          additionalProperties: false,
          properties: { moderatorUserId: { maxLength: 120, minLength: 1, type: 'string' } },
          required: ['moderatorUserId'],
          type: 'object',
        },
      },
    },
    async (request, reply) => {
      try {
        const params = request.params as { caseId: string };
        const body = request.body as { moderatorUserId: string };
        await moderationStore.assignModerationCase(
          requirePrincipal(request, true),
          params.caseId,
          body.moderatorUserId,
        );
        return reply.code(204).send();
      } catch (error) {
        return errorResponse(error, reply);
      }
    },
  );

  app.post(
    '/api/admin/moderation/cases/:caseId/action',
    { schema: { body: moderationActionSchema } },
    async (request, reply) => {
      try {
        const params = request.params as { caseId: string };
        return await moderationStore.applyModerationAction(
          requirePrincipal(request, true),
          params.caseId,
          request.body as ModerationActionInput,
        );
      } catch (error) {
        return errorResponse(error, reply);
      }
    },
  );

  app.post(
    '/api/admin/lifecycle/retention-policy',
    { schema: { body: retentionPolicySchema } },
    async (request, reply) => {
      try {
        return reply
          .code(201)
          .send(
            await moderationStore.configureRetentionPolicy(
              requirePrincipal(request, true),
              request.body as RetentionPolicyInput,
            ),
          );
      } catch (error) {
        return errorResponse(error, reply);
      }
    },
  );

  app.get('/api/admin/lifecycle/data-deletion-requests', async (request, reply) => {
    try {
      return {
        requests: await moderationStore.listDataDeletionRequests(requirePrincipal(request)),
      };
    } catch (error) {
      return errorResponse(error, reply);
    }
  });

  app.post(
    '/api/admin/lifecycle/data-deletion-requests/:requestId/process',
    async (request, reply) => {
      try {
        const params = request.params as { requestId: string };
        const completed = await moderationStore.processPersonalDataDeletion(
          requirePrincipal(request, true),
          params.requestId,
        );
        if (completed) {
          accessStore.revokeUserSessions(completed.userId);
          for (const fileId of completed.fileIds) accessStore.deletePrivateFile(fileId);
        }
        return reply.code(204).send();
      } catch (error) {
        return errorResponse(error, reply);
      }
    },
  );

  app.post(
    '/api/admin/reviews/:reviewId/assign',
    {
      schema: {
        body: {
          additionalProperties: false,
          properties: { moderatorUserId: { maxLength: 120, minLength: 1, type: 'string' } },
          required: ['moderatorUserId'],
          type: 'object',
        },
      },
    },
    async (request, reply) => {
      try {
        const params = request.params as { reviewId: string };
        const body = request.body as { moderatorUserId: string };
        await reviewStore.assignModerator(
          requirePrincipal(request, true),
          params.reviewId,
          body.moderatorUserId,
        );
        return reply.code(204).send();
      } catch (error) {
        return errorResponse(error, reply);
      }
    },
  );

  app.post(
    '/api/admin/reviews/:reviewId/decision',
    { schema: { body: reviewDecisionSchema } },
    async (request, reply) => {
      try {
        const params = request.params as { reviewId: string };
        await reviewStore.decideReview(
          requirePrincipal(request, true),
          params.reviewId,
          request.body as ReviewDecisionInput,
        );
        return reply.code(204).send();
      } catch (error) {
        return errorResponse(error, reply);
      }
    },
  );

  app.post(
    '/api/admin/reviews/:reviewId/evidence/delete-after-retention',
    async (request, reply) => {
      try {
        const params = request.params as { reviewId: string };
        const fileId = await reviewStore.deleteEvidenceAfterRetention(
          requirePrincipal(request, true),
          params.reviewId,
        );
        if (typeof fileId === 'string') accessStore.deletePrivateFile(fileId);
        return reply.code(204).send();
      } catch (error) {
        return errorResponse(error, reply);
      }
    },
  );

  app.post(
    '/api/admin/workshops/assisted-onboarding',
    {
      schema: {
        body: {
          additionalProperties: false,
          properties: {
            applicantUserId: { maxLength: 120, minLength: 1, type: 'string' },
            consentSource: { const: 'documented_support_request', type: 'string' },
            consentVersion: { maxLength: 80, minLength: 1, type: 'string' },
            profile: workshopProfileSchema,
          },
          required: ['applicantUserId', 'consentSource', 'consentVersion', 'profile'],
          type: 'object',
        },
      },
    },
    async (request, reply) => {
      try {
        const principal = requirePrincipal(request, true);
        const body = request.body as {
          applicantUserId: string;
          consentSource: 'documented_support_request';
          consentVersion: string;
          profile: WorkshopProfileInput;
        };
        const workshop = accessStore.createAssistedWorkshop(
          principal,
          body.applicantUserId,
          body.profile,
          {
            source: body.consentSource,
            version: body.consentVersion,
          },
        );
        return reply
          .code(201)
          .send({ id: workshop.id, publicationState: workshop.publicationState });
      } catch (error) {
        return errorResponse(error, reply);
      }
    },
  );

  app.post(
    '/api/admin/workshops/:workshopId/decision',
    {
      schema: {
        body: {
          additionalProperties: false,
          properties: {
            decision: { enum: ['published', 'rejected', 'suspended'], type: 'string' },
            verification: verificationChecklistSchema,
          },
          required: ['decision', 'verification'],
          type: 'object',
        },
      },
    },
    async (request, reply) => {
      try {
        const principal = requirePrincipal(request, true);
        const params = request.params as { workshopId: string };
        const body = request.body as {
          decision: 'published' | 'rejected' | 'suspended';
          verification: VerificationChecklist;
        };
        accessStore.reviewWorkshop(principal, params.workshopId, body.decision, body.verification);
        return reply.code(204).send();
      } catch (error) {
        return errorResponse(error, reply);
      }
    },
  );

  app.post(
    '/api/admin/workshops/:workshopId/photos/:photoId/decision',
    {
      schema: {
        body: {
          additionalProperties: false,
          properties: { approved: { type: 'boolean' } },
          required: ['approved'],
          type: 'object',
        },
      },
    },
    async (request, reply) => {
      try {
        const principal = requirePrincipal(request, true);
        const params = request.params as { photoId: string; workshopId: string };
        const body = request.body as { approved: boolean };
        accessStore.publishWorkshopPhoto(
          principal,
          params.workshopId,
          params.photoId,
          body.approved,
        );
        return reply.code(204).send();
      } catch (error) {
        return errorResponse(error, reply);
      }
    },
  );

  app.post(
    '/api/files/upload-grants',
    {
      schema: {
        body: {
          additionalProperties: false,
          properties: {
            contentType: { type: 'string' },
            sizeBytes: { maximum: 10 * 1024 * 1024, minimum: 1, type: 'integer' },
          },
          required: ['contentType', 'sizeBytes'],
          type: 'object',
        },
      },
    },
    async (request, reply) => {
      try {
        const principal = requirePrincipal(request, true);
        const body = request.body as { contentType: string; sizeBytes: number };
        const grant = accessStore.getFileGrant(principal.userId, body.contentType, body.sizeBytes);
        await reviewStore.registerPrivateFile?.(
          principal.userId,
          grant.fileId,
          body.contentType,
          body.sizeBytes,
        );
        return reply.code(201).send(grant);
      } catch (error) {
        return errorResponse(error, reply);
      }
    },
  );

  app.get('/api/files/:fileId/download-grant', async (request, reply) => {
    try {
      const principal = requirePrincipal(request);
      const params = request.params as { fileId: string };
      return accessStore.issueDownloadGrant(principal, params.fileId);
    } catch (error) {
      return errorResponse(error, reply);
    }
  });

  app.post('/auth/logout', async (request, reply) => {
    try {
      const principal = requirePrincipal(request, true);
      accessStore.revokeSession(principal.sessionId);
      reply.clearCookie('autokosova_session', { path: '/' });
      reply.clearCookie('autokosova_csrf', { path: '/' });
      return reply.code(204).send();
    } catch (error) {
      return errorResponse(error, reply);
    }
  });

  app.post('/auth/recovery', async (_request, reply) => {
    return reply
      .code(202)
      .send({ message: 'If an account exists, recovery continues with the identity provider.' });
  });

  if (options.staticRoot) {
    app.register(fastifyStatic, {
      root: options.staticRoot,
      prefix: '/',
      index: 'index.html',
      redirect: false,
      maxAge: '1y',
      setHeaders(response, path) {
        // Only Angular bundles with a content hash can safely survive a release in cache.
        if (!/(?:main|styles|polyfills|chunk)-[A-Z0-9]{8}\.(?:js|css)$/.test(path)) {
          response.header('cache-control', 'public, max-age=0, must-revalidate');
        }
      },
    });
  }

  return app;
}

export function isNoIndexPath(url: string): boolean {
  const path = url.split('?', 1)[0];
  return (
    path.startsWith('/api/') ||
    path.startsWith('/auth/') ||
    path === '/anfrage' ||
    path === '/sq/anfrage' ||
    path === '/en/anfrage' ||
    path === '/werkstatt/aufnahme' ||
    path === '/sq/werkstatt/aufnahme' ||
    path === '/en/werkstatt/aufnahme' ||
    path === '/suche' ||
    path === '/sq/suche' ||
    path === '/en/suche'
  );
}

function siteUrl(origin: string, path: string): string {
  const url = new URL(origin);
  if (url.protocol !== 'https:') throw new Error('PUBLIC_SITE_URL must use HTTPS');
  return new URL(path, url).toString();
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => {
    const entities: Readonly<Record<string, string>> = {
      '"': '&quot;',
      '&': '&amp;',
      "'": '&apos;',
      '<': '&lt;',
      '>': '&gt;',
    };
    return entities[character];
  });
}

function isAnalyticsPayload(value: unknown): value is { readonly name: PublicAnalyticsEvent } {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.keys(value).length === 1 &&
    Object.hasOwn(value, 'name') &&
    isPublicAnalyticsEvent((value as { readonly name: unknown }).name)
  );
}
