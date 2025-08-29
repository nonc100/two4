// apps/web/menu/server.js
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

// --- 경로/상수 ----------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);             // /apps/web/menu
const WEB_DIR    = path.join(__dirname, '..');           // /apps/web
const MEDIA_DIR  = path.join(WEB_DIR, 'media');

const app  = express();
const PORT = Number(process.env.PORT || 3000);
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;

// --- 아주 간단한 메모리 캐시 (기본 30초) ---------------------------
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.t < ttlMs) return hit.v;
  const v = await fn();
  cache.set(key, { t: now, v });
  return v;
}

// --- 공통 미들웨어 ------------------------------------------------
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// 정적 파일: / (menu), /media
app.use(express.static(__dirname));               // index.html, style.css, *.html 등
app.use('/media', express.static(MEDIA_DIR));     // /media/background.mp4 등

// --- 디버그(선택) -------------------------------------------------
app.get('/__debug', (req, res) => {
  try {
    const files = fs.readdirSync(__dirname).filter(Boolean);
    res.json({
      dirname: __dirname,
      cwd: process.cwd(),
      files,
      media: fs.existsSync(MEDIA_DIR) ? 'ok' : 'err',
      ts: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ err: e.message });
  }
});

// 루트
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// --- CoinGecko 호출 유틸 (프로/데모 자동 호스트 선택 + 재시도) -----
async function callCoinGeckoAPI(endpoint, qs = {}, retries = 2) {
  // 키가 있으면 pro → public 순서로, 없으면 public만
  const BASES = COINGECKO_API_KEY
    ? ['https://pro-api.coingecko.com/api/v3', 'https://api.coingecko.com/api/v3']
    : ['https://api.coingecko.com/api/v3'];

  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'Two4-Cosmos/1.0',
  };
  // 엔드포인트 별로 헤더/쿼리 요구가 달라 둘 다 넣어줌
  if (COINGECKO_API_KEY) {
    headers['x-cg-demo-api-key'] = COINGECKO_API_KEY; // 데모
    headers['x-cg-pro-api-key']  = COINGECKO_API_KEY; // 프로
    qs['x_cg_demo_api_key'] = COINGECKO_API_KEY;      // 쿼리로 요구하는 경우
  }

  for (let b = 0; b < BASES.length; b++) {
    const BASE = BASES[b];

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const params = new URLSearchParams(qs);
        const url = `${BASE}${endpoint}${params.toString() ? `?${params}` : ''}`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const res  = await fetch(url, { headers, signal: controller.signal });
        const text = await res.text();
        clearTimeout(timeout);

        let data;
        try { data = JSON.parse(text); } catch { data = text; }

        if (!res.ok) {
          // error_code 10010 → pro/public 호스트 변경 요구 → 다음 BASE로
          const code = data?.status?.error_code || data?.error_code;
          if (code === 10010 && b < BASES.length - 1) break;

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
          if (b < BASES.length - 1) break;
          return {
            success: false,
            statusCode: err.name === 'AbortError' ? 408 : 500,
            error: err.message || 'Fetch error'
          };
        }
        await new Promise(r => setTimeout(r, 800 * attempt));
      }
    }
    // 현재 BASE 실패 → 다음 BASE 시도
  }
}

// --- API 라우트 묶어서 부착 --------------------------------------
function attachApi(base = '/api') {
  // 헬스체크
  app.get(`${base}/health`, (req, res) => {
    res.json({ ok: true, ts: new Date().toISOString(), key: !!COINGECKO_API_KEY });
  });

  // 글로벌(요약)
  app.get(`${base}/global`, async (req, res) => {
    const key = `${base}/global`;
    const result = await cached(key, 30_000, async () =>
      callCoinGeckoAPI('/global')
    );
    if (result.success) res.json(result.data);
    else res.status(result.statusCode || 500).json({ error: result.error });
  });

  app.get(`${base}/global/summary`, async (req, res) => {
    const key = `${base}/global/summary`;
    const result = await cached(key, 30_000, async () =>
      callCoinGeckoAPI('/global')
    );
    if (result.success) {
      const g = result.data?.data ?? result.data;
      res.json({
        active_cryptocurrencies: g?.active_cryptocurrencies,
        upcoming_icos: g?.upcoming_icos,
        ongoing_icos: g?.ongoing_icos,
        markets: g?.markets,
        total_market_cap_usd: g?.total_market_cap?.usd,
        total_volume_usd: g?.total_volume?.usd,
        market_cap_percentage: g?.market_cap_percentage,
        market_cap_change_percentage_24h_usd: g?.market_cap_change_percentage_24h_usd,
      });
    } else {
      res.status(result.statusCode || 500).json({ error: result.error });
    }
  });

  // 트렌딩
  app.get(`${base}/trending`, async (req, res) => {
    const key = `${base}/trending`;
    const result = await cached(key, 30_000, async () =>
      callCoinGeckoAPI('/search/trending')
    );
    if (result.success) res.json(result.data);
    else res.status(result.statusCode || 500).json({ error: result.error });
  });

  // 코인 마켓
  app.get(`${base}/coins/markets`, async (req, res) => {
    const qs = new URLSearchParams();
    qs.set('vs_currency', req.query.vs_currency || 'usd');
    qs.set('order', req.query.order || 'market_cap_desc');
    qs.set('per_page', Math.min(parseInt(req.query.per_page) || 20, 50));
    qs.set('page', Math.max(parseInt(req.query.page) || 1, 1));
    if (req.query.sparkline) qs.set('sparkline', req.query.sparkline);
    if (req.query.price_change_percentage)
      qs.set('price_change_percentage', req.query.price_change_percentage);
    if (req.query.ids) qs.set('ids', req.query.ids);

    const key = `${base}/coins/markets:${qs.toString()}`;
    const result = await cached(key, 30_000, async () =>
      callCoinGeckoAPI('/coins/markets', Object.fromEntries(qs))
    );

    if (result.success) res.json(result.data);
    else res.status(result.statusCode || 500).json({ error: result.error });
  });

  // 최대 상승 (상위 N개)
  app.get(`${base}/top-gainers`, async (req, res) => {
    const vs = (req.query.vs_currency || 'usd').toLowerCase();
    const limit = Math.max(1, Math.min(parseInt(req.query.limit) || 10, 50));

    const result = await cached(`${base}/top-gainers:${vs}`, 30_000, async () =>
      callCoinGeckoAPI('/coins/markets', {
        vs_currency: vs,
        order: 'market_cap_desc',
        per_page: 250,
        page: 1,
        price_change_percentage: '24h'
      })
    );

    if (!result.success) {
      return res.status(result.statusCode || 500).json({ error: result.error });
    }

    const rows = (result.data || [])
      .filter(x => typeof x?.price_change_percentage_24h === 'number')
      .sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h)
      .slice(0, limit)
      .map(x => ({
        id: x.id,
        symbol: x.symbol,
        name: x.name,
        rank: x.market_cap_rank,
        price: x.current_price,
        price_change_24h_pct: x.price_change_percentage_24h,
        market_cap: x.market_cap,
      }));

    res.json({ vs_currency: vs, limit, rows });
  });
}

// /api 와 /menu/cosmos/api 둘 다 제공 (프론트에서 어느 경로를 쓰든 동작)
attachApi('/api');
attachApi('/menu/cosmos/api');

// --- 404/에러 핸들러 ----------------------------------------------
app.use((req, res) => res.status(404).json({ error: 'Not Found', path: req.path }));

app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// --- 서버 시작 ----------------------------------------------------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Two4 menu server running on :${PORT}`);
  console.log(`  menu dir : ${__dirname}`);
  console.log(`  web  dir : ${WEB_DIR}`);
  console.log(`  media dir: ${MEDIA_DIR}`);
  console.log(`  API key  : ${COINGECKO_API_KEY ? 'present' : 'missing'}`);
});

export default app;
