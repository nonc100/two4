const express = require('express');
const { performance } = require('perf_hooks');

const fetch = (...args) => import('node-fetch').then(({ default: fetchFn }) => fetchFn(...args));

const SECTORS = [
  { name: '플랫폼/L1', list: ['ETH', 'BNB', 'SOL', 'ADA', 'DOT', 'AVAX', 'TRX', 'NEAR', 'TON', 'APT', 'SUI', 'ATOM', 'ALGO', 'CFX', 'SEI'] },
  { name: 'AI', list: ['RNDR', 'GRT', 'TAO', 'WLD', 'ARKM', 'OCEAN', 'NMR'] },
  { name: 'DePIN', list: ['HNT', 'IOTX', 'AKT', 'FIL', 'STORJ', 'AR'] },
  { name: 'DeFi', list: ['AAVE', 'SNX', 'MKR', 'COMP', 'LDO', 'HIFI', 'YFI'] },
  { name: 'LSDFi', list: ['LDO', 'RPL', 'PENDLE', 'ETHFI', 'JTO', 'SWELL', 'PUFFER'] },
  { name: 'DEX', list: ['UNI', 'SUSHI', 'DYDX', 'RUNE', '1INCH', 'KNC', 'BAL', 'JUP', 'RAY'] },
  { name: 'NFT/메타/X2E', list: ['AXS', 'SAND', 'MANA', 'ILV', 'GALA', 'APE', 'PIXEL', 'GMT', 'YGG', 'BIGTIME', 'VOXEL'] },
  { name: '오라클/데이터', list: ['LINK', 'BAND', 'PYTH', 'API3', 'TRB', 'UMA'] },
  { name: '페이먼트', list: ['XRP', 'XLM', 'CELO', 'COTI', 'CRO', 'PUNDIX'] },
  { name: '프라이버시', list: ['ZEC', 'DASH', 'SCRT', 'ZEN'] },
  { name: 'DID', list: ['WLD', 'CVC', 'ICX', 'ONT'] },
  { name: '크로스체인', list: ['AXL', 'W', 'STG'] },
  { name: '거래소 토큰', list: ['BNB', 'OKB', 'BGB', 'CRO', 'KCS', 'WOO', 'MX'] },
  { name: 'RWA', list: ['ONDO', 'POLYX', 'CFG', 'RSR', 'MKR'] },
  { name: 'BTCfi', list: ['STX', 'RUNE'] },
  { name: 'BRC-20', list: ['ORDI', 'SATS'] },
];

const TIMEFRAME_TO_INTERVAL = {
  '15m': '15m',
  '1H': '1h',
  '4H': '4h',
  '1D': '1d',
  '1W': '1w',
  '1M': '1M',
};

function resolveTimeframeKey(raw) {
  if (!raw) return null;
  const base = String(raw).trim();
  if (!base) return null;

  const candidates = [
    base,
    base.toUpperCase(),
    base.toLowerCase(),
    base.replace(/([a-z]+)/gi, match => {
      if (match.length <= 1) return match.toUpperCase();
      return match[0].toUpperCase() + match.slice(1).toLowerCase();
    }),
  ];

  for (const key of candidates) {
    if (TIMEFRAME_TO_INTERVAL[key]) {
      return key;
    }
  }

  return null;
}

const DEFAULT_LIMIT = 120;
const MAX_LIMIT = 720;
const CANDLE_CACHE_TTL = 60_000; // 1 min
const MARKET_CAP_TTL = 600_000; // 10 min
const TICKER_TTL = 45_000; // 45 sec

const PAIR_OVERRIDES = new Map([
  ['W', 'WUSDT'],
  ['SATS', 'SATSUSDT'],
  ['1INCH', '1INCHUSDT'],
  ['YFI', 'YFIUSDT'],
  ['HIFI', 'HIFIUSDT'],
  ['DYDX', 'DYDXUSDT'],
  ['TAO', 'TAOUSDT'],
  ['WLD', 'WLDUSDT'],
  ['PYTH', 'PYTHUSDT'],
  ['JTO', 'JTOUSDT'],
  ['PIXEL', 'PIXELUSDT'],
  ['BIGTIME', 'BIGTIMEUSDT'],
  ['VOXEL', 'VOXELUSDT'],
  ['PUNDIX', 'PUNDIXUSDT'],
  ['SCRT', 'SCRTUSDT'],
  ['AXL', 'AXLUSDT'],
  ['CFG', 'CFGUSDT'],
  ['STG', 'STGUSDT'],
  ['ONDO', 'ONDOUSDT'],
  ['POLYX', 'POLYXUSDT'],
  ['ETHFI', 'ETHFIUSDT'],
  ['SEI', 'SEIUSDT'],
  ['APT', 'APTUSDT'],
  ['SUI', 'SUIUSDT'],
  ['FIL', 'FILUSDT'],
  ['AR', 'ARUSDT'],
  ['AKT', 'AKTUSDT'],
  ['RPL', 'RPLUSDT'],
  ['SWELL', 'SWELLUSDT'],
  ['PUFFER', null],
  ['OKB', null],
  ['BGB', null],
  ['KCS', null],
  ['MX', null],
]);

const localCache = new Map();
function getCache(key, ttl) {
  const hit = localCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.t > ttl) {
    localCache.delete(key);
    return null;
  }
  return hit.v;
}
function setCache(key, value) {
  localCache.set(key, { v: value, t: Date.now() });
}

async function mapConcurrent(items, limit, iterator) {
  const size = items.length;
  const results = new Array(size);
  if (!size) return results;
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, size) }, async () => {
    while (index < size) {
      const current = index++;
      try {
        results[current] = await iterator(items[current], current);
      } catch (err) {
        results[current] = err;
      }
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchJson(url, options = {}, label = 'request') {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${label} failed (${res.status}) ${text.slice(0, 120)}`);
  }
  return res.json();
}

function resolvePair(base) {
  const upper = base.toUpperCase();
  if (PAIR_OVERRIDES.has(upper)) {
    const override = PAIR_OVERRIDES.get(upper);
    if (!override) return null;
    return override;
  }
  return `${upper}USDT`;
}

async function fetchCandles(pair, interval, limit) {
  const key = `candles:${pair}:${interval}:${limit}`;
  const cached = getCache(key, CANDLE_CACHE_TTL);
  if (cached) return cached;

  const url = new URL('https://api.binance.com/api/v3/klines');
  url.searchParams.set('symbol', pair);
  url.searchParams.set('interval', interval);
  url.searchParams.set('limit', String(limit));

  const rows = await fetchJson(url.toString(), {}, `klines ${pair}`);
  const candles = rows.map(row => ({
    time: Math.floor(Number(row[0]) / 1000),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
  }));
  setCache(key, candles);
  return candles;
}

async function fetchMarketCaps() {
  const cached = getCache('marketCaps', MARKET_CAP_TTL);
  if (cached) return cached;

  try {
    const body = JSON.stringify({ page: 1, rows: 1000 });
    const res = await fetch('https://www.binance.com/bapi/asset/v2/public/asset-service/product/get-product-list', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    if (!res.ok) throw new Error(`market list ${res.status}`);
    const json = await res.json();
    const list = Array.isArray(json?.data) ? json.data : Array.isArray(json?.data?.list) ? json.data.list : [];
    const map = new Map();
    for (const item of list) {
      const base = String(item?.b || item?.baseAsset || '').toUpperCase();
      const capValue = Number(item?.marketCap || item?.marketCapUsd || item?.market_cap || item?.marketCapValue);
      if (base && Number.isFinite(capValue) && capValue > 0) {
        map.set(base, capValue);
      }
    }
    if (map.size) {
      setCache('marketCaps', map);
      return map;
    }
  } catch (err) {
    console.warn('[twofive] market cap fetch failed:', err.message);
  }
  const fallback = new Map();
  setCache('marketCaps', fallback);
  return fallback;
}

async function fetchTickers(pairs) {
  const signature = pairs.slice().sort().join(',');
  const key = `tickers:${signature}`;
  const cached = getCache(key, TICKER_TTL);
  if (cached) return cached;

  const map = new Map();
  const chunkSize = 80;
  for (let i = 0; i < pairs.length; i += chunkSize) {
    const chunk = pairs.slice(i, i + chunkSize);
    const qs = encodeURIComponent(JSON.stringify(chunk));
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${qs}`;
    try {
      const rows = await fetchJson(url, {}, 'ticker24');
      for (const row of rows) {
        const symbol = String(row?.symbol || '').toUpperCase();
        if (!symbol) continue;
        map.set(symbol, {
          quoteVolume: Number(row?.quoteVolume) || 0,
          volume: Number(row?.volume) || 0,
          lastPrice: Number(row?.lastPrice) || 0,
          weightedAvgPrice: Number(row?.weightedAvgPrice) || 0,
        });
      }
    } catch (err) {
      console.warn('[twofive] ticker chunk failed:', err.message);
    }
  }
  setCache(key, map);
  return map;
}

function aggregateCandles(constituents, weights, candlesByPair) {
  const bucket = new Map();
  const used = [];
  const missing = [];

  for (const base of constituents) {
    const pair = base.pair;
    const weight = weights.get(base.symbol) || 0;
    const candles = pair ? candlesByPair.get(pair) : null;
    if (!pair || !candles || !candles.length || !Number.isFinite(weight) || weight <= 0) {
      missing.push(base.symbol);
      continue;
    }
    used.push(base.symbol);
    for (const c of candles) {
      let slot = bucket.get(c.time);
      if (!slot) {
        slot = [];
        bucket.set(c.time, slot);
      }
      slot.push({ weight, ...c });
    }
  }

  const combined = [];
  const times = Array.from(bucket.keys()).sort((a, b) => a - b);
  for (const time of times) {
    const rows = bucket.get(time) || [];
    const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
    if (!totalWeight) continue;
    const open = rows.reduce((acc, row) => acc + row.open * row.weight, 0) / totalWeight;
    const close = rows.reduce((acc, row) => acc + row.close * row.weight, 0) / totalWeight;
    const high = Math.max(...rows.map(row => row.high));
    const low = Math.min(...rows.map(row => row.low));
    combined.push({
      time,
      open: Number(open.toFixed(6)),
      high: Number(high.toFixed(6)),
      low: Number(low.toFixed(6)),
      close: Number(close.toFixed(6)),
    });
  }

  return { candles: combined, used, missing };
}

async function gatherSectorData(interval, limit) {
  const normalizedInterval = resolveTimeframeKey(interval);
  const effectiveInterval = normalizedInterval || '1D';
  if (!normalizedInterval && interval) {
    console.warn(`[twofive] unsupported interval "${interval}" – falling back to ${effectiveInterval}`);
  }
  const binanceInterval = TIMEFRAME_TO_INTERVAL[effectiveInterval];
  if (!binanceInterval) {
    throw new Error(`Unsupported interval: ${interval || effectiveInterval}`);
  }

  const allSymbols = new Set();
  const pairBySymbol = new Map();
  const sectorConstituents = SECTORS.map(sec => {
    const entries = sec.list.map(sym => {
      const pair = resolvePair(sym);
      if (pair) {
        allSymbols.add(pair);
        pairBySymbol.set(sym, pair);
      }
      return { symbol: sym, pair };
    });
    return { sector: sec.name, entries };
  });

  const pairs = Array.from(allSymbols);
  const candlesByPair = new Map();
  await mapConcurrent(pairs, 6, async pair => {
    try {
      const candles = await fetchCandles(pair, binanceInterval, limit);
      candlesByPair.set(pair, candles);
    } catch (err) {
      console.warn(`[twofive] failed to fetch klines for ${pair}:`, err.message);
    }
  });

  const marketCaps = await fetchMarketCaps();
  const tickers = await fetchTickers(pairs);

  const weights = new Map();
  for (const [symbol, pair] of pairBySymbol.entries()) {
    const cap = marketCaps.get(symbol);
    const ticker = tickers.get(pair);
    const fallback = ticker
      ? ticker.quoteVolume || (ticker.weightedAvgPrice * ticker.volume) || (ticker.lastPrice || 1)
      : 0;
    const weight = Number.isFinite(cap) && cap > 0 ? cap : fallback;
    if (Number.isFinite(weight) && weight > 0) {
      weights.set(symbol, weight);
    }
  }

  const sectors = sectorConstituents.map(sec => {
    const result = aggregateCandles(sec.entries, weights, candlesByPair);
    return {
      name: sec.sector,
      candles: result.candles,
      used: result.used,
      missing: sec.entries
        .filter(entry => entry.pair === null || !result.used.includes(entry.symbol))
        .map(entry => entry.symbol),
    };
  });

  return { interval: effectiveInterval, binanceInterval, sectors };
}

function createTwoFiveRouter({ setCorsAndCache } = {}) {
  const router = express.Router();

  router.get('/sector-map', async (req, res) => {
    const interval = String(req.query.interval || req.query.tf || '1D');
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || DEFAULT_LIMIT, 20), MAX_LIMIT);
    const started = performance.now();

    try {
      const payload = await gatherSectorData(interval, limit);
      const duration = Math.round(performance.now() - started);
      const response = {
        ok: true,
        interval: payload.interval,
        binanceInterval: payload.binanceInterval,
        limit,
        sectors: payload.sectors,
        generatedAt: new Date().toISOString(),
        latencyMs: duration,
      };
      if (setCorsAndCache) setCorsAndCache(res);
      res.status(200).json(response);
    } catch (err) {
      console.error('[twofive] sector map failed:', err.message);
      if (setCorsAndCache) setCorsAndCache(res);
      res.status(500).json({ ok: false, error: 'SECTOR_MAP_FAILED', detail: err.message });
    }
  });

  return router;
}

module.exports = { createTwoFiveRouter };
