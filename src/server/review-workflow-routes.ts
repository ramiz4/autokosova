import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AccessError, type Principal } from './access';
import type { ReviewStore } from './reviews';
import type { LocalDemoFileStore } from './local-demo-files';

/** Private author projections and exact synthetic-byte uploads share the normal auth/CSRF path. */
export function registerReviewWorkflowRoutes(
  app: FastifyInstance,
  reviews: ReviewStore,
  files: LocalDemoFileStore | undefined,
  requirePrincipal: (request: FastifyRequest, write?: boolean) => Principal,
  respond: (error: unknown, reply: FastifyReply) => unknown,
): void {
  app.get(
    '/api/me/reviews/:reviewId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['reviewId'],
          additionalProperties: false,
          properties: { reviewId: { type: 'string', minLength: 1, maxLength: 120 } },
        },
      },
    },
    async (request, reply) => {
      try {
        const principal = requirePrincipal(request);
        if (!reviews.getOwnReview) throw new AccessError(503, 'Persistent reviews are unavailable');
        const detail = await reviews.getOwnReview(
          principal,
          (request.params as { reviewId: string }).reviewId,
        );
        requirePrincipal(request);
        return detail;
      } catch (error) {
        return respond(error, reply);
      }
    },
  );
  app.get('/api/me/review-evidence', async (request, reply) => {
    try {
      requirePrincipal(request);
      return files
        ? { mode: 'local_fixture', acceptedTypes: ['text/plain'], maxBytes: 4096 }
        : { mode: 'unavailable', acceptedTypes: [], maxBytes: 0 };
    } catch (error) {
      return respond(error, reply);
    }
  });
  app.get('/api/me/review-evidence/sample', async (request, reply) => {
    try {
      requirePrincipal(request);
      if (!files) throw new AccessError(503, 'Demo evidence unavailable');
      return reply
        .type('text/plain; charset=utf-8')
        .header('content-disposition', 'attachment; filename="demo-visit.txt"')
        .send(files.visitSample());
    } catch (error) {
      return respond(error, reply);
    }
  });
  app.put(
    '/api/me/review-evidence/:requestId',
    {
      bodyLimit: 4096,
      schema: {
        params: {
          type: 'object',
          required: ['requestId'],
          additionalProperties: false,
          properties: { requestId: { type: 'string', pattern: '^[a-fA-F0-9-]{36}$' } },
        },
        body: { type: 'string', minLength: 1, maxLength: 4096 },
      },
    },
    async (request, reply) => {
      try {
        const principal = requirePrincipal(request, true);
        if (!files)
          throw new AccessError(503, 'An approved private upload store is not configured');
        const result = await files.createVisitEvidence(
          principal,
          (request.params as { requestId: string }).requestId,
          request.body as string,
        );
        requirePrincipal(request);
        return reply.code(201).send(result);
      } catch (error) {
        return respond(error, reply);
      }
    },
  );
}
