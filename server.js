// server.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const Parser = require('rss-parser');               // RSS (네이버/구글 트렌드)
const parser = new Parser();
const createNewsKoRouter = require('./routes/news-ko');
const { connectDatabase } = require('./server/database');
const {
  CVDModel,
  HeatmapModel,
  PriceModel,
  LiquidationEventModel,
} = require('./server/models/marketModels');
const { CVDEngine } = require('./server/engines/cvdEngine');
const { HeatmapEngine } = require('./server/engines/heatmapEngine');
const { LiquidationHeatmapEngine } = require('./server/engines/liquidationHeatmapEngine');
const createCvdRouter = require('./server/api/cvd');
const createHeatmapRouter = require('./server/api/heatmap');
const createLiquidationHeatmapRouter = require('./server/api/liquidation-heatmap');
const createPriceRouter = require('./server/api/price');
const createSeedWeatherRouter = require('./server/api/seed-weather');

const app = express();
const PORT = process.env.COSMOS_PORT || process.env.PORT || 3000;

let cvdEngine;
let heatmapEngine;
let liquidationEngine;
let cvdRouter;
let heatmapRouter;
let liquidationRouter;
let priceRouter;
const seedWeatherRouter = createSeedWeatherRouter();

// ==============================
// 정적 파일 서빙
// ==============================
const FALLBACK_ICON = '/media/coin.svg';

const ICON_DIR = path.join(__dirname, 'apps/web/icons');

app.get('/icons/:sym.svg', async (req, res) => {
  const raw = String(req.params.sym || '');
  const sym = raw.toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!sym) {
    return res.redirect(302, FALLBACK_ICON);
  }

  const file = path.join(ICON_DIR, `${sym}.svg`);
  try {
    await fs.promises.access(file, fs.constants.R_OK);
    res.type('image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.sendFile(file);
  } catch {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.redirect(302, `/api/icon/${encodeURIComponent(sym)}`);
  }
});

app.use(express.static(path.join(__dirname, 'apps/web')));
app.use('/media', express.static(path.join(__dirname, 'apps/web/media')));
app.use('/ai', express.static(path.join(__dirname, 'apps/web/ai'))); // seed.html 등

// JSON 파서
app.use(express.json({ limit: '2mb' }));

// ==============================
// ORBITS 게시판 파일 스토어 (legacy METHOD 데이터 마이그레이션 포함)
// ==============================
const ORBITS_DATA_DIR = path.join(__dirname, 'data');
const ORBITS_POSTS_FILE = path.join(ORBITS_DATA_DIR, 'orbits-posts.json');
const LEGACY_METHOD_POSTS_FILE = path.join(ORBITS_DATA_DIR, 'method-posts.json');

function ensureOrbitStore() {
  try {
    fs.mkdirSync(ORBITS_DATA_DIR, { recursive: true });
  } catch (error) {
    console.error('⚠️ ORBITS 데이터 디렉터리를 생성하지 못했습니다:', error.message);
  }

  if (!fs.existsSync(ORBITS_POSTS_FILE)) {
    try {
      if (fs.existsSync(LEGACY_METHOD_POSTS_FILE)) {
        fs.renameSync(LEGACY_METHOD_POSTS_FILE, ORBITS_POSTS_FILE);
      } else {
        fs.writeFileSync(ORBITS_POSTS_FILE, JSON.stringify({ posts: [] }, null, 2), 'utf8');
      }
    } catch (error) {
      console.error('⚠️ ORBITS 게시글 저장소를 초기화하지 못했습니다:', error.message);
    }
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function applyInlineFormatting(block) {
  const escaped = escapeHtml(block);
  return escaped
    .replace(/\[b\]([\s\S]*?)\[\/b\]/g, '<strong>$1</strong>')
    .replace(/\[size=(small|large)\]([\s\S]*?)\[\/size\]/g, (_match, size, content) => {
      const sizeClass = size === 'small' ? 'content-size-small' : 'content-size-large';
      return `<span class="${sizeClass}">${content}</span>`;
    })
    .replace(/\[size=[^\]]*\]([\s\S]*?)\[\/size\]/g, '$1');
}

function toContentHtml(text) {
  const clean = String(text || '').trim();
  if (!clean) return '';
  return clean
    .split(/\n{2,}/)
    .map(block => `<p>${applyInlineFormatting(block).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

function excerptFromText(text) {
  const plain = String(text || '')
    .replace(/\[\/?b\]/g, '')
    .replace(/\[size=(?:small|large|normal)\]/g, '')
    .replace(/\[\/size\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return '';
  const slice = plain.slice(0, 140);
  return plain.length > 140 ? `${slice}…` : slice;
}

function excerptFromHtml(html) {
  return excerptFromText(String(html || '').replace(/<[^>]+>/g, ' '));
}

const MAX_IMAGE_DATA_URL_LENGTH = 700000;
const DATA_URL_IMAGE_PATTERN = /^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);base64,/i;

function normalizeStoredPost(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `legacy-${Date.now().toString(36)}`;
  const createdAt = typeof raw.createdAt === 'string' && !Number.isNaN(Date.parse(raw.createdAt))
    ? raw.createdAt
    : new Date().toISOString();
  const tags = Array.isArray(raw.tags)
    ? raw.tags
        .map(tag => (typeof tag === 'string' ? tag.trim() : ''))
        .filter(Boolean)
        .slice(0, 12)
    : [];
  const stats = raw.stats && typeof raw.stats === 'object' ? raw.stats : {};
  const contentHtml = typeof raw.contentHtml === 'string' && raw.contentHtml.trim()
    ? raw.contentHtml
    : toContentHtml(raw.content || '');
  const normalizedImages = (() => {
    const list = sanitizeImageList(raw.images);
    const primary = sanitizeImageData(raw.image);
    if (primary) {
      if (!list.includes(primary)) {
        list.unshift(primary);
      } else {
        const filtered = list.filter(item => item !== primary);
        list.length = 0;
        list.push(primary, ...filtered);
      }
    }
    return list;
  })();

  return {
    id,
    category: typeof raw.category === 'string' && raw.category.trim() ? raw.category.trim() : 'general',
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : '제목 없음',
    author: typeof raw.author === 'string' && raw.author.trim() ? raw.author.trim() : '익명',
    tags,
    image: normalizedImages[0] || undefined,
    images: normalizedImages,
    excerpt: typeof raw.excerpt === 'string' && raw.excerpt.trim() ? raw.excerpt.trim() : excerptFromHtml(contentHtml),
    contentHtml,
    createdAt,
    stats: {
      likes: Number.isFinite(Number(stats.likes)) ? Number(stats.likes) : 0,
      comments: Number.isFinite(Number(stats.comments)) ? Number(stats.comments) : 0,
      views: Number.isFinite(Number(stats.views)) ? Number(stats.views) : 0
    }
  };
}

function loadOrbitPosts() {
  ensureOrbitStore();
  try {
    const raw = fs.readFileSync(ORBITS_POSTS_FILE, 'utf8');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.posts) ? parsed.posts : [];
    return list
      .map(normalizeStoredPost)
      .filter(Boolean);
  } catch (error) {
    console.error('⚠️ ORBITS 게시글을 불러오지 못했습니다:', error.message);
    return [];
  }
}

let orbitPostsStore = loadOrbitPosts();

function saveOrbitPosts() {
  ensureOrbitStore();
  try {
    fs.writeFileSync(ORBITS_POSTS_FILE, JSON.stringify({ posts: orbitPostsStore }, null, 2), 'utf8');
  } catch (error) {
    console.error('⚠️ ORBITS 게시글을 저장하지 못했습니다:', error.message);
  }
}

function computeUpdatedAt(posts) {
  const latest = posts.reduce((acc, post) => {
    if (!post?.createdAt) return acc;
    const ts = Date.parse(post.createdAt);
    return Number.isNaN(ts) ? acc : Math.max(acc, ts);
  }, 0);
  return latest ? new Date(latest).toISOString() : null;
}

function sanitizeTitle(value) {
  return String(value || '')
    .trim()
    .slice(0, 200);
}

function sanitizeCategory(value) {
  return String(value || '')
    .trim()
    .slice(0, 120);
}

function sanitizeAuthor(value) {
  const clean = String(value || '').trim();
  return clean ? clean.slice(0, 60) : 'Anonymous';
}

function sanitizeTags(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map(tag => (typeof tag === 'string' ? tag.trim() : ''))
    .filter(Boolean)
    .slice(0, 12)
    .map(tag => tag.slice(0, 40));
}

function sanitizeImageData(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!DATA_URL_IMAGE_PATTERN.test(trimmed)) return '';
  if (trimmed.length > MAX_IMAGE_DATA_URL_LENGTH) return '';
  return trimmed;
}

function sanitizeImageList(value) {
  const source = Array.isArray(value) ? value : typeof value !== 'undefined' ? [value] : [];
  const sanitized = [];
  for (const item of source) {
    const clean = sanitizeImageData(item);
    if (clean && !sanitized.includes(clean)) {
      sanitized.push(clean);
    }
    if (sanitized.length >= 10) {
      break;
    }
  }
  return sanitized;
}

const orbitsRouter = express.Router();

orbitsRouter.get('/posts', (_req, res) => {
  res.json({ ok: true, posts: orbitPostsStore, updatedAt: computeUpdatedAt(orbitPostsStore) });
});

orbitsRouter.post('/posts', (req, res) => {
  const payload = req.body || {};
  const title = sanitizeTitle(payload.title);
  const category = sanitizeCategory(payload.category);
  const body = String(payload.content || '').trim();

  if (!title || !category || !body) {
    return res.status(400).json({ ok: false, error: 'INVALID_PAYLOAD' });
  }

  const now = new Date();
  const images = sanitizeImageList(payload.images);
  const fallbackImage = sanitizeImageData(payload.image);
  if (fallbackImage && !images.includes(fallbackImage)) {
    images.unshift(fallbackImage);
  }
  const primaryImage = images[0];
  const newPost = {
    id: `o-${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    category,
    title,
    author: sanitizeAuthor(payload.author),
    tags: sanitizeTags(payload.tags),
    excerpt: excerptFromText(body),
    contentHtml: toContentHtml(body),
    createdAt: now.toISOString(),
    image: primaryImage || undefined,
    images: images.length ? images : undefined,
    stats: { likes: 0, comments: 0, views: 1 }
  };

  orbitPostsStore.unshift(newPost);
  saveOrbitPosts();

  res.status(201).json({ ok: true, post: newPost, updatedAt: newPost.createdAt });
});

orbitsRouter.delete('/posts/:id', (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) {
    return res.status(400).json({ ok: false, error: 'INVALID_ID' });
  }
  const index = orbitPostsStore.findIndex(post => post.id === id);
  if (index === -1) {
    return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
  }

  orbitPostsStore.splice(index, 1);
  saveOrbitPosts();

  res.json({ ok: true, removed: id, updatedAt: computeUpdatedAt(orbitPostsStore) });
});

// [SEED AI] Seed 라우터 마운트 (+ 마운트 확인 로그 & 프로브)
try {
  const aiRouter = require('./apps/web/ai/server.cjs');
  app.use('/api', aiRouter);
  console.log('✅ Seed AI router mounted at /api');
  app.get('/api/_probe', (_req, res) => res.json({ ok: true, mounted: true }));
} catch (e) {
  console.error('❌ Seed AI 라우터를 연결하지 못했습니다:', e.message);
}

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

const newsKoRouter = createNewsKoRouter({ hit, keep, setCorsAndCache });
app.use('/api/news-ko', newsKoRouter);

try {
  const { createTwoFiveRouter } = require('./others/server.js');
  const twoFiveRouter = createTwoFiveRouter({ setCorsAndCache });
  app.use('/api/twofive', twoFiveRouter);
  console.log('✅ TwoFive sector router mounted at /api/twofive');
} catch (err) {
  console.error('❌ Failed to mount TwoFive sector router:', err.message);
}

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
const BINANCE_SPOT_BASES = [
  'https://api.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api3.binance.com',
  'https://api4.binance.com',
  'https://api-gcp.binance.com',
  'https://data-api.binance.vision'
];

const BINANCE_FETCH_HEADERS = (() => {
  const headers = { 'User-Agent': 'two4-cosmos/1.0' };
  if (BINANCE_API_KEY) headers['X-MBX-APIKEY'] = BINANCE_API_KEY;
  return headers;
})();

async function bfetch(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const r = await fetch(url, {
      headers: BINANCE_FETCH_HEADERS,
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
  if (cached) {
    try {
      const parsed = JSON.parse(cached.body);
      if (Array.isArray(parsed)) {
        if (parsed.length === 0) return parsed;
        const first = parsed[0];
        if (first && typeof first === 'object' && Number.isFinite(first.timestamp) && Number.isFinite(first.price)) {
          return parsed;
        }
      }
    } catch (e) {
      // ignore and refetch below
    }
    cache.delete(key);
  }

  const u = new URL(BINANCE_CONT);
  u.searchParams.set('pair', pair);
  u.searchParams.set('contractType', 'PERPETUAL');
  u.searchParams.set('interval', '15m');
  u.searchParams.set('limit', '672');

  const kl = await bfetch(u.toString());
  const closes = kl
    .map(c => ({ timestamp: Number(c[0]), price: parseFloat(c[4]) }))
    .filter(p => Number.isFinite(p.timestamp) && Number.isFinite(p.price));
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
      const rawSpark = Array.isArray(sparks[idx]) ? sparks[idx] : [];
      const sparkPoints = rawSpark.filter(p => p && typeof p === 'object' && Number.isFinite(p.timestamp) && Number.isFinite(p.price));
      const sparkPrices = sparkPoints.map(p => p.price);
      const sparkTimes = sparkPoints.map(p => p.timestamp);
      return {
        id: base?.toLowerCase() || '',
        symbol: base?.toLowerCase() || '',
        name: base || '',
        current_price: parseFloat(it.lastPrice),
        price_change_percentage_24h: parseFloat(it.priceChangePercent),
        total_volume: parseFloat(it.quoteVolume),
        market_cap: null, // Binance엔 없음(원하면 CG에서 병합 캐시)
        sparkline_in_7d: { price: sparkPrices, timestamps: sparkTimes },
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

    // 시가총액(우선) / 24h 거래대금(보조) 기반으로 상위 심볼 선정
    let heavySet = new Set();
    if (HEAVY_N > 0) {
      const scored = slice.map((s, idx) => {
        const capEntry = capMap[s.base.toUpperCase()];
        const stat = statsMap.get(s.symbol);
        const capScore = (typeof capEntry === 'number' && Number.isFinite(capEntry)) ? capEntry : NaN;
        const volScore = Number(stat?.quoteVolume);
        const score = Number.isFinite(capScore)
          ? capScore
          : (Number.isFinite(volScore) ? volScore : -1);
        return { idx, score };
      });

      scored.sort((a, b) => {
        if (a.score === b.score) return a.idx - b.idx;
        const as = Number.isFinite(a.score) ? a.score : -1;
        const bs = Number.isFinite(b.score) ? b.score : -1;
        return bs - as;
      });

      heavySet = new Set(scored.slice(0, HEAVY_N).map(it => it.idx));
    }

    // 동시성 제한 유틸(pmap)
    const sparksArr = await pmap(
      pairs.map((p, i) => heavySet.has(i) ? p : null),
      2,
      async (p) => p ? await binanceSpark7dCloses(p) : []
    );
    const oiArr = await pmap(
      symbols.map((sym, i) => heavySet.has(i) ? sym : null),
      3,
      async (sym) => sym ? await binanceOpenInterest(sym) : 0
    );
    const oiPctArr = await pmap(
      symbols.map((sym, i) => heavySet.has(i) ? sym : null),
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
      const rawSpark = sparkMap.get(pair);
      const sparkPoints = Array.isArray(rawSpark)
        ? rawSpark.filter(p => p && typeof p === 'object' && Number.isFinite(p.timestamp) && Number.isFinite(p.price))
        : [];
      const sparkPrices = sparkPoints.map(p => p.price);
      const sparkTimes = sparkPoints.map(p => p.timestamp);
      const lastClose = sparkPrices.at(-1);
      const close1hAgo = sparkPrices.length>=5 ? sparkPrices[sparkPrices.length-5] : null;
      const close7dAgo = sparkPrices[0] ?? null;
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
        sparkline_in_7d: { price: sparkPrices, timestamps: sparkTimes },
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

// GET /api/binance/price?symbol=BTCUSDT
app.get('/api/binance/price', async (req, res) => {
  try {
    const symbol = (req.query.symbol || 'BTCUSDT').toUpperCase();
    const key = `BN:PX:${symbol}`;
    const cached = hit2(key, 2000); // 2s 캐시로 429 완화
    if (cached) { setCorsAndCache(res); return res.type('application/json').send(cached.body); }

    // 가벼운 재시도(최대 2회)
    let lastErr = null, data = null;
    for (let i=0;i<2;i++){
      try{
        data = await bfetch(`${BINANCE_FAPI}/ticker/price?symbol=${encodeURIComponent(symbol)}`);
        break;
      }catch(e){ lastErr = e; await new Promise(r=>setTimeout(r, 150*(i+1))); }
    }
    if (!data) throw lastErr || new Error('binance price fail');

    const body = JSON.stringify({ symbol: data.symbol, price: Number(data.price) });
    keep(key, { ok:true, body, ct:'application/json' });
    setCorsAndCache(res);
    res.type('application/json').send(body);
  } catch(e){
    res.status(502).json({ error:'binance price error' });
  }
});

// SSE: 다중 심볼 실시간 가격 스트림
app.get('/api/binance/prices/stream', (req, res) => {
  const rawParam = req.query.symbols;
  const raw = Array.isArray(rawParam) ? rawParam.join(',') : (rawParam || '');
  const symbols = raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (!symbols.length) {
    return res.status(400).json({ error: 'symbols query required' });
  }

  const requestedInterval = Number(req.query.interval) || 4000;
  const intervalMs = Math.max(2000, Math.min(15000, requestedInterval));

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let closed = false;
  let sending = false;
  let timer = null;
  let keepAlive = null;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (timer) clearInterval(timer);
    if (keepAlive) clearInterval(keepAlive);
    try { res.end(); } catch {}
  };

  req.on('close', cleanup);

  const writeSafe = chunk => {
    if (closed) return;
    try {
      res.write(chunk);
    } catch (err) {
      console.error('/api/binance/prices/stream write error:', err);
      cleanup();
    }
  };

  const pushUpdate = async () => {
    if (closed || sending) return;
    sending = true;
    try {
      const arr = encodeURIComponent(JSON.stringify(symbols));
      const data = await bfetch(`${BINANCE_FAPI}/ticker/price?symbols=${arr}`);
      const payload = Array.isArray(data)
        ? data.map(item => ({
            symbol: item.symbol,
            base: typeof item.symbol === 'string' ? item.symbol.replace(/USDT$/i, '') : '',
            price: Number(item.price)
          }))
        : [];
      writeSafe(`data: ${JSON.stringify({ ts: Date.now(), prices: payload })}\n\n`);
    } catch (err) {
      console.error('/api/binance/prices/stream upstream error:', err);
      writeSafe(`event: warn\ndata: ${JSON.stringify({ message: 'upstream error' })}\n\n`);
    } finally {
      sending = false;
    }
  };

  keepAlive = setInterval(() => writeSafe(':\n\n'), 20000);
  timer = setInterval(pushUpdate, intervalMs);
  pushUpdate();
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

app.get('/api/dominance/top3', async (req, res) => {
  const daysRaw = Number.parseInt(req.query.days, 10);
  const days = Number.isFinite(daysRaw) ? Math.max(7, Math.min(daysRaw, 120)) : 30;
  const cacheKey = `DOMTOP3:${days}`;
  const cached = hit2(cacheKey, 5 * 60 * 1000);
  if (cached) {
    setCorsAndCache(res);
    return res.type(cached.ct).status(cached.status).send(cached.body);
  }

  try {
    const listUrl = new URL('https://api.coingecko.com/api/v3/coins/markets');
    listUrl.searchParams.set('vs_currency', 'usd');
    listUrl.searchParams.set('order', 'market_cap_desc');
    listUrl.searchParams.set('per_page', '3');
    listUrl.searchParams.set('page', '1');

    const topPayload = await proxyFetch(listUrl, cgHeaders);
    if (!topPayload.ok) {
      setCorsAndCache(res);
      return res.type(topPayload.ct).status(topPayload.status).send(topPayload.body);
    }

    let topCoins = [];
    try { topCoins = JSON.parse(topPayload.body); } catch (e) { topCoins = []; }
    if (!Array.isArray(topCoins) || !topCoins.length) {
      setCorsAndCache(res);
      return res.status(502).json({ error: 'top coins unavailable' });
    }

    const ids = topCoins.map(c => c?.id).filter(Boolean);
    if (!ids.length) {
      setCorsAndCache(res);
      return res.status(502).json({ error: 'no ids for dominance' });
    }

    const globalUrl = `https://api.coingecko.com/api/v3/global/market_cap_chart?vs_currency=usd&days=${days}`;
    const globalPayload = await proxyFetch(globalUrl, cgHeaders);
    if (!globalPayload.ok) {
      setCorsAndCache(res);
      return res.type(globalPayload.ct).status(globalPayload.status).send(globalPayload.body);
    }

    let globalData;
    try { globalData = JSON.parse(globalPayload.body); }
    catch { globalData = null; }

    const extractGlobalSeries = (obj) => {
      if (!obj) return [];
      if (Array.isArray(obj)) return obj;
      if (Array.isArray(obj.market_cap)) return obj.market_cap;
      if (Array.isArray(obj.total_market_cap)) return obj.total_market_cap;
      if (obj.market_cap_chart) {
        const chart = obj.market_cap_chart;
        if (Array.isArray(chart.market_cap)) return chart.market_cap;
        if (Array.isArray(chart.total_market_cap)) return chart.total_market_cap;
      }
      if (obj.data) return extractGlobalSeries(obj.data);
      return [];
    };

    const totalSeries = extractGlobalSeries(globalData);
    if (!Array.isArray(totalSeries) || !totalSeries.length) {
      setCorsAndCache(res);
      return res.status(502).json({ error: 'global market cap unavailable' });
    }

    const normalizeTs = (ts) => {
      const n = Number(ts);
      if (!Number.isFinite(n)) return null;
      const ms = n >= 1e12 ? n : n * 1000; // CoinGecko global chart uses seconds
      return Math.round(ms / 3_600_000) * 3_600_000; // hourly bucket in ms
    };

    const totalMap = new Map();
    for (const entry of totalSeries) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const ts = normalizeTs(entry[0]);
      const val = Number(entry[1]);
      if (!Number.isFinite(ts) || !Number.isFinite(val) || val <= 0) continue;
      totalMap.set(ts, val);
    }

    const findTotal = (ts) => {
      if (totalMap.has(ts)) return totalMap.get(ts);
      const offsets = [ -3_600_000, 3_600_000, -2 * 3_600_000, 2 * 3_600_000 ];
      for (const off of offsets) {
        const v = totalMap.get(ts + off);
        if (Number.isFinite(v)) return v;
      }
      return null;
    };

    const coinPayloads = await pmap(ids, ids.length, (id) => {
      const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=daily`;
      return proxyFetch(url, cgHeaders);
    });

    const coins = [];
    coinPayloads.forEach((payload, idx) => {
      if (!payload?.ok) return;
      let coinData;
      try { coinData = JSON.parse(payload.body); }
      catch { coinData = null; }
      if (!coinData) return;

      const marketCaps = Array.isArray(coinData.market_caps)
        ? coinData.market_caps
        : Array.isArray(coinData.data?.market_caps)
          ? coinData.data.market_caps
          : [];

      if (!Array.isArray(marketCaps) || !marketCaps.length) return;

      const points = [];
      for (const entry of marketCaps) {
        if (!Array.isArray(entry) || entry.length < 2) continue;
        const ts = normalizeTs(entry[0]);
        const cap = Number(entry[1]);
        if (!Number.isFinite(ts) || !Number.isFinite(cap) || cap <= 0) continue;
        const total = findTotal(ts);
        if (!Number.isFinite(total) || total <= 0) continue;
        const pct = (cap / total) * 100;
        points.push({ time: Math.floor(ts / 1000), value: Number(pct.toFixed(4)) });
      }

      if (!points.length) return;
      points.sort((a, b) => a.time - b.time);
      const first = points[0]?.value;
      const last = points[points.length - 1]?.value;
      const change = (Number.isFinite(last) && Number.isFinite(first)) ? (last - first) : null;
      const meta = topCoins[idx] || {};

      coins.push({
        id: ids[idx],
        symbol: (meta.symbol || '').toUpperCase(),
        name: meta.name || ids[idx],
        dominance: Number.isFinite(last) ? Number(last.toFixed(2)) : null,
        change: Number.isFinite(change) ? Number(change.toFixed(2)) : null,
        series: points
      });
    });

    const response = {
      days,
      updated_at: Date.now(),
      coins: coins.sort((a, b) => (b.dominance ?? 0) - (a.dominance ?? 0))
    };

    const body = JSON.stringify(response);
    const payload = { ok: true, status: 200, ct: 'application/json; charset=utf-8', body };
    setCorsAndCache(res);
    res.type(payload.ct).status(200).send(body);
    keep(cacheKey, payload);
  } catch (e) {
    console.error('dominance/top3 error', e);
    setCorsAndCache(res);
    res.status(502).json({ error: 'dominance fetch failed' });
  }
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

// Binance spot kline proxy
// Binance spot kline proxy
// /api/binance/klines?symbol=BTCUSDT&interval=1h&limit=24
app.get('/api/binance/klines', async (req, res) => {
  try {
    let { symbol, interval, limit } = req.query;
    if (!symbol || !interval) {
      return res.status(400).json({ error: "symbol and interval are required" });
    }

    symbol = String(symbol).toUpperCase();
    const lim = Math.min(Number(limit) || 500, 1000); // Binance 최대 1000
    const search = new URLSearchParams();
    search.set('symbol', symbol);
    search.set('interval', interval);
    search.set('limit', String(lim));
    const qs = search.toString();

    const cacheKey = `BINKLINES:${symbol}:${interval}:${lim}`;
    const cached = hit(cacheKey);
    if (cached) {
      setCorsAndCache(res);
      return res.type(cached.ct).status(cached.status).send(cached.body);
    }
    let lastError;
    const normalize = (rows) => {
      if (!Array.isArray(rows)) return null;
      if (!rows.length) return [];
      if (Array.isArray(rows[0])) return rows;
      const out = [];
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const openTime = Number(row.openTime ?? row.t ?? row.time ?? row.timestamp ?? row[0]);
        const open = Number(row.open ?? row.o ?? row[1]);
        const high = Number(row.high ?? row.h ?? row[2]);
        const low = Number(row.low ?? row.l ?? row[3]);
        const close = Number(row.close ?? row.c ?? row[4]);
        const volumeRaw = row.volume ?? row.v ?? row.quoteAssetVolume ?? row.quoteVolume ?? row.q ?? row[5];
        const volume = Number(volumeRaw ?? 0);
        if (!Number.isFinite(openTime) || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
          continue;
        }
        out.push([
          openTime,
          open,
          high,
          low,
          close,
          Number.isFinite(volume) ? volume : 0
        ]);
      }
      return out;
    };

    for (const base of BINANCE_SPOT_BASES) {
      const url = `${base}/api/v3/klines?${qs}`;
      try {
        const raw = await bfetch(url);
        const klines = normalize(raw);
        if (!klines) throw new Error('invalid klines payload');
        const payload = { ok: true, status: 200, body: JSON.stringify(klines), ct: 'application/json; charset=utf-8' };
        setCorsAndCache(res);
        res.type(payload.ct).status(payload.status).send(payload.body);
        keep(cacheKey, payload);
        return;
      } catch (err) {
        lastError = err;
        console.warn(`[binance klines] ${base} failed:`, err?.message || err);
      }
    }

    throw lastError || new Error('binance spot endpoints exhausted');
  } catch (e) {
    console.error('/api/binance/klines error:', e);
    setCorsAndCache(res);
    res.status(502).json({ error: 'binance kline failed', detail: String(e?.message || e) });
  }
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

// 메인 페이지
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'apps/web/index.html'));
});

// SPA fallback: 오직 "비-API" GET 요청만 index.html 반환
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  if (req.method !== 'GET') return next();
  if (!req.accepts('html')) return next();
  return res.sendFile(path.join(__dirname, 'apps/web/index.html'));
});

// 여기까지 못 잡힌 건 404로
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not Found' });
  }
  return res.status(404).end();
});

// 헬스체크
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// ==============================
// MongoDB 연결 + 서버 시작
// ==============================
let serverStarted = false;
function startHttpServer() {
  if (serverStarted) return;
  serverStarted = true;
  app.listen(PORT, () => console.log(`🚀 TWO4/Seed server on ${PORT}`));
}

let shuttingDown = false;
function gracefulShutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`⚙️  Received ${signal}, shutting down market engines...`);
  try {
    cvdEngine?.stop?.();
    heatmapEngine?.stop?.();
    liquidationEngine?.stop?.();
  } catch (error) {
    console.error('Failed to stop market engines:', error.message);
  }
  if (!serverStarted) {
    process.exit(0);
  }
  setTimeout(() => process.exit(0), 500).unref?.();
}

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, () => gracefulShutdown(signal));
});

async function bootstrap() {
  const uri = process.env.MONGODB_URI;
  if (uri) {
    try {
      const parsed = new URL(uri);
      const masked = `${parsed.protocol}//${parsed.username || '(no-user)'}:****@${parsed.host}${parsed.pathname || ''}`;
      console.log('🔌 Connecting to MongoDB at', masked);
    } catch (error) {
      console.log('🔌 Connecting to MongoDB with provided URI');
    }
  }

  try {
    await connectDatabase();
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error.message);
    process.exit(1);
  }

  cvdEngine = new CVDEngine({ cvdModel: CVDModel, priceModel: PriceModel, symbol: 'BTCUSDT' });
  heatmapEngine = new HeatmapEngine({ heatmapModel: HeatmapModel, symbol: 'BTCUSDT' });
  liquidationEngine = new LiquidationHeatmapEngine({ liquidationModel: LiquidationEventModel });

  cvdEngine.start();
  heatmapEngine.start();
  liquidationEngine.start();

  cvdRouter = createCvdRouter({ cvdEngine, cvdModel: CVDModel, priceModel: PriceModel });
  heatmapRouter = createHeatmapRouter({ heatmapEngine, heatmapModel: HeatmapModel });
  liquidationRouter = createLiquidationHeatmapRouter({ liquidationEngine });
  priceRouter = createPriceRouter({ cvdEngine, priceModel: PriceModel });

  app.use('/api/cvd', cvdRouter);
  app.use('/api/heatmap', heatmapRouter);
  app.use('/api/liquidations', liquidationRouter);
  app.use('/api/price', priceRouter);
  app.use('/api/seed-weather', seedWeatherRouter);
  app.use('/api/orbits', orbitsRouter);
  app.use('/api/method', orbitsRouter);

  startHttpServer();
}

bootstrap().catch((error) => {
  console.error('❌ Failed to bootstrap application:', error);
  process.exit(1);
});
