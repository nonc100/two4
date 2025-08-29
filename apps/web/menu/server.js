// apps/web/menu/server.js
import express from 'express';
import path from 'path';
import fs from 'fs';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 폴더 경로
const MENU_DIR  = __dirname;                  // apps/web/menu
const WEB_DIR   = path.join(__dirname, '..'); // apps/web
const MEDIA_DIR = path.join(WEB_DIR, 'media');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// --- 아주 간단한 메모리 캐시 (기본 30초) ---
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.t < ttlMs) return hit.v;
  const v = await fn();
  cache.set(key, { t: now, v });
  return v;
}

app.use(express.json());

// ---------- 정적 서빙 ----------
app.use(express.static(MENU_DIR));            // /menu/*.html
app.use(express.static(WEB_DIR));             // /index.html, /style.css
app.use('/media', express.static(MEDIA_DIR)); // /media/*

// 루트는 web/index.html
app.get('/', (_req, res) => res.sendFile(path.join(WEB_DIR, 'index.html')));

// ---------- CoinGecko 프록시 API ----------
const CG_KEY = process.env.COINGECKO_API_KEY || '';
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
      const msg = await res.text();
      return { ok: false, code: res.status, error: msg };
    }
    return { ok: true, json: await res.json() };
  } catch (e) {
    return { ok: false, code: 500, error: e.message };
  }
}

// 동일 라우트를 두 베이스에 장착: '/api'와 '/menu/cosmos/api'
function attachApi(base) {
  // 헬스
  app.get(`${base}/health`, (_req, res) =>
    res.json({ ok: true, ts: new Date().toISOString(), key: !!CG_KEY })
  );

  // 트렌딩
  app.get(`${base}/trending`, async (_req, res) => {
    const r = await callCG('/search/trending');
    if (r.ok) return res.json(r.json);
    res.status(r.code || 500).json({ error: r.error });
  });

  // 글로벌 (키 없으면 400 응답)
  app.get(`${base}/global`, async (_req, res) => {
    if (!CG_KEY) return res.status(400).json({ error: 'COINGECKO_API_KEY required' });
    const r = await callCG('/global');
    if (r.ok) return res.json(r.json);
    res.status(r.code || 500).json({ error: r.error });
  });

  // 마켓 리스트
  app.get(`${base}/coins/markets`, async (req, res) => {
    const q = new URLSearchParams();
    q.set('vs_currency', req.query.vs_currency || 'usd');
    q.set('order', req.query.order || 'market_cap_desc');
    q.set('per_page', Math.min(parseInt(req.query.per_page || '20', 10), 50).toString());
    q.set('page', Math.max(parseInt(req.query.page || '1', 10), 1).toString());
    if (req.query.sparkline) q.set('sparkline', req.query.sparkline);
    if (req.query.price_change_percentage) q.set('price_change_percentage', req.query.price_change_percentage);
    if (req.query.ids) q.set('ids', req.query.ids);

    const r = await callCG('/coins/markets', q.toString());
    if (r.ok) return res.json(r.json);
    res.status(r.code || 500).json({ error: r.error });
  });
}

attachApi('/api');
attachApi('/menu/cosmos/api');

// ---------- (선택) 디버그 엔드포인트 ----------
app.get('/__debug', (_req, res) => {
  const out = {
    MENU_DIR, WEB_DIR, MEDIA_DIR,
    menuFiles: (() => { try { return fs.readdirSync(MENU_DIR) } catch { return 'err' } })(),
    webFiles:  (() => { try { return fs.readdirSync(WEB_DIR)  } catch { return 'err' } })(),
    mediaFiles:(() => { try { return fs.readdirSync(MEDIA_DIR)} catch { return 'err' } })(),
    ts: new Date().toISOString(),
  };
  res.json(out);
});

// 404 핸들러
app.use((_req, res) => res.status(404).send('Not Found'));

// start
app.listen(PORT, '0.0.0.0', () => console.log(`[Two4] serving on :${PORT}`));
export default app;
