import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AccessError, type Principal } from './access';
import type { PostgresAdministrationStore, AdminFilter } from './administration-store';
import type { LocalDemoFileStore } from './local-demo-files';
import {
  validAdminDecision,
  validAdminLocationPoint,
  validAdminRevision,
  type AdminRevision,
} from '../shared/administration';
import type { GarageProfileInput, VerificationChecklist } from '../shared/garage-onboarding';

export function registerAdministrationRoutes(
  app: FastifyInstance,
  store: PostgresAdministrationStore | undefined,
  files: LocalDemoFileStore | undefined,
  requirePrincipal: (request: FastifyRequest, write?: boolean) => Principal,
  respond: (error: unknown, reply: FastifyReply) => unknown,
  garageProfileSchema: object,
  consoleUrl?: string,
  revokeSessions?: (userId: string) => void,
): void {
  const prefix = '/api/admin/management';
  const querySchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      page: { type: 'integer', minimum: 1, maximum: 10000 },
      query: { type: 'string', maxLength: 120 },
      status: { type: 'string', maxLength: 40 },
    },
  };
  async function admin(request: FastifyRequest, write = false): Promise<Principal> {
    const principal = requirePrincipal(request, write);
    if (!principal.roles.has('admin')) throw new AccessError(403, 'Admin access denied');
    if (!store) throw new AccessError(503, 'Persistent administration is unavailable');
    await store.validateAdmin(principal);
    return principal;
  }
  function ids(request: FastifyRequest) {
    return request.params as {
      garageId: string;
      fileId?: string;
      photoId?: string;
      requestId?: string;
    };
  }
  async function read<T>(
    request: FastifyRequest,
    action: (principal: Principal) => Promise<T>,
  ): Promise<T> {
    const principal = await admin(request),
      signature = JSON.stringify([
        principal.userId,
        principal.sessionId,
        [...principal.roles].sort(),
      ]);
    const value = await action(principal);
    const current = await admin(request);
    if (
      JSON.stringify([current.userId, current.sessionId, [...current.roles].sort()]) !== signature
    )
      throw new AccessError(403, 'Administrative context changed while loading');
    return value;
  }
  function get<T>(
    path: string,
    action: (request: FastifyRequest, principal: Principal) => Promise<T>,
  ) {
    app.get(prefix + path, { schema: { querystring: querySchema } }, async (request, reply) => {
      try {
        return await read(request, (principal) => action(request, principal));
      } catch (error) {
        return respond(error, reply);
      }
    });
  }
  get('/overview', (_, p) => store!.overview(p));
  get('/users', (r, p) => store!.users(p, r.query as AdminFilter));
  get('/garages', (r, p) => store!.garages(p, r.query as AdminFilter));
  get('/garages/:garageId', (r, p) => store!.garage(p, ids(r).garageId));
  get('/privacy', (r, p) => store!.privacy(p, r.query as AdminFilter));
  get('/audit', (r, p) => store!.auditPage(p, r.query as AdminFilter));
  get('/catalog', (_, p) => store!.catalog(p));
  get('/provider', async () => ({
    ...(approvedConsoleUrl(consoleUrl) ? { consoleUrl: approvedConsoleUrl(consoleUrl) } : {}),
  }));
  get('/garages/:garageId/documents/:fileId/grant', async (r, p) => {
    const params = ids(r),
      garage = await store!.garage(p, params.garageId);
    if (garage.deleted || !garage.documents.some((d) => d.fileId === params.fileId && d.available))
      throw new AccessError(404, 'Company document not available');
    if (!files) throw new AccessError(503, 'Private document storage is not configured');
    return files.issue(p, params.fileId!);
  });
  const post = (
    path: string,
    action: (request: FastifyRequest, principal: Principal) => Promise<void>,
  ) => {
    app.post(prefix + path, async (request, reply) => {
      try {
        const principal = await admin(request, true);
        await action(request, principal);
        return reply.code(204).send();
      } catch (error) {
        return respond(error, reply);
      }
    });
  };
  app.post(prefix + '/garages/:garageId/decision', async (request, reply) => {
    try {
      const principal = await admin(request, true);
      if (!validAdminDecision(request.body))
        throw new AccessError(422, 'Invalid administrative decision');
      return reply.send(await store!.decideGarage(principal, ids(request).garageId, request.body));
    } catch (error) {
      return respond(error, reply);
    }
  });
  post('/garages/:garageId/submit', async (r, p) => {
    const value = revisionBody(r.body, ['revision', 'reason', 'requestReference']);
    if (typeof value['requestReference'] !== 'string')
      throw new AccessError(422, 'Support reference required');
    await store!.submitSupported(p, ids(r).garageId, {
      ...value,
      requestReference: value['requestReference'],
    });
  });
  post('/users/:userId/revoke-sessions', async (r, p) => {
    if (!record(r.body) || Object.keys(r.body).length !== 0)
      throw new AccessError(422, 'Invalid session revocation request');
    const userId = (r.params as { userId: string }).userId;
    if (!revokeSessions) throw new AccessError(503, 'Local session management unavailable');
    await store!.recordSessionRevocation(p, userId);
    revokeSessions(userId);
  });
  post('/garages/:garageId/verification', async (r, p) => {
    const value = revisionBody(r.body, ['revision', 'reason', 'verification', 'locationPoint']);
    const point = value['locationPoint'];
    if (point !== undefined && !validAdminLocationPoint(point))
      throw new AccessError(422, 'Invalid point');
    await store!.verifyGarage(p, ids(r).garageId, {
      revision: value.revision,
      reason: value.reason,
      verification: value['verification'] as VerificationChecklist,
      ...(point ? { locationPoint: point as { latitude: number; longitude: number } } : {}),
    });
  });
  post('/garages/:garageId/membership', async (r, p) => {
    const value = revisionBody(r.body, ['revision', 'reason', 'userId', 'role', 'state']);
    if (typeof value['userId'] !== 'string' || value['userId'].length > 200)
      throw new AccessError(422, 'Invalid account');
    await store!.changeMember(p, ids(r).garageId, {
      ...value,
      userId: value['userId'],
      role: value['role'] as 'owner' | 'editor',
      state: value['state'] as 'active' | 'revoked',
    });
  });
  post('/garages/:garageId/ownership', async (r, p) => {
    const value = revisionBody(r.body, ['revision', 'reason', 'fromUserId', 'toUserId']);
    if (
      typeof value['fromUserId'] !== 'string' ||
      typeof value['toUserId'] !== 'string' ||
      value['fromUserId'].length > 200 ||
      value['toUserId'].length > 200
    )
      throw new AccessError(422, 'Invalid ownership transfer');
    await store!.transferOwner(p, ids(r).garageId, {
      ...value,
      fromUserId: value['fromUserId'],
      toUserId: value['toUserId'],
    });
  });
  post('/garages/:garageId/photos/:photoId/decision', async (r, p) => {
    const value = revisionBody(r.body, ['revision', 'reason', 'approved']);
    if (typeof value['approved'] !== 'boolean')
      throw new AccessError(422, 'Invalid photo decision');
    await store!.decidePhoto(p, ids(r).garageId, ids(r).photoId!, {
      ...value,
      approved: value['approved'],
    });
  });
  post('/privacy/:requestId/refresh', async (r, p) => {
    if (!record(r.body) || Object.keys(r.body).length !== 0)
      throw new AccessError(422, 'Invalid refresh request');
    await store!.refreshDeletion(p, ids(r).requestId!);
  });
  app.put(
    prefix + '/garages/:garageId/profile',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['profile', 'revision', 'reason', 'requestReference'],
          properties: {
            profile: garageProfileSchema,
            revision: { type: 'integer', minimum: 1, maximum: 2147483647 },
            reason: { const: 'documented_support' },
            requestReference: { type: 'string', minLength: 5, maxLength: 200 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const principal = await admin(request, true);
        await store!.correctProfile(
          principal,
          ids(request).garageId,
          request.body as AdminRevision & { profile: GarageProfileInput; requestReference: string },
        );
        return reply.code(204).send();
      } catch (error) {
        return respond(error, reply);
      }
    },
  );
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function revisionBody(
  value: unknown,
  keys: readonly string[],
): AdminRevision & Record<string, unknown> {
  if (
    !record(value) ||
    !validAdminRevision(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new AccessError(422, 'A current revision and valid reason are required');
  return value as AdminRevision & Record<string, unknown>;
}
function approvedConsoleUrl(value?: string): string | undefined {
  if (!value) return;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash)
      return url.href;
  } catch {
    return;
  }
  return;
}
