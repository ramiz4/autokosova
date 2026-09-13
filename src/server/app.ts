import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';

export function createServer(options: { staticRoot?: string } = {}) {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/api/health', async () => ({ status: 'ok' }));

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
