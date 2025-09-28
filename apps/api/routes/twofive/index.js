'use strict';

const { setTimeout: delay } = require('node:timers/promises');

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

const TOKEN_META = new Map([
  ['ETH', { id: 'ethereum', name: 'Ethereum' }],
  ['BNB', { id: 'binancecoin', name: 'BNB' }],
  ['SOL', { id: 'solana', name: 'Solana' }],
  ['ADA', { id: 'cardano', name: 'Cardano' }],
  ['DOT', { id: 'polkadot', name: 'Polkadot' }],
  ['AVAX', { id: 'avalanche-2', name: 'Avalanche' }],
  ['TRX', { id: 'tron', name: 'TRON' }],
  ['NEAR', { id: 'near', name: 'NEAR' }],
  ['TON', { id: 'the-open-network', name: 'TON' }],
  ['APT', { id: 'aptos', name: 'Aptos' }],
  ['SUI', { id: 'sui', name: 'Sui' }],
  ['ATOM', { id: 'cosmos', name: 'Cosmos' }],
  ['ALGO', { id: 'algorand', name: 'Algorand' }],
  ['CFX', { id: 'conflux-token', name: 'Conflux' }],
  ['SEI', { id: 'sei-network', name: 'Sei' }],
  ['RNDR', { id: 'render-token', name: 'Render' }],
  ['GRT', { id: 'the-graph', name: 'The Graph' }],
  ['TAO', { id: 'bittensor', name: 'Bittensor' }],
  ['WLD', { id: 'worldcoin', name: 'Worldcoin' }],
  ['ARKM', { id: 'arkham', name: 'Arkham' }],
  ['OCEAN', { id: 'ocean-protocol', name: 'Ocean Protocol' }],
  ['NMR', { id: 'numeraire', name: 'Numeraire' }],
  ['HNT', { id: 'helium', name: 'Helium' }],
  ['IOTX', { id: 'iotex', name: 'IoTeX' }],
  ['AKT', { id: 'akash-network', name: 'Akash' }],
  ['FIL', { id: 'filecoin', name: 'Filecoin' }],
  ['STORJ', { id: 'storj', name: 'Storj' }],
  ['AR', { id: 'arweave', name: 'Arweave' }],
  ['AAVE', { id: 'aave', name: 'Aave' }],
  ['SNX', { id: 'synthetix-network-token', name: 'Synthetix' }],
  ['MKR', { id: 'maker', name: 'Maker' }],
  ['COMP', { id: 'compound-governance-token', name: 'Compound' }],
  ['LDO', { id: 'lido-dao', name: 'Lido DAO' }],
  ['HIFI', { id: 'hifi-finance', name: 'Hifi' }],
  ['YFI', { id: 'yearn-finance', name: 'Yearn Finance' }],
  ['RPL', { id: 'rocket-pool', name: 'Rocket Pool' }],
  ['PENDLE', { id: 'pendle', name: 'Pendle' }],
  ['ETHFI', { id: 'ether-fi', name: 'Ether.fi' }],
  ['JTO', { id: 'jito-governance-token', name: 'Jito' }],
  ['SWELL', { id: 'swell-network', name: 'Swell' }],
  ['PUFFER', { id: 'puffer-finance', name: 'Puffer Finance' }],
  ['UNI', { id: 'uniswap', name: 'Uniswap' }],
  ['SUSHI', { id: 'sushi', name: 'Sushi' }],
  ['DYDX', { id: 'dydx', name: 'dYdX' }],
  ['RUNE', { id: 'thorchain', name: 'THORChain' }],
  ['1INCH', { id: '1inch', name: '1inch' }],
  ['KNC', { id: 'kyber-network-crystal', name: 'Kyber Network' }],
  ['BAL', { id: 'balancer', name: 'Balancer' }],
  ['JUP', { id: 'jupiter', name: 'Jupiter' }],
  ['RAY', { id: 'raydium', name: 'Raydium' }],
  ['AXS', { id: 'axie-infinity', name: 'Axie Infinity' }],
  ['SAND', { id: 'the-sandbox', name: 'The Sandbox' }],
  ['MANA', { id: 'decentraland', name: 'Decentraland' }],
  ['ILV', { id: 'illuvium', name: 'Illuvium' }],
  ['GALA', { id: 'gala', name: 'Gala' }],
  ['APE', { id: 'apecoin', name: 'ApeCoin' }],
  ['PIXEL', { id: 'pixels', name: 'Pixels' }],
  ['GMT', { id: 'stepn', name: 'STEPN' }],
  ['YGG', { id: 'yield-guild-games', name: 'Yield Guild Games' }],
  ['BIGTIME', { id: 'big-time', name: 'Big Time' }],
  ['VOXEL', { id: 'voxies', name: 'Voxies' }],
  ['LINK', { id: 'chainlink', name: 'Chainlink' }],
  ['BAND', { id: 'band-protocol', name: 'Band Protocol' }],
  ['PYTH', { id: 'pyth-network', name: 'Pyth Network' }],
  ['API3', { id: 'api3', name: 'API3' }],
  ['TRB', { id: 'tellor', name: 'Tellor' }],
  ['UMA', { id: 'uma', name: 'UMA' }],
  ['XRP', { id: 'ripple', name: 'XRP' }],
  ['XLM', { id: 'stellar', name: 'Stellar' }],
  ['CELO', { id: 'celo', name: 'Celo' }],
  ['COTI', { id: 'coti', name: 'COTI' }],
  ['CRO', { id: 'cronos', name: 'Cronos' }],
  ['PUNDIX', { id: 'pundi-x-2', name: 'Pundi X' }],
  ['ZEC', { id: 'zcash', name: 'Zcash' }],
  ['DASH', { id: 'dash', name: 'Dash' }],
  ['SCRT', { id: 'secret', name: 'Secret' }],
  ['ZEN', { id: 'horizen', name: 'Horizen' }],
  ['CVC', { id: 'civic', name: 'Civic' }],
  ['ICX', { id: 'icon', name: 'ICON' }],
  ['ONT', { id: 'ontology', name: 'Ontology' }],
  ['AXL', { id: 'axelar', name: 'Axelar' }],
  ['W', { id: 'wormhole', name: 'Wormhole' }],
  ['STG', { id: 'stargate-finance', name: 'Stargate Finance' }],
  ['OKB', { id: 'okb', name: 'OKB' }],
  ['BGB', { id: 'bitget-token', name: 'Bitget Token' }],
  ['KCS', { id: 'kucoin-shares', name: 'KuCoin Token' }],
  ['WOO', { id: 'woo-network', name: 'WOO Network' }],
  ['MX', { id: 'mx-token', name: 'MX Token' }],
  ['ONDO', { id: 'ondo-finance', name: 'Ondo' }],
  ['POLYX', { id: 'polymesh', name: 'Polymesh' }],
  ['CFG', { id: 'centrifuge', name: 'Centrifuge' }],
  ['RSR', { id: 'reserve-rights-token', name: 'Reserve Rights' }],
  ['STX', { id: 'stacks', name: 'Stacks' }],
  ['ORDI', { id: 'ordi', name: 'ORDI' }],
  ['SATS', { id: 'sats-ordinals', name: 'SATS Ordinals' }],
]);

const INTERVALS = {
  '15M': { key: '15m', seconds: 15 * 60, maxCandles: 192 },
  '15m': { key: '15m', seconds: 15 * 60, maxCandles: 192 },
  '1H': { key: '1H', seconds: 60 * 60, maxCandles: 720 },
  '1h': { key: '1H', seconds: 60 * 60, maxCandles: 720 },
  '4H': { key: '4H', seconds: 4 * 60 * 60, maxCandles: 720 },
  '4h': { key: '4H', seconds: 4 * 60 * 60, maxCandles: 720 },
  '1D': { key: '1D', seconds: 24 * 60 * 60, maxCandles: 420 },
  '1d': { key: '1D', seconds: 24 * 60 * 60, maxCandles: 420 },
  '1W': { key: '1W', seconds: 7 * 24 * 60 * 60, maxCandles: 260 },
  '1w': { key: '1W', seconds: 7 * 24 * 60 * 60, maxCandles: 260 },
  '1M': { key: '1M', seconds: 30 * 24 * 60 * 60, maxCandles: 120 },
  '1mth': { key: '1M', seconds: 30 * 24 * 60 * 60, maxCandles: 120 },
  '1m': { key: '1H', seconds: 60 * 60, maxCandles: 720 },
};

const DEFAULT_INTERVAL = '1D';
const DEFAULT_LIMIT = 160;
const FETCH_CONCURRENCY = 4;
const FETCH_RETRIES = 3;
const FETCH_TIMEOUT_MS = 15000;
const HEALTHCHECK_TIMEOUT_MS = 4000;
const PING_TTL_MS = 60 * 1000;

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

let lastPingAt = 0;
let lastPingOk = false;

function pickInterval(raw) {
  if (!raw) return INTERVALS[DEFAULT_INTERVAL];
  const val = String(raw);
  return INTERVALS[val] || INTERVALS[val.toUpperCase()] || INTERVALS[val.toLowerCase()] || INTERVALS[DEFAULT_INTERVAL];
}

function clampLimit(intervalDef, rawLimit) {
  const max = intervalDef.maxCandles;
  const requested = Number.isFinite(Number(rawLimit)) ? Number(rawLimit) : DEFAULT_LIMIT;
  const safe = Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(safe), 30), max);
}

function mapWithConcurrency(items, limit, mapper) {
  if (!items.length) return Promise.resolve([]);
  const results = new Array(items.length);
  let index = 0;
  const size = Math.min(limit, items.length);
  const workers = Array.from({ length: size }, () => (async () => {
    while (true) {
      const current = index++;
      if (current >= items.length) break;
      const item = items[current];
      try {
        results[current] = await mapper(item, current);
      } catch (err) {
        results[current] = { error: err, item };
      }
    }
  })());
  return Promise.all(workers).then(() => results);
}

async function fetchCoinRange(id, fromSec, toSec) {
  const url = `${COINGECKO_BASE}/coins/${encodeURIComponent(id)}/market_chart/range?vs_currency=usd&from=${fromSec}&to=${toSec}`;
  let attempt = 0;
  while (attempt < FETCH_RETRIES) {
    attempt += 1;
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        if ((res.status >= 500 || res.status === 429) && attempt < FETCH_RETRIES) {
          await delay(400 * attempt);
          continue;
        }
        const text = await res.text();
        throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 120)}`);
      }
      return await res.json();
    } catch (err) {
      if (attempt >= FETCH_RETRIES) throw err;
      await delay(300 * attempt);
    }
  }
  throw new Error('Failed to fetch after retries');
}

async function ensureCoinGeckoReachable() {
  const now = Date.now();
  if (lastPingOk && now - lastPingAt < PING_TTL_MS) {
    return true;
  }
  try {
    const res = await fetch(`${COINGECKO_BASE}/ping`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(HEALTHCHECK_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ping HTTP ${res.status}: ${text.slice(0, 120)}`);
    }
    lastPingOk = true;
    lastPingAt = now;
    return true;
  } catch (err) {
    lastPingOk = false;
    lastPingAt = now;
    const error = new Error('CoinGecko ping failed');
    error.cause = err;
    throw error;
  }
}

function normaliseBuckets(raw, intervalSeconds, limit) {
  if (!raw || !Array.isArray(raw.prices) || !raw.prices.length) return [];
  const priceArr = raw.prices;
  const capArr = Array.isArray(raw.market_caps) ? raw.market_caps : [];
  const len = Math.min(priceArr.length, capArr.length);
  const buckets = new Map();
  for (let i = 0; i < len; i += 1) {
    const [ts, priceVal] = priceArr[i];
    const capEntry = capArr[i];
    const capVal = Array.isArray(capEntry) ? capEntry[1] : null;
    if (!Number.isFinite(priceVal)) continue;
    const bucketTime = Math.floor((ts / 1000) / intervalSeconds) * intervalSeconds;
    const capNorm = Number.isFinite(capVal) && capVal > 0 ? capVal : null;
    let bucket = buckets.get(bucketTime);
    if (!bucket) {
      bucket = {
        time: bucketTime,
        open: priceVal,
        close: priceVal,
        high: priceVal,
        low: priceVal,
        capOpen: capNorm,
        capClose: capNorm,
        capSum: capNorm ?? 0,
        capCount: capNorm ? 1 : 0,
      };
      buckets.set(bucketTime, bucket);
    } else {
      bucket.close = priceVal;
      bucket.high = Math.max(bucket.high, priceVal);
      bucket.low = Math.min(bucket.low, priceVal);
      if (capNorm != null) {
        if (bucket.capOpen == null) bucket.capOpen = capNorm;
        bucket.capClose = capNorm;
        bucket.capSum += capNorm;
        bucket.capCount += 1;
      }
    }
  }
  const sorted = Array.from(buckets.values()).sort((a, b) => a.time - b.time);
  const tail = limit ? sorted.slice(-1 * (limit + 4)) : sorted;
  return tail.map((bucket) => {
    const capAvg = bucket.capCount > 0 ? bucket.capSum / bucket.capCount : null;
    return {
      time: bucket.time,
      open: bucket.open,
      close: bucket.close,
      high: bucket.high,
      low: bucket.low,
      capOpen: bucket.capOpen ?? capAvg,
      capClose: bucket.capClose ?? capAvg,
      capAvg,
    };
  });
}

function pickCap(...values) {
  for (const v of values) {
    if (Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

function round(value, digits = 6) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function combineSector(sectorSymbols, coinData, intervalSeconds, limit) {
  const aggregator = new Map();
  const used = [];
  const missing = [];
  const seen = new Set();

  sectorSymbols.forEach((rawSymbol) => {
    const symbol = String(rawSymbol || '').toUpperCase();
    if (!symbol || seen.has(symbol)) return;
    seen.add(symbol);
    const coin = coinData.get(symbol);
    if (!coin || !coin.buckets || !coin.buckets.length) {
      missing.push(symbol);
      return;
    }
    used.push(symbol);
    coin.buckets.forEach((bucket) => {
      const time = bucket.time;
      if (!Number.isFinite(time)) return;
      let entry = aggregator.get(time);
      if (!entry) {
        entry = {
          time,
          openNum: 0,
          openDen: 0,
          openPlain: 0,
          openPlainCount: 0,
          closeNum: 0,
          closeDen: 0,
          closePlain: 0,
          closePlainCount: 0,
          high: null,
          low: null,
        };
        aggregator.set(time, entry);
      }
      const capOpen = pickCap(bucket.capOpen, bucket.capAvg);
      const capClose = pickCap(bucket.capClose, bucket.capAvg);
      if (Number.isFinite(bucket.open)) {
        if (capOpen != null) {
          entry.openNum += bucket.open * capOpen;
          entry.openDen += capOpen;
        } else {
          entry.openPlain += bucket.open;
          entry.openPlainCount += 1;
        }
      }
      if (Number.isFinite(bucket.close)) {
        if (capClose != null) {
          entry.closeNum += bucket.close * capClose;
          entry.closeDen += capClose;
        } else {
          entry.closePlain += bucket.close;
          entry.closePlainCount += 1;
        }
      }
      if (Number.isFinite(bucket.high)) {
        entry.high = entry.high == null ? bucket.high : Math.max(entry.high, bucket.high);
      }
      if (Number.isFinite(bucket.low)) {
        entry.low = entry.low == null ? bucket.low : Math.min(entry.low, bucket.low);
      }
    });
  });

  const times = Array.from(aggregator.keys()).sort((a, b) => a - b);
  const trimmedTimes = limit ? times.slice(-1 * limit) : times;
  const candles = [];
  trimmedTimes.forEach((time) => {
    const entry = aggregator.get(time);
    let open = entry.openDen > 0 ? entry.openNum / entry.openDen : (entry.openPlainCount > 0 ? entry.openPlain / entry.openPlainCount : null);
    let close = entry.closeDen > 0 ? entry.closeNum / entry.closeDen : (entry.closePlainCount > 0 ? entry.closePlain / entry.closePlainCount : null);
    let high = entry.high;
    let low = entry.low;
    const fallback = open ?? close;
    if (high == null && fallback != null) high = fallback;
    if (low == null && fallback != null) low = fallback;
    if (open == null) open = fallback;
    if (close == null) close = fallback;
    if ([open, close, high, low].some((v) => !Number.isFinite(v))) return;
    candles.push({
      time,
      open: round(open),
      close: round(close),
      high: round(high),
      low: round(low),
    });
  });

  return { candles, used, missing };
}

function generateFallbackCandles(limit, intervalSeconds, basePrice = 100) {
  const candles = [];
  const now = Math.floor(Date.now() / 1000);
  let price = basePrice;
  const start = now - intervalSeconds * limit;
  for (let i = 0; i < limit; i += 1) {
    const time = start + (i + 1) * intervalSeconds;
    const open = price;
    const drift = (Math.random() - 0.5) * 0.08 * open;
    let close = Math.max(0.0001, open + drift);
    const high = Math.max(open, close) * (1 + Math.random() * 0.04);
    const low = Math.min(open, close) * (1 - Math.random() * 0.04);
    candles.push({
      time,
      open: round(open, 4),
      close: round(close, 4),
      high: round(high, 4),
      low: round(low, 4),
    });
    price = close;
  }
  return candles;
}

function generateFallbackSectors(intervalDef, limit) {
  let seed = 120;
  return SECTORS.map((sector) => {
    seed += 23;
    return {
      name: sector.name,
      candles: generateFallbackCandles(limit, intervalDef.seconds, seed),
      used: [...new Set(sector.list.map((s) => String(s || '').toUpperCase()))],
      missing: [],
      fallback: true,
    };
  });
}

async function buildSectorPayload(intervalDef, limit, log) {
  const nowSec = Math.floor(Date.now() / 1000);
  const fromSec = nowSec - intervalDef.seconds * (limit + 4);
  const uniqueSymbols = new Set();
  SECTORS.forEach((sector) => {
    sector.list.forEach((symbol) => {
      if (symbol) uniqueSymbols.add(String(symbol).toUpperCase());
    });
  });

  const symbolMeta = Array.from(uniqueSymbols).map((symbol) => ({
    symbol,
    meta: TOKEN_META.get(symbol),
  }));

  const missingMeta = new Set();
  symbolMeta.forEach(({ symbol, meta }) => {
    if (!meta) missingMeta.add(symbol);
  });

  const targets = symbolMeta.filter(({ meta }) => meta && meta.id);
  const coinData = new Map();
  const failedSymbols = new Set();

  if (targets.length) {
    await ensureCoinGeckoReachable();
  }

  const results = await mapWithConcurrency(targets, FETCH_CONCURRENCY, async ({ symbol, meta }) => {
    const response = { symbol, id: meta.id };
    try {
      const raw = await fetchCoinRange(meta.id, fromSec, nowSec);
      const buckets = normaliseBuckets(raw, intervalDef.seconds, limit + 6);
      response.buckets = buckets;
    } catch (err) {
      response.error = err;
    }
    return response;
  });

  let coinsWithData = 0;

  results.forEach((result) => {
    if (!result) return;
    const { symbol, buckets, error } = result;
    if (error || !buckets || !buckets.length) {
      failedSymbols.add(symbol);
      if (error) log.warn({ symbol, err: error }, 'twofive: coin fetch failed');
      coinData.set(symbol, { symbol, buckets: [] });
    } else {
      coinData.set(symbol, { symbol, buckets });
      coinsWithData += 1;
    }
  });

  missingMeta.forEach((symbol) => {
    failedSymbols.add(symbol);
    coinData.set(symbol, { symbol, buckets: [] });
    log.warn({ symbol }, 'twofive: missing coingecko id');
  });

  const sectors = SECTORS.map((sector) => {
    const combined = combineSector(sector.list, coinData, intervalDef.seconds, limit);
    return {
      name: sector.name,
      candles: combined.candles,
      used: combined.used,
      missing: combined.missing,
    };
  });

  const totalCandles = sectors.reduce((acc, sector) => acc + (sector.candles?.length || 0), 0);
  if (totalCandles === 0) {
    const error = new Error('No sector candles generated');
    error.code = 'NO_SECTOR_DATA';
    throw error;
  }

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    interval: intervalDef.key,
    limit,
    source: 'coingecko',
    range: {
      from: new Date(fromSec * 1000).toISOString(),
      to: new Date(nowSec * 1000).toISOString(),
    },
    sectors,
    diagnostics: {
      totalCoins: uniqueSymbols.size,
      fetched: Math.max(0, targets.length - failedSymbols.size),
      withData: coinsWithData,
      missing: Array.from(failedSymbols),
    },
  };
}

module.exports = async function twofiveRoutes(fastify) {
  fastify.get('/api/twofive/sector-map', async (request, reply) => {
    const started = Date.now();
    const intervalDef = pickInterval(request.query?.interval || DEFAULT_INTERVAL);
    const limit = clampLimit(intervalDef, request.query?.limit);
    try {
      const payload = await buildSectorPayload(intervalDef, limit, request.log);
      return {
        ...payload,
        elapsedMs: Date.now() - started,
        fallback: false,
        binanceInterval: intervalDef.key,
      };
    } catch (err) {
      request.log.error({ err }, 'twofive: failed to build sector payload, using fallback data');
      const sectors = generateFallbackSectors(intervalDef, limit);
      return {
        ok: true,
        fallback: true,
        reason: err.message,
        interval: intervalDef.key,
        binanceInterval: intervalDef.key,
        limit,
        sectors,
        generatedAt: new Date().toISOString(),
        source: 'fallback',
        elapsedMs: Date.now() - started,
      };
    }
  });
};

