// apps/web/server.js  (CommonJS)
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const ROOT = __dirname;                    // apps/web
const MENU = path.join(__dirname, 'menu'); // apps/web/menu

// 정적 파일
app.use(express.static(ROOT));
app.use('/menu', express.static(MENU));
app.use('/media', express.static(path.join(ROOT, 'media')));

// API 프록시들
app.get('/api/coins/markets', async (req, res) => {
  try {
    const u = new URL('https://api.coingecko.com/api/v3/coins/markets');
    for (const [k, v] of Object.entries(req.query)) u.searchParams.set(k, v);
    if (!u.searchParams.get('vs_currency')) u.searchParams.set('vs_currency', 'usd');
    if (!u.searchParams.get('order')) u.searchParams.set('order', 'market_cap_desc');
    if (!u.searchParams.get('per_page')) u.searchParams.set('per_page', '200');
    if (!u.searchParams.get('page')) u.searchParams.set('page', '1');
    if (!u.searchParams.get('sparkline')) u.searchParams.set('sparkline', 'false');
    if (!u.searchParams.get('price_change_percentage')) u.searchParams.set('price_change_percentage', '24h,7d');

    const r = await fetch(u, { headers: { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY || '' } });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get('/api/global', async (_req, res) => {
  const r = await fetch('https://api.coingecko.com/api/v3/global');
  res.json(await r.json());
});

app.get('/api/fng', async (_req, res) => {
  const r = await fetch('https://api.alternative.me/fng/?limit=1&format=json');
  res.json(await r.json());
});

// 홈: apps/web/index.html 있으면 그걸, 없으면 apps/web/menu/index.html
app.get('/', (_req, res) => {
  const rootIdx = path.join(ROOT, 'index.html');
  const menuIdx = path.join(MENU, 'index.html');
  if (fs.existsSync(rootIdx)) return res.sendFile(rootIdx);
  if (fs.existsSync(menuIdx)) return res.sendFile(menuIdx);
  res.status(404).send('Not Found');
});

// SPA fallback
app.get('*', (_req, res) => {
  const rootIdx = path.join(ROOT, 'index.html');
  const menuIdx = path.join(MENU, 'index.html');
  if (fs.existsSync(rootIdx)) return res.sendFile(rootIdx);
  if (fs.existsSync(menuIdx)) return res.sendFile(menuIdx);
  res.status(404).send('Not Found');
});

app.listen(PORT, () => {
  console.log(`🚀 Server started on port ${PORT}`);
});
