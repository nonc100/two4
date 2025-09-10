// server.js
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const Parser = require('rss-parser');               // RSS (네이버/구글 트렌드)
const parser = new Parser();

const app = express();
const PORT = process.env.COSMOS_PORT || process.env.PORT || 3000;

// ==============================
// 정적 파일 서빙
// ==============================
app.use(express.static(path.join(__dirname, 'apps/web')));
app.use('/media', express.static(path.join(__dirname, 'apps/web/media')));
app.use('/ai', express.static(path.join(__dirname, 'apps/web/ai'))); // seed.html 등

// JSON 파서
app.use(express.json({ limit: '2mb' }));

function setCorsAndCache(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
}

// ==============================
// 공통 유틸: 메모리 캐시 & 프록시
// ==============================
const cache = new Map();
const TTL_MS = 60_000;
const hit  = key => { const v = cache.get(key); return v && (Date.now() - v.t < TTL_MS) ? v : null; };
const keep = (key, payload) => { if (payload.ok) cache.set(key, { ...payload, t: Date.now() }); };

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

// =======================================================
// ✅ CoinGecko 프록시 (COSMOS 등 암호화폐 시세용)
// =======================================================
const CG_PRO  = process.env.X_CG_PRO_API_KEY || '';
const CG_DEMO = process.env.COINGECKO_API_KEY || process.env.X_CG_DEMO_API_KEY || '';
const cgHeaders = { 'User-Agent': 'two4-cosmos/1.0' };
if (CG_PRO)  cgHeaders['x-cg-pro-api-key']  = CG_PRO;
else if (CG_DEMO) cgHeaders['x-cg-demo-api-key'] = CG_DEMO;

// 1) 마켓 리스트
// 예: /api/coins/markets?vs_currency=usd&ids=cosmos&per_page=50&page=1&sparkline=true
app.get('/api/coins/markets', async (req, res) => {
  const u = new URL('https://api.coingecko.com/api/v3/coins/markets');
  for (const [k,v] of Object.entries(req.query)) u.searchParams.set(k,v);
  if (!u.searchParams.get('vs_currency')) u.searchParams.set('vs_currency','usd');
  if (!u.searchParams.get('order'))       u.searchParams.set('order','market_cap_desc');
  const per_page = Math.min(Number(req.query.per_page) || 100, 250);
  u.searchParams.set('per_page', String(per_page));
  if (!u.searchParams.get('page'))        u.searchParams.set('page','1');
  if (!u.searchParams.get('sparkline'))   u.searchParams.set('sparkline','true');
  if (!u.searchParams.get('price_change_percentage')) u.searchParams.set('price_change_percentage','1h,24h,7d');

  const key = `CG:${u.toString()}`;
  const cached = hit(key);
  if (cached){ setCorsAndCache(res); return res.type(cached.ct).status(cached.status).send(cached.body); }

  const payload = await proxyFetch(u, cgHeaders);
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

// 2) 글로벌 메트릭
app.get('/api/global', async (_req, res) => {
  const url = 'https://api.coingecko.com/api/v3/global';
  const key = `CG:${url}`;
  const cached = hit(key);
  if (cached){ setCorsAndCache(res); return res.type(cached.ct).status(cached.status).send(cached.body); }

  const payload = await proxyFetch(url, cgHeaders);
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

// 3) 심플 가격
// 예: /api/simple/price?ids=cosmos,bitcoin&vs_currencies=usd,krw
app.get('/api/simple/price', async (req, res) => {
  const u = new URL('https://api.coingecko.com/api/v3/simple/price');
  for (const [k,v] of Object.entries(req.query)) u.searchParams.set(k,v);

  const key = `CG:${u.toString()}`;
  const cached = hit(key);
  if (cached){ setCorsAndCache(res); return res.type(cached.ct).status(cached.status).send(cached.body); }

  const payload = await proxyFetch(u, cgHeaders);
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

// 4) 특정 코인 차트
// 예: /api/coins/cosmos/market_chart?vs_currency=usd&days=7
app.get('/api/coins/:id/market_chart', async (req, res) => {
  const u = new URL(`https://api.coingecko.com/api/v3/coins/${req.params.id}/market_chart`);
  for (const [k,v] of Object.entries(req.query)) u.searchParams.set(k,v);

  const key = `CG:${u.toString()}`;
  const cached = hit(key);
  if (cached){ setCorsAndCache(res); return res.type(cached.ct).status(cached.status).send(cached.body); }

  const payload = await proxyFetch(u, cgHeaders);
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

// =======================================================
// ✅ 키 없이 쓰는 “기본 데이터” API
// =======================================================

// (A) 날씨 — Open-Meteo
// /api/weather?lat=37.56&lon=126.97
app.get('/api/weather', async (req, res) => {
  const lat = req.query.lat || '37.56';
  const lon = req.query.lon || '126.97';
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
  const key = `WEATHER:${lat},${lon}`;
  const cached = hit(key);
  if (cached){ setCorsAndCache(res); return res.type(cached.ct).status(cached.status).send(cached.body); }
  const payload = await proxyFetch(url);
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

// (B) 한국 뉴스 헤드라인 — 네이버 RSS
// /api/news?cat=newsflash|economy|politics|society|world|it
const NAVER_FEEDS = {
  newsflash: "https://rss.naver.com/newsflash.rss",
  economy:   "https://rss.naver.com/economy/economy_general.rss",
  politics:  "https://rss.naver.com/politics/politics_general.rss",
  society:   "https://rss.naver.com/society/society_general.rss",
  world:     "https://rss.naver.com/world/world_general.rss",
  it:        "https://rss.naver.com/science/science_general.rss",
};
app.get('/api/news', async (req, res) => {
  const cat = req.query.cat || 'newsflash';
  const url = NAVER_FEEDS[cat] || NAVER_FEEDS.newsflash;
  const key = `NEWS:${cat}`;
  const cached = hit(key);
  if (cached){ setCorsAndCache(res); return res.type('application/json').status(200).send(cached.body); }

  try {
    const feed = await parser.parseURL(url);
    const items = (feed.items || []).slice(0, 10).map(i => ({
      title: i.title, link: i.link, pubDate: i.pubDate
    }));
    const body = JSON.stringify({ category: cat, items });
    setCorsAndCache(res);
    res.status(200).json({ category: cat, items });
    keep(key, { ok:true, body, ct:'application/json' });
  } catch (e) {
    setCorsAndCache(res);
    res.status(500).json({ error:'news fetch failed' });
  }
});

// (C) 검색 트렌드 — Google Trends RSS (KR)
// /api/trends
app.get('/api/trends', async (_req, res) => {
  const key = 'TRENDS:KR';
  const cached = hit(key);
  if (cached){ setCorsAndCache(res); return res.type('application/json').status(200).send(cached.body); }

  try {
    const feed = await parser.parseURL('https://trends.google.com/trends/trendingsearches/daily/rss?geo=KR');
    const items = (feed.items || []).slice(0, 10).map(i => ({
      title: i.title, link: i.link, pubDate: i.pubDate
    }));
    const body = JSON.stringify({ items });
    setCorsAndCache(res);
    res.status(200).json({ items });
    keep(key, { ok:true, body, ct:'application/json' });
  } catch (e) {
    setCorsAndCache(res);
    res.status(500).json({ error:'trends fetch failed' });
  }
});

// (D) 투자심리 — Fear & Greed Index
// /api/fng
app.get('/api/fng', async (_req, res) => {
  const key = 'FNG:latest';
  const cached = hit(key);
  if (cached){ setCorsAndCache(res); return res.type(cached.ct).status(cached.status).send(cached.body); }

  const payload = await proxyFetch('https://api.alternative.me/fng/', { 'User-Agent':'two4/1.0' });
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

// (E) 환율 — exchangerate.host
// /api/exchange?from=USD&to=KRW
app.get('/api/exchange', async (req, res) => {
  const from = req.query.from || 'USD';
  const to   = req.query.to   || 'KRW';
  const url  = `https://api.exchangerate.host/convert?from=${from}&to=${to}`;
  const key = `FX:${from}->${to}`;
  const cached = hit(key);
  if (cached){ setCorsAndCache(res); return res.type(cached.ct).status(cached.status).send(cached.body); }

  const payload = await proxyFetch(url);
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

// (F) 공휴일 — Nager.Date
// /api/holidays?year=2025&country=KR
app.get('/api/holidays', async (req, res) => {
  const year = req.query.year || '2025';
  const country = req.query.country || 'KR';
  const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`;
  const key = `HOLIDAYS:${country}:${year}`;
  const cached = hit(key);
  if (cached){ setCorsAndCache(res); return res.type(cached.ct).status(cached.status).send(cached.body); }

  const payload = await proxyFetch(url);
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

// =======================================================
/** ✅ OpenRouter (채팅) **/
// =======================================================
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL_ID = process.env.MODEL_ID || 'openrouter/auto';
const OPENROUTER_SITE_URL  = process.env.OPENROUTER_SITE_URL  || 'https://two4-production.up.railway.app';
const OPENROUTER_SITE_NAME = process.env.OPENROUTER_SITE_NAME || 'TWO4 Seed AI';

// 텍스트 채팅 — POST /api/chat
app.post('/api/chat', async (req, res) => {
  try {
    if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not set' });
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

// 이미지 생성 자리표시자 — POST /api/image
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
// 기본 라우트 & SPA
// ==============================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'apps/web/index.html'));
});
app.use((req, res, next) => { if (req.accepts('html')) return next(); res.status(404).end(); });
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'apps/web/index.html')));

// ==============================
// MongoDB 연결 + 서버 시작
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
mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 })
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(PORT, () => console.log(`🚀 TWO4/Seed server on ${PORT}`));
  })
  .catch(err => {
    console.error('❌ MongoDB connect error:', err.message);
    process.exit(1);
  });

// 헬스체크
app.get('/healthz', (_req, res) => res.json({ ok: true }));
