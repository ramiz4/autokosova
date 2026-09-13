import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import { join } from 'node:path';
import { createServer } from './server/app';
import { readZitadelOidcConfig } from './server/oidc';

const app = createServer({
  oidcConfig: readZitadelOidcConfig(process.env),
  staticRoot: join(import.meta.dirname, '../browser'),
});
const angularApp = new AngularNodeAppEngine();

app.setNotFoundHandler(async (request, reply) => {
  const response = await angularApp.handle(request.raw);

  if (!response) {
    return reply.code(404).send({ error: 'Not found' });
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
  app.server.emit('request', request, response);
});
