const express = require('express');
const { createHeadlineText, createSectorText } = require('../ai/forecaster');
const { rewriteForecast, isEnabled } = require('../ai/llm');

const FIVE_MINUTES = 5 * 60 * 1000;
const DEFAULT_SYMBOL = 'BTCUSDT';

const cache = new Map();

function hashString(input) {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (Math.imul(h ^ (h >>> 16), 2246822507) >>> 0) || 1;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const SKY_LEVELS = ['sunny', 'clear', 'breeze', 'overcast', 'storm', 'typhoon'];
const VOL_LEVELS = ['low', 'normal', 'high', 'extreme'];
const TREND_LEVELS = ['down', 'flat', 'up'];
const CVD_LEVELS = ['neutral', 'mixed', 'retail_push', 'whale_push', 'whale_dump'];

function chooseLevel(levels, value) {
  const scaled = Math.max(0, Math.min(0.9999, value));
  const index = Math.floor(scaled * levels.length);
  return levels[Math.min(index, levels.length - 1)];
}

function deriveSky({ rng, trend4h, volatility }) {
  const base = rng();
  if (volatility === 'extreme') return base > 0.4 ? 'typhoon' : 'storm';
  if (volatility === 'high') {
    if (trend4h === 'down') return base > 0.4 ? 'storm' : 'overcast';
    return base > 0.5 ? 'storm' : 'breeze';
  }
  if (trend4h === 'up') return base > 0.3 ? 'sunny' : 'clear';
  if (trend4h === 'down') return base > 0.5 ? 'overcast' : 'storm';
  return base > 0.6 ? 'breeze' : 'clear';
}

function deriveAction({ trend4h, volatility, cvdSignal }) {
  if (trend4h === 'down' || volatility === 'extreme' || cvdSignal === 'whale_dump') {
    return 'protect';
  }
  if (trend4h === 'up' && (cvdSignal === 'whale_push' || cvdSignal === 'retail_push')) {
    return 'push';
  }
  return 'balance';
}

function formatNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildSectorPayload({ symbol, name, bucket, index }) {
  const seed = hashString(`${symbol}:${name}:${bucket}:${index}`);
  const rng = mulberry32(seed);

  const breadth = formatNumber(0.28 + rng() * 0.6, 0.18, 0.92);
  const volatility = chooseLevel(VOL_LEVELS, rng());
  const trend4h = chooseLevel(TREND_LEVELS, rng());
  const cvdSignal = chooseLevel(CVD_LEVELS, rng());
  const action = deriveAction({ trend4h, volatility, cvdSignal });
  const sky = deriveSky({ rng, trend4h, volatility });

  return {
    name,
    sky,
    breadth: Number(breadth.toFixed(2)),
    volatility,
    trend4h,
    cvdSignal,
    action,
  };
}

function buildHeadlinePayload({ symbol, bucket }) {
  const seed = hashString(`${symbol}:headline:${bucket}`);
  const rng = mulberry32(seed);

  const breadth = formatNumber(0.35 + rng() * 0.5, 0.2, 0.95);
  const volatility = chooseLevel(VOL_LEVELS, rng());
  const trend4h = chooseLevel(TREND_LEVELS, rng());
  const cvdSignal = chooseLevel(CVD_LEVELS, rng());
  const action = deriveAction({ trend4h, volatility, cvdSignal });
  const sky = deriveSky({ rng, trend4h, volatility });

  return {
    sky,
    breadth: Number(breadth.toFixed(2)),
    volatility,
    trend4h,
    cvdSignal,
    action,
  };
}

const DEFAULT_SECTORS = [
  'AI',
  'RWA',
  'Oracle · LINK',
  'DeFi',
  'Meme/High-Beta',
];

async function applyForecastText(payload, { type, symbol, asOf }) {
  const ruleBased = type === 'headline'
    ? createHeadlineText(payload)
    : createSectorText(payload);

  let narrative = ruleBased.narrative;

  if (narrative && isEnabled()) {
    const rewritten = await rewriteForecast({
      narrative,
      context: { type, symbol, at: asOf, name: payload.name || 'headline' },
    });
    if (rewritten) {
      narrative = rewritten;
    }
  }

  return {
    ...payload,
    forecast: {
      narrative,
      action: ruleBased.action,
      actionKey: ruleBased.actionKey,
      combined: narrative ? `${narrative} ${ruleBased.action}`.trim() : ruleBased.action,
    },
  };
}

async function generateWeather(symbol) {
  const now = Date.now();
  const bucket = Math.floor(now / FIVE_MINUTES);

  const headlinePayload = buildHeadlinePayload({ symbol, bucket });
  const enrichedHeadline = await applyForecastText(headlinePayload, {
    type: 'headline',
    symbol,
    asOf: now,
  });

  const sectors = await Promise.all(
    DEFAULT_SECTORS.map((name, index) => buildSectorPayload({ symbol, name, bucket, index }))
      .map(async (payload) => applyForecastText(payload, {
        type: 'sector',
        symbol,
        asOf: now,
      })),
  );

  return {
    asOf: now,
    symbol,
    headline: enrichedHeadline,
    sectors,
  };
}

async function getWeather(symbol) {
  const normalizedSymbol = String(symbol || DEFAULT_SYMBOL).toUpperCase();
  const key = normalizedSymbol;
  const now = Date.now();
  const existing = cache.get(key);

  if (existing && existing.expires > now) {
    return existing.data;
  }

  const data = await generateWeather(normalizedSymbol);
  cache.set(key, {
    data,
    expires: now + FIVE_MINUTES,
  });
  return data;
}

module.exports = function createSeedWeatherRouter() {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const symbol = String(req.query.symbol || DEFAULT_SYMBOL).toUpperCase();
      const weather = await getWeather(symbol);
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.json(weather);
    } catch (error) {
      console.error('[API/SEED-WEATHER] Failed to build response:', error);
      return res.status(500).json({ error: 'Failed to generate Seed AI weather data.' });
    }
  });

  return router;
};
