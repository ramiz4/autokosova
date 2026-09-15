import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AccessError, type Principal } from './access';
import {
  STAFF_ESCALATION_REASONS,
  type ModerationLifecycleStore,
  type StaffQueueFilter,
  type StaffCaseAssignment,
  type StaffCaseEscalation,
} from './moderation';

export function registerStaffRoutes(
  app: FastifyInstance,
  store: ModerationLifecycleStore,
  requirePrincipal: (request: FastifyRequest, write?: boolean) => Principal,
  respond: (error: unknown, reply: FastifyReply) => unknown,
): void {
  const params = {
    type: 'object',
    required: ['caseId'],
    additionalProperties: false,
    properties: { caseId: { type: 'string', minLength: 1, maxLength: 200 } },
  };
  const revision = { type: 'integer', minimum: 1, maximum: 2147483647 };
  function available() {
    if (
      !store.listStaffCases ||
      !store.getStaffCase ||
      !store.listStaffModerators ||
      !store.assignStaffCase ||
      !store.escalateStaffCase
    )
      throw new AccessError(503, 'The persistent staff workspace is unavailable');
  }
  function staff(request: FastifyRequest, write = false) {
    const principal = requirePrincipal(request, write);
    if (!principal.roles.has('admin') && !principal.roles.has('moderator'))
      throw new AccessError(403, 'Staff access denied');
    available();
    return principal;
  }
  app.get(
    '/api/staff/cases',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            page: { type: 'integer', minimum: 1, maximum: 10000 },
            kind: { enum: ['report', 'review_submission', 'garage_submission', 'data_deletion'] },
            status: {
              enum: ['submitted', 'assigned', 'waiting_for_subject', 'resolved', 'rejected'],
            },
            priority: { enum: ['normal', 'high'] },
            escalated: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        return await store.listStaffCases!(staff(request), request.query as StaffQueueFilter);
      } catch (error) {
        return respond(error, reply);
      }
    },
  );
  app.get('/api/staff/moderators', async (request, reply) => {
    try {
      return { moderators: await store.listStaffModerators!(staff(request)) };
    } catch (error) {
      return respond(error, reply);
    }
  });
  app.get('/api/staff/cases/:caseId', { schema: { params } }, async (request, reply) => {
    try {
      return await store.getStaffCase!(
        staff(request),
        (request.params as { caseId: string }).caseId,
      );
    } catch (error) {
      return respond(error, reply);
    }
  });
  app.post(
    '/api/staff/cases/:caseId/assign',
    {
      schema: {
        params,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['moderatorUserId', 'revision'],
          properties: {
            moderatorUserId: { type: 'string', minLength: 1, maxLength: 200 },
            revision,
          },
        },
      },
    },
    async (request, reply) => {
      try {
        await store.assignStaffCase!(
          staff(request, true),
          (request.params as { caseId: string }).caseId,
          request.body as StaffCaseAssignment,
        );
        return reply.code(204).send();
      } catch (error) {
        return respond(error, reply);
      }
    },
  );
  app.post(
    '/api/staff/cases/:caseId/escalate',
    {
      schema: {
        params,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['reason', 'revision'],
          properties: { reason: { type: 'string', enum: STAFF_ESCALATION_REASONS }, revision },
        },
      },
    },
    async (request, reply) => {
      try {
        await store.escalateStaffCase!(
          staff(request, true),
          (request.params as { caseId: string }).caseId,
          request.body as StaffCaseEscalation,
        );
        return reply.code(204).send();
      } catch (error) {
        return respond(error, reply);
      }
    },
  );
}
