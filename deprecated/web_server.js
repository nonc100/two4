// @deprecated
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
app.use('/ai', express.static(path.join(__dirname, 'apps/web/ai')));

// JSON 파서
app.use(express.json({ limit: '2mb' }));

function setCorsAndCache(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
}

// ==============================
// 📌 초고속 시세 집계 (Binance + Bybit + OKX)
// ==============================
const FAST_TTL = 5_000; // 5초 캐시
const fastCache = new Map();

function getCache(k) {
  const v = fastCache.get(k);
  return v && (Date.now() - v.t < FAST_TTL) ? v.data : null;
}
function setCache(k, data) { fastCache.set(k, { t: Date.now(), data }); }

const fetchJson = async (url, headers = {}, timeoutMs = 1500) => {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers, signal: ac.signal });
    clearTimeout(timer);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
};

// 거래소별 파서
const parseBinance = j => Number(j.price);
const parseBybit   = j => Number(j?.result?.list?.[0]?.lastPrice);
const parseOKX     = j => Number(j?.data?.[0]?.last);

// 심볼 매핑
const mapToExSymbols = (symbol) => ({
  binance: symbol.toUpperCase(),                        // BTCUSDT
  bybit:   symbol.toUpperCase(),                        // BTCUSDT
  okx:     symbol.toUpperCase().replace('USDT','-USDT') // BTC-USDT
});

// GET /api/price/fast?symbol=BTCUSDT
app.get('/api/price/fast', async (req, res) => {
  try {
    const symbol = (req.query.symbol || 'BTCUSDT').toUpperCase();
    const cacheKey = `FAST:${symbol}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json({ ...cached, cached: true });

    const s = mapToExSymbols(symbol);

    const candidates = [
      // Binance
      (async () => {
        const j = await fetchJson(`https://api.binance.com/api/v3/ticker/price?symbol=${s.binance}`);
        return { source: 'binance', price: parseBinance(j) };
      })(),
      // Bybit
      (async () => {
        const j = await fetchJson(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${s.bybit}`);
        return { source: 'bybit', price: parseBybit(j) };
      })(),
      // OKX
      (async () => {
        const j = await fetchJson(`https://www.okx.com/api/v5/market/ticker?instId=${s.okx}`);
        return { source: 'okx', price: parseOKX(j) };
      })(),
    ];

    // 가장 먼저 성공하는 값 채택
    const first = await Promise.any(candidates);
    if (!isFinite(first.price)) throw new Error('Invalid price');

    setCache(cacheKey, first);
    return res.json({ ...first, cached: false });
  } catch (e) {
    return res.status(502).json({ error: 'all sources failed', detail: String(e) });
  }
});

// ==============================
// 📌 OpenRouter 프록시 (Chat / Image)
// ==============================
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL_ID = process.env.MODEL_ID || 'openrouter/auto';
const OPENROUTER_SITE_URL  = process.env.OPENROUTER_SITE_URL  || 'https://two4-production.up.railway.app';
const OPENROUTER_SITE_NAME = process.env.OPENROUTER_SITE_NAME || 'TWO4 Seed AI';

// /api/chat
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

// /api/image (자리표시자)
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

app.use((req, res, next) => {
  if (req.accepts('html')) return next();
  res.status(404).end();
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'apps/web/index.html')));

// ==============================
// 📌 MongoDB 연결
// ==============================
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set');
  process.exit(1);
}

mongoose.set('strictQuery', true);

mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 })
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(PORT, () => console.log(`🚀 Cosmos/Seed server running on ${PORT}`));
  })
  .catch(err => {
    console.error('❌ MongoDB connect error:', err.message);
    process.exit(1);
  });
