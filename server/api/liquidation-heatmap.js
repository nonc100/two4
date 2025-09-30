const express = require('express');
const {
  normalizeTimeframe,
  timeframeToMs,
  SUPPORTED_TIMEFRAMES,
} = require('../utils/timeframes');
const { createMemoryCache } = require('../utils/cache');

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function computeAdaptiveStep(range, bins) {
  if (!Number.isFinite(range) || range <= 0 || !Number.isFinite(bins) || bins <= 0) {
    return 1;
  }
  const rawStep = range / bins;
  if (!Number.isFinite(rawStep) || rawStep <= 0) {
    return 1;
  }
  const exponent = Math.floor(Math.log10(rawStep));
  const base = 10 ** exponent;
  const normalized = rawStep / base;
  const candidates = [1, 2, 2.5, 5, 10];
  const nice = candidates.find((value) => normalized <= value) || 10;
  return nice * base;
}

function percentile(values, ratio) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * ratio)));
  return sorted[index];
}

const RESPONSE_CACHE = createMemoryCache({ ttlMs: 5 * 60 * 1000, maxEntries: 256 });

module.exports = function createLiquidationHeatmapRouter({ liquidationEngine }) {
  const router = express.Router();

  liquidationEngine.on('event', () => {
    RESPONSE_CACHE.clear();
  });
  liquidationEngine.on('symbols', () => {
    RESPONSE_CACHE.clear();
  });

  router.get('/symbols', (_req, res) => {
    const symbols = liquidationEngine.getSymbols();
    res.json({ symbols });
  });

  router.get('/', async (req, res) => {
    const symbol = String(req.query.symbol || '').toUpperCase() || liquidationEngine.getSymbols()[0]?.symbol || 'BTCUSDT';
    const timeframe = normalizeTimeframe(req.query.tf, '1m');
    const bins = clamp(Number.parseInt(req.query.bins, 10) || 160, 20, 600);
    const limit = clamp(Number.parseInt(req.query.limit, 10) || 720, 20, 5000);

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required.' });
    }

    const cacheKey = [symbol, timeframe, bins, limit];

    try {
      const payload = await RESPONSE_CACHE.wrap(cacheKey, async () => {
        const rows = await liquidationEngine.getEvents({ symbol, timeframe, limit });
        if (!Array.isArray(rows) || !rows.length) {
          return {
            symbol,
            timeframe,
            timestamps: [],
            matrix: [],
            priceSeries: [],
            totals: { long: 0, short: 0, count: 0 },
            priceBins: { count: bins, min: null, max: null, step: null, centers: [] },
            maxValue: 0,
            meta: {
              timeframes: SUPPORTED_TIMEFRAMES,
              lastPrice: liquidationEngine.getLastPrice(symbol),
              clip: null,
            },
          };
        }

        let minPrice = Number.POSITIVE_INFINITY;
        let maxPrice = Number.NEGATIVE_INFINITY;
        rows.forEach((row) => {
          const price = Number(row.price);
          if (Number.isFinite(price)) {
            minPrice = Math.min(minPrice, price);
            maxPrice = Math.max(maxPrice, price);
          }
        });

        if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice)) {
          return {
            symbol,
            timeframe,
            timestamps: [],
            matrix: [],
            priceSeries: [],
            totals: { long: 0, short: 0, count: 0 },
            priceBins: { count: bins, min: null, max: null, step: null, centers: [] },
            maxValue: 0,
            meta: {
              timeframes: SUPPORTED_TIMEFRAMES,
              lastPrice: liquidationEngine.getLastPrice(symbol),
              clip: null,
            },
          };
        }

        if (minPrice === maxPrice) {
          const pad = Math.max(1, minPrice * 0.001);
          minPrice -= pad;
          maxPrice += pad;
        }

        const range = maxPrice - minPrice;
        const step = computeAdaptiveStep(range, bins);
        const centers = Array.from({ length: bins }, (_, idx) => minPrice + step * (idx + 0.5));

        const bucketMs = timeframeToMs(timeframe) || 60_000;
        const bucketMap = new Map();
        const rawValues = [];
        let totalLong = 0;
        let totalShort = 0;

        rows.forEach((row) => {
          const ts = Number(row.event_time);
          const price = Number(row.price);
          const notional = Number(row.notional);
          const side = String(row.side || '').toUpperCase();
          if (!Number.isFinite(ts) || !Number.isFinite(price) || !Number.isFinite(notional)) {
            return;
          }
          const bucketTs = Math.floor(ts / bucketMs) * bucketMs;
          const binIdx = Math.min(bins - 1, Math.max(0, Math.floor((price - minPrice) / step)));
          if (!bucketMap.has(bucketTs)) {
            bucketMap.set(bucketTs, {
              values: new Array(bins).fill(0),
              priceSum: 0,
              notionalSum: 0,
              long: 0,
              short: 0,
            });
          }
          const bucket = bucketMap.get(bucketTs);
          bucket.values[binIdx] += notional;
          bucket.priceSum += price * notional;
          bucket.notionalSum += notional;
          if (side === 'SELL') {
            bucket.long += notional;
            totalLong += notional;
          } else if (side === 'BUY') {
            bucket.short += notional;
            totalShort += notional;
          }
          rawValues.push(notional);
        });

        const timestamps = Array.from(bucketMap.keys()).sort((a, b) => a - b);
        const logMatrix = [];
        const priceSeries = [];
        const longSeries = [];
        const shortSeries = [];

        const clipThreshold = percentile(rawValues, 0.99) || 0;

        timestamps.forEach((ts) => {
          const bucket = bucketMap.get(ts);
          if (!bucket) {
            return;
          }
          const logRow = bucket.values.map((value) => {
            const effectiveClip = clipThreshold > 0 ? clipThreshold : value;
            const clipped = Math.min(value, effectiveClip);
            return Number.isFinite(clipped) && clipped > 0 ? Math.log10(1 + clipped) : 0;
          });
          logMatrix.push(logRow);
          if (bucket.notionalSum > 0) {
            priceSeries.push([ts, bucket.priceSum / bucket.notionalSum]);
          } else {
            priceSeries.push([ts, null]);
          }
          longSeries.push([ts, bucket.long]);
          shortSeries.push([ts, bucket.short]);
        });

        const maxValue = logMatrix.reduce((max, row) => {
          const local = Math.max(...row);
          return Number.isFinite(local) ? Math.max(max, local) : max;
        }, 0);

        return {
          symbol,
          timeframe,
          timestamps,
          matrix: logMatrix,
          priceSeries,
          longSeries,
          shortSeries,
          totals: { long: totalLong, short: totalShort, count: rows.length },
          priceBins: { count: bins, min: minPrice, max: maxPrice, step, centers },
          maxValue,
          meta: {
            timeframes: SUPPORTED_TIMEFRAMES,
            lastPrice: liquidationEngine.getLastPrice(symbol),
            clip: clipThreshold,
          },
        };
      });

      return res.json(payload);
    } catch (error) {
      console.error('[API/LIQ] Failed to load liquidation heatmap:', error.message);
      return res.status(500).json({ error: 'Failed to load liquidation heatmap data.' });
    }
  });

  return router;
};
