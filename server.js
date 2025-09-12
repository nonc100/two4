// server.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Parser = require('rss-parser');               // RSS (네이버/구글 트렌드)
const parser = new Parser();

const app = express();
const PORT = process.env.COSMOS_PORT || process.env.PORT || 3000;

// ==============================
// 정적 파일 서빙
// ==============================
const ICON_DIR = path.join(__dirname, 'apps/web/icons');
app.use('/icons', express.static(ICON_DIR, {
  fallthrough: false,
  setHeaders(res){
    res.type('image/svg+xml');
    res.setHeader('Cache-Control','public, max-age=86400');
  }
}));
const FALLBACK_ICON = '/media/coin.svg';

app.use(express.static(path.join(__dirname, 'apps/web')));
app.use('/media', express.static(path.join(__dirname, 'apps/web/media')));
app.use('/ai', express.static(path.join(__dirname, 'apps/web/ai'))); // seed.html 등

// JSON 파서
app.use(express.json({ limit: '2mb' }));

const aiRouter = require('./apps/web/ai/server.js');
app.use('/api', aiRouter);

function setCorsAndCache(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
}

// ==============================
// 공통 유틸: 메모리 캐시 & 프록시
// ==============================
const cache = new Map();
const TTL_MS = 60_000;
const hit  = key => { const v = cache.get(key); return v && (Date.now() - v.t < TTL_MS) ? v : null; };
const keep = (key, payload) => { if (payload.ok) cache.set(key, { ...payload, t: Date.now() }); };

// === ADD: TTL-override hit() & limited concurrency map ===
const hit2 = (key, ttlMs) => {
  const v = cache.get(key);
  return v && (Date.now() - v.t < (ttlMs || TTL_MS)) ? v : null;
};
async function pmap(arr, limit, fn) {
  const out = new Array(arr.length);
  let i = 0;
  async function worker() {
    while (i < arr.length) {
      const idx = i++;
      out[idx] = await fn(arr[idx], idx);
    }
  }
  const n = Math.min(limit, Math.max(arr.length, 1));
  await Promise.all(Array.from({length: n}, worker));
  return out;
}

// 롱% 계산: ratio = long/short → long% = ratio/(1+ratio)*100
const longPct = r => {
  const x = Number(r);
  if (!isFinite(x)) return null;
  return (x / (1 + x)) * 100;
};

async function proxyFetch(url, headers = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const r = await fetch(url, { headers, signal: ac.signal });
    const body = await r.text();
    clearTimeout(timer);
    return { ok: r.ok, status: r.status, body, ct: r.headers.get('content-type') || 'application/json; charset=utf-8' };
  } catch (e) {
    clearTimeout(timer);
    return { ok:false, status:502, body: JSON.stringify({ error:'proxy failed', detail:String(e) }), ct:'application/json; charset=utf-8' };
  }
}

// =======================================================
// ✅ Binance Futures 어댑터 (CoinGecko-호환 포맷으로 반환)
// =======================================================
const BINANCE_FAPI = 'https://fapi.binance.com/fapi/v1';
const BINANCE_CONT = 'https://fapi.binance.com/fapi/v1/continuousKlines';
const BINANCE_API_KEY = process.env.BINANCE_API_KEY || '';

async function bfetch(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const r = await fetch(url, {
      headers: BINANCE_API_KEY ? { 'X-MBX-APIKEY': BINANCE_API_KEY } : {},
      signal: ac.signal
    });
    const body = await r.json();
    clearTimeout(timer);
    if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(body)}`);
    return body;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// 선물 심볼 목록 (무기한/USDT/거래중만)
async function binanceFuturesSymbolsUSDT() {
  const key = 'BF:exchangeInfoUSDT';
  const cached = hit(key);
  if (cached) return JSON.parse(cached.body);

  const info = await bfetch(`${BINANCE_FAPI}/exchangeInfo`);
  const symbols = (info.symbols || [])
    .filter(s =>
      s.status === 'TRADING' &&
      s.contractType === 'PERPETUAL' &&
      s.quoteAsset === 'USDT'
    )
    .map(s => ({ symbol: s.symbol, base: s.baseAsset, quote: s.quoteAsset }));
  keep(key, { ok:true, body: JSON.stringify(symbols), ct:'application/json' });
  return symbols;
}

// 24h 통계 배치
async function binanceTicker24Batch(symbols) {
  // symbols는 ["BTCUSDT","ETHUSDT",...] 배열
  const chunkKey = `BF:ticker24:${symbols.slice(0,50).join(',')}`;
  const cached = hit(chunkKey);
  if (cached) return JSON.parse(cached.body);

  const arr = encodeURIComponent(JSON.stringify(symbols));
  const data = await bfetch(`${BINANCE_FAPI}/ticker/24hr?symbols=${arr}`);
  keep(chunkKey, { ok:true, body: JSON.stringify(data), ct:'application/json' });
  return data; // [{symbol,lastPrice,priceChangePercent,quoteVolume,...}]
}

// 7D 스파크라인 (15m * 7d = 672포인트 → 다운샘플)
function downsample(arr, target = 100) {
  if (arr.length <= target) return arr;
  const step = arr.length / target;
  const out = [];
  for (let i = 0; i < target; i++) out.push(arr[Math.floor(i*step)]);
  return out;
}
async function binanceSpark7dCloses(pair) {
  const key = `BF:spark:${pair}`;
  const cached = hit2(key, 10 * 60 * 1000); // 10분 캐시
  if (cached) return JSON.parse(cached.body);

  const u = new URL(BINANCE_CONT);
  u.searchParams.set('pair', pair);
  u.searchParams.set('contractType', 'PERPETUAL');
  u.searchParams.set('interval', '15m');
  u.searchParams.set('limit', '672');

  const kl = await bfetch(u.toString());
  const closes = kl.map(c => parseFloat(c[4])); // close
  const spark = downsample(closes, 100);

  keep(key, { ok:true, body: JSON.stringify(spark), ct:'application/json' });
  return spark;
}

// --- ADD: Futures Open Interest (per symbol) with cache ---
async function binanceOpenInterest(symbol /* e.g., 'BTCUSDT' */) {
  const key = `BF:oi:${symbol}`;
  const cached = hit2(key, 60 * 1000); // 60초 캐시
  if (cached) return JSON.parse(cached.body);

  const data = await bfetch(`${BINANCE_FAPI}/openInterest?symbol=${symbol}`);
  const oi = parseFloat(data?.openInterest ?? '0');
  keep(key, { ok:true, body: JSON.stringify(oi), ct:'application/json' });
  return oi;
}

// --- ADD: Open Interest % change helper ---
async function binanceOIChangePct(symbol){            // 60s 캐시
  const key = `BF:oipct:${symbol}`;
  const cached = hit2(key, 60*1000);
  if (cached) return JSON.parse(cached.body);

  const url = `https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=5m&limit=300`;
  const arr = await bfetch(url);
  const n = arr.length;
  const last = parseFloat(arr[n-1]?.sumOpenInterest ?? 'NaN');
  const h1   = parseFloat(arr[n-12]?.sumOpenInterest ?? 'NaN');    // 5m*12
  const d1   = parseFloat(arr[n-288]?.sumOpenInterest ?? 'NaN');   // 5m*288
  const pct = (a,b)=> (isFinite(a)&&isFinite(b)&&b!==0) ? ((a-b)/b*100) : null;
  const out = { oi_1h_pct: pct(last,h1), oi_24h_pct: pct(last,d1) };

  keep(key, { ok:true, body: JSON.stringify(out), ct:'application/json' });
  return out;
}

// 10분 캐시: CG top 250 market cap -> { SYMBOL: market_cap }
async function cgMarketCapMap(){
  const key = 'CG:capmap';
  const cached = hit2(key, 10*60*1000);
  if (cached) return JSON.parse(cached.body);

  const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1';
  const payload = await proxyFetch(url, cgHeaders);
  const rows = JSON.parse(payload.body || '[]');
  const map = {};
  rows.forEach(r => { map[(r.symbol||'').toUpperCase()] = r.market_cap ?? null; });
  keep(key, { ok:true, body: JSON.stringify(map), ct:'application/json' });
  return map;
}

// ✅ Binance 버전 /api/coins/markets (source=binance 일 때만 처리)
app.get('/api/coins/markets', async (req, res, next) => {
  if ((req.query.source || '').toLowerCase() !== 'binance') return next();

  try {
    setCorsAndCache(res);

    // 페이징
    const limit = Math.min(Number(req.query.per_page) || 50, 250);
    const page  = Math.max(Number(req.query.page) || 1, 1);
    const offset = (page - 1) * limit;

    // 1) 선물 USDT 심볼
    const list = await binanceFuturesSymbolsUSDT();
    const slice = list.slice(offset, offset + limit);
    const symbols = slice.map(s => s.symbol);

    if (symbols.length === 0) return res.json([]);

    // 2) 24h 통계 배치 호출
    const stats = await binanceTicker24Batch(symbols);

    // 3) 7D 스파크 (병렬)
    const pairs = slice.map(s => `${s.base}${s.quote}`);
    const sparks = await Promise.all(pairs.map(p => binanceSpark7dCloses(p)));

    // 4) 코인게코 호환 매핑
    const rows = stats.map((it, idx) => {
      const base = slice[idx]?.base || it.symbol?.replace(/USDT$/,'');
      return {
        id: base?.toLowerCase() || '',
        symbol: base?.toLowerCase() || '',
        name: base || '',
        current_price: parseFloat(it.lastPrice),
        price_change_percentage_24h: parseFloat(it.priceChangePercent),
        total_volume: parseFloat(it.quoteVolume),
        market_cap: null, // Binance엔 없음(원하면 CG에서 병합 캐시)
        sparkline_in_7d: { price: sparks[idx] || [] },
        image: { small: `/icons/${(base||'').toLowerCase()}.svg` } // 로컬 아이콘 권장
      };
    });

    res.json(rows);
  } catch (e) {
    console.error('binance markets error:', e);
    res.status(502).json({ error: 'binance adapter failed', detail: String(e) });
  }
});

// --- REPLACE: /api/binance/markets handler ---
app.get('/api/binance/markets', async (req, res) => {
  try {
    setCorsAndCache(res);

    // paging
    const limit = Math.min(Number(req.query.per_page) || 50, 250);
    const page  = Math.max(Number(req.query.page) || 1, 1);
    const offset = (page - 1) * limit;

    // 1) USDT-M 선물 심볼 리스트
    const list = await binanceFuturesSymbolsUSDT(); // [{symbol:'BTCUSDT', base:'BTC', quote:'USDT'}, ...]
    const slice = list.slice(offset, offset + limit);
    const symbols = slice.map(s => s.symbol);
    if (symbols.length === 0) return res.type('application/json').status(200).send('[]');

    // 시가총액 맵 준비 (Top 250)
    const capMap = await cgMarketCapMap();

    // 2) 24h 통계 (주의: 응답 순서 미보장)
    const statsArr = await binanceTicker24Batch(symbols);
    const statsMap = new Map(statsArr.map(o => [o.symbol, o])); // symbol -> stat

    // 3) 7D 스파크/OI (안전모드: 동시성 제한 + 캐시 사용 전제)
    const pairs = slice.map(s => `${s.base}${s.quote}`);
    
    // 상위 N개만 헤비 필드(스파크/OI) 계산 (기본 20)
    const HEAVY_N = Math.max(0, Math.min(Number(req.query.heavy_n) || 20, slice.length));

    // 동시성 제한 유틸(pmap)
    const sparksArr = await pmap(
      pairs.map((p, i) => i < HEAVY_N ? p : null),
      2,
      async (p) => p ? await binanceSpark7dCloses(p) : []
    );
    const oiArr = await pmap(
      symbols.map((sym, i) => i < HEAVY_N ? sym : null),
      3,
      async (sym) => sym ? await binanceOpenInterest(sym) : 0
    );
        const oiPctArr = await pmap(
      symbols.map((sym, i) => i < HEAVY_N ? sym : null),
      2,
      async (sym)=> sym ? await binanceOIChangePct(sym) : { oi_1h_pct:null, oi_24h_pct:null }
    );

    // 배열 -> map (pair 기준)
    const sparkMap = new Map();
    pairs.forEach((p, i) => sparkMap.set(p, sparksArr[i] || []));
 
   // 4) CG 호환 매핑 (+ 시가총액 + OI%)
    const rows = slice.map((s, idx) => {
      const stat  = statsMap.get(s.symbol) || {};
      const pair  = `${s.base}${s.quote}`;
      const spark = sparkMap.get(pair) || [];
      const lastClose = spark.at(-1);
      const close1hAgo = spark.length>=5 ? spark[spark.length-5] : null;
      const close7dAgo = spark[0] ?? null;
      const pct = (a,b)=> (isFinite(a)&&isFinite(b)&&b!==0) ? ((a-b)/b*100) : null;
      
      return {
        id: s.base.toLowerCase(),
        symbol: s.base.toLowerCase(),
        name: s.base,
        image: `/icons/${s.base.toLowerCase()}.svg`,
        current_price: parseFloat(stat.lastPrice ?? '0'),
        total_volume: parseFloat(stat.quoteVolume ?? '0'),
        market_cap: capMap[s.base.toUpperCase()] ?? null,
        price_change_percentage_1h: pct(lastClose, close1hAgo),
        price_change_percentage_24h: parseFloat(stat.priceChangePercent ?? '0'),
        price_change_percentage_7d: pct(lastClose, close7dAgo),
        sparkline_in_7d: { price: spark },
        open_interest: oiArr[idx] ?? 0,
        open_interest_1h_change_pct:  oiPctArr[idx]?.oi_1h_pct ?? null,
        open_interest_24h_change_pct: oiPctArr[idx]?.oi_24h_pct ?? null
      };
    });

    res.type('application/json').status(200).send(JSON.stringify(rows));
  } catch (e) {
    console.error('/api/binance/markets error:', e);
    res.status(502).json({ error: 'binance adapter failed', detail: String(e) });
  }
});

// 롱/숏 비율: 전체 계정(Global)
app.get('/api/binance/ls/global', async (req, res) => {
  try {
    const symbol = (req.query.symbol || 'BTCUSDT').toUpperCase();
    const key = `LSG:${symbol}`;
    const c = hit2(key, 60 * 1000);
    if (c) {
      setCorsAndCache(res);
      return res.json(JSON.parse(c.body));
    }
    const url = `https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=5m&limit=288`;
    const arr = await bfetch(url);
    const last = longPct(arr.at(-1)?.longShortRatio);
    const avg = longPct(arr.reduce((s, a) => s + Number(a.longShortRatio || 0), 0) / arr.length);
    const out = { symbol, long_pct_last: last, long_pct_avg24: avg };
    setCorsAndCache(res);
    res.json(out);
    keep(key, { ok: true, body: JSON.stringify(out), ct: 'application/json' });
  } catch {
    res.status(502).json({ error: 'global L/S fetch fail' });
  }
});

// 롱/숏 비율: 상위 트레이더(Top Trader)
app.get('/api/binance/ls/top', async (req, res) => {
  try {
    const symbol = (req.query.symbol || 'BTCUSDT').toUpperCase();
    const key = `LST:${symbol}`;
    const c = hit2(key, 60 * 1000);
    if (c) {
      setCorsAndCache(res);
      return res.json(JSON.parse(c.body));
    }
    const url = `https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=${symbol}&period=5m&limit=288`;
    const arr = await bfetch(url);
    const last = longPct(arr.at(-1)?.longShortRatio);
    const avg = longPct(arr.reduce((s, a) => s + Number(a.longShortRatio || 0), 0) / arr.length);
    const out = { symbol, long_pct_last: last, long_pct_avg24: avg };
    setCorsAndCache(res);
    res.json(out);
    keep(key, { ok: true, body: JSON.stringify(out), ct: 'application/json' });
  } catch {
    res.status(502).json({ error: 'top L/S fetch fail' });
  }
});

// /api/binance/flow?symbol=BTCUSDT&period=5m
app.get('/api/binance/flow', async (req, res) => {
  try {
    const symbol = (req.query.symbol || 'BTCUSDT').toUpperCase();
    const period = req.query.period || '5m'; // 5m/15m/1h etc.
    const key = `FLOW:${symbol}:${period}`;
    const cached = hit2(key, 60 * 1000); // 60s
    if (cached) return res.json(JSON.parse(cached.body));

    const url = `https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=${symbol}&period=${period}&limit=288`;
    const arr = await bfetch(url); // [{buyVol, sellVol, ...} x 288]

    const ratioPct = a => {
      const buy = a.reduce((s, x) => s + Number(x.buyVol || 0), 0);
      const sell = a.reduce((s, x) => s + Number(x.sellVol || 0), 0);
      return (buy / (buy + sell)) * 100;
    };

    const r24 = ratioPct(arr);           // 최근 24h 평균
    const r1h = ratioPct(arr.slice(-12)); // 5m*12 = 1h 평균
    const out = { symbol, ratio_1h: r1h, ratio_24h: r24, delta_pp: r1h - r24 };

    keep(key, { ok: true, body: JSON.stringify(out), ct: 'application/json' });
    res.json(out);
  } catch (e) {
    res.status(502).json({ error: 'flow fetch fail' });
  }
});

// =======================================================
// ✅ CoinGecko 프록시 (COSMOS 등 암호화폐 시세용)
// =======================================================
const CG_PRO  = process.env.X_CG_PRO_API_KEY || '';
const CG_DEMO = process.env.COINGECKO_API_KEY || process.env.X_CG_DEMO_API_KEY || '';
const cgHeaders = { 'User-Agent': 'two4-cosmos/1.0' };
if (CG_PRO)  cgHeaders['x-cg-pro-api-key']  = CG_PRO;
else if (CG_DEMO) cgHeaders['x-cg-demo-api-key'] = CG_DEMO;

// 1) 마켓 리스트
// 예: /api/coins/markets?vs_currency=usd&ids=cosmos&per_page=50&page=1&sparkline=true
app.get('/api/coins/markets', async (req, res) => {
  // 위의 Binance 미들웨어에서 걸러지지 않았다면(=source≠binance), CoinGecko로 프록시
  const u = new URL('https://api.coingecko.com/api/v3/coins/markets');
  for (const [k,v] of Object.entries(req.query)) u.searchParams.set(k,v);
  if (!u.searchParams.get('vs_currency')) u.searchParams.set('vs_currency','usd');
  if (!u.searchParams.get('order'))       u.searchParams.set('order','market_cap_desc');
  const per_page = Math.min(Number(req.query.per_page) || 100, 250);
  u.searchParams.set('per_page', String(per_page));
  if (!u.searchParams.get('page'))        u.searchParams.set('page','1');
  if (!u.searchParams.get('sparkline'))   u.searchParams.set('sparkline','true');
  if (!u.searchParams.get('price_change_percentage')) u.searchParams.set('price_change_percentage','1h,24h,7d');

  const key = `CG:${u.toString()}`;
  const cached = hit(key);
  if (cached){ setCorsAndCache(res); return res.type(cached.ct).status(cached.status).send(cached.body); }

  const payload = await proxyFetch(u, cgHeaders);
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

// 2) 글로벌 메트릭
app.get('/api/global', async (_req, res) => {
  const url = 'https://api.coingecko.com/api/v3/global';
  const key = `CG:${url}`;
  const cached = hit(key);
  if (cached){ setCorsAndCache(res); return res.type(cached.ct).status(cached.status).send(cached.body); }

  const payload = await proxyFetch(url, cgHeaders);
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

// 3) 심플 가격
// 예: /api/simple/price?ids=cosmos,bitcoin&vs_currencies=usd,krw
app.get('/api/simple/price', async (req, res) => {
  const u = new URL('https://api.coingecko.com/api/v3/simple/price');
  for (const [k,v] of Object.entries(req.query)) u.searchParams.set(k,v);

  const key = `CG:${u.toString()}`;
  const cached = hit(key);
  if (cached){ setCorsAndCache(res); return res.type(cached.ct).status(cached.status).send(cached.body); }

  const payload = await proxyFetch(u, cgHeaders);
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

// 4) 특정 코인 차트
// 예: /api/coins/cosmos/market_chart?vs_currency=usd&days=7
app.get('/api/coins/:id/market_chart', async (req, res) => {
  const u = new URL(`https://api.coingecko.com/api/v3/coins/${req.params.id}/market_chart`);
  for (const [k,v] of Object.entries(req.query)) u.searchParams.set(k,v);

  const key = `CG:${u.toString()}`;
  const cached = hit(key);
  if (cached){ setCorsAndCache(res); return res.type(cached.ct).status(cached.status).send(cached.body); }

  const payload = await proxyFetch(u, cgHeaders);
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

// =======================================================
// ✅ 키 없이 쓰는 “기본 데이터” API
// =======================================================

// (A) 날씨 — Open-Meteo
// /api/weather?lat=37.56&lon=126.97
app.get('/api/weather', async (req, res) => {
  const lat = req.query.lat || '37.56';
  const lon = req.query.lon || '126.97';
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
  const key = `WEATHER:${lat},${lon}`;
  const cached = hit(key);
  if (cached){ setCorsAndCache(res); return res.type(cached.ct).status(cached.status).send(cached.body); }
  const payload = await proxyFetch(url);
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

// (B) 한국 뉴스 헤드라인 — 네이버 RSS
// /api/news?cat=newsflash|economy|politics|society|world|it
const NAVER_FEEDS = {
  newsflash: "https://rss.naver.com/newsflash.rss",
  economy:   "https://rss.naver.com/economy/economy_general.rss",
  politics:  "https://rss.naver.com/politics/politics_general.rss",
  society:   "https://rss.naver.com/society/society_general.rss",
  world:     "https://rss.naver.com/world/world_general.rss",
  it:        "https://rss.naver.com/science/science_general.rss",
};
app.get('/api/news', async (req, res) => {
  const cat = req.query.cat || 'newsflash';
  const url = NAVER_FEEDS[cat] || NAVER_FEEDS.newsflash;
  const key = `NEWS:${cat}`;
  const cached = hit(key);
  if (cached){ setCorsAndCache(res); return res.type('application/json').status(200).send(cached.body); }

  try {
    const feed = await parser.parseURL(url);
    const items = (feed.items || []).slice(0, 10).map(i => ({
      title: i.title, link: i.link, pubDate: i.pubDate
    }));
    const body = JSON.stringify({ category: cat, items });
    setCorsAndCache(res);
    res.status(200).json({ category: cat, items });
    keep(key, { ok:true, body, ct:'application/json' });
  } catch (e) {
    setCorsAndCache(res);
    res.status(500).json({ error:'news fetch failed' });
  }
});

// (C) 검색 트렌드 — Google Trends RSS (KR)
// /api/trends
app.get('/api/trends', async (_req, res) => {
  const key = 'TRENDS:KR';
  const cached = hit(key);
  if (cached){ setCorsAndCache(res); return res.type('application/json').status(200).send(cached.body); }

  try {
    const feed = await parser.parseURL('https://trends.google.com/trends/trendingsearches/daily/rss?geo=KR');
    const items = (feed.items || []).slice(0, 10).map(i => ({
      title: i.title, link: i.link, pubDate: i.pubDate
    }));
    const body = JSON.stringify({ items });
    setCorsAndCache(res);
    res.status(200).json({ items });
    keep(key, { ok:true, body, ct:'application/json' });
  } catch (e) {
    setCorsAndCache(res);
    res.status(500).json({ error:'trends fetch failed' });
  }
});

// (D) 투자심리 — Fear & Greed Index
// /api/fng
app.get('/api/fng', async (_req, res) => {
  const key = 'FNG:latest';
  const cached = hit(key);
  if (cached){ setCorsAndCache(res); return res.type(cached.ct).status(cached.status).send(cached.body); }

  const payload = await proxyFetch('https://api.alternative.me/fng/', { 'User-Agent':'two4/1.0' });
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

// (E) 환율 — exchangerate.host
// /api/exchange?from=USD&to=KRW
app.get('/api/exchange', async (req, res) => {
  const from = req.query.from || 'USD';
  const to   = req.query.to   || 'KRW';
  const url  = `https://api.exchangerate.host/convert?from=${from}&to=${to}`;
  const key = `FX:${from}->${to}`;
  const cached = hit(key);
  if (cached){ setCorsAndCache(res); return res.type(cached.ct).status(cached.status).send(cached.body); }

  const payload = await proxyFetch(url);
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

// (F) 공휴일 — Nager.Date
// /api/holidays?year=2025&country=KR
app.get('/api/holidays', async (req, res) => {
  const year = req.query.year || '2025';
  const country = req.query.country || 'KR';
  const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`;
  const key = `HOLIDAYS:${country}:${year}`;
  const cached = hit(key);
  if (cached){ setCorsAndCache(res); return res.type(cached.ct).status(cached.status).send(cached.body); }

  const payload = await proxyFetch(url);
  setCorsAndCache(res);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
});

// 아이콘: 로컬 있으면 그거, 없으면 코인게코 썸네일로 7일 캐시 리다이렉트
app.get('/api/icon/:sym', async (req, res) => {
  try {
    const sym = (req.params.sym || '').toLowerCase();
    const local = path.join(ICON_DIR, `${sym}.svg`);

    // 1) 로컬 svg 있으면 그걸로
    if (fs.existsSync(local)) {
      res.type('image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.sendFile(local);
    }

    // 2) 캐시된 리다이렉트 URL 있으면 바로 사용(7일)
    const key = `ICON_URL:${sym.toUpperCase()}`;
    const cached = hit2(key, 7 * 24 * 60 * 60 * 1000);
    if (cached) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.redirect(302, cached.body); // body=URL
    }

    // 3) 코인게코 검색 → 같은 심볼 찾기 → thumb URL
    const url = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(sym)}`;
    const payload = await proxyFetch(url, { 'User-Agent': 'two4-cosmos/1.0' });
    let img = null;
    if (payload.ok) {
      const j = JSON.parse(payload.body || '{}');
      const hit = (j.coins || []).find(c => (c.symbol || '').toLowerCase() === sym);
      img = hit?.thumb || hit?.large || hit?.small || null;
    }

    if (img) {
      keep(key, { ok: true, body: img, ct: 'text/plain' }); // URL 캐시
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.redirect(302, img);
    }

    // 4) 마지막 폴백
    return res.redirect(302, FALLBACK_ICON);
  } catch {
    return res.redirect(302, FALLBACK_ICON);
  }
});

// ==============================
// 기본 라우트 & SPA
// ==============================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'apps/web/index.html'));
});
app.use((req, res, next) => { if (req.accepts('html')) return next(); res.status(404).end(); });
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'apps/web/index.html')));

// ==============================
// MongoDB 연결 + 서버 시작
// ==============================
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set');
  process.exit(1);
}
try {
  const u = new URL(MONGODB_URI);
  const masked = `${u.protocol}//${u.username || '(no-user)'}:****@${u.host}${u.pathname || ''}`;
  console.log('🔌 Trying MongoDB:', masked);
} catch (_) {
  console.log('🔌 Trying MongoDB: (unable to parse URI)');
}

mongoose.set('strictQuery', true);
mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 })
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(PORT, () => console.log(`🚀 TWO4/Seed server on ${PORT}`));
  })
  .catch(err => {
    console.error('❌ MongoDB connect error:', err.message);
    process.exit(1);
  });

// 헬스체크
app.get('/healthz', (_req, res) => res.json({ ok: true }));
