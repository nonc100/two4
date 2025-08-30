// apps/web/server.js
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 정적 파일(index.html, css, 이미지 등)을 /apps/web에서 서빙
app.use(express.static(path.join(__dirname)));

// CoinGecko 프록시
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

    const r = await fetch(u, {
      headers: { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY || '' }
    });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// 모든 라우트는 index.html로 보내서 SPA도 동작
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server started on port ${PORT}`);
});
