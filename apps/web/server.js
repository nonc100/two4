// apps/web/server.js  (CommonJS)
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

/* 정적 파일 (menu 폴더 + /media) */
app.use(express.static(path.join(__dirname)));
app.use('/media', express.static(path.join(__dirname, '..', 'media')));

/* CoinGecko 키 & 헤더 */
const CG_DEMO = process.env.COINGECKO_API_KEY || process.env.CG_API_KEY || process.env.X_CG_DEMO_API_KEY || '';
const CG_PRO  = process.env.X_CG_PRO_API_KEY || '';
const cgHeaders = { 'User-Agent': 'two4-cosmos/1.0' };
if (CG_PRO) cgHeaders['x-cg-pro-api-key'] = CG_PRO;
else if (CG_DEMO) cgHeaders['x-cg-demo-api-key'] = CG_DEMO;

function setCorsAndCache(res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
}

/* Fear & Greed */
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
    const target = 'https://api.coingecko.com/api/v3' + req.url.replace(/^\/api/, '');
    const r = await fetch(target, { headers: cgHeaders });
    const body = await r.text();
    setCorsAndCache(res);
    res.type(r.headers.get('content-type') || 'application/json');
    res.status(r.status).send(body);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* SPA fallback */
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server started on port ${PORT}`);
});
