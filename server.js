// server.js
// Cosmos + Seed AI 통합 서버
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose'); // (선택) 대화 로그 저장용

const app = express();
const PORT = process.env.COSMOS_PORT || process.env.PORT || 3000;

// ----------------------------------------------------------------------------
// 공통 미들웨어
// ----------------------------------------------------------------------------
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// 정적 파일 서빙 (apps/web 폴더)
app.use(express.static(path.join(__dirname, 'apps', 'web')));
app.use('/media', express.static(path.join(__dirname, 'apps', 'web', 'media')));

function setCorsAndCache(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
}

// ----------------------------------------------------------------------------
// 초간단 메모리 캐시 & fetch 유틸
// ----------------------------------------------------------------------------
const cache = new Map();
const TTL_MS = 60_000;
const hit = (k) => {
  const v = cache.get(k);
  return v && Date.now() - v.t < TTL_MS ? v : null;
};
const keep = (k, p) => {
  if (p.ok) cache.set(k, { ...p, t: Date.now() });
};

async function proxyFetch(url, headers = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const r = await fetch(url, { headers, signal: ac.signal });
    const body = await r.text();
    clearTimeout(timer);
    return {
      ok: r.ok,
      status: r.status,
      body,
      ct: r.headers.get('content-type') || 'application/json; charset=utf-8',
    };
  } catch (e) {
    clearTimeout(timer);
    return {
      ok: false,
      status: 502,
      body: JSON.stringify({ error: 'proxy failed', detail: String(e) }),
      ct: 'application/json; charset=utf-8',
    };
  }
}

// ----------------------------------------------------------------------------
// CoinGecko / FNG (기존 기능 유지)
// ----------------------------------------------------------------------------
const CG_PRO = process.env.X_CG_PRO_API_KEY || '';
const CG_DEMO = process.env.COINGECKO_API_KEY || process.env.X_CG_DEMO_API_KEY || '';
const cgHeaders = { 'User-Agent': 'two4-cosmos/1.0' };
if (CG_PRO) cgHeaders['x-cg-pro-api-key'] = CG_PRO;
else if (CG_DEMO) cgHeaders['x-cg-demo-api-key'] = CG_DEMO;

// /api/coins/markets
app.get('/api/coins/markets', async (req, res) => {
  const u = new URL('https://api.coingecko.com/api/v3/coins/markets');
  for (const [k, v] of Object.entries(req.query)) u.searchParams.set(k, v);
  if (!u.searchParams.get('vs_currency')) u.searchParams.set('vs_currency', 'usd');
  if (!u.searchParams.get('order')) u.searchParams.set('order', 'market_cap_desc');
  const per_page = Math.min(Number(req.query.per_page) || 100, 250);
  u.searchParams.set('per_page', String(per_page));
  if (!u.searchParams.get('page')) u.searchParams.set('page', '1');
  if (!u.searchParams.get('sparkline')) u.searchParams.set('sparkline', 'true');
  if (!u.searchParams.get('price_change_percentage')) u.searchParams.set('price_change_percentage', '1h,24h,7d');

  const key = `CG:${u.toString()}`;
  const cached = hit(key);
  if (cached) {
    setCorsAndCache(res);
    return res.type(cached.ct).status(cached.status).send(cached.body);
  }

  const payload = await proxyFetch(u, cgHeaders);
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

// /api/global
app.get('/api/global', async (_req, res) => {
  const u = 'https://api.coingecko.com/api/v3/global';
  const key = `CG:${u}`;
  const cached = hit(key);
  if (cached) {
    setCorsAndCache(res);
    return res.type(cached.ct).status(cached.status).send(cached.body);
  }

  const payload = await proxyFetch(u, cgHeaders);
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

// /api/simple/price
app.get('/api/simple/price', async (req, res) => {
  const u = new URL('https://api.coingecko.com/api/v3/simple/price');
  for (const [k, v] of Object.entries(req.query)) u.searchParams.set(k, v);

  const key = `CG:${u.toString()}`;
  const cached = hit(key);
  if (cached) {
    setCorsAndCache(res);
    return res.type(cached.ct).status(cached.status).send(cached.body);
  }

  const payload = await proxyFetch(u, cgHeaders);
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

// /api/coins/:id/market_chart
app.get('/api/coins/:id/market_chart', async (req, res) => {
  const u = new URL(`https://api.coingecko.com/api/v3/coins/${req.params.id}/market_chart`);
  for (const [k, v] of Object.entries(req.query)) u.searchParams.set(k, v);

  const key = `CG:${u.toString()}`;
  const cached = hit(key);
  if (cached) {
    setCorsAndCache(res);
    return res.type(cached.ct).status(cached.status).send(cached.body);
  }

  const payload = await proxyFetch(u, cgHeaders);
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

// /api/fng (alternative.me)
app.get('/api/fng', async (req, res) => {
  const u = new URL('https://api.alternative.me/fng/');
  u.searchParams.set('limit', req.query.limit || '1');
  u.searchParams.set('format', req.query.format || 'json');

  const key = `FNG:${u.toString()}`;
  const cached = hit(key);
  if (cached) {
    setCorsAndCache(res);
    return res.type(cached.ct).status(cached.status).send(cached.body);
  }

  const payload = await proxyFetch(u, { 'User-Agent': 'two4-cosmos/1.0' });
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

// ----------------------------------------------------------------------------
// 업비트 / 바이낸스 간단 시세 (API 키 불필요)
// ----------------------------------------------------------------------------
app.get('/api/price/upbit/:market', async (req, res) => {
  try {
    const { market } = req.params; // 예: KRW-BTC
    const r = await fetch(`https://api.upbit.com/v1/ticker?markets=${encodeURIComponent(market.toUpperCase())}`);
    if (!r.ok) return res.status(r.status).json({ error: 'upbit error' });
    const [d] = await r.json();
    return res.json({
      market: d.market,
      price: d.trade_price,
      change: d.change,
      changeRate: d.signed_change_rate,
    });
  } catch (e) {
    return res.status(500).json({ error: 'server error', detail: String(e) });
  }
});

app.get('/api/price/binance/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params; // 예: BTCUSDT
    const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol.toUpperCase())}`);
    if (!r.ok) return res.status(r.status).json({ error: 'binance error' });
    const d = await r.json();
    return res.json({ symbol: d.symbol, price: Number(d.price) });
  } catch (e) {
    return res.status(500).json({ error: 'server error', detail: String(e) });
  }
});

// ----------------------------------------------------------------------------
// OpenRouter (채팅/이미지) – 프록시 (키는 서버에서만 사용)
// ----------------------------------------------------------------------------
function orHeaders() {
  return {
    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY || ''}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://two4-production.up.railway.app',
    'X-Title': 'Two.4 Seed AI',
  };
}

// POST /api/chat  { messages:[...] }
app.post('/api/chat', async (req, res) => {
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(400).json({ error: 'OPENROUTER_API_KEY missing' });
    }
    const model = process.env.MODEL_ID || 'openrouter/auto';
    const { messages = [], temperature = 0.7, max_tokens = 500 } = req.body || {};
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: orHeaders(),
      body: JSON.stringify({ model, messages, temperature, max_tokens }),
    });
    if (!r.ok) {
      const t = await r.text();
      console.error('OpenRouter chat error:', t);
      return res.status(r.status).json({ error: 'chat request failed' });
    }
    const data = await r.json();
    const reply = data?.choices?.[0]?.message?.content || '';
    // (선택) Mongo 저장
    if (messages?.length && mongo.col) {
      const lastUser = messages[messages.length - 1];
      const docs = [];
      if (lastUser?.role === 'user') docs.push({ role: 'user', content: lastUser.content, created_at: new Date() });
      docs.push({ role: 'assistant', content: reply, created_at: new Date() });
      mongo.col.insertMany(docs).catch(() => {});
    }
    return res.json({ reply });
  } catch (e) {
    return res.status(500).json({ error: 'server error', detail: String(e) });
  }
});

// POST /api/image  { prompt }
app.post('/api/image', async (req, res) => {
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(400).json({ error: 'OPENROUTER_API_KEY missing' });
    }
    const { prompt } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    const model = process.env.IMAGE_MODEL || 'stability-ai/sdxl-turbo';
    const r = await fetch('https://openrouter.ai/api/v1/images', {
      method: 'POST',
      headers: orHeaders(),
      body: JSON.stringify({ model, prompt, size: '1024x1024' }),
    });
    if (!r.ok) {
      const t = await r.text();
      console.error('OpenRouter image error:', t);
      return res.status(r.status).json({ error: 'image request failed' });
    }
    const data = await r.json();
    let url = data?.data?.[0]?.url;
    if (!url && data?.data?.[0]?.b64_json) {
      url = `data:image/png;base64,${data.data[0].b64_json}`;
    }
    if (!url) return res.status(500).json({ error: 'image not returned' });

    // (선택) Mongo 저장
    if (mongo.col) {
      mongo.col.insertOne({
        role: 'assistant',
        content: `[image] ${prompt} -> ${url}`,
        created_at: new Date(),
      }).catch(() => {});
    }
    return res.json({ url });
  } catch (e) {
    return res.status(500).json({ error: 'server error', detail: String(e) });
  }
});

// ----------------------------------------------------------------------------
// CoinGlass v4 (선택)
// ----------------------------------------------------------------------------
function cgHeadersAuth() {
  return {
    'CG-API-KEY': process.env.COINGLASS_API_KEY || '',
    'Content-Type': 'application/json',
  };
}

app.get('/api/cg/oi/agg', async (req, res) => {
  try {
    if (!process.env.COINGLASS_API_KEY) return res.status(400).json({ error: 'COINGLASS_API_KEY missing' });
    const { symbol = 'BTCUSDT', interval = '4h' } = req.query;
    const url = `https://open-api-v4.coinglass.com/api/futures/open-interest/aggregated-history?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`;
    const r = await fetch(url, { headers: cgHeadersAuth() });
    if (!r.ok) return res.status(r.status).json({ error: 'coinglass error' });
    const data = await r.json();
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: 'server error', detail: String(e) });
  }
});

app.get('/api/cg/funding', async (req, res) => {
  try {
    if (!process.env.COINGLASS_API_KEY) return res.status(400).json({ error: 'COINGLASS_API_KEY missing' });
    const { symbol = 'BTCUSDT', interval = '4h' } = req.query;
    const url = `https://open-api-v4.coinglass.com/api/futures/funding-rate/history?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`;
    const r = await fetch(url, { headers: cgHeadersAuth() });
    if (!r.ok) return res.status(r.status).json({ error: 'coinglass error' });
    const data = await r.json();
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: 'server error', detail: String(e) });
  }
});

// ----------------------------------------------------------------------------
// 기본 라우트
// ----------------------------------------------------------------------------
app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'apps', 'web', 'index.html'));
});

// 존재하지 않는 정적/비HTML 요청은 404 처리
app.use((req, res, next) => {
  if (req.accepts('html')) return next();
  res.status(404).end();
});

// SPA fallback
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'apps', 'web', 'index.html')));

// ----------------------------------------------------------------------------
// MongoDB 연결 (선택) → 없으면 경고만 찍고 서버 바로 시작
// ----------------------------------------------------------------------------
const mongo = { col: null };
const MONGODB_URI = process.env.MONGODB_URI;

async function start() {
  if (MONGODB_URI) {
    try {
      // 보기 편하게 민감정보 마스킹해서 출력
      try {
        const u = new URL(MONGODB_URI);
        const masked = `${u.protocol}//${u.username ? u.username : '(no-user)'}:****@${u.host}${u.pathname || ''}`;
        console.log('🔌 Trying MongoDB:', masked, u.search.includes('%21') ? '(contains %21)' : '');
      } catch (_) {
        console.log('🔌 Trying MongoDB: (unable to parse URI)');
      }

      mongoose.set('strictQuery', true);
      await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
      console.log('✅ MongoDB connected');

      // 간단 콜렉션(선택)
      const db = mongoose.connection.db;
      mongo.col = db.collection('chat_messages');
    } catch (err) {
      console.warn('⚠️ MongoDB connect failed (continue without DB):', err.message);
    }
  } else {
    console.warn('ℹ️ MONGODB_URI not set — running without DB logging');
  }

  app.listen(PORT, () => console.log(`🚀 Cosmos/Seed server on ${PORT}`));
}

start();
