// apps/web/menu/server.js
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ✅ Railway가 주는 PORT 우선 사용
const PORT =
  Number(process.env.PORT) ||
  Number(process.env.COSMOS_PORT) || // 있으면 보조로 사용
  3000;

// ---- 기본 설정 ----
app.disable('x-powered-by');

app.use(
  cors({
    origin:
      process.env.NODE_ENV === 'production'
        ? [/\.railway\.app$/, /localhost/]
        : true,
    credentials: true,
  })
);

app.use(express.json());

// ✅ menu 폴더 전체를 정적 서빙 (index.html, style.css, media/*, cosmos/* 전부)
app.use(express.static(__dirname));

// ---- 유틸: CoinGecko 호출 ----
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;

async function callCoinGeckoAPI(endpoint, retries = 2) {
  const url = `https://api.coingecko.com/api/v3${endpoint}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Two4-Cosmos/1.0',
          ...(COINGECKO_API_KEY && { 'x-cg-demo-api-key': COINGECKO_API_KEY }),
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        if (response.status === 429) throw new Error('Rate limit exceeded');
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return { success: true, data: await response.json() };
    } catch (e) {
      if (attempt === retries) {
        return {
          success: false,
          error: e.name === 'AbortError' ? 'Timeout' : e.message,
          statusCode: e.name === 'AbortError' ? 408 : 500,
        };
      }
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

// ---- 라우트 ----
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'Two.4 Cosmos',
    ts: new Date().toISOString(),
    apiKey: COINGECKO_API_KEY ? 'configured' : 'missing',
  });
});

// API
app.get('/api/global', async (_req, res) => {
  if (!COINGECKO_API_KEY) {
    return res.status(400).json({
      error:
        'COINGECKO_API_KEY 필요. https://www.coingecko.com/en/api 에서 발급하세요.',
    });
  }
  const r = await callCoinGeckoAPI('/global');
  r.success ? res.json(r.data) : res.status(r.statusCode || 500).json({ error: r.error });
});

app.get('/api/trending', async (_req, res) => {
  const r = await callCoinGeckoAPI('/search/trending');
  r.success ? res.json(r.data) : res.status(r.statusCode || 500).json({ error: r.error });
});

app.get('/api/coins/markets', async (req, res) => {
  const q = new URLSearchParams();
  q.set('vs_currency', req.query.vs_currency || 'usd');
  q.set('order', req.query.order || 'market_cap_desc');
  q.set('per_page', Math.min(parseInt(req.query.per_page) || 20, 50));
  q.set('page', Math.max(parseInt(req.query.page) || 1, 1));
  if (req.query.sparkline) q.set('sparkline', req.query.sparkline);
  if (req.query.price_change_percentage)
    q.set('price_change_percentage', req.query.price_change_percentage);
  if (req.query.ids) q.set('ids', req.query.ids);

  const r = await callCoinGeckoAPI(`/coins/markets?${q.toString()}`);
  r.success ? res.json(r.data) : res.status(r.statusCode || 500).json({ error: r.error });
});

// SPA/정적 루트
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 404/에러
app.use((_req, res) => res.status(404).json({ error: 'Not Found' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// ---- start ----
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Two.4 menu serving on :${PORT}`);
  console.log('📡 /health');
  console.log('🎯 /');
});

export default app;
