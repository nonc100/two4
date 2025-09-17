'use strict';

const fastifyFactory = require('fastify');
const fastifyCors = require('@fastify/cors');

function buildServer(opts = {}) {
  const app = fastifyFactory({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      ...(opts.logger || {})
    }
  });

  app.register(fastifyCors, {
    origin: true,
    credentials: false
  });

  app.get('/healthz', async () => ({
    ok: true,
    service: 'two4-api',
    at: new Date().toISOString()
  }));

  app.register(require('./plugins/news-ko'));

  return app;
}

async function start() {
  const server = buildServer();
  const port = Number(process.env.PORT || process.env.API_PORT || 5000);
  const host = process.env.HOST || '0.0.0.0';

  try {
    await server.listen({ port, host });
    server.log.info({ port, host }, 'TWO4 API server started');
  } catch (error) {
    server.log.error({ err: error }, 'Failed to start TWO4 API server');
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = buildServer;
