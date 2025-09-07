import Fastify from 'fastify';
import cors from '@fastify/cors';

const app = Fastify({ logger: true });

app.get('/healthz', async () => {
  return {
    ok: true,
    env: process.env.APP_ENV ?? 'DEV',
    version:
      process.env.RAILWAY_GIT_COMMIT_SHA ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      'local',
    time: new Date().toISOString(),
  };
});

app.get('/', async () => ({ ok: true }));

const port = Number(process.env.PORT ?? 8787);
const host = '0.0.0.0';

async function start() {
  // 개발용 CORS 허용 (웹 개발 서버: 5173)
  await app.register(cors, {
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  try {
    await app.listen({ port, host });
    console.log(`[api] listening on http://${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
