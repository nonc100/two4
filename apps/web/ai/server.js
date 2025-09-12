// app/web/ai/server.js
router.get('/_probe', (req, res) => {
  res.json({ ok: true, mounted: true });
});
const router = require('express').Router();
const fetch = require('node-fetch'); // v2
const cookieParser = require('cookie-parser');
const { MongoClient } = require('mongodb');

let messagesCol = null; // MongoDB optional

// Mongo 연결 (옵션)
async function getMongo() {
  if (!process.env.MONGODB_URI) return null;
  if (messagesCol) return messagesCol;
  const client = new MongoClient(process.env.MONGODB_URI, { ignoreUndefined: true });
  await client.connect();
  const db = client.db(); // 기본 DB
  messagesCol = db.collection('chat_messages');
  return messagesCol;
}

// 간단 세션 ID 생성
function randomId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// 미들웨어 (cookie) – 라우터 레벨에서도 사용 가능
router.use(cookieParser());

// 공통 OpenRouter 헤더
function orHeaders() {
  return {
    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://two4-production.up.railway.app',
    'X-Title': 'Two.4 Seed AI'
  };
}

// POST /api/chat
router.post('/chat', async (req, res) => {
  try {
    if (!req.cookies.sid) {
      res.cookie('sid', randomId(), { httpOnly: true, sameSite: 'lax' });
    }
    const model = process.env.MODEL_ID || 'openrouter/auto';
    const { messages = [], temperature = 0.7, max_tokens = 500 } = req.body || {};
    const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: orHeaders(),
      body: JSON.stringify({ model, messages, temperature, max_tokens })
    });

    if (!orRes.ok) {
      const txt = await orRes.text();
      console.error('OpenRouter chat error:', txt);
      return res.status(orRes.status).json({ error: 'chat request failed' });
    }
    const data = await orRes.json();
    const reply = data?.choices?.[0]?.message?.content || '';

    // Mongo 저장 (옵션)
    try {
      const col = await getMongo();
      if (col) {
        const sid = req.cookies.sid;
        const now = new Date();
        const toInsert = [];
        const lastUser = messages[messages.length - 1];
        if (lastUser?.role === 'user') {
          toInsert.push({ session_id: sid, role: 'user', content: lastUser.content, created_at: now });
        }
        toInsert.push({ session_id: sid, role: 'assistant', content: reply, created_at: now });
        if (toInsert.length) await col.insertMany(toInsert);
      }
    } catch (e) { console.warn('Mongo insert skipped:', e.message); }

    res.json({ reply });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
});

// POST /api/image
router.post('/image', async (req, res) => {
  try {
    if (!req.cookies.sid) {
      res.cookie('sid', randomId(), { httpOnly: true, sameSite: 'lax' });
    }
    const { prompt } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'prompt required' });
    const model = process.env.IMAGE_MODEL || 'stability-ai/sdxl-turbo';

    const orRes = await fetch('https://openrouter.ai/api/v1/images', {
      method: 'POST',
      headers: orHeaders(),
      body: JSON.stringify({ model, prompt, size: '1024x1024' })
    });
    if (!orRes.ok) {
      const t = await orRes.text();
      console.error('OpenRouter image error:', t);
      return res.status(orRes.status).json({ error: 'image request failed' });
    }
    const data = await orRes.json();
    let url = data?.data?.[0]?.url;
    if (!url && data?.data?.[0]?.b64_json) {
      url = `data:image/png;base64,${data.data[0].b64_json}`;
    }
    if (!url) return res.status(500).json({ error: 'image not returned' });

    // (옵션) Mongo 저장
    try {
      const col = await getMongo();
      if (col) {
        await col.insertOne({
          session_id: req.cookies.sid,
          role: 'assistant',
          content: `[image] ${prompt} -> ${url}`,
          created_at: new Date()
        });
      }
    } catch (e) { console.warn('Mongo insert skipped:', e.message); }

    res.json({ url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
});

// GET /api/price/upbit/:market
router.get('/price/upbit/:market', async (req, res) => {
  try {
    const { market } = req.params;
    const r = await fetch(`https://api.upbit.com/v1/ticker?markets=${encodeURIComponent(market)}`);
    if (!r.ok) return res.status(r.status).json({ error: 'upbit error' });
    const [data] = await r.json();
    res.json({
      market: data.market,
      price: data.trade_price,
      change: data.change,
      changeRate: data.signed_change_rate
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
});

// GET /api/price/binance/:symbol
router.get('/price/binance/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`);
    if (!r.ok) return res.status(r.status).json({ error: 'binance error' });
    const data = await r.json();
    res.json({ symbol: data.symbol, price: Number(data.price) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
});

// CoinGlass v4 (옵션)
function cgHeaders() {
  return {
    'CG-API-KEY': process.env.COINGLASS_API_KEY || '',
    'Content-Type': 'application/json'
  };
}

// GET /api/cg/oi/agg?symbol=BTCUSDT&interval=4h
router.get('/cg/oi/agg', async (req, res) => {
  try {
    if (!process.env.COINGLASS_API_KEY) return res.status(400).json({ error: 'COINGLASS_API_KEY missing' });
    const { symbol = 'BTCUSDT', interval = '4h' } = req.query;
    const r = await fetch(
      `https://open-api-v4.coinglass.com/api/futures/open-interest/aggregated-history?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`,
      { headers: cgHeaders() }
    );
    if (!r.ok) return res.status(r.status).json({ error: 'coinglass error' });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
});

// GET /api/cg/funding?symbol=BTCUSDT&interval=4h
router.get('/cg/funding', async (req, res) => {
  try {
    if (!process.env.COINGLASS_API_KEY) return res.status(400).json({ error: 'COINGLASS_API_KEY missing' });
    const { symbol = 'BTCUSDT', interval = '4h' } = req.query;
    const r = await fetch(
      `https://open-api-v4.coinglass.com/api/futures/funding-rate/history?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`,
      { headers: cgHeaders() }
    );
    if (!r.ok) return res.status(r.status).json({ error: 'coinglass error' });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
});

module.exports = router;
