import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import type { FastifyReply } from 'fastify';
import { AccessError, AccessStore } from './access';
import {
  createAuthorizationUrl,
  createPkceTransaction,
  exchangeAuthorizationCode,
  type ZitadelOidcConfig,
  verifyZitadelAccessToken,
} from './oidc';

interface ServerOptions {
  readonly accessStore?: AccessStore;
  readonly oidcConfig?: ZitadelOidcConfig;
  readonly staticRoot?: string;
}

export function createServer(options: ServerOptions = {}) {
  const app = Fastify({
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

  app.register(cookie);

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
    if (error instanceof AccessError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    throw error;
  }

  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/api/health', async () => ({ status: 'ok' }));
  app.get('/api/public/search', async () => ({ status: 'public-search-ready' }));

  app.get('/auth/login', async (_request, reply) => {
    if (!options.oidcConfig) {
      return reply.code(503).send({ error: 'OIDC is not configured' });
    }
    const transaction = createPkceTransaction();
    accessStore.createOidcTransaction(transaction.state, transaction.codeVerifier);
    return reply.redirect(
      createAuthorizationUrl(options.oidcConfig, transaction.state, transaction.codeChallenge),
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
      return reply.redirect('/');
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
        return reply
          .code(201)
          .send(accessStore.getFileGrant(principal.userId, body.contentType, body.sizeBytes));
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
    });
  }

  return app;
}
