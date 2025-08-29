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

// 로그
console.log('🚀 Two4/Menu server booting…');
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
// 루트(/)에서 menu 정적 파일 접근 가능: /index.html, /style.css …
app.use(express.static(MENU_DIR));
// /media/* 정적 파일
app.use('/media', express.static(MEDIA_DIR));
// /menu/* 로 접근해도 동일하게 menu 정적 파일 서빙
app.use('/menu', express.static(MENU_DIR));

// 라우트: 기본 페이지
app.get('/', (_req, res) => {
  res.sendFile(path.join(MENU_DIR, 'index.html'));
});

// ----------------------------------------------------
// CoinGecko API 유틸
// ----------------------------------------------------
async function callCoinGeckoAPI(endpoint, retries = 2) {
  const url = `https://api.coingecko.com/api/v3${endpoint}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      // demo/pro 두 헤더를 모두 세팅 (서버 쪽에서 필요한 헤더를 사용)
      const headers = {
        'Accept': 'application/json',
        'User-Agent': 'Two4-Cosmos/1.0',
        ...(COINGECKO_API_KEY ? {
          'x-cg-demo-api-key': COINGECKO_API_KEY,
          'x-cg-pro-api-key' : COINGECKO_API_KEY
        } : {})
      };

      const response = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        if (response.status === 429) throw new Error('Rate limit exceeded - 요청 한도 초과');
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return { success: true, data };
    } catch (err) {
      if (attempt === retries) {
        return {
          success: false,
          error: err.message,
          statusCode: err.name === 'AbortError' ? 408 : 500
        };
      }
      await new Promise(r => setTimeout(r, 1000 * attempt));
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

// 글로벌 시장 요약
api.get('/global', async (_req, res) => {
  const result = await cached('global:30s', 30_000, () => callCoinGeckoAPI('/global'));
  if (result.success) return res.json(result.data);
  res.status(result.statusCode || 500).json({ error: result.error });
});

// 트렌딩
api.get('/trending', async (_req, res) => {
  const result = await cached('trending:30s', 30_000, () => callCoinGeckoAPI('/search/trending'));
  if (result.success) return res.json(result.data);
  res.status(result.statusCode || 500).json({ error: result.error });
});

// 코인 마켓 데이터 프록시
api.get('/coins/markets', async (req, res) => {
  const q = new URLSearchParams();
  q.set('vs_currency', req.query.vs_currency || 'usd');
  q.set('order', req.query.order || 'market_cap_desc');
  q.set('per_page', Math.min(parseInt(req.query.per_page) || 20, 50));
  q.set('page', Math.max(parseInt(req.query.page) || 1, 1));
  if (req.query.sparkline) q.set('sparkline', req.query.sparkline);
  if (req.query.price_change_percentage) q.set('price_change_percentage', req.query.price_change_percentage);
  if (req.query.ids) q.set('ids', req.query.ids);

  const key = `markets:${q.toString()}`;
  const result = await cached(key, 30_000, () => callCoinGeckoAPI(`/coins/markets?${q.toString()}`));
  if (result.success) return res.json(result.data);
  res.status(result.statusCode || 500).json({ error: result.error });
});

// 상위 상승 코인
api.get('/top-gainers', async (req, res) => {
  const vs = req.query.vs_currency || 'usd';
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);

  const url = `/coins/markets?vs_currency=${encodeURIComponent(vs)}&order=market_cap_desc&per_page=250&page=1&price_change_percentage=24h`;
  const result = await cached(`top:${vs}`, 30_000, () => callCoinGeckoAPI(url));
  if (!result.success) return res.status(result.statusCode || 500).json({ error: result.error });

  const rows = (result.data || [])
    .filter(x => typeof x.price_change_percentage_24h === 'number')
    .sort((a, b) => (b.price_change_percentage_24h ?? -Infinity) - (a.price_change_percentage_24h ?? -Infinity))
    .slice(0, limit)
    .map(x => ({
      id: x.id,
      symbol: x.symbol,
      name: x.name,
      rank: x.market_cap_rank,
      price: x.current_price,
      price_change_24h_pct: x.price_change_percentage_24h,
      market_cap: x.market_cap
    }));

  res.json({ vs_currency: vs, limit, rows });
});

// 디버그 (필요할 때만 확인)
api.get('/__debug', (_req, res) => {
  res.json({
    dirname: MENU_DIR,
    cwd: process.cwd(),
    files: fs.readdirSync(MENU_DIR),
    media: (fs.existsSync(MEDIA_DIR) ? 'ok' : 'err'),
    ts: new Date().toISOString()
  });
});

// API 라우터 마운트
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
  console.log(`   • static: /  -> ${MENU_DIR}`);
  console.log(`   • static: /media  -> ${MEDIA_DIR}`);
  console.log(`   • api:    /api/*  & /menu/cosmos/api/*`);
});

export default app;
