// apps/web/menu/server.js
import express from 'express';
import path from 'path';
import fs from 'fs';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

// ---- 경로 상수 ----
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const MENU_DIR  = __dirname;                  // apps/web/menu
const WEB_DIR   = path.join(__dirname, '..'); // apps/web
const MEDIA_DIR = path.join(WEB_DIR, 'media');

// ---- 앱/포트 ----
const app  = express();
const PORT = Number(process.env.PORT) || 3000;

// ---- 아주 간단한 메모리 캐시(기본 30초) ----
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.t < ttlMs) return hit.v;
  const v = await fn();
  cache.set(key, { t: now, v });
  return v;
}

// ---- 미들웨어/정적 서빙 ----
app.use(express.json());
app.use(express.static(MENU_DIR));            // /menu/*.html
app.use(express.static(WEB_DIR));             // /index.html, /style.css
app.use('/media', express.static(MEDIA_DIR)); // /media/*

// 루트는 web/index.html
app.get('/', (_req, res) => res.sendFile(path.join(WEB_DIR, 'index.html')));

// ---- CoinGecko 프록시 공통 ----
const CG_KEY  = process.env.COINGECKO_API_KEY || '';
const CG_BASE = 'https://api.coingecko.com/api/v3';

async function callCG(pathname, query = '') {
  const url = `${CG_BASE}${pathname}${query ? `?${query}` : ''}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        ...(CG_KEY ? { 'x-cg-demo-api-key': CG_KEY } : {})
      },
      signal: controller.signal
    });
    clearTimeout(t);
    if (!res.ok) {
      return { ok: false, code: res.status, error: await res.text() };
    }
    return { ok: true, json: await res.json() };
  } catch (e) {
    return { ok: false, code: 500, error: e.message };
  }
}

// ---- API 라우트 묶음 ----
function attachApi(base) {
  // 헬스
  app.get(`${base}/health`, (_req, res) =>
    res.json({ ok: true, ts: new Date().toISOString(), key: !!CG_KEY })
  );

  // 트렌딩 (30초 캐시)
  app.get(`${base}/trending`, async (_req, res) => {
    const r = await cached(`${base}:trending`, 30000, async () => await callCG('/search/trending'));
    if (r.ok) return res.json(r.json);
    res.status(r.code || 500).json({ error: r.error });
  });

  // 글로벌 원본 (키 필요, 30초 캐시)
  app.get(`${base}/global`, async (_req, res) => {
    if (!CG_KEY) return res.status(400).json({ error: 'COINGECKO_API_KEY required' });
    const r = await cached(`${base}:global`, 30000, async () => await callCG('/global'));
    if (r.ok) return res.json(r.json);
    res.status(r.code || 500).json({ error: r.error });
  });

  // 글로벌 요약(시총/24h/활성코인/BTC%)
  app.get(`${base}/global/summary`, async (_req, res) => {
    if (!CG_KEY) return res.status(400).json({ error: 'COINGECKO_API_KEY required for global summary' });
    const r = await cached(`${base}:globalSummary`, 30000, async () => await callCG('/global'));
    if (!r.ok) return res.status(r.code || 500).json({ error: r.error });

    const g = r.json.data || r.json;
    res.json({
      marketCapUSD : g?.total_market_cap?.usd ?? null,
      volume24hUSD : g?.total_volume?.usd ?? null,
      activeCoins  : g?.active_cryptocurrencies ?? null,
      btcDominance : g?.market_cap_percentage?.btc ?? null,
      updatedAt    : new Date().toISOString()
    });
  });

  // 마켓 리스트 (테이블용, 15초 캐시)
  app.get(`${base}/coins/markets`, async (req, res) => {
    const q = new URLSearchParams();
    q.set('vs_currency', req.query.vs_currency || 'usd');
    q.set('order', req.query.order || 'market_cap_desc');
    q.set('per_page', Math.min(parseInt(req.query.per_page || '20', 10), 50).toString());
    q.set('page', Math.max(parseInt(req.query.page || '1', 10), 1).toString());
    if (req.query.sparkline) q.set('sparkline', req.query.sparkline);
    if (req.query.price_change_percentage) q.set('price_change_percentage', req.query.price_change_percentage);
    if (req.query.ids) q.set('ids', req.query.ids);

    const key = `${base}:markets:${q.toString()}`;
    const r = await cached(key, 15000, async () => await callCG('/coins/markets', q.toString()));
    if (r.ok) return res.json(r.json);
    res.status(r.code || 500).json({ error: r.error });
  });

  // 최댓상승(24h) 상위 N개 (30초 캐시)
  app.get(`${base}/top-gainers`, async (req, res) => {
    const vs    = req.query.vs_currency || 'usd';
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);
    const perPage = Math.min(parseInt(req.query.per_page || '200', 10), 250); // 넉넉히 가져와서 상위만 추출

    const q = new URLSearchParams({
      vs_currency: vs,
      order: 'market_cap_desc',
      per_page: String(perPage),
      page: '1',
      price_change_percentage: '24h'
    });

    const key = `${base}:topGainers:${q.toString()}`;
    const r = await cached(key, 30000, async () => await callCG('/coins/markets', q.toString()));
    if (!r.ok) return res.status(r.code || 500).json({ error: r.error });

    const rows = (r.json || [])
      .map(x => ({
        id   : x.id,
        symbol: x.symbol,
        name : x.name,
        rank : x.market_cap_rank,
        price: x.current_price,
        price_change_24h_pct: x.price_change_percentage_24h_in_currency,
        market_cap: x.market_cap
      }))
      .filter(x => typeof x.price_change_24h_pct === 'number')
      .sort((a, b) => b.price_change_24h_pct - a.price_change_24h_pct)
      .slice(0, limit);

    res.json({ vs_currency: vs, limit, rows });
  });
}

// 두 베이스 모두 활성화 (상대/절대 경로 모두 커버)
attachApi('/api');
attachApi('/menu/cosmos/api');

// ---- (선택) 디버그 엔드포인트 ----
app.get('/__debug', (_req, res) => {
  const out = {
    MENU_DIR, WEB_DIR, MEDIA_DIR,
    menuFiles : (() => { try { return fs.readdirSync(MENU_DIR)  } catch { return 'err' } })(),
    webFiles  : (() => { try { return fs.readdirSync(WEB_DIR)   } catch { return 'err' } })(),
    mediaFiles: (() => { try { return fs.readdirSync(MEDIA_DIR) } catch { return 'err' } })(),
    ts: new Date().toISOString(),
  };
  res.json(out);
});

// ---- 404 ----
app.use((_req, res) => res.status(404).send('Not Found'));

// ---- start ----
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Two4] serving on :${PORT}`);
});

export default app;
