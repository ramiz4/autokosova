import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import { join } from 'node:path';
import { createServer, isNoIndexPath } from './server/app';
import { AccessStore } from './server/access';
import { readZitadelOidcConfig } from './server/oidc';
import { PostgresRepairRequestStore } from './server/repair-request-store';
import { PostgresReviewStore } from './server/review-store';
import { PostgresModerationStore } from './server/moderation-store';
import { PostgresWorkshopSearchStore } from './server/workshop-search-store';
import { PostgresAnalyticsStore } from './server/analytics';

const databaseUrl = process.env['DATABASE_URL'];
if (process.env['NODE_ENV'] === 'production' && !databaseUrl) {
  throw new Error('DATABASE_URL is required for a production server.');
}
const accessStore = new AccessStore();
const app = createServer({
  accessStore,
  oidcConfig: readZitadelOidcConfig(process.env),
  ...(databaseUrl ? { repairRequestStore: new PostgresRepairRequestStore(databaseUrl) } : {}),
  ...(databaseUrl ? { reviewStore: new PostgresReviewStore(databaseUrl) } : {}),
  ...(databaseUrl ? { moderationStore: new PostgresModerationStore(databaseUrl) } : {}),
  ...(databaseUrl ? { searchStore: new PostgresWorkshopSearchStore(databaseUrl) } : {}),
  ...(databaseUrl ? { analyticsStore: new PostgresAnalyticsStore(databaseUrl) } : {}),
  analyticsEnabled: process.env['AUTOKOSOVA_ANALYTICS_ENABLED'] === 'true',
  ...(process.env['PUBLIC_SITE_URL'] ? { publicSiteUrl: process.env['PUBLIC_SITE_URL'] } : {}),
  staticRoot: join(import.meta.dirname, '../browser'),
});
const angularApp = new AngularNodeAppEngine();

app.setNotFoundHandler(async (request, reply) => {
  const response = await angularApp.handle(request.raw);

  if (!response) {
    return reply.code(404).send({ error: 'Not found' });
  }

  if (isNoIndexPath(request.url)) response.headers.set('x-robots-tag', 'noindex, nofollow');

  reply.hijack();
  await writeResponseToNodeResponse(response, reply.raw);
});

/**
 * The server listens on the port defined by `PORT`, defaulting to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = Number(process.env['PORT'] || 4000);
  app.listen({ host: '127.0.0.1', port }, (error, address) => {
    if (error) {
      throw error;
    }

    console.log(`AutoKosova listens on ${address}`);
  });
}

export const reqHandler = createNodeRequestHandler(async (request, response) => {
  await app.ready();
  app.server.emit('request', request, response);
});
