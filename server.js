const express = require('express');
const path = require('path');

const app = express();

// 미들웨어
app.use(express.json());

// 정적 파일 서빙 (apps/web 폴더)
app.use(express.static(path.join(__dirname, 'apps/web')));

// 기본 라우트
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'apps/web/index.html'));
});

app.get('/ai-chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'apps/web/ai-chat.html'));
});

// API 라우트들 (기본 더미 데이터)
app.get('/api/simple/price', (req, res) => {
  res.json({
    bitcoin: { usd: 45000 },
    ethereum: { usd: 3000 },
    binancecoin: { usd: 500 },
    solana: { usd: 100 },
    cardano: { usd: 0.5 },
    ripple: { usd: 0.6 },
    'avalanche-2': { usd: 25 },
    dogecoin: { usd: 0.08 }
  });
});

app.get('/api/global', (req, res) => {
  res.json({
    data: {
      total_market_cap: {
        usd: 2000000000000
      }
    }
  });
});

app.get('/api/coins/:id/market_chart', (req, res) => {
  const now = Date.now();
  const prices = [];
  
  // 7일 간의 더미 데이터 생성
  for (let i = 0; i < 7; i++) {
    const timestamp = now - (6 - i) * 24 * 60 * 60 * 1000;
    const basePrice = 45000;
    const variation = (Math.random() - 0.5) * 0.1;
    const price = basePrice * (1 + variation);
    prices.push([timestamp, price]);
  }
  
  res.json({
    prices: prices
  });
});

// API 상태 확인
app.get('/api/status', (req, res) => {
  res.json({ 
    status: 'ok',
    service: 'TWO4 서버',
    timestamp: new Date().toISOString()
  });
});

// 서버 시작
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행중입니다.`);
});
