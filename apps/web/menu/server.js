// apps/web/menu/server.js  (ESM)

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

// __dirname (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// 디렉터리 경로
const MENU_DIR  = __dirname;                        // apps/web/menu
const WEB_DIR   = path.join(__dirname, '..');       // apps/web
const MEDIA_DIR = path.join(WEB_DIR, 'media');      // apps/web/media

// 서버 & 환경
const app  = express();
const PORT = Number(process.env.PORT) || 3000;
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;

// 로그(선택)
console.log('🚀 Two4/Menu server starting…');
console.log('📁 MENU_DIR :', MENU_DIR);
console.log('📁 WEB_DIR  :', WEB_DIR);
console.log('📁 MEDIA_DIR:', MEDIA_DIR);
console.log('🔑 COINGECKO_API_KEY:', COINGECKO_API_KEY ? 'configured' : 'missing');

// CORS & JSON
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// ---- 아주 간단한 메모리 캐시 (기본 30초) ----
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.t < ttlMs) return hit.v;
  const v = await fn();
  cache.set(key, { t: now, v });
  return v;
}

// ---- 정적 서빙 ----
app.use(express.static(MENU_DIR));              // /index.html, /style.css …
app.use('/menu', express.static(MENU_DIR));     // /menu/* 경로로도 접근 가능
app.use('/media', express.static(MEDIA_DIR));   // /media/* 정적 파일
app.use(express.static(WEB_DIR));               // web 루트에 있는 리소스도 커버

// 루트 페이지
app.get('/', (_req, res) => {
  // web/index.html을 기본 루트로
  const indexPath = path.join(WEB_DIR, 'index.html');
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  // 없으면 menu/index.html
  return res.sendFile(path.join(MENU_DIR, 'index.html'));
});

// ----------------------------------------------------
// CoinGecko API 유틸 (헤더 + 쿼리 파라미터에 키 동시 전송)
// ----------------------------------------------------
async function callCoinGeckoAPI(endpoint, qs = {}, retries = 2) {
  const BASE = 'https://api.coingecko.com/api/v3';

  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'Two4-Cosmos/1.0'
  };

  // 데모/프로 일부 엔드포인트 편차 대응: 헤더와 쿼리 모두에 키 전달
  if (COINGECKO_API_KEY) {
    headers['x-cg-demo-api-key'] = COINGECKO_API_KEY;
    headers['x-cg-pro-api-key']  = COINGECKO_API_KEY; // 프로 플랜 호환
    qs['x_cg_demo_api_key'] = COINGECKO_API_KEY;      // 쿼리 키를 요구하는 케이스 호환
  }

  const params = new URLSearchParams(qs);
  const url = `${BASE}${endpoint}${params.toString() ? `?${params}` : ''}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(url, { headers, signal: controller.signal });
      const text = await res.text(); // 실패 원문 파악 위해 text 우선
      clearTimeout(timeout);

      let data;
      try { data = JSON.parse(text); } catch { data = text; }

      if (!res.ok) {
        return {
          success: false,
          statusCode: res.status,
          error: typeof data === 'string'
            ? `HTTP ${res.status}: ${res.statusText} - ${data}`
            : data
        };
      }
      return { success: true, data };
    } catch (err) {
      if (attempt === retries) {
        return {
          success: false,
          statusCode: err.name === 'AbortError' ? 408 : 500,
          error: err.message || 'Fetch error'
        };
      }
      await new Promise(r => setTimeout(r, 800 * attempt));
    }
  }
}

// ----------------------------------------------------
// API Router (두 경로에 동시에 마운트: /api, /menu/cosmos/api)
// ----------------------------------------------------
const api = express.Router();

// 헬스체크
api.get('/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString(), key: !!COINGECKO_API_KEY });
});

// 글로벌 (키 필요) - 원본
api.get('/global', async (_req, res) => {
  const result = await cached('global:30s', 30_000, () =>
    callCoinGeckoAPI('/global')
  );
  if (result.success) return res.json(result.data);
  res.status(result.statusCode || 500).json({ error: result.error });
});

// 글로벌 요약(시총/볼륨/활성코인/BTC%)
api.get('/global/summary', async (_req, res) => {
  const result = await cached('globalSummary:30s', 30_000, () =>
    callCoinGeckoAPI('/global')
  );
  if (!result.success) return res.status(result.statusCode || 500).json({ error: result.error });

  const g = result.data?.data || result.data;
  return res.json({
    marketCapUSD : g?.total_market_cap?.usd ?? null,
    volume24hUSD : g?.total_volume?.usd ?? null,
    activeCoins  : g?.active_cryptocurrencies ?? null,
    btcDominance : g?.market_cap_percentage?.btc ?? null,
    updatedAt    : new Date().toISOString()
  });
});

// 트렌딩
api.get('/trending', async (_req, res) => {
  const result = await cached('trending:30s', 30_000, () =>
    callCoinGeckoAPI('/search/trending')
  );
  if (result.success) return res.json(result.data);
  res.status(result.statusCode || 500).json({ error: result.error });
});

// 코인 마켓 데이터 프록시
api.get('/coins/markets', async (req, res) => {
  const qs = {
    vs_currency: req.query.vs_currency || 'usd',
    order: req.query.order || 'market_cap_desc',
    per_page: Math.min(parseInt(req.query.per_page) || 20, 50),
    page: Math.max(parseInt(req.query.page) || 1, 1),
  };
  if (req.query.sparkline) qs.sparkline = req.query.sparkline;
  if (req.query.price_change_percentage) qs.price_change_percentage = req.query.price_change_percentage;
  if (req.query.ids) qs.ids = req.query.ids;

  const key = `markets:${new URLSearchParams(qs).toString()}`;
  const result = await cached(key, 30_000, () =>
    callCoinGeckoAPI('/coins/markets', qs)
  );
  if (result.success) return res.json(result.data);
  res.status(result.statusCode || 500).json({ error: result.error });
});

// 상위 상승 코인(24h)
api.get('/top-gainers', async (req, res) => {
  const vs = (req.query.vs_currency || 'usd').toLowerCase();
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);

  const qs = {
    vs_currency: vs,
    order: 'market_cap_desc',
    per_page: 250,
    page: 1,
    price_change_percentage: '24h'
  };

  const result = await cached(`top:${vs}`, 30_000, () =>
    callCoinGeckoAPI('/coins/markets', qs)
  );
  if (!result.success) return res.status(result.statusCode || 500).json({ error: result.error });

  const arr = Array.isArray(result.data) ? result.data : [];
  const list = arr
    .map(x => {
      const pct = x.price_change_percentage_24h_in_currency ?? x.price_change_percentage_24h;
      return {
        id: x.id,
        symbol: x.symbol,
        name: x.name,
        rank: x.market_cap_rank,
        price: x.current_price,
        price_change_24h_pct: pct,
        market_cap: x.market_cap
      };
    })
    .filter(x => typeof x.price_change_24h_pct === 'number')
    .sort((a, b) => b.price_change_24h_pct - a.price_change_24h_pct)
    .slice(0, limit);

  res.json({ vs_currency: vs, limit, rows: list });
});

// 디버그(선택)
api.get('/__debug', (_req, res) => {
  res.json({
    dirname: MENU_DIR,
    cwd: process.cwd(),
    files: (() => { try { return fs.readdirSync(MENU_DIR) } catch { return 'err' } })(),
    media: (() => { try { return fs.readdirSync(MEDIA_DIR) } catch { return 'err' } })(),
    ts: new Date().toISOString()
  });
});

// API 라우터 마운트 (두 경로)
app.use('/api', api);
app.use('/menu/cosmos/api', api);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.path });
});

// 에러 핸들러
app.use((err, _req, res, _next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// 서버 시작
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Two4/Menu server running on :${PORT}`);
  console.log('   • static: /, /menu, /media/');
  console.log('   • api:    /api/*  &  /menu/cosmos/api/*');
});

export default app;
