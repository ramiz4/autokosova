import { registerAdministrationRoutes } from './administration-routes';
import type { PostgresAdministrationStore } from './administration-store';
import { registerReviewWorkflowRoutes } from './review-workflow-routes';
import type { LocalDemoFileStore } from './local-demo-files';
import { registerStaffRoutes } from './staff-routes';
import { randomBytes } from 'node:crypto';
import { AUTH_BROWSER_COOKIE, registerOidcLogout } from './oidc-logout';
import type { RepairRequestMutation } from '../shared/saved-repair-request';
import { parseRepairRequestPage } from './repair-request-list';
import type { FavoriteStore } from './favorites';
import { isAccountPagePath } from './account-profile';
import { resolveOidcProfile } from './oidc-profile';
import type { GarageOnboardingStore } from './garage-onboarding-store';
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
  DuplicateGarageError,
  type VerificationChecklist,
  type GarageProfileInput,
} from './access';
import {
  createAuthorizationUrl,
  createPkceTransaction,
  exchangeAuthorizationCode,
  type ZitadelOidcConfig,
  verifyZitadelAccessToken,
} from './oidc';
import { buildMatchingPath, validateRepairRequest } from './repair-requests';
import { localDemoPhotoPath } from '../shared/local-demo';
import type { RepairRequestStore } from './repair-request-store';
import { normalizeGaragePhoto, GaragePhotoError } from './garage-photo';
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
  parsePublicGarageSearch,
  type GarageSearchStore,
  GarageSearchValidationError,
} from './garage-search';
import {
  REPAIR_REQUEST_LIMITS,
  REPAIR_REQUEST_PLACES,
  REPAIR_REQUEST_SERVICE_CATEGORIES,
  REPAIR_REQUEST_VEHICLE_MAKES,
  REPAIR_REQUEST_VEHICLE_CLASSES,
  REPAIR_REQUEST_FUELS,
  type RepairRequestInput,
} from '../shared/repair-request';

interface ServerOptions {
  readonly administrationStore?: PostgresAdministrationStore;
  readonly adminConsoleUrl?: string;
  readonly localDemoFiles?: LocalDemoFileStore;
  readonly garageStore?: GarageOnboardingStore;
  readonly favoriteStore?: FavoriteStore;
  readonly accessStore?: AccessStore;
  readonly analyticsEnabled?: boolean;
  readonly analyticsStore?: AnalyticsStore;
  readonly oidcConfig?: ZitadelOidcConfig;
  readonly moderationStore?: ModerationLifecycleStore;
  readonly repairRequestStore?: RepairRequestStore;
  readonly reviewStore?: ReviewStore;
  readonly searchStore?: GarageSearchStore;
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
        'garage_profile_opened',
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
      minItems: 0,
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
    symptom: { maxLength: REPAIR_REQUEST_LIMITS.maxSymptomLength, type: 'string' },
    vehicle: {
      additionalProperties: false,
      properties: {
        vehicleClass: { enum: REPAIR_REQUEST_VEHICLE_CLASSES, type: 'string' },
        fuel: { enum: REPAIR_REQUEST_FUELS, type: 'string' },
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
      type: 'object',
    },
  },
  required: ['areas', 'earliestDropoffOn', 'latestPickupOn', 'serviceCategoryId'],
  type: 'object',
};

function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2000) return '/';
  const match = value.match(
    /^(\/(?:(?:sq|en)\/)?(?:admin(?:\/(?:garages|users|privacy|audit|catalog|support))?|moderation|profile|reviews|inquiries|favorites|inquiry|anfrage|garages(?:\/[A-Za-z0-9_-]{1,128}(?:\/reviews\/new)?)?))(?:\?([^#]*))?$/,
  );
  if (!match) return '/';
  const path = match[1].replace(/\/anfrage$/, '/inquiry');
  const isGarageProfile = /\/garages\/(?!new$)[A-Za-z0-9_-]{1,128}$/.test(path);
  if (!path.endsWith('/garages') && !isGarageProfile) return match[2] ? '/' : path;
  const input = new URLSearchParams(match[2]);
  const query = new URLSearchParams();
  for (const key of ['all', 'places', 'service', 'vehicleMake', 'language', 'sort', 'page']) {
    const entry = input.get(key);
    if (entry) query.set(key, entry);
  }
  try {
    parsePublicGarageSearch(Object.fromEntries(query));
  } catch {
    return path;
  }
  return `${path}${query.size ? `?${query}` : ''}`;
}

const stringListSchema = {
  items: { maxLength: 80, minLength: 1, type: 'string' },
  maxItems: 20,
  type: 'array',
  uniqueItems: true,
};

const garageProfileSchema = {
  additionalProperties: false,
  properties: {
    address: { type: 'string', minLength: 8, maxLength: 500 },
    contactEmail: { format: 'email', maxLength: 254, type: 'string' },
    contactPerson: { maxLength: 120, minLength: 1, type: 'string' },
    contactPhone: { maxLength: 40, minLength: 3, type: 'string' },
    description: { maxLength: 2000, type: 'string' },
    languages: stringListSchema,
    locationPoint: {
      additionalProperties: false,
      properties: {
        latitude: { maximum: 90, minimum: -90, type: 'number' },
        longitude: { maximum: 180, minimum: -180, type: 'number' },
      },
      required: ['latitude', 'longitude'],
      type: 'object',
    },
    name: { maxLength: 160, minLength: 1, type: 'string' },
    placeId: { maxLength: 80, minLength: 1, pattern: '^xk-[a-z]+$', type: 'string' },
    publicPhone: { maxLength: 40, minLength: 3, type: 'string' },
    publicWhatsapp: { type: 'boolean' },
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
    garageId: { maxLength: 120, minLength: 1, type: 'string' },
  },
  required: [
    'garageId',
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
        garageMatches: { type: 'boolean' },
      },
      required: ['serviceMatches', 'visitMonthMatches', 'garageMatches'],
      type: 'object',
    },
    caseRevision: { type: 'integer', minimum: 1, maximum: 2147483647 },
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
    subjectType: { enum: ['review', 'garage_profile'], type: 'string' },
  },
  required: ['category', 'subjectId', 'subjectType'],
  type: 'object',
};

const moderationActionSchema = {
  additionalProperties: false,
  properties: {
    caseRevision: { type: 'integer', minimum: 1, maximum: 2147483647 },
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
          url: request.url
            .split('?')[0]
            .replace(/(\/api\/me\/(?:repair-requests|reviews|review-evidence))\/[^/]+/, '$1/:id')
            .replace(/(\/api\/reviews)\/[^/]+/, '$1/:id')
            .replace(/\/api\/garages\/[^/]+\/reviews\/[^/]+/, '/api/garages/:id/reviews/:id')
            .replace(/(\/api\/(?:staff\/cases|local-demo\/files))\/[^/]+/, '$1/:id'),
        }),
      },
    },
  });
  const accessStore = options.accessStore ?? new AccessStore();
  const garageStore: GarageOnboardingStore = options.garageStore ?? accessStore;
  if (garageStore.close) app.addHook('onClose', async () => garageStore.close?.());
  const favoriteStore: FavoriteStore = options.favoriteStore ?? accessStore;
  if (favoriteStore.close) app.addHook('onClose', async () => favoriteStore.close?.());
  const repairRequestStore: RepairRequestStore = options.repairRequestStore ?? accessStore;
  const reviewStore: ReviewStore = options.reviewStore ?? accessStore;
  const searchStore: GarageSearchStore = options.searchStore ?? accessStore;
  const moderationStore: ModerationLifecycleStore = options.moderationStore ?? accessStore;

  app.addHook('onRequest', async (request, reply) => {
    if (isNoIndexPath(request.url)) reply.header('x-robots-tag', 'noindex, nofollow');
    if (
      isAccountPagePath(request.url) ||
      /^\/api\/(?!public(?:[/?]|$))/.test(request.url) ||
      request.url.startsWith('/auth/')
    ) {
      reply.header('cache-control', 'private, no-store');
      reply.header('vary', 'Cookie');
      reply.header('referrer-policy', 'no-referrer');
    }
  });

  app.register(cookie);
  // A role revoked by a newly verified login cannot survive through a different legacy endpoint.
  app.addHook('preHandler', async (request, reply) => {
    if (!/^\/api\/(?!public(?:[/?]|$))/.test(request.url)) return;
    const principal = accessStore.getPrincipal(request.cookies['autokosova_session']);
    if (!principal || (!principal.roles.has('admin') && !principal.roles.has('moderator'))) return;
    try {
      await moderationStore.validateStaffPrincipal?.(principal);
      requirePrincipal(request);
    } catch (error) {
      return errorResponse(error, reply);
    }
  });

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
      throw new AccessError(403, 'CSRF validation failed', 'csrf_invalid');
    }
    return principal;
  }

  function errorResponse(error: unknown, reply: FastifyReply) {
    if (error instanceof DuplicateGarageError) {
      return reply.code(error.statusCode).send({
        candidates: error.publicMatches,
        error: error.message,
      });
    }
    if (error instanceof AccessError) {
      return reply
        .code(error.statusCode)
        .send({ error: error.message, ...(error.code ? { code: error.code } : {}) });
    }
    if (error instanceof GarageSearchValidationError) {
      return reply.code(400).send({ error: error.message });
    }
    throw error;
  }

  registerStaffRoutes(app, moderationStore, requirePrincipal, errorResponse);
  registerAdministrationRoutes(
    app,
    options.administrationStore,
    options.localDemoFiles,
    requirePrincipal,
    errorResponse,
    garageProfileSchema,
    options.adminConsoleUrl,
    (userId) => accessStore.revokeUserSessions(userId),
  );
  if (options.administrationStore)
    app.addHook('onClose', async () => options.administrationStore!.close());
  registerReviewWorkflowRoutes(
    app,
    reviewStore,
    options.localDemoFiles,
    requirePrincipal,
    errorResponse,
  );
  if (options.localDemoFiles) app.addHook('onClose', async () => options.localDemoFiles!.close());
  app.get('/api/local-demo/files/:fileId/content', async (request, reply) => {
    try {
      const principal = requirePrincipal(request);
      if (!options.localDemoFiles) throw new AccessError(404, 'Private demo file not found');
      const grant = request.headers['x-file-grant'];
      if (typeof grant !== 'string') throw new AccessError(404, 'Private demo file not found');
      const content = await options.localDemoFiles.consume(
        principal,
        (request.params as { fileId: string }).fileId,
        grant,
      );
      requirePrincipal(request);
      return reply
        .header('cache-control', 'private, no-store')
        .header('x-content-type-options', 'nosniff')
        .header('content-security-policy', "default-src 'none'; sandbox")
        .type('text/plain; charset=utf-8')
        .send(content);
    } catch (error) {
      return errorResponse(error, reply);
    }
  });

  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/api/health', async () => ({ status: 'ok' }));
  app.get('/robots.txt', async (_request, reply) => {
    reply.type('text/plain; charset=utf-8');
    const sitemap = options.publicSiteUrl
      ? `\nSitemap: ${siteUrl(options.publicSiteUrl, '/sitemap.xml')}`
      : '';
    return `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /auth/\nDisallow: /admin\nDisallow: /sq/admin\nDisallow: /en/admin\nDisallow: /moderation\nDisallow: /sq/moderation\nDisallow: /en/moderation\nDisallow: /profile\nDisallow: /sq/profile\nDisallow: /en/profile\nDisallow: /favorites\nDisallow: /sq/favorites\nDisallow: /en/favorites\nDisallow: /reviews\nDisallow: /sq/reviews\nDisallow: /en/reviews\nDisallow: /*/reviews/new\nDisallow: /inquiries\nDisallow: /sq/inquiries\nDisallow: /en/inquiries\nDisallow: /inquiry\nDisallow: /sq/inquiry\nDisallow: /en/inquiry\nDisallow: /garages/new\nDisallow: /sq/garages/new\nDisallow: /en/garages/new\nDisallow: /garages$\nDisallow: /garages?\nDisallow: /sq/garages$\nDisallow: /sq/garages?\nDisallow: /en/garages$\nDisallow: /en/garages?\nDisallow: /suche\nDisallow: /werkstaetten${sitemap}\n`;
  });
  app.get('/sitemap.xml', async (_request, reply) => {
    if (!options.publicSiteUrl) {
      return reply
        .code(503)
        .send({ error: 'PUBLIC_SITE_URL is required before publishing a sitemap' });
    }
    const garageIds = await searchStore.listPublicGarageIds();
    const locations = [
      '/',
      '/sq',
      '/en',
      ...garageIds.flatMap((id) => [
        `/garages/${encodeURIComponent(id)}`,
        `/sq/garages/${encodeURIComponent(id)}`,
        `/en/garages/${encodeURIComponent(id)}`,
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
      const input = parsePublicGarageSearch(request.query as Record<string, unknown>);
      // Kept as a non-sensitive readiness response for the existing health/smoke contract.
      if (!input) return { status: 'public-search-ready' };
      return await searchStore.searchPublicGarages(input);
    } catch (error) {
      return errorResponse(error, reply);
    }
  });
  app.get('/api/public/garages', async () => ({ garages: accessStore.listPublicGarages() }));
  app.get('/api/public/garages/:garageId', async (request, reply) => {
    try {
      const params = request.params as { garageId: string };
      const query = request.query as { places?: string };
      const garage = await searchStore.getPublicGarage(params.garageId);
      if (!garage) return reply.code(404).send({ error: 'Published garage not found' });
      if (!query.places || !searchStore.getPublicGarageMatch) return garage;
      const input = parsePublicGarageSearch({ places: query.places });
      if (!input) throw new AccessError(400, 'Search context is invalid');
      const match = await searchStore.getPublicGarageMatch(params.garageId, input.areas);
      return {
        ...garage,
        ...(match?.distanceKm === undefined
          ? {}
          : {
              searchContext: {
                distanceKm: match.distanceKm,
                matchingPlace: match.matchingPlace,
              },
            }),
      };
    } catch (error) {
      return errorResponse(error, reply);
    }
  });
  app.get(
    '/api/public/garages/:garageId/reviews',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            page: { type: 'integer', minimum: 1, maximum: 10000 },
            serviceCategoryId: { type: 'string', enum: REPAIR_REQUEST_SERVICE_CATEGORIES },
            vehicleMakeId: { type: 'string', enum: REPAIR_REQUEST_VEHICLE_MAKES },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const id = (request.params as { garageId: string }).garageId;
        const filter = request.query as {
          page?: number;
          serviceCategoryId?: string;
          vehicleMakeId?: string;
        };
        if (reviewStore.listPublicReviewPage)
          return await reviewStore.listPublicReviewPage(id, filter);
        return {
          reviews: await reviewStore.listPublicReviews(id, filter),
          page: 1,
          hasMore: false,
        };
      } catch (error) {
        return errorResponse(error, reply);
      }
    },
  );

  app.get('/api/public/garages/:garageId/photos/:photoId', async (request, reply) => {
    const params = request.params as { photoId: string; garageId: string };
    const publishedAdminPhoto = await options.administrationStore?.publicPhoto(
      params.garageId,
      params.photoId,
    );
    if (publishedAdminPhoto) return reply.redirect(publishedAdminPhoto);
    const photo = accessStore.getGaragePhoto(params.garageId, params.photoId);
    if (!photo) {
      const demoPath = localDemoPhotoPath(params.garageId, params.photoId);
      const demoProfile = demoPath ? await searchStore.getPublicGarage(params.garageId) : undefined;
      return demoPath && demoProfile
        ? reply.redirect(demoPath)
        : reply.code(404).send({ error: 'Published garage photo not found' });
    }
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
    const query = request.query as { returnTo?: unknown; prompt?: unknown; locale?: unknown };
    const locale = query.locale === 'sq' || query.locale === 'en' ? query.locale : 'de';
    const prompt =
      query.prompt === 'create'
        ? 'create'
        : query.prompt === 'select_account'
          ? 'select_account'
          : 'login';
    const browserId =
      (/^[A-Za-z0-9_-]{43}$/.test(request.cookies[AUTH_BROWSER_COOKIE] ?? '')
        ? request.cookies[AUTH_BROWSER_COOKIE]
        : undefined) || randomBytes(32).toString('base64url');
    reply.setCookie(AUTH_BROWSER_COOKIE, browserId, {
      httpOnly: true,
      path: '/auth',
      sameSite: 'lax',
      secure: process.env['NODE_ENV'] === 'production',
      maxAge: 600,
    });
    accessStore.createOidcTransaction(
      transaction.state,
      transaction.codeVerifier,
      query.returnTo === undefined
        ? `/auth/landing?locale=${locale}`
        : safeReturnTo(query.returnTo),
      {
        browserId,
        nonce: transaction.nonce,
        ...(prompt === 'login' ? { reauthenticateAfter: Math.floor(Date.now() / 1000) } : {}),
      },
    );
    return reply.redirect(
      createAuthorizationUrl(
        options.oidcConfig,
        transaction.state,
        transaction.codeChallenge,
        prompt,
        transaction.nonce,
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
    const transaction = accessStore.claimOidcTransaction(
      query.state,
      request.cookies[AUTH_BROWSER_COOKIE],
    );
    if (!transaction) {
      return reply.code(400).send({ error: 'OIDC state is invalid or expired' });
    }

    try {
      const tokens = await exchangeAuthorizationCode(
        options.oidcConfig,
        query.code,
        transaction.codeVerifier,
      );
      const identity = await verifyZitadelAccessToken(tokens.idToken, options.oidcConfig, {
        nonce: transaction.nonce!,
        reauthenticateAfter: transaction.reauthenticateAfter,
      });
      const profile = await resolveOidcProfile(options.oidcConfig, identity, tokens.accessToken);
      await moderationStore.recordVerifiedIdentity?.(identity.subject, identity.roles, profile);
      if (!accessStore.finishOidcTransaction(query.state, transaction))
        return reply.code(401).send({ error: 'OIDC login was cancelled or expired' });
      accessStore.setVerifiedRoles(identity.subject, identity.roles);
      const session = accessStore.createSession(identity.subject, undefined, profile);
      const previousSession = request.cookies['autokosova_session'];
      if (previousSession) accessStore.revokeSession(previousSession);
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
      accessStore.finishOidcTransaction(query.state, transaction);
      return reply.code(401).send({ error: 'OIDC authentication failed' });
    }
  });

  // Resolve the general login destination only after the existing OIDC callback has completed.
  // Explicit returnTo paths never visit this endpoint; account lookup cannot race session creation.
  app.get('/auth/landing', async (request, reply) => {
    const { locale } = request.query as { locale?: unknown };
    const prefix = locale === 'sq' || locale === 'en' ? `/${locale}` : '';
    let destination = `${prefix}/profile`;
    const principal = accessStore.getPrincipal(request.cookies['autokosova_session']);
    if (principal) {
      try {
        const type = await garageStore.getAccountType(principal);
        // Logout or expiry during the store read must not produce an account-specific redirect.
        const current = accessStore.getPrincipal(principal.sessionId);
        if (current?.userId === principal.userId) {
          if (current.roles.has('admin')) destination = `${prefix}/admin`;
          else if (current.roles.has('moderator')) destination = `${prefix}/moderation`;
          else if (type === 'garage') destination = `${prefix}/garages/new`;
          else if (type === 'customer') destination = `${prefix}/inquiries`;
        }
      } catch {
        // The existing profile page handles unavailable account data without another login loop.
        // Never log account/store errors or turn failed lookup into a guessed customer type.
      }
    }
    return reply.redirect(destination);
  });

  app.get('/api/session', async (request, reply) => {
    reply.header('cache-control', 'private, no-store');
    return {
      authenticated: Boolean(accessStore.getPrincipal(request.cookies['autokosova_session'])),
    };
  });
  app.get('/api/me', async (request, reply) => {
    const principal = accessStore.getPrincipal(request.cookies['autokosova_session']);
    if (!principal) {
      return reply.code(401).send({
        error: 'Authentication required',
        loginAvailable: Boolean(options.oidcConfig),
      });
    }
    try {
      const memberships = await garageStore.listOwnMemberships(principal);
      const accountType = await garageStore.getAccountType(principal);
      // Recheck expiry after the asynchronous store read, then whitelist the response.
      return {
        ...accessStore.getOwnAccount(principal),
        accountType,
        garageMemberships: memberships.map((membership) => ({
          garageId: membership.garageId,
          ...(membership.garageName ? { garageName: membership.garageName } : {}),
          role: membership.role,
        })),
      };
    } catch (error) {
      if (error instanceof AccessError) return errorResponse(error, reply);
      // Do not expose or log database errors containing account or membership values.
      return reply.code(503).send({ error: 'Account information unavailable' });
    }
  });
  app.get('/api/me/favorites', async (request, reply) => {
    reply.header('cache-control', 'private, no-store');
    try {
      const principal = requirePrincipal(request);
      if (Object.keys(request.query as object).length)
        throw new AccessError(400, 'Unexpected favorites query');
      const garageIds = await favoriteStore.listFavoriteGarageIds(principal.userId);
      accessStore.getOwnAccount(principal);
      return { garageIds };
    } catch (error) {
      if (error instanceof AccessError) return errorResponse(error, reply);
      return reply.code(503).send({ error: 'Favorites unavailable' });
    }
  });
  const favoriteParams = {
    type: 'object',
    required: ['garageId'],
    properties: { garageId: { type: 'string', minLength: 1, maxLength: 128 } },
    additionalProperties: false,
  };
  app.put(
    '/api/me/favorites/:garageId',
    { schema: { params: favoriteParams } },
    async (request, reply) => {
      reply.header('cache-control', 'private, no-store');
      try {
        const principal = requirePrincipal(request, true);
        const { garageId } = request.params as { garageId: string };
        if (!(await searchStore.getPublicGarage(garageId)))
          throw new AccessError(404, 'Garage not available');
        accessStore.getOwnAccount(principal);
        await favoriteStore.saveFavorite(principal.userId, garageId, () => {
          accessStore.getOwnAccount(principal);
        });
        accessStore.getOwnAccount(principal);
        return reply.code(204).send();
      } catch (error) {
        if (error instanceof AccessError) return errorResponse(error, reply);
        return reply.code(503).send({ error: 'Favorites unavailable' });
      }
    },
  );
  app.delete(
    '/api/me/favorites/:garageId',
    { schema: { params: favoriteParams } },
    async (request, reply) => {
      reply.header('cache-control', 'private, no-store');
      try {
        const principal = requirePrincipal(request, true);
        await favoriteStore.removeFavorite(
          principal.userId,
          (request.params as { garageId: string }).garageId,
          () => {
            accessStore.getOwnAccount(principal);
          },
        );
        accessStore.getOwnAccount(principal);
        return reply.code(204).send();
      } catch (error) {
        if (error instanceof AccessError) return errorResponse(error, reply);
        return reply.code(503).send({ error: 'Favorites unavailable' });
      }
    },
  );

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
        if (error instanceof AccessError) return errorResponse(error, reply);
        return reply.code(503).send({ error: 'Private request storage unavailable' });
      }
    },
  );

  app.get('/api/me/repair-requests', async (request, reply) => {
    try {
      const principal = requirePrincipal(request);
      const page = await repairRequestStore.listRepairRequests(
        principal.userId,
        parseRepairRequestPage(request.query),
      );
      // Expiry/revocation during an asynchronous store read must not release private data.
      accessStore.getOwnAccount(principal);
      return page;
    } catch (error) {
      if (error instanceof AccessError) return errorResponse(error, reply);
      return reply.code(503).send({ error: 'Private repair requests unavailable' });
    }
  });

  app.get('/api/me/repair-requests/:repairRequestId', async (request, reply) => {
    try {
      const principal = requirePrincipal(request);
      const params = request.params as { repairRequestId: string };
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(params.repairRequestId))
        throw new AccessError(404, 'Private repair request not found');
      const detail = await repairRequestStore.getRepairRequest(
        principal.userId,
        params.repairRequestId,
      );
      accessStore.getOwnAccount(principal);
      return reply.header('etag', `"${detail.revision}"`).send(detail);
    } catch (error) {
      if (error instanceof AccessError) return errorResponse(error, reply);
      return reply.code(503).send({ error: 'Private repair request unavailable' });
    }
  });

  for (const method of ['PUT', 'PATCH', 'DELETE'] as const) {
    app.route({
      method,
      url: '/api/me/repair-requests/:repairRequestId',
      // Validate before Fastify's schema coercion can remove a supplied owner or unknown field.
      preValidation: async (request, reply) => {
        const allowed =
          method === 'PUT' ? Object.keys(repairRequestBodySchema.properties) : ['active'];
        if (
          method !== 'DELETE' &&
          (!request.body ||
            typeof request.body !== 'object' ||
            Array.isArray(request.body) ||
            Object.keys(request.body).some((key) => !allowed.includes(key)))
        )
          return reply.code(400).send({ error: 'Invalid private request' });
        if (
          method === 'PATCH' &&
          typeof (request.body as { active?: unknown })?.active !== 'boolean'
        )
          return reply.code(400).send({ error: 'Invalid private request' });
      },
      ...(method === 'PUT' ? { schema: { body: repairRequestBodySchema } } : {}),
      handler: async (request, reply) => {
        try {
          const principal = requirePrincipal(request, true);
          const match = request.headers['if-match'];
          if (match === undefined) throw new AccessError(428, 'A request revision is required');
          if (typeof match !== 'string' || !/^"[1-9]\d{0,9}"$/.test(match))
            throw new AccessError(400, 'Invalid request revision');
          const revision = Number(match.slice(1, -1));
          if (revision > 2_147_483_647) throw new AccessError(400, 'Invalid request revision');
          const id = (request.params as { repairRequestId: string }).repairRequestId;
          if (!/^[A-Za-z0-9_-]{1,128}$/.test(id))
            throw new AccessError(404, 'Private repair request not found');
          const mutation: RepairRequestMutation =
            method === 'DELETE'
              ? { kind: 'delete' }
              : method === 'PATCH'
                ? { kind: 'activity', active: (request.body as { active: boolean }).active }
                : { kind: 'update', input: request.body as RepairRequestInput };
          if (mutation.kind === 'update') {
            const error = validateRepairRequest(mutation.input);
            if (error) throw new AccessError(400, error);
          }
          const result = await repairRequestStore.mutateRepairRequest(
            principal.userId,
            id,
            revision,
            mutation,
            () => {
              accessStore.getOwnAccount(principal);
            },
          );
          accessStore.getOwnAccount(principal);
          return result
            ? reply.header('etag', `"${result.revision}"`).send(result)
            : reply.code(204).send();
        } catch (error) {
          if (error instanceof AccessError) return errorResponse(error, reply);
          return reply.code(503).send({ error: 'Private request could not be changed' });
        }
      },
    });
  }

  app.get('/api/me/garages', async (request, reply) => {
    reply.header('cache-control', 'private, no-store');
    try {
      const principal = requirePrincipal(request);
      return { garages: await garageStore.listOwnedGarages(principal) };
    } catch (error) {
      return errorResponse(error, reply);
    }
  });

  app.get(
    '/api/me/reviews',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { page: { type: 'integer', minimum: 1, maximum: 10000 } },
        },
      },
    },
    async (request, reply) => {
      try {
        const principal = requirePrincipal(request);
        if (!reviewStore.listOwnReviewPage)
          return { reviews: await reviewStore.listOwnReviews(principal), page: 1, hasMore: false };
        const data = await reviewStore.listOwnReviewPage(
          principal,
          (request.query as { page?: number }).page ?? 1,
        );
        requirePrincipal(request);
        return data;
      } catch (error) {
        return errorResponse(error, reply);
      }
    },
  );

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
            requestId: { type: 'string', pattern: '^[a-fA-F0-9-]{36}$' },
            kind: { enum: ['complaint', 'rework'], type: 'string' },
            text: {
              maxLength: REVIEW_LIMITS.maxUpdateLength,
              minLength: REVIEW_LIMITS.minTextLength,
              type: 'string',
            },
          },
          required: ['kind', 'text', 'requestId'],
          type: 'object',
        },
      },
    },
    async (request, reply) => {
      try {
        const params = request.params as { reviewId: string };
        const body = request.body as { kind: ReviewUpdateKind; text: string; requestId: string };
        await reviewStore.postReviewUpdate(
          requirePrincipal(request, true),
          params.reviewId,
          body.kind,
          body.text,
          body.requestId,
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
      const principal = requirePrincipal(request);
      const grant = await reviewStore.issueEvidenceDownloadGrant(principal, params.reviewId);
      const result = options.localDemoFiles
        ? await options.localDemoFiles.issue(principal, grant.fileId)
        : grant;
      requirePrincipal(request);
      return result;
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

  app.get('/api/garages/duplicate-candidates', async (request, reply) => {
    try {
      requirePrincipal(request);
      const query = request.query as { name?: string; placeId?: string };
      if (!query.name?.trim() || !query.placeId?.trim()) {
        throw new AccessError(400, 'Name and placeId are required for duplicate checks');
      }
      return {
        candidates: await garageStore.listPublicDuplicateCandidates(query.name, query.placeId),
      };
    } catch (error) {
      return errorResponse(error, reply);
    }
  });

  app.post(
    '/api/garages',
    {
      schema: {
        body: {
          additionalProperties: false,
          properties: {
            consentVersion: { maxLength: 80, minLength: 1, type: 'string' },
            profile: garageProfileSchema,
          },
          required: ['consentVersion', 'profile'],
          type: 'object',
        },
      },
    },
    async (request, reply) => {
      try {
        const principal = requirePrincipal(request, true);
        const body = request.body as { consentVersion: string; profile: GarageProfileInput };
        const garage = await garageStore.createGarageRegistration(
          principal,
          body.profile,
          body.consentVersion,
        );
        return reply.code(201).send({ id: garage.id, publicationState: garage.publicationState });
      } catch (error) {
        return errorResponse(error, reply);
      }
    },
  );

  app.get('/api/garages/:garageId', async (request, reply) => {
    try {
      const principal = requirePrincipal(request);
      const params = request.params as { garageId: string };
      reply.header('cache-control', 'private, no-store');
      return await garageStore.getPrivateGarage(principal, params.garageId);
    } catch (error) {
      return errorResponse(error, reply);
    }
  });

  app.put(
    '/api/garages/:garageId',
    { schema: { body: garageProfileSchema } },
    async (request, reply) => {
      try {
        const principal = requirePrincipal(request, true);
        const params = request.params as { garageId: string };
        await garageStore.updateGarageProfile(
          principal,
          params.garageId,
          request.body as GarageProfileInput,
        );
        return reply.code(204).send();
      } catch (error) {
        return errorResponse(error, reply);
      }
    },
  );

  app.delete('/api/garages/:garageId', async (request, reply) => {
    try {
      const principal = requirePrincipal(request, true);
      const params = request.params as { garageId: string };
      await garageStore.deleteGarage(principal, params.garageId);
      return reply.code(204).send();
    } catch (error) {
      return errorResponse(error, reply);
    }
  });

  app.post('/api/garages/:garageId/submit-for-review', async (request, reply) => {
    try {
      const principal = requirePrincipal(request, true);
      const params = request.params as { garageId: string };
      await garageStore.submitGarageForReview(principal, params.garageId);
      return reply.code(204).send();
    } catch (error) {
      return errorResponse(error, reply);
    }
  });

  app.post('/api/garages/:garageId/verification-document-grants', async (request, reply) => {
    try {
      const principal = requirePrincipal(request, true);
      const params = request.params as { garageId: string };
      return reply
        .code(201)
        .send(accessStore.createGarageDocumentGrant(principal, params.garageId));
    } catch (error) {
      return errorResponse(error, reply);
    }
  });

  app.post('/api/garages/:garageId/photos', async (request, reply) => {
    try {
      const principal = requirePrincipal(request, true);
      const params = request.params as { garageId: string };
      const body = request.body;
      if (!Buffer.isBuffer(body)) throw new AccessError(415, 'A binary garage photo is required');
      const normalized = await normalizeGaragePhoto(body, request.headers['content-type']);
      const photo = accessStore.registerGaragePhoto(principal, params.garageId, normalized);
      return reply.code(201).send({
        contentType: photo.contentType,
        height: photo.height,
        id: photo.id,
        width: photo.width,
      });
    } catch (error) {
      if (error instanceof GaragePhotoError) {
        return reply.code(415).send({ error: error.message });
      }
      return errorResponse(error, reply);
    }
  });

  app.get('/api/garages/:garageId/photos/:photoId', async (request, reply) => {
    try {
      const principal = requirePrincipal(request);
      const params = request.params as { photoId: string; garageId: string };
      const photo = accessStore.getGaragePhoto(params.garageId, params.photoId, principal);
      if (!photo) throw new AccessError(404, 'Garage photo not found');
      return reply.type(photo.contentType).send(photo.content);
    } catch (error) {
      return errorResponse(error, reply);
    }
  });

  app.post(
    '/api/garages/:garageId/profile',
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
        const params = request.params as { garageId: string };
        accessStore.requireGarageMembership(principal, params.garageId);
        return reply.code(204).send();
      } catch (error) {
        return errorResponse(error, reply);
      }
    },
  );

  app.post(
    '/api/garages/:garageId/reviews/:reviewId/response',
    {
      schema: {
        body: {
          additionalProperties: false,
          properties: {
            requestId: { type: 'string', pattern: '^[a-fA-F0-9-]{36}$' },
            responseRevision: { type: 'integer', minimum: 0, maximum: 2147483647 },
            text: {
              maxLength: REVIEW_LIMITS.maxResponseLength,
              minLength: REVIEW_LIMITS.minTextLength,
              type: 'string',
            },
          },
          required: ['text', 'requestId', 'responseRevision'],
          type: 'object',
        },
      },
    },
    async (request, reply) => {
      try {
        const params = request.params as { reviewId: string; garageId: string };
        const body = request.body as { text: string; requestId: string; responseRevision: number };
        await reviewStore.postGarageResponse(
          requirePrincipal(request, true),
          params.garageId,
          params.reviewId,
          body.text,
          body.requestId,
          body.responseRevision,
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
            revision: { type: 'integer', minimum: 1 },
            reason: { type: 'string', maxLength: 40 },
            role: { enum: ['editor', 'owner'], type: 'string' },
            userId: { minLength: 1, type: 'string' },
            garageId: { minLength: 1, type: 'string' },
          },
          required: ['userId', 'garageId', 'role'],
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
          garageId: string;
        };
        if (options.administrationStore) {
          const data = request.body as typeof body &
            import('../shared/administration').AdminRevision;
          await options.administrationStore.changeMember(principal, body.garageId, {
            ...data,
            state: 'active',
          });
          return reply.code(201).send({ status: 'created' });
        }
        accessStore.addMembership(body.userId, body.garageId, body.role);
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
        const principal = requirePrincipal(request, true);
        if (!principal.roles.has('admin') && !principal.roles.has('moderator'))
          throw new AccessError(403, 'Staff access denied');
        const params = request.params as { caseId: string };
        if (
          moderationStore.decideStaffCase &&
          (request.body as ModerationActionInput).caseRevision === undefined
        )
          throw new AccessError(422, 'A current case revision is required');
        return await moderationStore.applyModerationAction(
          principal,
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
        const principal = requirePrincipal(request, true);
        if (!principal.roles.has('admin') && !principal.roles.has('moderator'))
          throw new AccessError(403, 'Staff access denied');
        const params = request.params as { reviewId: string };
        if (
          moderationStore.decideStaffCase &&
          (request.body as ReviewDecisionInput).caseRevision === undefined
        )
          throw new AccessError(422, 'A current case revision is required');
        await reviewStore.decideReview(
          principal,
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
    '/api/admin/garages/assisted-onboarding',
    {
      schema: {
        body: {
          additionalProperties: false,
          properties: {
            requestReference: { type: 'string', minLength: 5, maxLength: 200 },
            applicantUserId: { maxLength: 120, minLength: 1, type: 'string' },
            consentSource: { const: 'documented_support_request', type: 'string' },
            consentVersion: { maxLength: 80, minLength: 1, type: 'string' },
            profile: garageProfileSchema,
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
          requestReference?: string;
          applicantUserId: string;
          consentSource: 'documented_support_request';
          consentVersion: string;
          profile: GarageProfileInput;
        };
        const garage = options.administrationStore
          ? await options.administrationStore.assistedGarage(principal, {
              ...body,
              requestReference: body.requestReference ?? '',
            })
          : await garageStore.createAssistedGarage(principal, body.applicantUserId, body.profile, {
              source: body.consentSource,
              version: body.consentVersion,
            });
        return reply.code(201).send({ id: garage.id, publicationState: garage.publicationState });
      } catch (error) {
        return errorResponse(error, reply);
      }
    },
  );

  app.post(
    '/api/admin/garages/:garageId/decision',
    {
      schema: {
        body: {
          additionalProperties: false,
          properties: {
            revision: { type: 'integer', minimum: 1, maximum: 2147483647 },
            reason: { type: 'string', maxLength: 40 },
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
        const params = request.params as { garageId: string };
        const body = request.body as {
          decision: 'published' | 'rejected' | 'suspended';
          verification: VerificationChecklist;
        };
        if (options.administrationStore) {
          await options.administrationStore.decideGarage(
            principal,
            params.garageId,
            request.body as import('../shared/administration').AdminGarageDecision,
          );
          return reply.code(204).send();
        }
        await garageStore.reviewGarage(
          principal,
          params.garageId,
          body.decision,
          body.verification,
        );
        return reply.code(204).send();
      } catch (error) {
        return errorResponse(error, reply);
      }
    },
  );

  app.post(
    '/api/admin/garages/:garageId/photos/:photoId/decision',
    {
      schema: {
        body: {
          additionalProperties: false,
          properties: {
            approved: { type: 'boolean' },
            revision: { type: 'integer', minimum: 1 },
            reason: { type: 'string', maxLength: 40 },
          },
          required: ['approved'],
          type: 'object',
        },
      },
    },
    async (request, reply) => {
      try {
        const principal = requirePrincipal(request, true);
        const params = request.params as { photoId: string; garageId: string };
        const body = request.body as { approved: boolean };
        if (options.administrationStore) {
          await options.administrationStore.decidePhoto(
            principal,
            params.garageId,
            params.photoId,
            request.body as import('../shared/administration').AdminRevision & {
              approved: boolean;
            },
          );
          return reply.code(204).send();
        }
        accessStore.publishGaragePhoto(principal, params.garageId, params.photoId, body.approved);
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

  registerOidcLogout(app, accessStore, options.oidcConfig);

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
    isAccountPagePath(path) ||
    path.startsWith('/api/') ||
    path.startsWith('/auth/') ||
    path === '/anfrage' ||
    path === '/sq/anfrage' ||
    path === '/en/anfrage' ||
    path === '/werkstatt/aufnahme' ||
    path === '/sq/werkstatt/aufnahme' ||
    path === '/en/werkstatt/aufnahme' ||
    path === '/inquiry' ||
    path === '/sq/inquiry' ||
    path === '/en/inquiry' ||
    path === '/garages/new' ||
    path === '/sq/garages/new' ||
    path === '/en/garages/new' ||
    path === '/garages' ||
    path === '/sq/garages' ||
    path === '/en/garages' ||
    path === '/suche' ||
    path === '/sq/suche' ||
    path === '/en/suche' ||
    path === '/werkstaetten' ||
    path === '/sq/werkstaetten' ||
    path === '/en/werkstaetten'
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
