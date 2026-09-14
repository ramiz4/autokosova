import { PostgresFavoriteStore } from './server/favorites';
import { PostgresGarageOnboardingStore } from './server/garage-onboarding-store';
import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import { join } from 'node:path';
import { createServer, isNoIndexPath } from './server/app';
import { AccessStore } from './server/access';
import { isAccountPagePath } from './server/account-profile';
import { readZitadelOidcConfig } from './server/oidc';
import { PostgresRepairRequestStore } from './server/repair-request-store';
import { PostgresReviewStore } from './server/review-store';
import { PostgresModerationStore } from './server/moderation-store';
import { PostgresGarageSearchStore } from './server/garage-search-store';
import { PostgresAnalyticsStore } from './server/analytics';
import { loadEnvironment } from '../scripts/environment.mjs';
import { isStaticAssetRequest } from './server/static-asset-path';

Object.assign(process.env, loadEnvironment());

const databaseUrl = process.env['DATABASE_URL'];
if (process.env['NODE_ENV'] === 'production' && !databaseUrl) {
  throw new Error('DATABASE_URL is required for a production server.');
}
const accessStore = new AccessStore();
const app = createServer({
  accessStore,
  ...(databaseUrl ? { garageStore: new PostgresGarageOnboardingStore(databaseUrl) } : {}),
  ...(databaseUrl ? { favoriteStore: new PostgresFavoriteStore(databaseUrl) } : {}),
  oidcConfig: readZitadelOidcConfig(process.env),
  ...(databaseUrl ? { repairRequestStore: new PostgresRepairRequestStore(databaseUrl) } : {}),
  ...(databaseUrl ? { reviewStore: new PostgresReviewStore(databaseUrl) } : {}),
  ...(databaseUrl ? { moderationStore: new PostgresModerationStore(databaseUrl) } : {}),
  ...(databaseUrl ? { searchStore: new PostgresGarageSearchStore(databaseUrl) } : {}),
  ...(databaseUrl ? { analyticsStore: new PostgresAnalyticsStore(databaseUrl) } : {}),
  analyticsEnabled: process.env['AUTOKOSOVA_ANALYTICS_ENABLED'] === 'true',
  ...(process.env['PUBLIC_SITE_URL'] ? { publicSiteUrl: process.env['PUBLIC_SITE_URL'] } : {}),
  staticRoot: join(import.meta.dirname, '../browser'),
});
const angularApp = new AngularNodeAppEngine();

app.setNotFoundHandler(async (request, reply) => {
  // Do not hand a missing browser bundle to Angular SSR: module requests must never receive
  // index.html, otherwise browsers report a misleading JavaScript MIME-type failure.
  if (isStaticAssetRequest(request.url)) {
    return reply.code(404).type('application/json').send({ error: 'Static asset not found' });
  }
  const response = await angularApp.handle(request.raw);

  if (!response) {
    return reply.code(404).send({ error: 'Not found' });
  }

  if (isNoIndexPath(request.url)) response.headers.set('x-robots-tag', 'noindex, nofollow');
  if (isAccountPagePath(request.url)) {
    response.headers.set('cache-control', 'private, no-store');
    response.headers.set('vary', 'Cookie');
    response.headers.set('referrer-policy', 'no-referrer');
  }

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
  // Local readiness must refer to this starter, even if a port was claimed concurrently.
  if (process.env['NODE_ENV'] !== 'production' && process.env['AUTOKOSOVA_DEV_INSTANCE']) {
    response.setHeader('x-autokosova-dev-instance', process.env['AUTOKOSOVA_DEV_INSTANCE']);
  }
  app.server.emit('request', request, response);
});
