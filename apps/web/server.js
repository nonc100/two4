// apps/web/server.js  (ESM)
import express from 'express';
import path, { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const app  = express();
const PORT = process.env.PORT || 3000;

/* 정적 파일 (apps/web 루트 + /media) */
app.use(express.static(__dirname));
app.use('/media', express.static(join(__dirname, '..', 'media')));

/* CoinGecko 키 & 헤더 */
const CG_DEMO = process.env.COINGECKO_API_KEY
             || process.env.CG_API_KEY
             || process.env.X_CG_DEMO_API_KEY
             || '';
const CG_PRO  = process.env.X_CG_PRO_API_KEY || '';

const cgHeaders = { 'User-Agent': 'two4-cosmos/1.0' };
if (CG_PRO) cgHeaders['x-cg-pro-api-key']   = CG_PRO;
else if (CG_DEMO) cgHeaders['x-cg-demo-api-key'] = CG_DEMO;

function setCorsAndCache(res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
}

/* 헬스체크 */
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'two4-cosmos', at: Date.now() });
});

/* Fear & Greed 프록시 */
app.get('/api/fng', async (req, res) => {
  try {
    const u = new URL('https://api.alternative.me/fng/');
    u.searchParams.set('limit',  req.query.limit  || '1');
    u.searchParams.set('format', req.query.format || 'json');

    const r = await fetch(u);
    const body = await r.text();
    setCorsAndCache(res);
    res.type(r.headers.get('content-type') || 'application/json');
    res.status(r.status).send(body);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* CoinGecko 와일드카드 프록시: /api/* → /api/v3/* */
app.get('/api/*', async (req, res) => {
  try {
    const pathAfter = req.originalUrl.replace(/^\/api/, '');
    const u = new URL('https://api.coingecko.com/api/v3' + pathAfter);
    if (req.query.per_page || u.searchParams.has('per_page')) {
      const per_page = Math.min(Number(req.query.per_page) || 100, 250);
      u.searchParams.set('per_page', String(per_page));
    }
    const target = u.toString();
    const r = await fetch(target, { headers: cgHeaders });
    const body = await r.text();
    setCorsAndCache(res);
    res.type(r.headers.get('content-type') || 'application/json');
    res.status(r.status).send(body);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* ✅ Tidewave 라우트 (menu/index.html 연결) */
app.get('/tidewave', (_req, res) => {
  const filePath = join(__dirname, 'menu', 'studio.html');
  console.log('HIT /tidewave ->', filePath);
  res.sendFile(filePath);
});

/* 존재하지 않는 정적/비HTML 요청은 404 처리 */
app.use((req, res, next) => {
  if (req.accepts('html')) return next();
  res.status(404).end();
});

/* SPA fallback (맨 마지막) */
app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Web server listening on ${PORT}`);
});
