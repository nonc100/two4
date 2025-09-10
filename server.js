// server.js
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');               // ⬅️ 추가

const app = express();
const PORT = process.env.COSMOS_PORT || process.env.PORT || 3000;

// 정적 파일 서빙 (apps/web 폴더)
app.use(express.static(path.join(__dirname, 'apps/web')));
app.use('/media', express.static(path.join(__dirname, 'apps/web/media')));

function setCorsAndCache(res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
}

// CoinGecko 키 (Railway Variables)
const CG_PRO  = process.env.X_CG_PRO_API_KEY || '';
const CG_DEMO = process.env.COINGECKO_API_KEY || process.env.X_CG_DEMO_API_KEY || '';
const cgHeaders = { 'User-Agent': 'two4-cosmos/1.0' };
if (CG_PRO) cgHeaders['x-cg-pro-api-key'] = CG_PRO;
else if (CG_DEMO) cgHeaders['x-cg-demo-api-key'] = CG_DEMO;

// 초간단 메모리 캐시
const cache = new Map();
const TTL_MS = 60_000;
const hit  = k => { const v = cache.get(k); return v && Date.now()-v.t < TTL_MS ? v : null; };
const keep = (k,p) => { if (p.ok) cache.set(k, { ...p, t: Date.now() }); };

async function proxyFetch(url, headers = {}){
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const r = await fetch(url, { headers, signal: ac.signal });
    const body = await r.text();
    clearTimeout(timer);
    return { ok: r.ok, status: r.status, body, ct: r.headers.get('content-type') || 'application/json; charset=utf-8' };
  } catch (e){
    clearTimeout(timer);
    return { ok:false, status:502, body: JSON.stringify({ error:'proxy failed', detail:String(e) }), ct:'application/json; charset=utf-8' };
  }
}

// /api/coins/markets
app.get('/api/coins/markets', async (req, res) => {
  const u = new URL('https://api.coingecko.com/api/v3/coins/markets');
  for (const [k,v] of Object.entries(req.query)) u.searchParams.set(k,v);
  if (!u.searchParams.get('vs_currency')) u.searchParams.set('vs_currency','usd');
  if (!u.searchParams.get('order'))      u.searchParams.set('order','market_cap_desc');
  const per_page = Math.min(Number(req.query.per_page) || 100, 250);
  u.searchParams.set('per_page', String(per_page));
  if (!u.searchParams.get('page'))       u.searchParams.set('page','1');
  if (!u.searchParams.get('sparkline'))  u.searchParams.set('sparkline','true');
  if (!u.searchParams.get('price_change_percentage')) u.searchParams.set('price_change_percentage','1h,24h,7d');

  const key = `CG:${u.toString()}`;
  const cached = hit(key); if (cached){ setCorsAndCache(res); return res.type(cached.ct).status(cached.status).send(cached.body); }

  const payload = await proxyFetch(u, cgHeaders);
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

// /api/global
app.get('/api/global', async (_req, res) => {
  const u = 'https://api.coingecko.com/api/v3/global';
  const key = `CG:${u}`;
  const cached = hit(key); if (cached){ setCorsAndCache(res); return res.type(cached.ct).status(cached.status).send(cached.body); }

  const payload = await proxyFetch(u, cgHeaders);
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

// /api/simple/price
app.get('/api/simple/price', async (req, res) => {
  const u = new URL('https://api.coingecko.com/api/v3/simple/price');
  for (const [k,v] of Object.entries(req.query)) u.searchParams.set(k,v);
  
  const key = `CG:${u.toString()}`;
  const cached = hit(key); if (cached){ setCorsAndCache(res); return res.type(cached.ct).status(cached.status).send(cached.body); }

  const payload = await proxyFetch(u, cgHeaders);
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

// /api/coins/:id/market_chart
app.get('/api/coins/:id/market_chart', async (req, res) => {
  const u = new URL(`https://api.coingecko.com/api/v3/coins/${req.params.id}/market_chart`);
  for (const [k,v] of Object.entries(req.query)) u.searchParams.set(k,v);
  
  const key = `CG:${u.toString()}`;
  const cached = hit(key); if (cached){ setCorsAndCache(res); return res.type(cached.ct).status(cached.status).send(cached.body); }

  const payload = await proxyFetch(u, cgHeaders);
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

// /api/fng (alternative.me)
app.get('/api/fng', async (req, res) => {
  const u = new URL('https://api.alternative.me/fng/');
  u.searchParams.set('limit',  req.query.limit  || '1');
  u.searchParams.set('format', req.query.format || 'json');

  const key = `FNG:${u.toString()}`;
  const cached = hit(key); if (cached){ setCorsAndCache(res); return res.type(cached.ct).status(cached.status).send(cached.body); }

  const payload = await proxyFetch(u, { 'User-Agent':'two4-cosmos/1.0' });
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

// 기본 라우트들
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'apps/web/index.html'));
});

app.get('/ai-chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'apps/web/ai-chat.html'));
});

// 존재하지 않는 정적/비HTML 요청은 404 처리
app.use((req, res, next) => {
  if (req.accepts('html')) return next();
  res.status(404).end();
});

// SPA fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'apps/web/index.html')));

// =========================
// ✅ MongoDB 연결 후 서버 시작
// =========================
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set');
  process.exit(1);
}

// 보기 편하게 민감정보 마스킹해서 출력
try {
  const u = new URL(MONGODB_URI);
  const masked = `${u.protocol}//${u.username ? u.username : '(no-user)'}:****@${u.host}${u.pathname || ''}`;
  console.log('🔌 Trying MongoDB:', masked, u.search.includes('%21') ? '(contains %21)' : '');
} catch (_) {
  console.log('🔌 Trying MongoDB: (unable to parse URI)');
}

mongoose.set('strictQuery', true);

mongoose.connect(MONGODB_URI, {
  // dbName을 URI에 명시하지 않았다면 아래 주석 해제 → dbName: 'two4',
  serverSelectionTimeoutMS: 10000,
})
.then(() => {
  console.log('✅ MongoDB connected');
   app.listen(PORT, () => console.log(`🚀 Cosmos server on ${PORT}`));
})
.catch(err => {
  console.error('❌ MongoDB connect error:', err.message);
  process.exit(1);
});
