// server.js
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.COSMOS_PORT || process.env.PORT || 3000;

// ==============================
// 📌 정적 파일 서빙
// ==============================
app.use(express.static(path.join(__dirname, 'apps/web')));
app.use('/media', express.static(path.join(__dirname, 'apps/web/media')));
// ✅ 추가: AI 전용 폴더
app.use('/ai', express.static(path.join(__dirname, 'apps/web/ai')));

// JSON 파서
app.use(express.json({ limit: '2mb' }));

function setCorsAndCache(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
}

// ==============================
// 📌 CoinGecko API 프록시
// ==============================
const CG_PRO  = process.env.X_CG_PRO_API_KEY || '';
const CG_DEMO = process.env.COINGECKO_API_KEY || process.env.X_CG_DEMO_API_KEY || '';
const cgHeaders = { 'User-Agent': 'two4-cosmos/1.0' };
if (CG_PRO) cgHeaders['x-cg-pro-api-key'] = CG_PRO;
else if (CG_DEMO) cgHeaders['x-cg-demo-api-key'] = CG_DEMO;

const cache = new Map();
const TTL_MS = 60_000;
const hit  = k => { const v = cache.get(k); return v && Date.now() - v.t < TTL_MS ? v : null; };
const keep = (k, p) => { if (p.ok) cache.set(k, { ...p, t: Date.now() }); };

async function proxyFetch(url, headers = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const r = await fetch(url, { headers, signal: ac.signal });
    const body = await r.text();
    clearTimeout(timer);
    return { ok: r.ok, status: r.status, body, ct: r.headers.get('content-type') || 'application/json; charset=utf-8' };
  } catch (e) {
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

// /api/fng
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

// ==============================
// 📌 OpenRouter 프록시 설정
// ==============================
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL_ID = process.env.MODEL_ID || 'openrouter/auto';
const OPENROUTER_SITE_URL  = process.env.OPENROUTER_SITE_URL  || 'https://two4-production.up.railway.app';
const OPENROUTER_SITE_NAME = process.env.OPENROUTER_SITE_NAME || 'TWO4 Seed AI';

// 텍스트 채팅
app.post('/api/chat', async (req, res) => {
  try {
    if (!OPENROUTER_API_KEY) {
      return res.status(500).json({ error: 'OPENROUTER_API_KEY not set' });
    }
    const { messages } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages is required' });
    }

    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': OPENROUTER_SITE_URL,
        'X-Title': OPENROUTER_SITE_NAME,
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages,
        temperature: 0.7,
        max_tokens: 800
      })
    });

    if (!r.ok) {
      const t = await r.text().catch(()=> '');
      console.error('OpenRouter upstream error:', r.status, t);
      return res.status(502).json({ error: 'openrouter upstream', detail: t });
    }

    const data = await r.json();
    const reply = data?.choices?.[0]?.message?.content || '(no content)';
    res.json({ reply });
  } catch (e) {
    console.error('/api/chat error:', e);
    res.status(500).json({ error: 'server error' });
  }
});

// 이미지 생성 자리표시자
const IMAGE_MODEL = process.env.IMAGE_MODEL || '';
app.post('/api/image', async (req, res) => {
  try {
    const { prompt } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    if (!OPENROUTER_API_KEY || !IMAGE_MODEL) {
      return res.status(501).json({ error: 'IMAGE_MODEL not configured. Set IMAGE_MODEL env and implement image call.' });
    }

    return res.status(501).json({ error: 'image generation not implemented yet' });
  } catch (e) {
    console.error('/api/image error:', e);
    res.status(500).json({ error: 'server error' });
  }
});

// ==============================
// 📌 기본 라우트
// ==============================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'apps/web/index.html'));
});

// 존재하지 않는 정적/비HTML 요청은 404
app.use((req, res, next) => {
  if (req.accepts('html')) return next();
  res.status(404).end();
});

// SPA fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'apps/web/index.html')));

// ==============================
// 📌 MongoDB 연결 + 서버 시작
// ==============================
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set');
  process.exit(1);
}

try {
  const u = new URL(MONGODB_URI);
  const masked = `${u.protocol}//${u.username || '(no-user)'}:****@${u.host}${u.pathname || ''}`;
  console.log('🔌 Trying MongoDB:', masked);
} catch (_) {
  console.log('🔌 Trying MongoDB: (unable to parse URI)');
}

mongoose.set('strictQuery', true);
mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
})
.then(() => {
  console.log('✅ MongoDB connected');
  app.listen(PORT, () => console.log(`🚀 Cosmos/seed server on ${PORT}`));
})
.catch(err => {
  console.error('❌ MongoDB connect error:', err.message);
  process.exit(1);
});

// 헬스체크
app.get('/healthz', (_req, res) => res.json({ ok: true }));
