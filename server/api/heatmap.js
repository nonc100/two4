const express = require('express');
const { normalizeTimeframe, SUPPORTED_TIMEFRAMES } = require('../utils/timeframes');
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

const RESPONSE_CACHE = createMemoryCache({ ttlMs: 2 * 60 * 60 * 1000, maxEntries: 64 });

module.exports = function createHeatmapRouter({ heatmapEngine, heatmapModel }) {
  const router = express.Router();

  heatmapEngine.on('snapshot', () => {
    RESPONSE_CACHE.clear();
  });

  router.get('/', async (req, res) => {
    const symbol = (req.query.symbol || heatmapEngine.symbol || 'BTCUSDT').toUpperCase();
    const bins = clamp(Number.parseInt(req.query.bins, 10) || 120, 10, 500);
    const limit = clamp(Number.parseInt(req.query.limit, 10) || 720, 10, 2000);
    const timeframe = normalizeTimeframe(req.query.tf, '1m');

    if (symbol !== heatmapEngine.symbol) {
      return res.status(404).json({ error: 'Symbol not tracked yet.' });
    }

    const cacheKey = [symbol, timeframe, bins, limit];

    try {
      const payload = await RESPONSE_CACHE.wrap(cacheKey, async () => {
        let docs = [];
        if (heatmapModel) {
          docs = await heatmapModel
            .find({ symbol, tf: timeframe })
            .sort({ t: -1 })
            .limit(limit)
            .lean();
        }

        let rows;
        if (docs.length) {
          rows = docs
            .slice()
            .reverse()
            .map((doc) => ({
              timestamp: doc.t,
              bids: Array.isArray(doc.bids) ? doc.bids : [],
              asks: Array.isArray(doc.asks) ? doc.asks : [],
              lastPrice: doc.lastPrice ?? null,
            }));
        } else {
          const fallback = await heatmapEngine.getSnapshots({ limit, timeframe });
          rows = fallback.map((row) => ({
            timestamp: Number(row.timestamp),
            bids: Array.isArray(row.bids) ? row.bids : JSON.parse(row.bids || '[]'),
            asks: Array.isArray(row.asks) ? row.asks : JSON.parse(row.asks || '[]'),
            lastPrice: row.last_price ?? row.lastPrice ?? null,
          }));
        }

        if (!rows.length) {
          return {
            symbol,
            timeframe,
            timestamps: [],
            matrix: [],
            priceBins: { count: bins, min: null, max: null, step: null, centers: [] },
            maxValue: 0,
            lastPrice: heatmapEngine.lastPrice,
            meta: { timeframes: SUPPORTED_TIMEFRAMES, scale: { logBase: 10, clip: null } },
          };
        }

        const parsed = rows.map((row) => ({
          timestamp: Number(row.timestamp),
          bids: Array.isArray(row.bids) ? row.bids : [],
          asks: Array.isArray(row.asks) ? row.asks : [],
          lastPrice: row.lastPrice ?? null,
        }));

        let minPrice = Number.POSITIVE_INFINITY;
        let maxPrice = Number.NEGATIVE_INFINITY;
        parsed.forEach((snapshot) => {
          [...snapshot.bids, ...snapshot.asks].forEach(([price]) => {
            const value = Number(price);
            if (Number.isFinite(value)) {
              minPrice = Math.min(minPrice, value);
              maxPrice = Math.max(maxPrice, value);
            }
          });
        });

        if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice)) {
          return {
            symbol,
            timeframe,
            timestamps: [],
            matrix: [],
            priceBins: { count: bins, min: null, max: null, step: null, centers: [] },
            maxValue: 0,
            lastPrice: heatmapEngine.lastPrice,
            meta: { timeframes: SUPPORTED_TIMEFRAMES, scale: { logBase: 10, clip: null } },
          };
        }

        if (minPrice === maxPrice) {
          const padding = Math.max(1, minPrice * 0.001);
          minPrice -= padding;
          maxPrice += padding;
        }

        const range = maxPrice - minPrice;
        const step = computeAdaptiveStep(range, bins);
        const centers = Array.from({ length: bins }, (_, idx) => minPrice + step * (idx + 0.5));

        const rawValues = [];
        const matrix = parsed.map((snapshot) => {
          const rowValues = new Array(bins).fill(0);
          const accumulate = (levels) => {
            levels.forEach(([price, qty]) => {
              const priceNum = Number(price);
              const qtyNum = Number(qty);
              if (!Number.isFinite(priceNum) || !Number.isFinite(qtyNum)) {
                return;
              }
              const index = Math.min(
                bins - 1,
                Math.max(0, Math.floor((priceNum - minPrice) / step))
              );
              const notional = Math.abs(priceNum * qtyNum);
              if (Number.isFinite(notional)) {
                rowValues[index] += notional;
                rawValues.push(notional);
              }
            });
          };
          accumulate(snapshot.bids);
          accumulate(snapshot.asks);
          return rowValues;
        });

        const clipThreshold = percentile(rawValues, 0.99) || 0;
        const logMatrix = matrix.map((row) =>
          row.map((value) => {
            const effectiveClip = clipThreshold > 0 ? clipThreshold : value;
            const clipped = Math.min(value, effectiveClip);
            return Number.isFinite(clipped) && clipped > 0 ? Math.log10(1 + clipped) : 0;
          })
        );
        const maxValue = logMatrix.reduce((max, row) => {
          const local = Math.max(...row);
          return Number.isFinite(local) ? Math.max(max, local) : max;
        }, 0);

        return {
          symbol,
          timeframe,
          timestamps: parsed.map((snapshot) => snapshot.timestamp),
          matrix: logMatrix,
          priceBins: {
            count: bins,
            min: minPrice,
            max: maxPrice,
            step,
            centers,
          },
          maxValue,
          lastPrice: parsed[parsed.length - 1].lastPrice ?? heatmapEngine.lastPrice,
          meta: { timeframes: SUPPORTED_TIMEFRAMES, scale: { logBase: 10, clip: clipThreshold } },
        };
      });

      return res.json(payload);
    } catch (error) {
      console.error('[API/HEATMAP] Failed to load snapshots:', error.message);
      return res.status(500).json({ error: 'Failed to load heatmap data.' });
    }
  });

  return router;
};
